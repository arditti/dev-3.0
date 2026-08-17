import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "../../i18n";
import SpacesRail from "../SpacesRail";
import { HOME_GROUP_ID } from "../../utils/spaceGroups";
import type { Space } from "../../../shared/types";

const spaces: Space[] = [
	{ id: "sp_a", name: "Client X", parentId: null, projectIds: ["p1", "p2"], createdAt: 1 },
	{ id: "sp_b", name: "Labs", parentId: null, projectIds: ["p3"], createdAt: 1 },
];

function renderRail(over?: Partial<React.ComponentProps<typeof SpacesRail>>) {
	const props = {
		spaces,
		projectCountOf: (id: string) => (id === "sp_a" ? 2 : 1),
		maskedSpaceIds: new Set<string>(),
		totalProjects: 5,
		homeCount: 2,
		selectedSpaceId: null,
		onSelect: vi.fn(),
		onNewSpace: vi.fn(),
		...over,
	};
	render(
		<I18nProvider>
			<SpacesRail {...props} />
		</I18nProvider>,
	);
	return props;
}

describe("SpacesRail", () => {
	it("lists All projects, every space with its count, and the computed Home group", () => {
		renderRail();
		expect(screen.getByTestId("rail-all-projects")).toHaveTextContent("All projects");
		expect(screen.getByTestId("rail-all-projects")).toHaveTextContent("5");
		expect(screen.getByTestId("rail-space-sp_a")).toHaveTextContent("Client X");
		expect(screen.getByTestId("rail-space-sp_a")).toHaveTextContent("2");
		expect(screen.getByTestId("rail-home")).toHaveTextContent("Home");
	});

	it("hides Home when every project belongs to a space", () => {
		renderRail({ homeCount: 0 });
		expect(screen.queryByTestId("rail-home")).not.toBeInTheDocument();
	});

	it("reports the selection instead of navigating", async () => {
		const user = userEvent.setup();
		const props = renderRail();
		await user.click(screen.getByTestId("rail-space-sp_b"));
		expect(props.onSelect).toHaveBeenCalledWith("sp_b");
		await user.click(screen.getByTestId("rail-home"));
		expect(props.onSelect).toHaveBeenCalledWith(HOME_GROUP_ID);
		await user.click(screen.getByTestId("rail-all-projects"));
		expect(props.onSelect).toHaveBeenCalledWith(null);
	});

	it("marks the active entry with aria-pressed", () => {
		renderRail({ selectedSpaceId: "sp_a" });
		expect(screen.getByTestId("rail-space-sp_a")).toHaveAttribute("aria-pressed", "true");
		expect(screen.getByTestId("rail-all-projects")).toHaveAttribute("aria-pressed", "false");
	});

	it("masks a space name whose member project is sensitive", () => {
		renderRail({ maskedSpaceIds: new Set(["sp_a"]) });
		expect(screen.getByTestId("rail-space-sp_a").querySelector(".streamer-private")).not.toBeNull();
		expect(screen.getByTestId("rail-space-sp_b").querySelector(".streamer-private")).toBeNull();
	});

	it("opens the New Space flow", async () => {
		const user = userEvent.setup();
		const props = renderRail();
		await user.click(screen.getByTestId("rail-new-space"));
		expect(props.onNewSpace).toHaveBeenCalled();
	});
});
