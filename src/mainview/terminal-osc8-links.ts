import type { ILink, ILinkProvider } from "ghostty-web";

/**
 * Clickable OSC 8 hyperlinks (`ESC ] 8 ; params ; URI ST text ESC ] 8 ; ; ST`).
 *
 * ghostty-web's wasm build assigns a `hyperlink_id` to every linked cell (which
 * is what draws the hover underline), but it never exposes the URI back to
 * JavaScript — `getHyperlinkUri()` is a stub returning null, so the built-in
 * OSC8LinkProvider can never produce a clickable link. The URI therefore has
 * to be captured before the bytes reach the terminal: `createOsc8Tracker`
 * parses the PTY write stream for OSC 8 start/end pairs and remembers
 * label → URI, and `createOsc8LinkProvider` finds linked cell ranges by
 * `hyperlink_id` and resolves their visible text through that map.
 *
 * Keys are whitespace-stripped on both sides: wide glyphs occupy two cells
 * (the second reads back as a blank), so the cell-side label carries spaces
 * the stream-side label never saw.
 */

const MAX_LABEL_LENGTH = 2048;
const MAX_OSC_PAYLOAD = 8192;
/** How many neighbouring rows a wrapped link is stitched across, each way. */
const MAX_STITCH_ROWS = 4;
/** Schemes safe to hand to window.open / the desktop external-link intercept. */
const SAFE_URI = /^(https?:\/\/|mailto:)/i;

export interface Osc8Tracker {
	/** Parse one PTY chunk. Chunking is safe — parser state carries across calls. */
	feed(chunk: string): void;
	/** URI last seen for this visible label (whitespace-insensitive). */
	uriFor(label: string): string | undefined;
	dispose(): void;
}

function labelKey(label: string): string {
	return label.replace(/\s+/g, "");
}

const enum ParserState {
	Ground,
	Escape,
	Csi,
	OscPayload,
	/** Non-OSC string sequence (DCS/SOS/PM/APC) — consumed, payload ignored. */
	OtherString,
	/** Saw ESC inside a string sequence — next `\` is the ST terminator. */
	StringEscape,
}

export function createOsc8Tracker(maxEntries = 500): Osc8Tracker {
	const uris = new Map<string, string>();
	let state = ParserState.Ground;
	/** State to resume after a string sequence terminates. */
	let stringKind = ParserState.OtherString;
	let payload = "";
	let currentUri: string | null = null;
	let label = "";

	function remember(): void {
		if (currentUri !== null) {
			const key = labelKey(label);
			if (key && key.length <= MAX_LABEL_LENGTH) {
				// Re-insert so the Map's insertion order doubles as an LRU.
				uris.delete(key);
				uris.set(key, currentUri);
				if (uris.size > maxEntries) {
					const oldest = uris.keys().next().value;
					if (oldest !== undefined) uris.delete(oldest);
				}
			}
		}
		currentUri = null;
		label = "";
	}

	function handleOscPayload(): void {
		if (!payload.startsWith("8;")) return;
		// "8;params;URI" — params (e.g. id=…) end at the next semicolon.
		const uriStart = payload.indexOf(";", 2);
		if (uriStart < 0) return;
		const uri = payload.slice(uriStart + 1);
		remember();
		if (uri.length > 0) {
			currentUri = uri;
			label = "";
		}
	}

	function feed(chunk: string): void {
		for (let i = 0; i < chunk.length; i++) {
			const ch = chunk[i];
			const code = chunk.charCodeAt(i);
			switch (state) {
				case ParserState.Ground:
					if (code === 0x1b) state = ParserState.Escape;
					else if (currentUri !== null && code >= 0x20 && code !== 0x7f && label.length < MAX_LABEL_LENGTH) {
						label += ch;
					}
					break;
				case ParserState.Escape:
					if (ch === "]") {
						state = ParserState.OscPayload;
						stringKind = ParserState.OscPayload;
						payload = "";
					} else if (ch === "[") {
						state = ParserState.Csi;
					} else if (ch === "P" || ch === "X" || ch === "^" || ch === "_") {
						state = ParserState.OtherString;
						stringKind = ParserState.OtherString;
					} else {
						state = ParserState.Ground;
					}
					break;
				case ParserState.Csi:
					// Parameter/intermediate bytes are 0x20–0x3f; a final byte ends it.
					if (code >= 0x40 && code <= 0x7e) state = ParserState.Ground;
					break;
				case ParserState.OscPayload:
					if (code === 0x07) {
						handleOscPayload();
						state = ParserState.Ground;
					} else if (code === 0x1b) {
						state = ParserState.StringEscape;
					} else if (payload.length < MAX_OSC_PAYLOAD) {
						payload += ch;
					}
					break;
				case ParserState.OtherString:
					if (code === 0x07) state = ParserState.Ground;
					else if (code === 0x1b) state = ParserState.StringEscape;
					break;
				case ParserState.StringEscape:
					if (ch === "\\") {
						if (stringKind === ParserState.OscPayload) handleOscPayload();
						state = ParserState.Ground;
					} else {
						// Not an ST — the sequence is broken; drop it and re-read the
						// character as if it followed a bare ESC.
						state = ParserState.Escape;
						i--;
					}
					break;
			}
		}
	}

	return {
		feed,
		uriFor(text: string) {
			return uris.get(labelKey(text));
		},
		dispose() {
			uris.clear();
			currentUri = null;
			label = "";
		},
	};
}

