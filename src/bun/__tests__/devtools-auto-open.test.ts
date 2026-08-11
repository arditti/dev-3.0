import { describe, expect, it } from "vitest";
import { shouldAutoOpenDevTools } from "../devtools-auto-open";

describe("shouldAutoOpenDevTools", () => {
	it("auto-opens on non-macOS platforms", () => {
		expect(shouldAutoOpenDevTools({}, "linux")).toBe(true);
		expect(shouldAutoOpenDevTools({}, "win32")).toBe(true);
	});

	it("skips auto-open on macOS (docked inspector breaks WKWebView rendering)", () => {
		expect(shouldAutoOpenDevTools({}, "darwin")).toBe(false);
	});

	it("DEV3_DEVTOOLS=1 forces auto-open even on macOS", () => {
		expect(shouldAutoOpenDevTools({ DEV3_DEVTOOLS: "1" }, "darwin")).toBe(true);
	});

	it("DEV3_DEVTOOLS=0 forces it off even where the default is on", () => {
		expect(shouldAutoOpenDevTools({ DEV3_DEVTOOLS: "0" }, "linux")).toBe(false);
	});

	it("ignores values other than the two documented ones", () => {
		expect(shouldAutoOpenDevTools({ DEV3_DEVTOOLS: "yes" }, "darwin")).toBe(false);
		expect(shouldAutoOpenDevTools({ DEV3_DEVTOOLS: "" }, "linux")).toBe(true);
	});
});
