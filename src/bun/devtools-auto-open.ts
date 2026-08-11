/**
 * Whether a dev-channel build should auto-open DevTools at dom-ready.
 *
 * On macOS the docked Web Inspector corrupts WKWebView content rendering — a
 * fully black window on macOS 26, content shift/gray-out on earlier versions.
 * Known Electrobun bug (blackboardsh/electrobun#357, #475), fixed upstream but
 * not yet in a stable release; see
 * decisions/2026/08/11/dev-devtools-auto-open-blacks-wkwebview.md.
 * `DEV3_DEVTOOLS=1`/`=0` overrides the platform default in either direction.
 */
export function shouldAutoOpenDevTools(
	env: Record<string, string | undefined> = process.env,
	platform: NodeJS.Platform = process.platform,
): boolean {
	if (env.DEV3_DEVTOOLS === "1") return true;
	if (env.DEV3_DEVTOOLS === "0") return false;
	return platform !== "darwin";
}
