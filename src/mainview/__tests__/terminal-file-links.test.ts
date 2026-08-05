import { describe, expect, it, vi } from "vitest";
import {
	createFilePathLinkProvider,
	findPathCandidates,
	getLogicalLine,
	mapRangeToBuffer,
} from "../terminal-file-links";
import type { ResolvedTerminalPath } from "../../shared/types";

describe("findPathCandidates", () => {
	it("finds absolute paths", () => {
		const found = findPathCandidates("saved to /Users/me/project/src/index.ts today");
		expect(found).toHaveLength(1);
		expect(found[0].cleanPath).toBe("/Users/me/project/src/index.ts");
		expect(found[0].start).toBe(9);
	});

	it("finds relative paths with slashes", () => {
		const found = findPathCandidates("Draft is ready at kb-playbook-drafts/waf-cve-virtual-patching.md, built from");
		expect(found).toHaveLength(1);
		expect(found[0].cleanPath).toBe("kb-playbook-drafts/waf-cve-virtual-patching.md");
	});

	it("finds ~, ./ and ../ prefixed paths", () => {
		expect(findPathCandidates("see ~/notes/todo.md")[0]?.cleanPath).toBe("~/notes/todo.md");
		expect(findPathCandidates("see ./src/app.ts")[0]?.cleanPath).toBe("./src/app.ts");
		expect(findPathCandidates("see ../other/file.txt")[0]?.cleanPath).toBe("../other/file.txt");
	});

	it("finds bare filenames with an extension", () => {
		const found = findPathCandidates("update package.json and README.md please");
		expect(found.map((c) => c.cleanPath)).toEqual(["package.json", "README.md"]);
	});

	it("keeps :line:col in raw but strips it from cleanPath", () => {
		const found = findPathCandidates("error at src/foo.ts:12:5 in build");
		expect(found).toHaveLength(1);
		expect(found[0].raw).toBe("src/foo.ts:12:5");
		expect(found[0].cleanPath).toBe("src/foo.ts");
		expect(found[0].end).toBe(found[0].start + "src/foo.ts:12:5".length - 1);
	});

	it("strips trailing sentence punctuation", () => {
		const found = findPathCandidates("look at src/app.ts.");
		expect(found[0].cleanPath).toBe("src/app.ts");
		const parenthesized = findPathCandidates("(see docs/guide.md)");
		expect(parenthesized[0].cleanPath).toBe("docs/guide.md");
	});

	it("does not match inside URLs", () => {
		const found = findPathCandidates("open https://foo.com/bar/baz.html now");
		expect(found.filter((c) => c.cleanPath.includes("foo.com"))).toHaveLength(0);
	});

	it("ignores pure numbers and too-short tokens", () => {
		expect(findPathCandidates("version 3.5 costs 1,000.50")).toHaveLength(0);
	});
});

function fakeBuffer(rows: Array<{ text: string; isWrapped?: boolean }>) {
	return (y: number) => {
		const row = rows[y];
		if (!row) return undefined;
		return {
			isWrapped: row.isWrapped ?? false,
			translateToString: (trimRight?: boolean) =>
				trimRight ? row.text.replace(/\s+$/, "") : row.text,
		};
	};
}

