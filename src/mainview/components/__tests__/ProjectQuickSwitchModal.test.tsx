import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "../../i18n";
import ProjectQuickSwitchModal from "../ProjectQuickSwitchModal";
import type { Project } from "../../../shared/types";

vi.mock("../../rpc", () => ({
	api: {
		request: {
			getSpaces: vi.fn(() =>
				Promise.resolve({
					version: 1,
					spaces: [{ id: "sp_a", name: "Client X", parentId: null, projectIds: ["p1"], createdAt: 1 }],
					order: ["sp_a"],
				}),
			),
		},
	},
}));

const proj = (id: string, name: string): Project => ({
	id,
	name,
	path: `/tmp/${id}`,
	setupScript: "",
	devScript: "",
	cleanupScript: "",
	defaultBaseBranch: "main",
	createdAt: "2025-01-01T00:00:00Z",
});

describe("ProjectQuickSwitchModal — space name matching", () => {
	it("matching a space name surfaces its member projects, label stays the project name", async () => {
		const user = userEvent.setup();
		render(
			<I18nProvider>
				<ProjectQuickSwitchModal
					projects={[proj("p1", "api-server"), proj("p2", "unrelated")]}
					onSelect={vi.fn()}
					onClose={vi.fn()}
				/>
			</I18nProvider>,
		);
		const rowTexts = () =>
			screen.getAllByRole("option").map((el) => el.textContent ?? "");
		// Wait for the spaces fetch so the haystack includes "Client X".
		await waitFor(() => expect(rowTexts()).toHaveLength(2));
		await user.type(screen.getByRole("textbox"), "client");
		await waitFor(() => {
			const rows = rowTexts();
			expect(rows).toHaveLength(1);
			expect(rows[0]).toContain("api-server");
			// Space names never leak into the visible label.
			expect(rows[0]).not.toContain("Client X");
		});
	});
});
