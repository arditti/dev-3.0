import type { ILink, ILinkProvider, Terminal } from "ghostty-web";
import type { ResolvedTerminalPath } from "../shared/types";

/**
 * Detects file paths mentioned in terminal output (agent messages, build
 * errors, …) and turns the ones that actually exist on disk into
 * Cmd/Ctrl+Click links. Detection is regex-based over the *logical* line
 * (soft-wrapped rows are stitched back together); existence is verified
 * through the `resolveTerminalPaths` RPC so dead-looking tokens never get
 * underlined.
 *
 * Lookups answer SYNCHRONOUSLY from a resolve cache: ghostty's LinkDetector
 * marks a row scanned before awaiting providers, so an async answer loses the
 * first hover/click on a fresh path. Unknown candidates are resolved in a
 * batched background RPC; `onResolutionsChanged` then lets the underline
 * overlay repaint, and the next cache invalidation (every write) lets hover
 * re-scan the row.
 */

export interface PathCandidate {
	/** Exact matched text, including any trailing :line[:col] suffix. */
	raw: string;
	/** Path with the :line[:col] suffix stripped — what gets resolved on disk. */
	cleanPath: string;
	/** 1-based line number from a :line[:col] suffix, if present. */
	line?: number;
	/** Start index in the logical line text. */
	start: number;
	/** Inclusive end index in the logical line text. */
	end: number;
}

// Three alternatives: rooted paths (/, ~/, ./, ../), relative paths with at
// least one slash, and bare filenames with an alphabetic extension. Bare
// words produce false candidates ("e.g") — the on-disk existence check is
// what filters those out, not the regex.
const PATH_CHARS = "\\w.@%+,=-";
const SEGMENT = `[${PATH_CHARS}]+`;
const PATH_REGEX = new RegExp(
	`(?:~|\\.{1,2})?/(?:${SEGMENT}/)*${SEGMENT}/?` +
		`|(?:${SEGMENT}/)+${SEGMENT}/?` +
		`|[\\w@%+-][\\w.@%+-]*\\.[A-Za-z][A-Za-z0-9]{0,9}`,
	"g",
);

// file.ts:12 or file.ts:12:5 — kept in the link text, stripped for stat().
const LINE_COL_SUFFIX = /^:(\d+)(?::\d+)?/;
const TRAILING_PUNCTUATION = /[.,;:!?'"`)\]}>]+$/;
const MIN_CANDIDATE_LEN = 3;

/** Find file-path-looking tokens in one logical line of terminal text. */
export function findPathCandidates(text: string): PathCandidate[] {
	const candidates: PathCandidate[] = [];
	PATH_REGEX.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = PATH_REGEX.exec(text)) !== null) {
		let raw = match[0];
		const before = match.index > 0 ? text[match.index - 1] : "";
		// Skip URL tails: "https://foo.com/bar" would otherwise match at "//foo…".
		if (before === ":" || before === "/") continue;
		const suffix = LINE_COL_SUFFIX.exec(text.slice(match.index + raw.length));
		if (suffix) raw += suffix[0];
		let cleanPath = suffix ? raw.slice(0, raw.length - suffix[0].length) : raw;
		// Trailing sentence punctuation belongs to the prose, not the path.
		const trimmed = cleanPath.replace(TRAILING_PUNCTUATION, "");
		raw = raw.slice(0, raw.length - (cleanPath.length - trimmed.length));
		cleanPath = trimmed;
		if (cleanPath.length < MIN_CANDIDATE_LEN || !/[/\\.]/.test(cleanPath)) continue;
		if (/^[\d.,]+$/.test(cleanPath)) continue;
		candidates.push({
			raw,
			cleanPath,
			line: suffix ? Number.parseInt(suffix[1], 10) : undefined,
			start: match.index,
			end: match.index + raw.length - 1,
		});
	}
	return candidates;
}

/** The slice of IBufferLine the detection code reads. */
export interface CellLine {
	isWrapped: boolean;
	length: number;
	getCell(x: number): { getCode(): number } | undefined;
}

