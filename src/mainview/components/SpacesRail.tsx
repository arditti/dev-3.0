import type { Space } from "../../shared/types";
import { HOME_GROUP_ID } from "../utils/spaceGroups";
import { MASK_CLASS } from "../sensitive-projects";
import { useT } from "../i18n";

interface SpacesRailProps {
	spaces: Space[];
	/** Resolvable member count per space id (dangling ids already skipped). */
	projectCountOf: (spaceId: string) => number;
	/** Spaces whose name must be masked (a member project is sensitive). */
	maskedSpaceIds: ReadonlySet<string>;
	totalProjects: number;
	homeCount: number;
	/** null = All projects. `HOME_GROUP_ID` = the computed Home group. */
	selectedSpaceId: string | null;
	onSelect: (id: string | null) => void;
	onNewSpace: () => void;
}

/** First letter of the space name, for the neutral square badge (no colour). */
function initialOf(name: string): string {
	return (name.trim()[0] ?? "?").toUpperCase();
}

/**
 * Dashboard rail: All projects, then one row per space, then the computed Home
 * group. Selecting an entry FILTERS the dashboard — it never navigates, so a
 * space stays a grouping and never becomes a place with a board of its own.
 */
function SpacesRail({
	spaces,
	projectCountOf,
	maskedSpaceIds,
	totalProjects,
	homeCount,
	selectedSpaceId,
	onSelect,
	onNewSpace,
}: SpacesRailProps) {
	const t = useT();

	function rowClass(active: boolean): string {
		return `w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors ${
			active ? "bg-accent/15 text-fg" : "text-fg-2 hover:bg-elevated-hover hover:text-fg"
		}`;
	}

	return (
		<aside
			className="hidden lg:flex w-56 flex-shrink-0 flex-col border-r border-edge overflow-y-auto py-4 px-3 gap-4"
			aria-label={t("spaces.railLabel")}
			data-testid="spaces-rail"
		>
			<div className="flex flex-col gap-1">
				<span className="px-2.5 text-fg-muted text-nano font-semibold uppercase tracking-[0.08em]">
					{t("spaces.railOverview")}
				</span>
				<button
					type="button"
					onClick={() => onSelect(null)}
					aria-pressed={selectedSpaceId === null}
					className={rowClass(selectedSpaceId === null)}
					data-testid="rail-all-projects"
				>
					<span className="w-5 h-5 flex-shrink-0 rounded bg-raised flex items-center justify-center text-nano font-semibold text-fg-3">
						{"A"}
					</span>
					<span className="flex-1 text-sm truncate">{t("spaces.railAllProjects")}</span>
					<span className="text-fg-muted text-xs tabular-nums">{totalProjects}</span>
				</button>
			</div>

			<div className="flex flex-col gap-1">
				<span className="px-2.5 text-fg-muted text-nano font-semibold uppercase tracking-[0.08em]">
					{t("spaces.railSpaces")}
				</span>
				{spaces.map((space) => {
					const active = selectedSpaceId === space.id;
					return (
						<button
							key={space.id}
							type="button"
							onClick={() => onSelect(space.id)}
							aria-pressed={active}
							className={rowClass(active)}
							data-testid={`rail-space-${space.id}`}
						>
							<span className="w-5 h-5 flex-shrink-0 rounded bg-raised flex items-center justify-center text-nano font-semibold text-fg-3">
								{initialOf(space.name)}
							</span>
							<span className={`flex-1 text-sm truncate ${maskedSpaceIds.has(space.id) ? MASK_CLASS : ""}`}>
								{space.name}
							</span>
							<span className="text-fg-muted text-xs tabular-nums">{projectCountOf(space.id)}</span>
						</button>
					);
				})}
				{homeCount > 0 && (
					<button
						type="button"
						onClick={() => onSelect(HOME_GROUP_ID)}
						aria-pressed={selectedSpaceId === HOME_GROUP_ID}
						className={rowClass(selectedSpaceId === HOME_GROUP_ID)}
						data-testid="rail-home"
					>
						<span className="w-5 h-5 flex-shrink-0 rounded bg-raised flex items-center justify-center text-nano font-semibold text-fg-3">
							{initialOf(t("spaces.homeGroup"))}
						</span>
						<span className="flex-1 text-sm truncate">{t("spaces.homeGroup")}</span>
						<span className="text-fg-muted text-xs tabular-nums">{homeCount}</span>
					</button>
				)}
			</div>

			<button
				type="button"
				onClick={onNewSpace}
				className="mt-auto flex items-center gap-2 px-2.5 py-2 rounded-lg text-fg-3 hover:text-fg hover:bg-elevated-hover transition-colors"
				data-testid="rail-new-space"
			>
				<svg aria-hidden="true" focusable="false" className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
					<path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
				</svg>
				<span className="text-sm">{t("spaces.newSpace")}</span>
			</button>
		</aside>
	);
}

export default SpacesRail;
