import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "../../i18n";
import ActiveTasksSidebar from "../ActiveTasksSidebar";
import type { Project, Task } from "../../../shared/types";

const terminalPreview = vi.hoisted(() => ({
	close: vi.fn(),
	handlers: { onMouseEnter: vi.fn(), onMouseLeave: vi.fn() },
	state: {
		open: false,
		html: null,
		loading: false,
		pos: { top: 0, left: 0 },
		activeTaskId: null,
		cancelClose: vi.fn(),
		scheduleClose: vi.fn(),
	},
}));

vi.mock("../../hooks/useTerminalPreview", () => ({
	useTerminalPreview: () => terminalPreview,
}));

vi.mock("../../rpc", () => ({
	api: {
		request: {
			getTerminalPreview: vi.fn(),
			getAllProjectTasks: vi.fn(() => Promise.resolve([])),
			getSpaces: vi.fn(() => Promise.resolve({ version: 1, spaces: [], order: [] })),
			setTaskPriority: vi.fn(() => Promise.resolve([])),
			getGlobalSettings: vi.fn(() => Promise.resolve({ tipsDisabled: true })),
			getTipState: vi.fn(() => Promise.resolve({ snoozedUntil: 0, seen: {}, rotationIndex: 0 })),
			updateTipState: vi.fn((s) => Promise.resolve({ snoozedUntil: 0, seen: {}, rotationIndex: 0, ...s })),
		},
	},
}));

import { api } from "../../rpc";

const mockedApi = vi.mocked(api, true);

function makeProject(id: string, overrides?: Partial<Project>): Project {
	return {
		id,
		name: `Project ${id}`,
		path: `/tmp/${id}`,
		setupScript: "",
		devScript: "",
		cleanupScript: "",
		defaultBaseBranch: "main",
		createdAt: "2025-01-01T00:00:00Z",
		...overrides,
	};
}

function makeTask(id: string, projectId: string, overrides?: Partial<Task>): Task {
	return {
		id,
		seq: 1,
		projectId,
		title: `Task ${id}`,
		description: "",
		status: "in-progress",
		baseBranch: "main",
		worktreePath: "/tmp/wt",
		branchName: "feat/test",
		agentId: "builtin-claude",
		configId: "claude-bypass",
		createdAt: "2025-01-01T00:00:00Z",
		updatedAt: "2025-01-01T00:00:00Z",
		...overrides,
	} as Task;
}

const SPACES_FILE = {
	version: 1,
	spaces: [
		{ id: "s1", name: "Client X", parentId: null, projectIds: ["p1", "p2"], createdAt: 1 },
		{ id: "s2", name: "Labs", parentId: null, projectIds: ["p3"], createdAt: 2 },
	],
	order: ["s1", "s2"],
};

function renderDashboardSidebar(projects: Project[]) {
	return render(
		<I18nProvider>
			<ActiveTasksSidebar
				allProjects={projects}
				dispatch={vi.fn()}
				navigate={vi.fn()}
				agents={[]}
				bellCounts={new Map()}
				taskPorts={new Map()}
			/>
		</I18nProvider>,
	);
}

describe("SpaceSummaryStrip in the dashboard sidebar", () => {
	beforeEach(() => {
		localStorage.removeItem("dev3-sidebar-scope");
		vi.clearAllMocks();
		mockedApi.request.getSpaces.mockResolvedValue(SPACES_FILE as never);
		mockedApi.request.getAllProjectTasks.mockResolvedValue([
			{ projectId: "p1", tasks: [makeTask("t1", "p1", { status: "user-questions" })] },
			{ projectId: "p2", tasks: [makeTask("t2", "p2", { status: "in-progress" })] },
			{ projectId: "p3", tasks: [makeTask("t3", "p3", { status: "in-progress" })] },
		] as never);
	});

	it("renders one chip per space with its needs-you / working split", async () => {
		renderDashboardSidebar([makeProject("p1"), makeProject("p2"), makeProject("p3")]);

		const strip = await screen.findByTestId("sidebar-space-summary");
		const clientX = await screen.findByTestId("sidebar-space-summary-s1");
		expect(strip).toContainElement(clientX);
		expect(clientX).toHaveTextContent("Client X");
		// p1 has one needs-you task, p2 one working task.
		expect(clientX).toHaveTextContent("1");
		await waitFor(() => expect(clientX.querySelectorAll(".tabular-nums")).toHaveLength(2));

		const labs = screen.getByTestId("sidebar-space-summary-s2");
		expect(labs).toHaveTextContent("Labs");
		expect(labs.querySelectorAll(".tabular-nums")).toHaveLength(1);
	});

	it("toggles the space token in the search query and filters the list", async () => {
		const user = userEvent.setup();
		renderDashboardSidebar([makeProject("p1"), makeProject("p2"), makeProject("p3")]);

		await screen.findByText("Task t3");
		const chip = await screen.findByTestId("sidebar-space-summary-s1");
		await user.click(chip);

		const input = screen.getByRole("textbox");
		expect(input).toHaveValue('space:"Client X"');
		expect(chip).toHaveAttribute("aria-pressed", "true");
		expect(screen.getByText("Task t1")).toBeInTheDocument();
		expect(screen.queryByText("Task t3")).not.toBeInTheDocument();

		await user.click(chip);
		expect(input).toHaveValue("");
		expect(chip).toHaveAttribute("aria-pressed", "false");
		expect(await screen.findByText("Task t3")).toBeInTheDocument();
	});

	it("masks the name and counts of a space with a sensitive member", async () => {
		renderDashboardSidebar([
			makeProject("p1", { sensitive: true }),
			makeProject("p2"),
			makeProject("p3"),
		]);

		const chip = await screen.findByTestId("sidebar-space-summary-s1");
		await waitFor(() => expect(chip.querySelectorAll(".tabular-nums")).toHaveLength(2));
		expect(chip.querySelector(".streamer-private")).not.toBeNull();
		for (const count of chip.querySelectorAll(".tabular-nums")) {
			expect(count.classList.contains("streamer-private")).toBe(true);
		}
		// Labs has no sensitive member and stays readable.
		expect(screen.getByTestId("sidebar-space-summary-s2").querySelector(".streamer-private")).toBeNull();
	});

	it("is absent on a project mount even when spaces exist", async () => {
		render(
			<I18nProvider>
				<ActiveTasksSidebar
					project={makeProject("p1")}
					tasks={[makeTask("t1", "p1")]}
					allProjects={[makeProject("p1")]}
					dispatch={vi.fn()}
					navigate={vi.fn()}
					agents={[]}
					bellCounts={new Map()}
					taskPorts={new Map()}
				/>
			</I18nProvider>,
		);

		await screen.findByText("Task t1");
		expect(screen.queryByTestId("sidebar-space-summary")).not.toBeInTheDocument();
	});
});
