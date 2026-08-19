import { useEffect, useMemo, useState, type Dispatch } from "react";
import { toast } from "../toast";
import type { CodingAgent, PortInfo, Project } from "../../shared/types";
import { isBuiltinOpsProject, isSpaceSensitive, orderProjectsForDisplay } from "../../shared/types";
import type { AppAction, Route } from "../state";
import { api } from "../rpc";
import { confirm } from "../confirm";
import { useT } from "../i18n";
import { trackEvent } from "../analytics";
import { useSpaces } from "../useSpaces";
import { useNarrowViewport } from "../hooks/useNarrowViewport";
import { CAROUSEL_MAX_WIDTH } from "./MobileBoardCarousel";
import ActivityOverview from "./ActivityOverview";
import ActiveTasksSidebar from "./ActiveTasksSidebar";
import SpacesRail, { SPACES_RAIL_MIN_WIDTH } from "./SpacesRail";
import NewSpaceModal from "./NewSpaceModal";

interface DashboardProps {
	projects: Project[];
	dispatch: Dispatch<AppAction>;
	navigate: (route: Route) => void;
	bellCounts: Map<string, number>;
	bellReasons?: Map<string, string[]>;
	taskPorts: Map<string, PortInfo[]>;
	agents: CodingAgent[];
	onOpenAddProject: (spaceIds?: string[]) => void;
}

