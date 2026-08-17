import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "../../i18n";
import SpaceGroupedProjects from "../SpaceGroupedProjects";
import type { DashboardGroup } from "../../utils/spaceGroups";
import type { Project, Space } from "../../../shared/types";

vi.mock("../../rpc", () => ({
	api: {
		request: {
			reorderSpaces: vi.fn(() => Promise.resolve({ version: 1, spaces: [], order: [] })),
			reorderSpaceProjects: vi.fn(() =>
				Promise.resolve({ id: "sp_a", name: "Alpha", parentId: null, projectIds: [], createdAt: 1 }),
			),
		},
	},
}));

const proj = (id: string): Project => ({
	id,
	name: id,
	path: `/tmp/${id}`,
	setupScript: "",
	devScript: "",
	cleanupScript: "",
	defaultBaseBranch: "main",
	createdAt: "2025-01-01T00:00:00Z",
});

const sp = (id: string, name: string, projectIds: string[]): Space => ({
	id,
	name,
	parentId: null,
	projectIds,
	createdAt: 1,
});

const groups: DashboardGroup[] = [
	{ space: sp("sp_a", "Alpha", ["p1", "p2"]), projects: [proj("p1"), proj("p2")] },
	{ space: sp("sp_b", "Beta", ["p1"]), projects: [proj("p1")] },
	{ space: null, projects: [proj("p3")] },
];

function renderGroups(sensitive: ReadonlySet<string> = new Set()) {
	return render(
		<I18nProvider>
			<SpaceGroupedProjects
				groups={groups}
				spaceOrder={["sp_a", "sp_b"]}
				sensitiveProjectIds={sensitive}
				needsYouCountOf={() => 0}
				workingCountOf={() => 0}
				renderProject={(p) => <div data-testid={`row-${p.id}`}>{p.name}</div>}
				renderBottomBlockProject={(p) => <div data-testid={`rest-row-${p.id}`}>{p.name}</div>}
			/>
		</I18nProvider>,
	);
}

beforeEach(() => {
	localStorage.removeItem("dev3-collapsed-spaces");
	vi.clearAllMocks();
});

describe("SpaceGroupedProjects", () => {
	it("renders headers with member counts and the provided rows under each, repeating shared projects", () => {
		renderGroups();
		expect(screen.getByTestId("space-header-sp_a")).toHaveTextContent("Alpha");
		expect(screen.getByTestId("space-header-sp_b")).toHaveTextContent("Beta");
		// p1 renders under both of its spaces.
		expect(screen.getAllByTestId("row-p1")).toHaveLength(2);
		// Bottom block renders through its own callback under the computed heading.
		expect(screen.getByTestId("space-group-rest")).toHaveTextContent("Home");
		expect(screen.getByTestId("rest-row-p3")).toBeInTheDocument();
	});

	it("collapse hides a space's rows and persists to localStorage", async () => {
		const user = userEvent.setup();
		renderGroups();
		await user.click(screen.getByTestId("space-header-sp_a"));
		expect(screen.getAllByTestId("row-p1")).toHaveLength(1); // only Beta's copy remains
		expect(screen.queryByTestId("row-p2")).not.toBeInTheDocument();
		expect(JSON.parse(localStorage.getItem("dev3-collapsed-spaces")!)).toEqual(["sp_a"]);
	});

	it("masks the header name when a member project is sensitive", () => {
		renderGroups(new Set(["p2"]));
		const alpha = screen.getByTestId("space-header-sp_a");
		expect(alpha.querySelector(".streamer-private")).not.toBeNull();
		const beta = screen.getByTestId("space-header-sp_b");
		expect(beta.querySelector(".streamer-private")).toBeNull();
	});
});

describe("SpaceGroupedProjects — header details from the mock", () => {
	it("shows a letter badge, the project count, and split need-you / working counts", () => {
		render(
			<I18nProvider>
				<SpaceGroupedProjects
					groups={groups}
					spaceOrder={["sp_a", "sp_b"]}
					sensitiveProjectIds={new Set()}
					needsYouCountOf={(id) => (id === "p1" ? 1 : 0)}
					workingCountOf={(id) => (id === "p2" ? 2 : 0)}
					renderProject={(p) => <div data-testid={`row-${p.id}`}>{p.name}</div>}
					renderBottomBlockProject={(p) => <div data-testid={`rest-row-${p.id}`}>{p.name}</div>}
				/>
			</I18nProvider>,
		);
		const header = screen.getByTestId("space-header-sp_a");
		expect(header).toHaveTextContent("A");        // letter badge
		expect(header).toHaveTextContent("2 projects");
		expect(header).toHaveTextContent("1 need you");
		expect(header).toHaveTextContent("2 working");
	});

	it("offers the add-projects control only when the handler is provided", async () => {
		const user = userEvent.setup();
		const onAddProjects = vi.fn();
		render(
			<I18nProvider>
				<SpaceGroupedProjects
					groups={groups}
					spaceOrder={["sp_a", "sp_b"]}
					sensitiveProjectIds={new Set()}
					needsYouCountOf={() => 0}
					workingCountOf={() => 0}
					renderProject={(p) => <div data-testid={`row-${p.id}`}>{p.name}</div>}
					renderBottomBlockProject={(p) => <div data-testid={`rest-row-${p.id}`}>{p.name}</div>}
					onAddProjects={onAddProjects}
				/>
			</I18nProvider>,
		);
		await user.click(screen.getByTestId("space-add-projects-sp_a"));
		expect(onAddProjects).toHaveBeenCalledWith(expect.objectContaining({ id: "sp_a" }));
	});

	it("passes the owning space id to the row renderer so chips can omit it", () => {
		const renderProject = vi.fn((p) => <div data-testid={`row-${p.id}`}>{p.name}</div>);
		render(
			<I18nProvider>
				<SpaceGroupedProjects
					groups={groups}
					spaceOrder={["sp_a", "sp_b"]}
					sensitiveProjectIds={new Set()}
					needsYouCountOf={() => 0}
					workingCountOf={() => 0}
					renderProject={renderProject}
					renderBottomBlockProject={(p) => <div data-testid={`rest-row-${p.id}`}>{p.name}</div>}
				/>
			</I18nProvider>,
		);
		expect(renderProject).toHaveBeenCalledWith(
			expect.objectContaining({ id: "p1" }),
			expect.anything(),
			"sp_a",
		);
	});
});
