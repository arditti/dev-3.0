import { describe, it, expect, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	spawnSync: vi.fn(),
	loadSettingsSync: vi.fn(),
}));

vi.mock("../spawn", () => ({
	spawn: vi.fn(),
	spawnSync: mocks.spawnSync,
}));

vi.mock("../settings", () => ({
	loadSettingsSync: mocks.loadSettingsSync,
}));

import {
	GENERIC_TUNNEL_URL_REGEX,
	buildCustomTunnelArgv,
	compileUrlPattern,
	isCustomTunnelBinaryAvailable,
	resolveRemoteTunnelProvider,
	tunnelCommandName,
} from "../tunnel-provider";

describe("tunnelCommandName", () => {
	it("names the tool the command runs", () => {
		expect(tunnelCommandName("ngrok http {port} --log stdout")).toBe("ngrok");
	});

	it("strips a path so the log label stays short", () => {
		expect(tunnelCommandName("/opt/tools/bin/expose --port {port}")).toBe("expose");
	});

	it("falls back to a generic label for a blank command", () => {
		expect(tunnelCommandName("   ")).toBe("custom-tunnel");
	});
});

describe("resolveRemoteTunnelProvider", () => {
	it("defaults to cloudflare when nothing is configured", () => {
		expect(resolveRemoteTunnelProvider({}).kind).toBe("cloudflare");
		expect(resolveRemoteTunnelProvider({ remoteTunnel: undefined }).kind).toBe("cloudflare");
	});

	it("stays on cloudflare when the custom command is blank", () => {
		expect(resolveRemoteTunnelProvider({ remoteTunnel: { provider: "custom", command: "  " } }).kind).toBe("cloudflare");
	});

	it("resolves a configured custom command with its URL pattern", () => {
		const provider = resolveRemoteTunnelProvider({
			remoteTunnel: { provider: "custom", command: " ngrok http {port} --log stdout ", urlPattern: "https://\\S+\\.example\\.com" },
		});
		expect(provider.kind).toBe("custom");
		expect(provider.command).toBe("ngrok http {port} --log stdout");
		expect("wss://x https://foo.example.com done".match(provider.urlRegex!)?.[0]).toBe("https://foo.example.com");
	});

	it("reads settings from disk when none are passed", () => {
		mocks.loadSettingsSync.mockReturnValue({ remoteTunnel: { provider: "custom", command: "tunnel {port}" } });
		expect(resolveRemoteTunnelProvider().kind).toBe("custom");
	});
});

describe("compileUrlPattern", () => {
	it("falls back to the generic https match on an invalid regex", () => {
		expect(compileUrlPattern("([")).toBe(GENERIC_TUNNEL_URL_REGEX);
		expect(compileUrlPattern("")).toBe(GENERIC_TUNNEL_URL_REGEX);
		expect(compileUrlPattern(undefined)).toBe(GENERIC_TUNNEL_URL_REGEX);
	});
});

describe("GENERIC_TUNNEL_URL_REGEX", () => {
	it("scrapes the first https URL from typical tunnel CLI output", () => {
		const cases: Array<[string, string]> = [
			// ngrok --log stdout
			[
				't=2026-08-23 lvl=info msg="started tunnel" obj=tunnels name=command_line addr=http://localhost:3000 url=https://a1b2.ngrok-free.app',
				"https://a1b2.ngrok-free.app",
			],
			// cloudflared banner style
			["INF |  https://random-words.trycloudflare.com  |", "https://random-words.trycloudflare.com"],
			// plain "Public: <url>" style
			["   Public: https://me-app.tunnel.example.com", "https://me-app.tunnel.example.com"],
			// URL with a port
			["forwarding https://host.example.net:8443 -> localhost", "https://host.example.net:8443"],
		];
		for (const [line, expected] of cases) {
			expect(line.match(GENERIC_TUNNEL_URL_REGEX)?.[0]).toBe(expected);
		}
	});

	it("does not match non-https output lines", () => {
		expect("listening on http://localhost:3000".match(GENERIC_TUNNEL_URL_REGEX)).toBeNull();
	});
});

describe("buildCustomTunnelArgv", () => {
	it("substitutes {port} and runs under the shell", () => {
		const argv = buildCustomTunnelArgv("ngrok http {port} --log stdout", 18590);
		expect(argv.slice(0, 2)).toEqual(process.platform === "win32" ? ["cmd", "/c"] : ["sh", "-c"]);
		expect(argv[2]).toBe("ngrok http 18590 --log stdout");
	});

	it("substitutes every occurrence of {port}", () => {
		const argv = buildCustomTunnelArgv("tunnel {port} --name app-{port}", 4242);
		expect(argv[2]).toBe("tunnel 4242 --name app-4242");
	});
});

describe("isCustomTunnelBinaryAvailable", () => {
	it("probes the command's first word on PATH", () => {
		mocks.spawnSync.mockReturnValue({ exitCode: 0 });
		expect(isCustomTunnelBinaryAvailable("ngrok http {port}")).toBe(true);
		const probe = process.platform === "win32" ? "where" : "which";
		expect(mocks.spawnSync).toHaveBeenCalledWith([probe, "ngrok"]);

		mocks.spawnSync.mockReturnValue({ exitCode: 1 });
		expect(isCustomTunnelBinaryAvailable("missing-tool {port}")).toBe(false);
	});

	it("rejects an empty command", () => {
		expect(isCustomTunnelBinaryAvailable("   ")).toBe(false);
	});
});
