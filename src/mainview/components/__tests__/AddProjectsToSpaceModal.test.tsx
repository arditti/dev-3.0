import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "../../i18n";
import AddProjectsToSpaceModal from "../AddProjectsToSpaceModal";
import type { Project, Space } from "../../../shared/types";

const file = { version: 1 as const, spaces: [], order: [] };

vi.mock("../../rpc", () => ({
	api: {
		request: {
			getSpaces: vi.fn(() => Promise.resolve(file)),
			setProjectSpaces: vi.fn(() => Promise.resolve({ file, autoDeleted: [] })),
		},
	},
}));

const proj = (id: string, name: string, path: string): Project => ({
	id,
	name,
	path,
	setupScript: "",
	devScript: "",
	cleanupScript: "",
	defaultBaseBranch: "main",
	createdAt: "2025-01-01T00:00:00Z",
});

const space: Space = { id: "sp_a", name: "Labs", parentId: null, projectIds: ["p9"], createdAt: 1 };

const projects = [
	proj("p1", "benchmark-waf", "/dev/work/benchmark-waf"),
	proj("p2", "home-infra", "/dev/personal/home-infra"),
	proj("p9", "already-member", "/dev/already"),
];

beforeEach(() => vi.clearAllMocks());

function renderModal(over?: Partial<React.ComponentProps<typeof AddProjectsToSpaceModal>>) {
	const props = { space, projects, onClose: vi.fn(), onCreateProject: vi.fn(), ...over };
	render(
		<I18nProvider>
			<AddProjectsToSpaceModal {...props} />
		</I18nProvider>,
	);
	return props;
}

describe("AddProjectsToSpaceModal", () => {
	it("lists candidates and excludes projects already in the space", () => {
		renderModal();
		expect(screen.getByTestId("add-to-space-p1")).toBeInTheDocument();
		expect(screen.queryByTestId("add-to-space-p9")).not.toBeInTheDocument();
	});

	it("filters by name", async () => {
		const user = userEvent.setup();
		renderModal();
		await user.type(screen.getByTestId("add-to-space-search"), "bench");
		expect(screen.getByTestId("add-to-space-p1")).toBeInTheDocument();
		expect(screen.queryByTestId("add-to-space-p2")).not.toBeInTheDocument();
	});

	it("filters by path, since a project is often recognised by where it lives", async () => {
		const user = userEvent.setup();
		renderModal();
		await user.type(screen.getByTestId("add-to-space-search"), "personal");
		expect(screen.getByTestId("add-to-space-p2")).toBeInTheDocument();
		expect(screen.queryByTestId("add-to-space-p1")).not.toBeInTheDocument();
	});

	it("says nothing matches instead of claiming every project is already a member", async () => {
		const user = userEvent.setup();
		renderModal();
		await user.type(screen.getByTestId("add-to-space-search"), "zzz");
		expect(screen.getByText("No project matches")).toBeInTheDocument();
		expect(screen.queryByText("Every project is already in this space")).not.toBeInTheDocument();
	});

	it("hands off to the Add Project flow for this space", async () => {
		const user = userEvent.setup();
		const props = renderModal();
		await user.click(screen.getByTestId("add-to-space-new-project"));
		expect(props.onCreateProject).toHaveBeenCalledWith(space);
	});

	it("omits the create affordance when the host cannot open that flow", () => {
		renderModal({ onCreateProject: undefined });
		expect(screen.queryByTestId("add-to-space-new-project")).not.toBeInTheDocument();
	});

	it("adds the checked projects to the space", async () => {
		const user = userEvent.setup();
		const { api } = await import("../../rpc");
		const props = renderModal();
		await user.click(screen.getByTestId("add-to-space-p1"));
		await user.click(screen.getByTestId("add-to-space-submit"));
		await waitFor(() => expect(props.onClose).toHaveBeenCalled());
		expect(api.request.setProjectSpaces).toHaveBeenCalledWith({ projectId: "p1", spaceIds: ["sp_a"] });
	});
});
