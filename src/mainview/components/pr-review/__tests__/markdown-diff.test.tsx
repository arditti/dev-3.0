import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { buildMarkdownDiffBlocks, MarkdownRichDiff } from "../markdown-diff";

const mermaid = vi.hoisted(() => ({
	initialize: vi.fn(),
	render: vi.fn(),
}));

vi.mock("@streamdown/mermaid", () => ({
	createMermaidPlugin: () => ({
		name: "mermaid",
		type: "diagram",
		language: "mermaid",
		getMermaid: (config?: unknown) => {
			if (config) mermaid.initialize(config);
			return mermaid;
		},
	}),
}));

beforeEach(() => {
	vi.clearAllMocks();
	mermaid.render.mockResolvedValue({
		svg: '<svg data-testid="rendered-mermaid" role="graphics-document"></svg>',
		diagramType: "flowchart-v2",
	});
});

describe("buildMarkdownDiffBlocks", () => {
	it("returns null when both sides render the same document", () => {
		expect(buildMarkdownDiffBlocks("# Same\n\ntext\n", "# Same\n\ntext\n")).toBeNull();
	});

	it("ignores blank-line-only churn", () => {
		expect(buildMarkdownDiffBlocks("# Same\n\ntext\n", "# Same\n\n\n\ntext\n\n")).toBeNull();
	});

	it("marks a replaced paragraph as removed then added", () => {
		const blocks = buildMarkdownDiffBlocks("# Title\n\nold text\n", "# Title\n\nnew text\n");
		expect(blocks?.map((block) => block.kind)).toEqual(["context", "removed", "added"]);
		expect(blocks?.[0].source).toBe("# Title");
		expect(blocks?.[1].source).toBe("old text");
		expect(blocks?.[2].source).toBe("new text");
	});

	it("scopes a list change to the changed item", () => {
		const blocks = buildMarkdownDiffBlocks("- one\n- two\n", "- one\n- inserted\n- two\n");
		expect(blocks?.filter((block) => block.kind !== "context")).toHaveLength(1);
		const added = blocks?.find((block) => block.kind === "added");
		expect(added?.source).toContain("inserted");
		expect(added?.source).not.toContain("one");
	});

	it("keeps consecutive unchanged list items in one list", () => {
		const blocks = buildMarkdownDiffBlocks("- one\n- two\n\npara\n", "- one\n- two\n\nother\n");
		const context = blocks?.find((block) => block.kind === "context");
		expect(context?.source).toBe("- one\n- two");
	});

	it("keeps the numbering of an ordered list item", () => {
		const blocks = buildMarkdownDiffBlocks("1. first\n2. second\n", "1. first\n2. changed\n");
		expect(blocks?.find((block) => block.kind === "added")?.source).toBe("2. changed");
	});
});

describe("MarkdownRichDiff", () => {
	it("tags every block with its change kind", () => {
		const blocks = buildMarkdownDiffBlocks("old\n", "new\n") ?? [];
		render(<MarkdownRichDiff blocks={blocks} />);

		const host = screen.getByTestId("markdown-rich-diff");
		expect(host.querySelector("[data-diff-kind='removed']")?.textContent).toContain("old");
		expect(host.querySelector("[data-diff-kind='added']")?.textContent).toContain("new");
	});

	it("sanitizes markup on both sides", () => {
		const blocks = buildMarkdownDiffBlocks(
			"<script>alert(1)</script>gone\n",
			"<img src=\"x\" onerror=\"alert(2)\">stays\n",
		) ?? [];
		render(<MarkdownRichDiff blocks={blocks} />);

		const host = screen.getByTestId("markdown-rich-diff");
		expect(host.querySelector("script")).toBeNull();
		expect(host.querySelector("[onerror]")).toBeNull();
	});

	it("renders Mermaid fences inside changed blocks", async () => {
		const blocks = buildMarkdownDiffBlocks(
			"```mermaid\nflowchart LR\nA --> B\n```\n",
			"```mermaid\nflowchart LR\nA --> C\n```\n",
		) ?? [];
		render(<MarkdownRichDiff blocks={blocks} />);

		await waitFor(() => expect(mermaid.render).toHaveBeenCalledTimes(2));
		expect(screen.getAllByRole("img", { name: "Mermaid chart" })).toHaveLength(2);
		expect(screen.getAllByTestId("rendered-mermaid")).toHaveLength(2);
	});
});
