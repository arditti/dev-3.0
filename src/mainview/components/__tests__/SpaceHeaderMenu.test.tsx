import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "../../i18n";
import SpaceHeaderMenu from "../SpaceHeaderMenu";
import type { Space } from "../../../shared/types";

const space: Space = { id: "sp_a", name: "Labs", parentId: null, projectIds: ["p1"], createdAt: 1 };

function renderMenu() {
	const props = { space, onRename: vi.fn(), onDelete: vi.fn() };
	render(
		<I18nProvider>
			<SpaceHeaderMenu {...props} />
		</I18nProvider>,
	);
	return props;
}

describe("SpaceHeaderMenu", () => {
	it("rests visible and opens the space's two lifecycle actions", async () => {
		const user = userEvent.setup();
		renderMenu();
		const trigger = screen.getByTestId("space-menu-sp_a");
		expect(trigger).toHaveAttribute("aria-expanded", "false");
		await user.click(trigger);
		expect(screen.getByTestId("space-rename-sp_a")).toBeInTheDocument();
		expect(screen.getByTestId("space-delete-sp_a")).toBeInTheDocument();
	});

	it("renames through an inline field, seeded with the current name", async () => {
		const user = userEvent.setup();
		const props = renderMenu();
		await user.click(screen.getByTestId("space-menu-sp_a"));
		await user.click(screen.getByTestId("space-rename-sp_a"));
		const input = screen.getByTestId("space-rename-input-sp_a") as HTMLInputElement;
		expect(input.value).toBe("Labs");
		await user.clear(input);
		await user.type(input, "Research");
		await user.click(screen.getByTestId("space-rename-save-sp_a"));
		expect(props.onRename).toHaveBeenCalledWith(space, "Research");
	});

	it("commits a rename on Enter", async () => {
		const user = userEvent.setup();
		const props = renderMenu();
		await user.click(screen.getByTestId("space-menu-sp_a"));
		await user.click(screen.getByTestId("space-rename-sp_a"));
		const input = screen.getByTestId("space-rename-input-sp_a");
		await user.clear(input);
		await user.type(input, "Research{Enter}");
		expect(props.onRename).toHaveBeenCalledWith(space, "Research");
	});

	it("ignores an empty or unchanged rename", async () => {
		const user = userEvent.setup();
		const props = renderMenu();
		await user.click(screen.getByTestId("space-menu-sp_a"));
		await user.click(screen.getByTestId("space-rename-sp_a"));
		const input = screen.getByTestId("space-rename-input-sp_a");
		await user.type(input, "{Enter}"); // unchanged
		expect(props.onRename).not.toHaveBeenCalled();

		await user.click(screen.getByTestId("space-menu-sp_a"));
		await user.click(screen.getByTestId("space-rename-sp_a"));
		const again = screen.getByTestId("space-rename-input-sp_a");
		await user.clear(again);
		expect(screen.getByTestId("space-rename-save-sp_a")).toBeDisabled();
	});

	it("asks the host to delete, and closes itself first", async () => {
		const user = userEvent.setup();
		const props = renderMenu();
		await user.click(screen.getByTestId("space-menu-sp_a"));
		await user.click(screen.getByTestId("space-delete-sp_a"));
		expect(props.onDelete).toHaveBeenCalledWith(space);
		expect(screen.queryByTestId("space-delete-sp_a")).not.toBeInTheDocument();
	});

	it("styles delete as destructive", async () => {
		const user = userEvent.setup();
		renderMenu();
		await user.click(screen.getByTestId("space-menu-sp_a"));
		expect(screen.getByTestId("space-delete-sp_a").className).toContain("text-danger");
	});
});
