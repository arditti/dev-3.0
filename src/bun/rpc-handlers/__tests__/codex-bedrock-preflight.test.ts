import { describe, expect, it } from "vitest";
import { hasModelProviderSection } from "../shared-pure";

describe("hasModelProviderSection", () => {
	it("detects a bare section header", () => {
		const toml = `model = "gpt-5.6-sol"\n[model_providers.amazon-bedrock]\nname = "Bedrock"\n`;
		expect(hasModelProviderSection(toml, "amazon-bedrock")).toBe(true);
	});

	it("detects quoted section keys (double and single quotes)", () => {
		expect(hasModelProviderSection('[model_providers."amazon-bedrock"]\n', "amazon-bedrock")).toBe(true);
		expect(hasModelProviderSection("[model_providers.'amazon-bedrock']\n", "amazon-bedrock")).toBe(true);
	});

	it("detects an implicit parent via a subtable header", () => {
		expect(hasModelProviderSection("[model_providers.amazon-bedrock.extra]\n", "amazon-bedrock")).toBe(true);
	});

	it("tolerates leading whitespace before the header", () => {
		expect(hasModelProviderSection("  [model_providers.amazon-bedrock]\n", "amazon-bedrock")).toBe(true);
	});

	it("does not match a different provider id or a prefix", () => {
		expect(hasModelProviderSection("[model_providers.amazon-bedrock-eu]\n", "amazon-bedrock")).toBe(false);
		expect(hasModelProviderSection("[model_providers.openrouter]\n", "amazon-bedrock")).toBe(false);
	});

	it("does not match the id outside a model_providers header", () => {
		expect(hasModelProviderSection('provider = "amazon-bedrock"\n', "amazon-bedrock")).toBe(false);
		expect(hasModelProviderSection("", "amazon-bedrock")).toBe(false);
	});
});
