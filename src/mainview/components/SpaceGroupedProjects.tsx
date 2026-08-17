import { useState, type DragEvent, type ReactNode } from "react";
import { isSpaceSensitive, type Project, type Space } from "../../shared/types";
import type { DashboardGroup } from "../utils/spaceGroups";
import { MASK_CLASS } from "../sensitive-projects";
import { api } from "../rpc";
import { toast } from "../toast";
import { useT } from "../i18n";

const LS_COLLAPSED_SPACES = "dev3-collapsed-spaces";

function readCollapsed(): Set<string> {
	try {
		const raw = localStorage.getItem(LS_COLLAPSED_SPACES);
		if (raw) return new Set(JSON.parse(raw) as string[]);
	} catch { /* ignore */ }
	return new Set();
}

function writeCollapsed(ids: Set<string>) {
	try {
		localStorage.setItem(LS_COLLAPSED_SPACES, JSON.stringify([...ids]));
	} catch { /* ignore */ }
}

/** Per-row reorder wiring, injected so one row renderer serves every context. */
export interface RowReorderCtx {
	/** False when the group holds one project — nothing to reorder, so the whole
	 *  grip + up/down cluster is hidden rather than shown inert. */
	showReorder: boolean;
	isDragged: boolean;
	dragEnabled: boolean;
	onDragStart: (event: DragEvent<HTMLElement>) => void;
	onDragEnd: () => void;
	onDragOver: (event: DragEvent<HTMLDivElement>) => void;
	onDragLeave: () => void;
	onDrop: (event: DragEvent<HTMLDivElement>) => void;
	showDropBefore: boolean;
	showDropAfter: boolean;
	canMoveUp: boolean;
	canMoveDown: boolean;
	onMoveUp: () => void;
	onMoveDown: () => void;
}

interface SpaceGroupedProjectsProps {
	groups: DashboardGroup[];
	/** The order of spaces as rendered (for header drag persistence). */
	spaceOrder: string[];
	sensitiveProjectIds: ReadonlySet<string>;
	/** Split header counts: tasks waiting on the user vs. tasks in flight. */
	needsYouCountOf: (projectId: string) => number;
	workingCountOf: (projectId: string) => number;
	renderProject: (project: Project, reorder: RowReorderCtx, groupSpaceId: string | null) => ReactNode;
	/** The bottom block still owns global order — same callback as the flat path. */
	renderBottomBlockProject: (project: Project, blockProjects: Project[]) => ReactNode;
	/** Opens the "add existing projects to this space" flow. */
	onAddProjects?: (space: Space) => void;
}

/**
 * Space headers around the dashboard's existing project rows. Owns collapse
 * state, header drag (space order), and within-space project drag (that
 * space's projectIds). Drag never crosses groups and never changes membership.
 */