function Dashboard({
	projects,
	dispatch,
	navigate,
	bellCounts,
	bellReasons,
	taskPorts,
	agents,
	onOpenAddProject,
}: DashboardProps) {
	const t = useT();
	const { spaces } = useSpaces();
	const narrow = useNarrowViewport(CAROUSEL_MAX_WIDTH);
	const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
	const [showNewSpace, setShowNewSpace] = useState(false);

	// The rail hides below Tailwind's `lg` (1024px) with plain CSS. A selection
	// made on a wide window must not keep filtering once its control is gone.
	const railHidden = useNarrowViewport(SPACES_RAIL_MIN_WIDTH);
	useEffect(() => {
		if (railHidden) setSelectedSpaceId(null);
	}, [railHidden]);

	// The rail and the cross-space task panel only exist once a space does:
	// with zero spaces the dashboard stays exactly the screen it was.
	const hasSpaces = spaces.length > 0;

	const railCounts = useMemo(() => {
		const ordinary = projects.filter((p) => !p.deleted && !isBuiltinOpsProject(p));
		const known = new Set(ordinary.map((p) => p.id));
		const perSpace = new Map<string, number>();
		const associated = new Set<string>();
		for (const space of spaces) {
			const members = space.projectIds.filter((id) => known.has(id));
			perSpace.set(space.id, members.length);
			for (const id of members) associated.add(id);
		}
		return {
			perSpace,
			// `All projects` shows the pinned Operations board too, so its count
			// includes it — and thereby always agrees with the overview heading.
			total: projects.filter((p) => !p.deleted).length,
			home: ordinary.filter((p) => !associated.has(p.id)).length,
		};
	}, [projects, spaces]);

	const maskedSpaceIds = useMemo(() => {
		const sensitive = new Set(projects.filter((p) => p.sensitive).map((p) => p.id));
		return new Set(spaces.filter((s) => isSpaceSensitive(s, sensitive)).map((s) => s.id));
	}, [projects, spaces]);

	async function handleReorderSpaces(order: string[]) {
		try {
			await api.request.reorderSpaces({ order });
		} catch (err) {
			toast.error(t("spaces.failedUpdate", { error: String(err) }), { source: "dashboard" });
		}
	}

	async function handleRemoveProject(projectId: string) {
		const confirmed = await confirm({
			title: t("dashboard.confirmRemoveTitle"),
			message: t("dashboard.confirmRemove"),
			confirmLabel: t("dashboard.confirmRemoveAction"),
			danger: true,
		});
		if (!confirmed) return;
		try {
			await api.request.removeProject({ projectId });
			dispatch({ type: "removeProject", projectId });
			trackEvent("project_removed", { project_id: projectId });
		} catch (err) {
			toast.error(t("dashboard.failedRemove", { error: String(err) }), { projectId });
		}
	}

	async function handleReorderProjects(projectIds: string[]) {
		const previousProjects = projects;
		dispatch({ type: "reorderProjects", projectIds });
		try {
			const reordered = await api.request.reorderProjects({ projectIds });
			// reorderProjects only operates on git projects.json — re-merge virtual
			// boards (Operations) so they are not wiped from state on confirmation.
			const virtuals = previousProjects.filter((p) => p.kind === "virtual");
			dispatch({ type: "setProjects", projects: orderProjectsForDisplay([...reordered, ...virtuals]) });
			trackEvent("projects_reordered", { project_count: projectIds.length });
		} catch (err) {
			dispatch({ type: "setProjects", projects: previousProjects });
			toast.error(t("dashboard.failedReorder", { error: String(err) }), { source: "dashboard" });
		}
	}

	return (
		<div className="h-full w-full flex flex-col">
			<div className="flex-1 overflow-hidden flex">
				{hasSpaces && projects.length > 0 && (
					<SpacesRail
						spaces={spaces}
						projectCountOf={(id) => railCounts.perSpace.get(id) ?? 0}
						maskedSpaceIds={maskedSpaceIds}
						totalProjects={railCounts.total}
						homeCount={railCounts.home}
						selectedSpaceId={selectedSpaceId}
						onSelect={setSelectedSpaceId}
						onNewSpace={() => setShowNewSpace(true)}
						onReorder={handleReorderSpaces}
					/>
				)}
				<div className="flex-1 min-w-0 overflow-hidden">
				{projects.length > 0 ? (
					<ActivityOverview
						projects={projects}
						dispatch={dispatch}
						navigate={navigate}
						bellCounts={bellCounts}
						onRemoveProject={handleRemoveProject}
						onOpenAddProject={onOpenAddProject}
						onReorderProjects={handleReorderProjects}
						selectedSpaceId={selectedSpaceId}
						onNewSpace={() => setShowNewSpace(true)}
					/>
				) : (
					<div className="h-full overflow-y-auto p-3 md:p-7">
						<div className="flex flex-col items-center justify-center h-full">
							<div className="w-20 h-20 rounded-2xl bg-raised flex items-center justify-center mb-5">
								<svg
									aria-hidden="true"
									focusable="false"
									className="w-10 h-10 text-fg-3"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={1.5}
										d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
									/>
								</svg>
							</div>
							<h2 className="text-fg-2 text-lg font-medium mb-1 text-center text-pretty max-w-xs">
								{t("dashboard.noProjects")}
							</h2>
							<p className="text-fg-3 text-sm mb-5 text-center text-pretty max-w-xs">
								{t("dashboard.noProjectsHint")}
							</p>
							<button
								onClick={() => onOpenAddProject()}
								className="px-5 py-2 bg-accent-fill text-white text-sm font-semibold rounded-xl hover:bg-accent-fill-hover shadow-lg shadow-accent/20 transition-[background-color,transform] active:scale-[0.96]"
							>
								{t("dashboard.addProject")}
							</button>
						</div>
					</div>
				)}
				</div>
				{/* The same sidebar component the project view uses, with no current
				    project: locked to global scope — active work across all spaces. */}
				{hasSpaces && projects.length > 0 && !narrow && (
					<div className="w-[21rem] flex-shrink-0 border-l border-edge overflow-hidden">
						<ActiveTasksSidebar
							allProjects={projects}
							dispatch={dispatch}
							navigate={navigate}
							agents={agents}
							bellCounts={bellCounts}
							bellReasons={bellReasons}
							taskPorts={taskPorts}
						/>
					</div>
				)}
			</div>
			{showNewSpace && (
				<NewSpaceModal projects={projects} onClose={() => setShowNewSpace(false)} />
			)}
		</div>
	);
}

export default Dashboard;
