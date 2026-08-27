import { describe, it, expect, vi } from "vitest";
import {
	createOsc8Tracker,
	createOsc8LinkProvider,
	type HyperlinkLine,
} from "../terminal-osc8-links";
import type { ILink } from "ghostty-web";

const ESC = "\x1b";
const ST = `${ESC}\\`;
const BEL = "\x07";

function osc8(uri: string, params = ""): string {
	return `${ESC}]8;${params};${uri}${ST}`;
}

describe("createOsc8Tracker", () => {
	it("maps the visible label to the URI of an ST-terminated link", () => {
		const t = createOsc8Tracker();
		t.feed(`See ${osc8("https://example.com/pr/3226")}#3226${osc8("")} for details`);
		expect(t.uriFor("#3226")).toBe("https://example.com/pr/3226");
	});

	it("handles BEL-terminated sequences and id params", () => {
		const t = createOsc8Tracker();
		t.feed(`${ESC}]8;id=xyz;https://a.dev${BEL}click me${ESC}]8;;${BEL}`);
		expect(t.uriFor("click me")).toBe("https://a.dev");
	});

	it("keeps the URI intact when it contains extra semicolons", () => {
		const t = createOsc8Tracker();
		t.feed(`${osc8("https://a.dev/x;y;z")}L${osc8("")}`);
		expect(t.uriFor("L")).toBe("https://a.dev/x;y;z");
	});

	it("survives chunk splits in the middle of the escape and of the label", () => {
		const t = createOsc8Tracker();
		const full = `${osc8("https://split.example")}#42${osc8("")}`;
		for (const c of full) t.feed(c);
		expect(t.uriFor("#42")).toBe("https://split.example");
	});

	it("ignores SGR and other escapes inside the label", () => {
		const t = createOsc8Tracker();
		t.feed(`${osc8("https://sgr.example")}${ESC}[1;34m#77${ESC}[0m${osc8("")}`);
		expect(t.uriFor("#77")).toBe("https://sgr.example");
	});

	it("matches labels whitespace-insensitively (wide glyphs pad cells)", () => {
		const t = createOsc8Tracker();
		t.feed(`${osc8("https://wide.example")}ab cd${osc8("")}`);
		expect(t.uriFor("a b cd")).toBe("https://wide.example");
	});

	it("a new start terminates the previous link implicitly", () => {
		const t = createOsc8Tracker();
		t.feed(`${osc8("https://one.example")}one${osc8("https://two.example")}two${osc8("")}`);
		expect(t.uriFor("one")).toBe("https://one.example");
		expect(t.uriFor("two")).toBe("https://two.example");
	});

	it("the most recent URI wins for a repeated label", () => {
		const t = createOsc8Tracker();
		t.feed(`${osc8("https://old.example")}#1${osc8("")}${osc8("https://new.example")}#1${osc8("")}`);
		expect(t.uriFor("#1")).toBe("https://new.example");
	});

	it("evicts the oldest label past the cap", () => {
		const t = createOsc8Tracker(2);
		t.feed(`${osc8("https://a.dev")}a${osc8("")}${osc8("https://b.dev")}b${osc8("")}${osc8("https://c.dev")}c${osc8("")}`);
		expect(t.uriFor("a")).toBeUndefined();
		expect(t.uriFor("b")).toBe("https://b.dev");
		expect(t.uriFor("c")).toBe("https://c.dev");
	});

	it("plain output records nothing", () => {
		const t = createOsc8Tracker();
		t.feed("just text with https://example.com and \x1b[31mcolors\x1b[0m\n");
		expect(t.uriFor("https://example.com")).toBeUndefined();
	});
});

function lineOf(text: string, ids: number[]): HyperlinkLine {
	return {
		length: text.length,
		getCell(x: number) {
			if (x < 0 || x >= text.length) return undefined;
			return {
				getCode: () => text.charCodeAt(x),
				getHyperlinkId: () => ids[x] ?? 0,
			};
		},
	};
}

