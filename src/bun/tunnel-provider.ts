import type { RemoteTunnelSettings } from "../shared/types";
import { loadSettingsSync } from "./settings";
import { spawnSync } from "./spawn";
import { createLogger } from "./logger";

const log = createLogger("tunnel-provider");

/**
 * The resolved tunnel provider for the main remote-access tunnel.
 *
 * `cloudflare` is the built-in default (cloudflared quick tunnel, see
 * cloudflare-tunnel.ts). `custom` is bring-your-own-tunnel: any ngrok-like CLI
 * that takes a local port and prints a public https URL, configured in
 * Settings → System → Remote access tunnel.
 */
export interface ResolvedTunnelProvider {
	kind: "cloudflare" | "custom";
	/** Shell command with `{port}` already NOT substituted — see buildCustomTunnelArgv. */
	command: string | null;
	urlRegex: RegExp | null;
}

/** Default URL scrape for custom providers: the first https URL the CLI prints. */
export const GENERIC_TUNNEL_URL_REGEX = /https:\/\/[a-zA-Z0-9][a-zA-Z0-9._-]*(?::\d+)?(?=[\s"',;)\]]|$)/;

export function resolveRemoteTunnelProvider(settings?: { remoteTunnel?: RemoteTunnelSettings }): ResolvedTunnelProvider {
	const conf = (settings ?? loadSettingsSync()).remoteTunnel;
	if (conf?.provider !== "custom" || !conf.command?.trim()) {
		return { kind: "cloudflare", command: null, urlRegex: null };
	}
	return {
		kind: "custom",
		command: conf.command.trim(),
		urlRegex: compileUrlPattern(conf.urlPattern),
	};
}

/** A user-supplied pattern that does not compile falls back to the generic scrape. */
export function compileUrlPattern(pattern: string | undefined): RegExp {
	if (pattern?.trim()) {
		try {
			return new RegExp(pattern.trim());
		} catch (err) {
			log.warn("Invalid custom tunnel urlPattern — falling back to generic https URL match", {
				pattern,
				error: String(err),
			});
		}
	}
	return GENERIC_TUNNEL_URL_REGEX;
}

/**
 * A custom command is a free-form shell line (templates like
 * `ngrok http {port} --log stdout` need shell word splitting anyway), so it
 * runs under the platform shell — the same trust model as project scripts.
 */
export function buildCustomTunnelArgv(command: string, targetPort: number): string[] {
	const line = command.replaceAll("{port}", String(targetPort));
	return process.platform === "win32" ? ["cmd", "/c", line] : ["sh", "-c", line];
}

/** The tool a custom command runs, used to attribute its output lines in logs. */
export function tunnelCommandName(command: string): string {
	const binary = command.trim().split(/\s+/)[0] ?? "";
	return binary.split(/[\\/]/).pop() || "custom-tunnel";
}

/** Best-effort availability: the command's first word resolves on PATH. */
export function isCustomTunnelBinaryAvailable(command: string): boolean {
	const binary = command.trim().split(/\s+/)[0];
	if (!binary) return false;
	const probe = process.platform === "win32" ? ["where", binary] : ["which", binary];
	return spawnSync(probe).exitCode === 0;
}
