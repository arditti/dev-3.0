import { describe, expect, it } from "vitest";
import { viewportRowToAbsolute } from "../terminal-link-underlines";

describe("viewportRowToAbsolute", () => {
	it("maps rows at the bottom of scrollback (not scrolled)", () => {
		// 100 scrollback lines, viewport at bottom: row 0 = screen row 0 = absolute 100.
		expect(viewportRowToAbsolute(0, 0, 100)).toBe(100);
		expect(viewportRowToAbsolute(5, 0, 100)).toBe(105);
	});

	it("maps rows while scrolled up into scrollback", () => {
		// Scrolled up 10: top 10 viewport rows show scrollback lines 90..99.
		expect(viewportRowToAbsolute(0, 10, 100)).toBe(90);
		expect(viewportRowToAbsolute(9, 10, 100)).toBe(99);
		// Rows below the scrollback window show the screen from its top.
		expect(viewportRowToAbsolute(10, 10, 100)).toBe(100);
		expect(viewportRowToAbsolute(15, 10, 100)).toBe(105);
	});

	it("ignores fractional smooth-scroll offsets like the click handler does", () => {
		expect(viewportRowToAbsolute(0, 10.7, 100)).toBe(90);
	});

	it("handles an empty scrollback", () => {
		expect(viewportRowToAbsolute(3, 0, 0)).toBe(3);
	});
});