describe("getLogicalLine", () => {
	it("returns a single unwrapped row as-is", () => {
		const getLine = fakeBuffer([{ text: "hello world   " }]);
		const logical = getLogicalLine(getLine, 0);
		expect(logical?.text).toBe("hello world");
		expect(logical?.rows).toHaveLength(1);
	});

	it("stitches wrapped rows and maps offsets", () => {
		// A path soft-wrapped across two 20-col rows.
		const getLine = fakeBuffer([
			{ text: "saved kb-playbook-dr" },
			{ text: "afts/waf.md ok", isWrapped: true },
		]);
		const logical = getLogicalLine(getLine, 1);
		expect(logical?.text).toBe("saved kb-playbook-drafts/waf.md ok");
		expect(logical?.rows.map((r) => r.offset)).toEqual([0, 20]);

		const candidates = findPathCandidates(logical!.text);
		expect(candidates[0].cleanPath).toBe("kb-playbook-drafts/waf.md");
		const range = mapRangeToBuffer(logical!.rows, candidates[0].start, candidates[0].end);
		expect(range).toEqual({ start: { x: 6, y: 0 }, end: { x: 10, y: 1 } });
	});

	it("starts from the requested row when it is not wrapped", () => {
		const getLine = fakeBuffer([
			{ text: "first line" },
			{ text: "second /tmp/x.txt" },
		]);
		const logical = getLogicalLine(getLine, 1);
		expect(logical?.text).toBe("second /tmp/x.txt");
		expect(logical?.rows[0].y).toBe(1);
	});
});

describe("createFilePathLinkProvider", () => {
	function makeTerm(rows: Array<{ text: string; isWrapped?: boolean }>) {
		const getLine = fakeBuffer(rows);
		return { buffer: { active: { getLine } } } as never;
	}

	it("only linkifies paths that resolve on disk", async () => {
		const resolvePaths = vi.fn(async (paths: string[]) => {
			const out: Record<string, ResolvedTerminalPath | null> = {};
			for (const p of paths) {
				out[p] = p === "src/real.ts" ? { path: "/wt/src/real.ts", kind: "file" } : null;
			}
			return out;
		});
		const provider = createFilePathLinkProvider({
			term: makeTerm([{ text: "see src/real.ts and src/fake.ts" }]),
			resolvePaths,
			onActivate: vi.fn(),
		});
		const links = await new Promise<unknown[] | undefined>((resolve) => {
			provider.provideLinks(0, (result) => resolve(result));
		});
		expect(links).toHaveLength(1);
		expect((links![0] as { text: string }).text).toBe("src/real.ts");
	});

	it("activates only with Cmd/Ctrl held and passes the resolved target", async () => {
		const onActivate = vi.fn();
		const target: ResolvedTerminalPath = { path: "/wt/a/b.md", kind: "file" };
		const provider = createFilePathLinkProvider({
			term: makeTerm([{ text: "open a/b.md" }]),
			resolvePaths: async () => ({ "a/b.md": target }),
			onActivate,
		});
		const links = await new Promise<Array<{ activate(e: MouseEvent): void }> | undefined>(
			(resolve) => provider.provideLinks(0, (result) => resolve(result as never)),
		);
		links![0].activate({ ctrlKey: false, metaKey: false } as MouseEvent);
		expect(onActivate).not.toHaveBeenCalled();
		links![0].activate({ ctrlKey: false, metaKey: true } as MouseEvent);
		expect(onActivate).toHaveBeenCalledWith(target, expect.anything());
	});

	it("caches resolutions across rows", async () => {
		const resolvePaths = vi.fn(async (paths: string[]) => {
			const out: Record<string, ResolvedTerminalPath | null> = {};
			for (const p of paths) out[p] = { path: `/wt/${p}`, kind: "file" };
			return out;
		});
		const provider = createFilePathLinkProvider({
			term: makeTerm([{ text: "see a/b.ts" }, { text: "again a/b.ts" }]),
			resolvePaths,
			onActivate: vi.fn(),
		});
		await new Promise((resolve) => provider.provideLinks(0, resolve));
		await new Promise((resolve) => provider.provideLinks(1, resolve));
		expect(resolvePaths).toHaveBeenCalledTimes(1);
	});

	it("reports no links for plain prose", async () => {
		const provider = createFilePathLinkProvider({
			term: makeTerm([{ text: "just some words here" }]),
			resolvePaths: async () => ({}),
			onActivate: vi.fn(),
		});
		const links = await new Promise((resolve) => provider.provideLinks(0, resolve));
		expect(links).toBeUndefined();
	});
});
