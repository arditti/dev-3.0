import { describe, expect, it } from "vitest";
import { shouldAutoOpenDevTools } from "../devtools-auto-open";

describe("shouldAutoOpenDevTools", () => {
	it("auto-opens on non-macOS platforms", () => {
		expect(shouldAutoOpenDevTools({}, "linux", "6.8.0")).toBe(true);
		expect(shouldAutoOpenDevTools({}, "win32", "10.0.22631")).toBe(true);
	});

	it("auto-opens on macOS below 26 (Darwin < 25), where the inspector works", () => {
		expect(shouldAutoOpenDevTools({}, "darwin", "24.6.0")).toBe(true);
		expect(shouldAutoOpenDevTools({}, "darwin", "23.1.0")).toBe(true);
	});

	it("skips macOS 26+ (Darwin 25+), where the docked inspector blanks the WKWebView", () => {
		expect(shouldAutoOpenDevTools({}, "darwin", "25.0.0")).toBe(false);
		expect(shouldAutoOpenDevTools({}, "darwin", "25.6.0")).toBe(false);
		expect(shouldAutoOpenDevTools({}, "darwin", "26.1.0")).toBe(false);
	});

	it("treats an unparseable darwin release as affected", () => {
		expect(shouldAutoOpenDevTools({}, "darwin", "")).toBe(false);
		expect(shouldAutoOpenDevTools({}, "darwin", "beta")).toBe(false);
	});

	it("DEV3_DEVTOOLS=1 forces auto-open even on an affected macOS", () => {
		expect(shouldAutoOpenDevTools({ DEV3_DEVTOOLS: "1" }, "darwin", "25.6.0")).toBe(true);
	});

	it("DEV3_DEVTOOLS=0 forces it off even where the default is on", () => {
		expect(shouldAutoOpenDevTools({ DEV3_DEVTOOLS: "0" }, "linux", "6.8.0")).toBe(false);
		expect(shouldAutoOpenDevTools({ DEV3_DEVTOOLS: "0" }, "darwin", "24.6.0")).toBe(false);
	});

	it("ignores values other than the two documented ones", () => {
		expect(shouldAutoOpenDevTools({ DEV3_DEVTOOLS: "yes" }, "darwin", "25.6.0")).toBe(false);
		expect(shouldAutoOpenDevTools({ DEV3_DEVTOOLS: "" }, "darwin", "24.6.0")).toBe(true);
	});
});