function SpaceGroupedProjects({
	groups,
	spaceOrder,
	sensitiveProjectIds,
	needsYouCountOf,
	workingCountOf,
	renderProject,
	renderBottomBlockProject,
	onAddProjects,
}: SpaceGroupedProjectsProps) {
	const t = useT();
	// One space alone has no order to change, so its header carries no grip.
	const spaceCount = groups.filter((g) => g.space !== null).length;
	const [collapsed, setCollapsed] = useState<Set<string>>(readCollapsed);
	const [dragged, setDragged] = useState<{ spaceId: string; projectId: string } | null>(null);
	const [dropTarget, setDropTarget] = useState<{ spaceId: string; projectId: string; side: "before" | "after" } | null>(null);
	const [draggedHeader, setDraggedHeader] = useState<string | null>(null);
	const [headerDropTarget, setHeaderDropTarget] = useState<{ spaceId: string; side: "before" | "after" } | null>(null);

	function toggleCollapsed(spaceId: string) {
		setCollapsed((prev) => {
			const next = new Set(prev);
			if (next.has(spaceId)) next.delete(spaceId);
			else next.add(spaceId);
			writeCollapsed(next);
			return next;
		});
	}

	async function reorderWithinSpace(spaceId: string, members: Project[], sourceId: string, targetId: string, side: "before" | "after") {
		if (sourceId === targetId) return;
		const ids = members.map((p) => p.id);
		ids.splice(ids.indexOf(sourceId), 1);
		const targetIdx = ids.indexOf(targetId);
		if (targetIdx === -1) return;
		ids.splice(side === "after" ? targetIdx + 1 : targetIdx, 0, sourceId);
		try {
			await api.request.reorderSpaceProjects({ spaceId, projectIds: ids });
		} catch (err) {
			toast.error(t("spaces.failedUpdate", { error: String(err) }));
		}
	}

	async function reorderHeaders(sourceId: string, targetId: string, side: "before" | "after") {
		if (sourceId === targetId) return;
		const ids = [...spaceOrder];
		ids.splice(ids.indexOf(sourceId), 1);
		const targetIdx = ids.indexOf(targetId);
		if (targetIdx === -1) return;
		ids.splice(side === "after" ? targetIdx + 1 : targetIdx, 0, sourceId);
		try {
			await api.request.reorderSpaces({ order: ids });
		} catch (err) {
			toast.error(t("spaces.failedUpdate", { error: String(err) }));
		}
	}

	function rowCtx(spaceId: string, members: Project[], project: Project, index: number): RowReorderCtx {
		const isTarget = dropTarget?.spaceId === spaceId && dropTarget.projectId === project.id;
		const canReorder = members.length > 1;
		return {
			showReorder: canReorder,
			isDragged: dragged?.spaceId === spaceId && dragged.projectId === project.id,
			dragEnabled: canReorder,
			onDragStart: (event) => {
				setDragged({ spaceId, projectId: project.id });
				event.dataTransfer.setData("text/plain", `space-project:${spaceId}:${project.id}`);
				event.dataTransfer.effectAllowed = "move";
			},
			onDragEnd: () => {
				setDragged(null);
				setDropTarget(null);
			},
			onDragOver: (event) => {
				// Cross-group drops are a no-op: membership is not drag's job.
				if (!dragged || dragged.spaceId !== spaceId || dragged.projectId === project.id) return;
				event.preventDefault();
				event.dataTransfer.dropEffect = "move";
				const rect = event.currentTarget.getBoundingClientRect();
				const side = event.clientY > rect.top + rect.height / 2 ? "after" : "before";
				setDropTarget({ spaceId, projectId: project.id, side });
			},
			onDragLeave: () => {
				setDropTarget((cur) => (cur?.spaceId === spaceId && cur.projectId === project.id ? null : cur));
			},
			onDrop: (event) => {
				event.preventDefault();
				if (!dragged || dragged.spaceId !== spaceId) return;
				const side = isTarget ? dropTarget.side : "before";
				const source = dragged.projectId;
				setDragged(null);
				setDropTarget(null);
				void reorderWithinSpace(spaceId, members, source, project.id, side);
			},
			showDropBefore: !!isTarget && dropTarget.side === "before",
			showDropAfter: !!isTarget && dropTarget.side === "after",
			canMoveUp: index > 0,
			canMoveDown: index < members.length - 1,
			onMoveUp: () => {
				const target = members[index - 1];
				if (target) void reorderWithinSpace(spaceId, members, project.id, target.id, "before");
			},
			onMoveDown: () => {
				const target = members[index + 1];
				if (target) void reorderWithinSpace(spaceId, members, project.id, target.id, "after");
			},
		};
	}

	return (
		<>
			{groups.map((group) => {
				if (group.space === null) {
					if (group.projects.length === 0) return null;
					return (
						<div key="no-space" className="space-y-4" data-testid="space-group-rest">
							<div className="flex items-center gap-2 pt-2">
								<span className="text-fg-3 text-xs font-semibold uppercase tracking-wider">
									{t("spaces.homeGroup")}
								</span>
								<span className="text-fg-muted text-xs tabular-nums">{group.projects.length}</span>
							</div>
							{group.projects.map((project) => renderBottomBlockProject(project, group.projects))}
						</div>
					);
				}

				const space = group.space;
				const isCollapsed = collapsed.has(space.id);
				const masked = isSpaceSensitive(space, sensitiveProjectIds);
				const needsYou = group.projects.reduce((sum, p) => sum + needsYouCountOf(p.id), 0);
				const working = group.projects.reduce((sum, p) => sum + workingCountOf(p.id), 0);
				const isHeaderTarget = headerDropTarget?.spaceId === space.id;

				return (
					<div key={space.id} className="space-y-4 relative" data-testid={`space-group-${space.id}`}>
						{isHeaderTarget && headerDropTarget.side === "before" && (
							<div className="absolute -top-2 left-3 right-3 h-0.5 bg-accent rounded-full z-10" />
						)}
						{isHeaderTarget && headerDropTarget.side === "after" && (
							<div className="absolute -bottom-2 left-3 right-3 h-0.5 bg-accent rounded-full z-10" />
						)}
						<div
							className={`flex items-center gap-2 pt-2 ${draggedHeader === space.id ? "opacity-60" : ""}`}
							onDragOver={(event) => {
								if (!draggedHeader || draggedHeader === space.id) return;
								event.preventDefault();
								event.dataTransfer.dropEffect = "move";
								const rect = event.currentTarget.getBoundingClientRect();
								const side = event.clientY > rect.top + rect.height / 2 ? "after" : "before";
								setHeaderDropTarget({ spaceId: space.id, side });
							}}
							onDragLeave={() => setHeaderDropTarget((cur) => (cur?.spaceId === space.id ? null : cur))}
							onDrop={(event) => {
								event.preventDefault();
								if (!draggedHeader) return;
								const side = isHeaderTarget ? headerDropTarget.side : "before";
								const source = draggedHeader;
								setDraggedHeader(null);
								setHeaderDropTarget(null);
								void reorderHeaders(source, space.id, side);
							}}
						>
							{spaceCount > 1 && (
							<span
								role="presentation"
								draggable
								onDragStart={(event) => {
									setDraggedHeader(space.id);
									event.dataTransfer.setData("text/plain", `space:${space.id}`);
									event.dataTransfer.effectAllowed = "move";
								}}
								onDragEnd={() => {
									setDraggedHeader(null);
									setHeaderDropTarget(null);
								}}
								className="hidden md:inline-flex p-1 rounded text-fg-muted hover:text-fg cursor-grab active:cursor-grabbing"
								title={t("spaces.reorderSpace")}
							>
								<span aria-hidden="true" className="text-sm leading-none" style={{ fontFamily: "'JetBrainsMono Nerd Font Mono'" }}>
									{"\u{F01DB}"}
								</span>
							</span>
						)}
							<button
								type="button"
								onClick={() => toggleCollapsed(space.id)}
								aria-expanded={!isCollapsed}
								className="flex items-center gap-2 min-w-0 text-left group"
								data-testid={`space-header-${space.id}`}
							>
								<svg
									aria-hidden="true"
									focusable="false"
									className={`w-3.5 h-3.5 text-fg-muted group-hover:text-fg-3 transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
								</svg>
								<span className={`text-fg-2 text-sm font-semibold truncate ${masked ? MASK_CLASS : ""}`}>
									{space.name}
								</span>
								<span className="text-fg-muted text-xs tabular-nums flex-shrink-0">
									{t.plural("spaces.projectCount", group.projects.length)}
								</span>
								{needsYou > 0 && (
									<span className="flex items-center gap-1 flex-shrink-0 text-xs text-fg-3">
										<span aria-hidden="true" className="w-2 h-2 rounded-full bg-awake" />
										{t("spaces.needYou", { count: String(needsYou) })}
									</span>
								)}
								{working > 0 && (
									<span className="flex items-center gap-1 flex-shrink-0 text-xs text-fg-3">
										<span aria-hidden="true" className="w-2 h-2 rounded-full bg-accent" />
										{t("spaces.working", { count: String(working) })}
									</span>
								)}
							</button>
							{onAddProjects && (
								<button
									type="button"
									onClick={() => onAddProjects(space)}
									className="ml-auto p-1 rounded text-fg-muted hover:text-fg hover:bg-elevated transition-colors"
									title={t("spaces.addProjects")}
									aria-label={t("spaces.addProjects")}
									data-testid={`space-add-projects-${space.id}`}
								>
									<svg aria-hidden="true" focusable="false" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
										<path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
									</svg>
								</button>
							)}
						</div>
						{!isCollapsed && group.projects.map((project, index) => (
							<div key={`${space.id}:${project.id}`}>
								{renderProject(project, rowCtx(space.id, group.projects, project, index), space.id)}
							</div>
						))}
					</div>
				);
			})}
		</>
	);
}

export default SpaceGroupedProjects;