/**
 * Cell-exact row text: exactly ONE UTF-16 unit per cell, so string index ===
 * screen column. ghostty's `translateToString` skips codepoint-0 cells (rows
 * come back shorter than `cols`, shifting every later index), which is why
 * ghostty's own URL provider builds text cell-by-cell too. Blank, control,
 * and astral codepoints (2 UTF-16 units — emoji, rare CJK) all become spaces;
 * none of them are path characters.
 */
export function lineToText(line: CellLine): string {
	const chars: string[] = [];
	for (let x = 0; x < line.length; x++) {
		const code = line.getCell(x)?.getCode() ?? 0;
		chars.push(code === 0 || code < 32 || code > 0xffff ? " " : String.fromCodePoint(code));
	}
	return chars.join("");
}

export interface LogicalLineRow {
	/** Absolute buffer row. */
	y: number;
	/** Cell-exact row text (length === row length). */
	text: string;
	/** Offset of this row's first char within the logical line text. */
	offset: number;
}

export interface LogicalLine {
	text: string;
	rows: LogicalLineRow[];
}

// Bound reassembly work for pathological single logical lines (minified JSON
// etc.) — beyond this the tail rows just don't get links.
const MAX_LOGICAL_ROWS = 40;

export type BufferLineReader = (y: number) => CellLine | undefined;

/**
 * Stitch the soft-wrapped logical line containing buffer row `y` back into
 * one string, remembering each row's offset so match indices map back to
 * buffer coordinates.
 */
export function getLogicalLine(getLine: BufferLineReader, y: number): LogicalLine | undefined {
	if (!getLine(y)) return undefined;
	let startY = y;
	while (startY > 0 && y - startY < MAX_LOGICAL_ROWS && getLine(startY)?.isWrapped) startY--;
	const rows: LogicalLineRow[] = [];
	let text = "";
	for (let rowY = startY; rowY - startY < MAX_LOGICAL_ROWS; rowY++) {
		const line = getLine(rowY);
		if (!line) break;
		if (rowY > startY && !line.isWrapped) break;
		const rowText = lineToText(line);
		rows.push({ y: rowY, text: rowText, offset: text.length });
		text += rowText;
		if (!getLine(rowY + 1)?.isWrapped) break;
	}
	return { text, rows };
}

export interface BufferRange {
	start: { x: number; y: number };
	end: { x: number; y: number };
}

/** Map an inclusive [start, end] index range in the logical line to buffer coordinates. */
export function mapRangeToBuffer(rows: LogicalLineRow[], start: number, end: number): BufferRange | undefined {
	const locate = (idx: number): { x: number; y: number } | undefined => {
		for (const row of rows) {
			if (idx >= row.offset && idx < row.offset + row.text.length) {
				return { x: idx - row.offset, y: row.y };
			}
		}
		return undefined;
	};
	const startPos = locate(start);
	const endPos = locate(end);
	if (!startPos || !endPos) return undefined;
	return { start: startPos, end: endPos };
}

const RESOLVE_CACHE_TTL_MS = 10_000;
const RESOLVE_CACHE_MAX = 1000;
const RESOLVE_BATCH_MAX = 64; // matches the backend's per-call cap
const RESOLVE_FLUSH_DELAY_MS = 16;

export interface FilePathLinkProviderOptions {
	term: Pick<Terminal, "buffer">;
	resolvePaths: (paths: string[]) => Promise<Record<string, ResolvedTerminalPath | null>>;
	onActivate: (resolved: ResolvedTerminalPath, event: MouseEvent, line?: number) => void;
	/** Fires after a background RPC resolution lands — the underline overlay redraws on it. */
	onResolutionsChanged?: () => void;
}

export interface FilePathLinkProvider extends ILinkProvider {
	/**
	 * Synchronous link ranges for a set of absolute buffer rows (the visible
	 * viewport), from the resolve cache only. Unknown candidates are queued
	 * for one batched background resolve.
	 */
	linksForRows(ys: number[]): BufferRange[];
	dispose(): void;
}

