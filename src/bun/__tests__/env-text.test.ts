import { describe, expect, it } from "vitest";
import { parseEnvText, serializeEnvText, sanitizeEnvMap, validateEnvMap } from "../../shared/env-text";

describe("parseEnvText", () => {
	it("parses KEY=value lines", () => {
		expect(parseEnvText("FOO=bar\nBAZ=qux").env).toEqual({ FOO: "bar", BAZ: "qux" });
	});

	it("keeps everything after the first = verbatim, including = and spaces", () => {
		expect(parseEnvText("URL=https://x.dev/?a=1&b=2").env).toEqual({ URL: "https://x.dev/?a=1&b=2" });
		expect(parseEnvText("MSG= hello world ").env).toEqual({ MSG: " hello world " });
	});

	it("parses CRLF line endings", () => {
		expect(parseEnvText("FOO=bar\r\nBAZ=qux\r\n")).toEqual({
			env: { FOO: "bar", BAZ: "qux" },
			errors: [],
		});
	});

	it("allows empty values", () => {
		expect(parseEnvText("EMPTY=").env).toEqual({ EMPTY: "" });
	});

	it("skips blank lines and # comments", () => {
		const { env, errors } = parseEnvText("# comment\n\n  \nFOO=1\n  # indented comment");
		expect(env).toEqual({ FOO: "1" });
		expect(errors).toEqual([]);
	});

	it("reports invalid lines with 1-based line numbers", () => {
		const { env, errors } = parseEnvText("FOO=1\nnot a var\n2BAD=x");
		expect(env).toEqual({ FOO: "1" });
		expect(errors).toEqual([
			{ line: 2, text: "not a var" },
			{ line: 3, text: "2BAD=x" },
		]);
	});

	it("last duplicate key wins", () => {
		expect(parseEnvText("A=1\nA=2").env).toEqual({ A: "2" });
	});
});

describe("serializeEnvText", () => {
	it("round-trips with parseEnvText", () => {
		const env = { FOO: "bar", URL: "https://x.dev/?a=1", EMPTY: "" };
		expect(parseEnvText(serializeEnvText(env)).env).toEqual(env);
	});

	it("returns empty string for empty map", () => {
		expect(serializeEnvText({})).toBe("");
	});
});

describe("sanitizeEnvMap", () => {
	it("returns {} for non-objects", () => {
		expect(sanitizeEnvMap(null)).toEqual({});
		expect(sanitizeEnvMap("FOO=1")).toEqual({});
		expect(sanitizeEnvMap([1, 2])).toEqual({});
	});

	it("returns {} silently for undefined (not configured)", () => {
		const warnings: string[] = [];
		expect(sanitizeEnvMap(undefined, (m) => warnings.push(m))).toEqual({});
		expect(warnings).toEqual([]);
	});

	it("drops non-string values and invalid keys, keeps the rest, warns per drop", () => {
		const warnings: string[] = [];
		const out = sanitizeEnvMap({ GOOD: "1", BAD_NUM: 2, "2BAD": "x" }, (m) => warnings.push(m));
		expect(out).toEqual({ GOOD: "1" });
		expect(warnings.length).toBe(2);
	});
});

describe("validateEnvMap", () => {
	it("accepts a valid map and undefined", () => {
		expect(validateEnvMap({ FOO: "bar" })).toEqual([]);
		expect(validateEnvMap(undefined)).toEqual([]);
	});

	it("rejects non-object, invalid keys, non-string values", () => {
		expect(validateEnvMap("x").length).toBe(1);
		expect(validateEnvMap({ "2BAD": "x" }).length).toBe(1);
		expect(validateEnvMap({ FOO: 3 }).length).toBe(1);
	});

	it("rejects line breaks in values", () => {
		expect(validateEnvMap({ LF: "a\nb", CR: "a\rb" })).toEqual([
			"env var LF must not contain line breaks",
			"env var CR must not contain line breaks",
		]);
	});
});
