import type { ILink, ILinkProvider, Terminal } from "ghostty-web";
import type { ResolvedTerminalPath } from "../shared/types";

/**
 * Detects file paths mentioned in terminal output (agent messages, build
 * errors, …) and turns the ones that actually exist on disk into
 * Cmd/Ctrl+Click links. Detection is regex-based over the *logical* line
 * (soft-wrapped rows are stitched back together); existence is verified
 * through the `resolveTerminalPaths` RPC so dead-looking tokens never get
 * underlined.
 */

export interface PathCandidate {
	/** Exact matched text, including any trailing :line[:col] suffix. */
	raw: string;
	/** Path with the :line[:col] suffix stripped — what gets resolved on disk. */
	cleanPath: string;
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
const LINE_COL_SUFFIX = /^:\d+(?::\d+)?/;
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
			start: match.index,
			end: match.index + raw.length - 1,
		});
	}
	return candidates;
}

export interface LogicalLineRow {
	/** Absolute buffer row. */
	y: number;
	/** Row text; padded (non-trimmed) for all but the last row. */
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

type BufferLineReader = (y: number) => { isWrapped: boolean; translateToString(trimRight?: boolean): string } | undefined;

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
		const next = getLine(rowY + 1);
		const isLast = !next?.isWrapped;
		const rowText = line.translateToString(isLast);
		rows.push({ y: rowY, text: rowText, offset: text.length });
		text += rowText;
		if (isLast) break;
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

export interface FilePathLinkProviderOptions {
	term: Pick<Terminal, "buffer">;
	resolvePaths: (paths: string[]) => Promise<Record<string, ResolvedTerminalPath | null>>;
	onActivate: (resolved: ResolvedTerminalPath, event: MouseEvent) => void;
	/** Fires after a fresh RPC resolution lands — the underline overlay redraws on it. */
	onResolutionsChanged?: () => void;
}

export interface FilePathLinkProvider extends ILinkProvider {
	/** Link ranges for one absolute buffer row, for the persistent underline overlay. */
	linksForRow(y: number): Promise<BufferRange[]>;
}

/**
 * ghostty-web link provider for file paths. Activation requires Cmd/Ctrl —
 * plain clicks must keep reaching tmux mouse mode (same policy as the
 * built-in URL provider).
 */
export function createFilePathLinkProvider(options: FilePathLinkProviderOptions): FilePathLinkProvider {
	const cache = new Map<string, { value: ResolvedTerminalPath | null; at: number }>();
	const inFlight = new Map<string, Promise<Record<string, ResolvedTerminalPath | null>>>();

	async function resolveCached(paths: string[]): Promise<Map<string, ResolvedTerminalPath | null>> {
		const now = Date.now();
		const result = new Map<string, ResolvedTerminalPath | null>();
		const missing: string[] = [];
		for (const path of paths) {
			const hit = cache.get(path);
			if (hit && now - hit.at < RESOLVE_CACHE_TTL_MS) result.set(path, hit.value);
			else missing.push(path);
		}
		if (missing.length > 0) {
			const key = missing.join("\n");
			let promise = inFlight.get(key);
			if (!promise) {
				promise = options.resolvePaths(missing).finally(() => inFlight.delete(key));
				inFlight.set(key, promise);
			}
			const resolved = await promise;
			if (cache.size > RESOLVE_CACHE_MAX) cache.clear();
			for (const path of missing) {
				const value = resolved[path] ?? null;
				cache.set(path, { value, at: Date.now() });
				result.set(path, value);
			}
			options.onResolutionsChanged?.();
		}
		return result;
	}

	interface RowLink {
		target: ResolvedTerminalPath;
		raw: string;
		range: BufferRange;
	}

	async function computeLinks(y: number): Promise<RowLink[]> {
		const logical = getLogicalLine((row) => options.term.buffer.active.getLine(row), y);
		if (!logical) return [];
		const candidates = findPathCandidates(logical.text);
		if (candidates.length === 0) return [];
		const resolved = await resolveCached([...new Set(candidates.map((c) => c.cleanPath))]);
		const links: RowLink[] = [];
		for (const candidate of candidates) {
			const target = resolved.get(candidate.cleanPath);
			if (!target) continue;
			const range = mapRangeToBuffer(logical.rows, candidate.start, candidate.end);
			if (!range) continue;
			links.push({ target, raw: candidate.raw, range });
		}
		return links;
	}

	return {
		provideLinks(y, callback) {
			let done = false;
			const finish = (links: ILink[] | undefined) => {
				if (done) return;
				done = true;
				callback(links);
			};
			computeLinks(y)
				.then((rowLinks) => {
					const links: ILink[] = rowLinks.map(({ target, raw, range }) => ({
						text: raw,
						range,
						activate: (event) => {
							if (event.ctrlKey || event.metaKey) options.onActivate(target, event);
						},
					}));
					finish(links.length > 0 ? links : undefined);
				})
				.catch(() => finish(undefined));
		},
		async linksForRow(y) {
			try {
				return (await computeLinks(y)).map((link) => link.range);
			} catch {
				return [];
			}
		},
	};
}