export function createFilePathLinkProvider(options: FilePathLinkProviderOptions): FilePathLinkProvider {
	const cache = new Map<string, { value: ResolvedTerminalPath | null; at: number }>();
	const pending = new Set<string>();
	const inFlight = new Set<string>();
	let flushTimer: ReturnType<typeof setTimeout> | undefined;
	let disposed = false;

	function requestResolve(paths: Iterable<string>): void {
		for (const path of paths) {
			if (!inFlight.has(path)) pending.add(path);
		}
		if (pending.size > 0 && flushTimer === undefined) {
			flushTimer = setTimeout(() => {
				flushTimer = undefined;
				void flushPending();
			}, RESOLVE_FLUSH_DELAY_MS);
		}
	}

	async function flushPending(): Promise<void> {
		while (!disposed && pending.size > 0) {
			const batch = [...pending].slice(0, RESOLVE_BATCH_MAX);
			for (const path of batch) {
				pending.delete(path);
				inFlight.add(path);
			}
			try {
				const resolved = await options.resolvePaths(batch);
				if (cache.size > RESOLVE_CACHE_MAX) cache.clear();
				for (const path of batch) {
					cache.set(path, { value: resolved[path] ?? null, at: Date.now() });
				}
				options.onResolutionsChanged?.();
			} catch {
				// Transport hiccup — candidates stay unresolved and are re-requested
				// on the next hover/redraw.
			} finally {
				for (const path of batch) inFlight.delete(path);
			}
		}
	}

	/**
	 * Cached target for a candidate path. Stale entries are served
	 * stale-while-revalidate; unknown ones queue a background resolve and
	 * report undefined.
	 */
	function cachedTarget(path: string): ResolvedTerminalPath | null | undefined {
		const hit = cache.get(path);
		if (!hit) {
			requestResolve([path]);
			return undefined;
		}
		if (Date.now() - hit.at >= RESOLVE_CACHE_TTL_MS) requestResolve([path]);
		return hit.value;
	}

	interface RowLink {
		target: ResolvedTerminalPath;
		candidate: PathCandidate;
		range: BufferRange;
	}

	function computeLinks(y: number): { links: RowLink[]; rowYs: number[] } {
		const logical = getLogicalLine((row) => options.term.buffer.active.getLine(row), y);
		if (!logical) return { links: [], rowYs: [y] };
		const candidates = findPathCandidates(logical.text);
		const links: RowLink[] = [];
		for (const candidate of candidates) {
			const target = cachedTarget(candidate.cleanPath);
			if (!target) continue;
			const range = mapRangeToBuffer(logical.rows, candidate.start, candidate.end);
			if (!range) continue;
			links.push({ target, candidate, range });
		}
		return { links, rowYs: logical.rows.map((row) => row.y) };
	}

	return {
		provideLinks(y, callback) {
			try {
				const links: ILink[] = computeLinks(y).links.map(({ target, candidate, range }) => ({
					text: candidate.raw,
					range,
					activate: (event) => {
						if (event.ctrlKey || event.metaKey) options.onActivate(target, event, candidate.line);
					},
				}));
				callback(links.length > 0 ? links : undefined);
			} catch {
				callback(undefined);
			}
		},
		linksForRows(ys) {
			const ranges: BufferRange[] = [];
			// A logical line spans several rows; once processed, skip its siblings.
			const covered = new Set<number>();
			for (const y of ys) {
				if (covered.has(y)) continue;
				try {
					const { links, rowYs } = computeLinks(y);
					for (const { range } of links) ranges.push(range);
					for (const rowY of rowYs) covered.add(rowY);
				} catch {
					// skip unreadable rows
				}
			}
			return ranges;
		},
		dispose() {
			disposed = true;
			clearTimeout(flushTimer);
			pending.clear();
			cache.clear();
		},
	};
}