function collectLinks(
	rows: Record<number, HyperlinkLine>,
	uriFor: (label: string) => string | undefined,
	y: number,
	onActivate = vi.fn(),
): { links: ILink[]; onActivate: ReturnType<typeof vi.fn> } {
	const provider = createOsc8LinkProvider({ getLine: (row) => rows[row], uriFor, onActivate });
	let links: ILink[] = [];
	provider.provideLinks(y, (found) => {
		links = found ?? [];
	});
	return { links, onActivate };
}

describe("createOsc8LinkProvider", () => {
	it("produces a link for an id range whose label the tracker knows", () => {
		const text = "See #3226 now";
		const ids = text.split("").map((_, i) => (i >= 4 && i <= 8 ? 1 : 0));
		const { links } = collectLinks({ 5: lineOf(text, ids) }, (l) => (l === "#3226" ? "https://x.dev/pr/3226" : undefined), 5);
		expect(links).toHaveLength(1);
		expect(links[0].text).toBe("https://x.dev/pr/3226");
		expect(links[0].range).toEqual({ start: { x: 4, y: 5 }, end: { x: 8, y: 5 } });
	});

	it("activates only on Ctrl/Cmd+click", () => {
		const text = "#7";
		const { links, onActivate } = collectLinks({ 0: lineOf(text, [1, 1]) }, () => "https://x.dev", 0);
		links[0].activate(new MouseEvent("click"));
		expect(onActivate).not.toHaveBeenCalled();
		links[0].activate(new MouseEvent("click", { ctrlKey: true }));
		expect(onActivate).toHaveBeenCalledWith("https://x.dev", expect.anything());
	});

	it("falls back to the label itself when it is a safe URI", () => {
		const text = "https://self.dev";
		const { links } = collectLinks({ 0: lineOf(text, text.split("").map(() => 2)) }, () => undefined, 0);
		expect(links).toHaveLength(1);
		expect(links[0].text).toBe("https://self.dev");
	});

	it("drops unknown labels and unsafe URIs", () => {
		const text = "#9 file";
		const ids = [1, 1, 0, 3, 3, 3, 3];
		const { links } = collectLinks(
			{ 0: lineOf(text, ids) },
			(l) => (l === "file" ? "file:///etc/passwd" : undefined),
			0,
		);
		expect(links).toHaveLength(0);
	});

	it("stitches a wrapped link across rows to resolve the full label", () => {
		// Row 3 ends with "#12" (id 4), row 4 starts with "34" (id 4).
		const top = "text #12";
		const topIds = [0, 0, 0, 0, 0, 4, 4, 4];
		const bottom = "34 rest";
		const bottomIds = [4, 4, 0, 0, 0, 0, 0];
		const rows = { 3: lineOf(top, topIds), 4: lineOf(bottom, bottomIds) };
		const uriFor = (l: string) => (l === "#1234" ? "https://x.dev/1234" : undefined);
		const upper = collectLinks(rows, uriFor, 3);
		const lower = collectLinks(rows, uriFor, 4);
		expect(upper.links).toHaveLength(1);
		expect(upper.links[0].range).toEqual({ start: { x: 5, y: 3 }, end: { x: 7, y: 3 } });
		expect(lower.links).toHaveLength(1);
		expect(lower.links[0].range).toEqual({ start: { x: 0, y: 4 }, end: { x: 1, y: 4 } });
		expect(lower.links[0].text).toBe("https://x.dev/1234");
	});

	it("separates two adjacent links with different ids", () => {
		const text = "ab";
		const { links } = collectLinks(
			{ 0: lineOf(text, [1, 2]) },
			(l) => (l === "a" ? "https://a.dev" : l === "b" ? "https://b.dev" : undefined),
			0,
		);
		expect(links.map((l) => l.text)).toEqual(["https://a.dev", "https://b.dev"]);
	});
});