/** The slice of ghostty-web's buffer-line API the provider reads. */
export interface HyperlinkCell {
	getCode(): number;
	getHyperlinkId(): number;
}

export interface HyperlinkLine {
	readonly length: number;
	getCell(x: number): HyperlinkCell | undefined;
}

export type HyperlinkLineReader = (y: number) => HyperlinkLine | undefined;

function cellChar(line: HyperlinkLine, x: number): string {
	const code = line.getCell(x)?.getCode() ?? 0;
	return code === 0 || code < 32 || code > 0xffff ? " " : String.fromCodePoint(code);
}

function hyperlinkId(line: HyperlinkLine | undefined, x: number): number {
	return line?.getCell(x)?.getHyperlinkId() ?? 0;
}

/** Text of every cell of `id` at the edge-adjacent end of a neighbouring row. */
function edgeSegmentText(line: HyperlinkLine | undefined, id: number, fromStart: boolean): string | null {
	if (!line || line.length === 0) return null;
	if (fromStart) {
		if (hyperlinkId(line, 0) !== id) return null;
		let x = 0;
		let text = "";
		while (x < line.length && hyperlinkId(line, x) === id) text += cellChar(line, x++);
		return text;
	}
	if (hyperlinkId(line, line.length - 1) !== id) return null;
	let x = line.length - 1;
	while (x >= 0 && hyperlinkId(line, x) === id) x--;
	let text = "";
	for (let c = x + 1; c < line.length; c++) text += cellChar(line, c);
	return text;
}

export function createOsc8LinkProvider(opts: {
	getLine: HyperlinkLineReader;
	uriFor: (label: string) => string | undefined;
	onActivate: (uri: string, event: MouseEvent) => void;
}): ILinkProvider {
	/**
	 * A wrapped link continues on neighbouring rows; the tracker recorded the
	 * FULL label, so this row's segment alone would never match. Stitch the
	 * id-contiguous text from adjacent rows (bounded) around this segment.
	 */
	function stitchedLabel(y: number, id: number, segment: string, touchesStart: boolean, touchesEnd: boolean): string {
		let text = segment;
		if (touchesStart) {
			for (let up = 1; up <= MAX_STITCH_ROWS; up++) {
				const part = edgeSegmentText(opts.getLine(y - up), id, false);
				if (part === null) break;
				text = part + text;
				if (opts.getLine(y - up)?.getCell(0)?.getHyperlinkId() !== id) break;
			}
		}
		if (touchesEnd) {
			for (let down = 1; down <= MAX_STITCH_ROWS; down++) {
				const line = opts.getLine(y + down);
				const part = edgeSegmentText(line, id, true);
				if (part === null) break;
				text += part;
				if (!line || hyperlinkId(line, line.length - 1) !== id) break;
			}
		}
		return text;
	}

	return {
		provideLinks(y: number, callback: (links: ILink[] | undefined) => void): void {
			try {
				const line = opts.getLine(y);
				if (!line || line.length === 0) {
					callback(undefined);
					return;
				}
				const links: ILink[] = [];
				let x = 0;
				while (x < line.length) {
					const id = hyperlinkId(line, x);
					if (id === 0) {
						x++;
						continue;
					}
					const x0 = x;
					let segment = "";
					while (x < line.length && hyperlinkId(line, x) === id) segment += cellChar(line, x++);
					const label = stitchedLabel(y, id, segment, x0 === 0, x === line.length);
					const trimmed = label.trim();
					if (!trimmed) continue;
					// The stream tracker is the source of truth; a label that IS a
					// URI still works when the tracker missed it (e.g. scrolled past
					// the LRU) because the text itself is the destination.
					const uri = opts.uriFor(trimmed) ?? (SAFE_URI.test(trimmed) ? trimmed : undefined);
					if (!uri || !SAFE_URI.test(uri)) continue;
					links.push({
						text: uri,
						// One ILink per row segment, same as the file-path provider:
						// ghostty hit-tests a multi-row range as whole rows.
						range: { start: { x: x0, y }, end: { x: x - 1, y } },
						activate: (event: MouseEvent) => {
							if (event.ctrlKey || event.metaKey) opts.onActivate(uri, event);
						},
					});
				}
				callback(links.length > 0 ? links : undefined);
			} catch {
				callback(undefined);
			}
		},
	};
}
