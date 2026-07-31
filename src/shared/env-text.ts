/** Dotenv-style text <-> env map for per-project env vars. Values are taken
 *  verbatim after the first `=` — no quoting rules, no interpolation (v1). */

export const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

const LINE_RE = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/;

export function hasEnvLineBreak(value: string): boolean {
	return value.includes("\n") || value.includes("\r");
}

export interface EnvParseError {
	line: number;
	text: string;
}

export function parseEnvText(text: string): { env: Record<string, string>; errors: EnvParseError[] } {
	const env: Record<string, string> = {};
	const errors: EnvParseError[] = [];
	const lines = text.split("\n");
	for (let i = 0; i < lines.length; i++) {
		const raw = lines[i].endsWith("\r") ? lines[i].slice(0, -1) : lines[i];
		if (raw.trim() === "" || raw.trim().startsWith("#")) continue;
		const match = LINE_RE.exec(raw);
		if (!match) {
			errors.push({ line: i + 1, text: raw });
			continue;
		}
		env[match[1]] = match[2];
	}
	return { env, errors };
}

export function serializeEnvText(env: Record<string, string>): string {
	return Object.entries(env)
		.map(([key, value]) => `${key}=${value}`)
		.join("\n");
}

/** Best-effort cleanup for env maps read from JSON config files on disk:
 *  never throws, drops anything malformed, optionally reports each drop. */
export function sanitizeEnvMap(val: unknown, warn?: (msg: string) => void): Record<string, string> {
	if (val === null || typeof val !== "object" || Array.isArray(val)) {
		if (val !== undefined && val !== null) warn?.("Ignoring env config: not an object");
		return {};
	}
	const out: Record<string, string> = {};
	for (const [key, value] of Object.entries(val as Record<string, unknown>)) {
		if (!ENV_KEY_RE.test(key)) {
			warn?.(`Ignoring env var with invalid name: ${key}`);
			continue;
		}
		if (typeof value !== "string") {
			warn?.(`Ignoring env var with non-string value: ${key}`);
			continue;
		}
		out[key] = value;
	}
	return out;
}

/** Strict validation for env maps arriving via RPC save handlers. */
export function validateEnvMap(val: unknown): string[] {
	if (val === undefined) return [];
	if (val === null || typeof val !== "object" || Array.isArray(val)) {
		return ["env must be an object of string values"];
	}
	const problems: string[] = [];
	for (const [key, value] of Object.entries(val as Record<string, unknown>)) {
		if (!ENV_KEY_RE.test(key)) problems.push(`invalid env var name: ${key}`);
		else if (typeof value !== "string") problems.push(`env var ${key} must be a string`);
		else if (hasEnvLineBreak(value)) problems.push(`env var ${key} must not contain line breaks`);
	}
	return problems;
}
