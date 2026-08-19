import { useMemo } from "react";
import type { Project, Space, Task, TaskStatus } from "../../shared/types";
import { isSpaceSensitive } from "../../shared/types";
import { MASK_CLASS } from "../sensitive-projects";
import { isFacetTokenActive, toggleFacetToken } from "../utils/taskSearch";
import { useT } from "../i18n";

// Same needs-you / working split the space headers on the overview use.
const NEEDS_ME_STATUSES: TaskStatus[] = ["user-questions", "review-by-user"];
const BACKGROUND_STATUSES: TaskStatus[] = ["in-progress", "review-by-ai"];

interface SpaceSummaryStripProps {
	spaces: Space[];
	/** The sidebar's cross-project task pool (unfiltered by the search query). */
	tasks: Task[];
	allProjects: Project[];
	query: string;
	onQueryChange: (query: string) => void;
}

/**
 * Dashboard-only summary row over the sidebar's task pool: one chip per space
 * with its needs-you / working split. A chip toggles the existing `space:"…"`
 * token, so it composes with the All / Needs-you presets and anything else the
 * user typed — no second filtering model.
 */
function SpaceSummaryStrip({ spaces, tasks, allProjects, query, onQueryChange }: SpaceSummaryStripProps) {
	const t = useT();

	const sensitiveIds = useMemo(
		() => new Set(allProjects.filter((p) => p.sensitive).map((p) => p.id)),
		[allProjects],
	);

	const summaries = useMemo(
		() =>
			spaces.map((space) => {
				const members = new Set(space.projectIds);
				let needsYou = 0;
				let working = 0;
				for (const task of tasks) {
					if (!members.has(task.projectId)) continue;
					if (NEEDS_ME_STATUSES.includes(task.status)) needsYou++;
					else if (BACKGROUND_STATUSES.includes(task.status)) working++;
				}
				return { space, needsYou, working, masked: isSpaceSensitive(space, sensitiveIds) };
			}),
		[spaces, tasks, sensitiveIds],
	);

	return (
		<div
			role="group"
			aria-label={t("spaces.summaryStripLabel")}
			className="px-3 py-1.5 border-b border-edge flex-shrink-0 flex flex-wrap gap-1"
			data-testid="sidebar-space-summary"
		>
			{summaries.map(({ space, needsYou, working, masked }) => {
				const active = isFacetTokenActive(query, "space", space.name);
				return (
					<button
						key={space.id}
						type="button"
						onClick={() => onQueryChange(toggleFacetToken(query, "space", space.name))}
						aria-pressed={active}
						className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-nano font-medium transition-colors ${
							active ? "bg-accent/15 text-fg" : "bg-raised text-fg-3 hover:text-fg-2 hover:bg-raised-hover"
						}`}
						data-testid={`sidebar-space-summary-${space.id}`}
					>
						<span className={`truncate max-w-[9rem] ${masked ? MASK_CLASS : ""}`}>{space.name}</span>
						{/* Counts leak how much work a private client has in flight — masked with the name. */}
						{needsYou > 0 && (
							<span
								className={`inline-flex items-center gap-1 tabular-nums ${masked ? MASK_CLASS : ""}`}
								aria-label={t("spaces.needYou", { count: String(needsYou) })}
							>
								<span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-awake" />
								{needsYou}
							</span>
						)}
						{working > 0 && (
							<span
								className={`inline-flex items-center gap-1 tabular-nums ${masked ? MASK_CLASS : ""}`}
								aria-label={t("spaces.working", { count: String(working) })}
							>
								<span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-accent" />
								{working}
							</span>
						)}
					</button>
				);
			})}
		</div>
	);
}

export default SpaceSummaryStrip;
