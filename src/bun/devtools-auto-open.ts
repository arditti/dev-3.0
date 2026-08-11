import { release } from "node:os";

/**
 * Whether a dev-channel build should auto-open DevTools at dom-ready.
 *
 * On macOS 26+ the docked Web Inspector blanks the WKWebView content layer —
 * the dev window renders fully black while the renderer keeps running. Known
 * Electrobun bug (blackboardsh/electrobun#357, #475), fixed upstream but not
 * yet in a stable release, so the gate covers every macOS from 26 on until
 * the pinned Electrobun ships the fix; see
 * decisions/2026/08/11/dev-devtools-auto-open-blacks-wkwebview.md.
 * `DEV3_DEVTOOLS=1`/`=0` overrides the default in either direction.
 *
 * macOS 26 reports Darwin kernel 25 (`os.release()` = "25.x.y"); an
 * unparseable release on darwin counts as affected — a missing console beats
 * a black window.
 */
export function shouldAutoOpenDevTools(
	env: Record<string, string | undefined> = process.env,
	platform: NodeJS.Platform = process.platform,
	osRelease: string = release(),
): boolean {
	if (env.DEV3_DEVTOOLS === "1") return true;
	if (env.DEV3_DEVTOOLS === "0") return false;
	if (platform !== "darwin") return true;
	const darwinMajor = Number.parseInt(osRelease, 10);
	return Number.isFinite(darwinMajor) && darwinMajor < 25;
}
