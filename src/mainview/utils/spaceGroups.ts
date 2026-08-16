import { isBuiltinOpsProject, orderSpaces, type Project, type Space, type SpacesFile } from "../../shared/types";

export interface DashboardGroup {
	/** null = the computed bottom block of projects in no space. */
	space: Space | null;
	projects: Project[];
}

/**
 * Group dashboard projects under their spaces. Returns null when no active
 * space exists so the caller renders its legacy flat path untouched — the
 * zero-spaces dashboard must stay byte-identical to today's.
 *
 * The builtin Operations board never joins a group: the caller keeps it in
 * its flat pinned position and passes only ordinary projects here.
 */
export function groupProjectsForDashboard(
	visibleProjects: Project[],
	file: SpacesFile,
): DashboardGroup[] | null {
	const spaces = orderSpaces(file.spaces, file.order);
	if (spaces.length === 0) return null;

	const eligible = visibleProjects.filter((p) => !isBuiltinOpsProject(p));
	const byId = new Map(eligible.map((p) => [p.id, p]));

	const grouped = new Set<string>();
	const groups: DashboardGroup[] = [];
	for (const space of spaces) {
		// Dangling ids (deleted projects, other machines) are skipped silently.
		const members = space.projectIds
			.map((id) => byId.get(id))
			.filter((p): p is Project => p !== undefined);
		if (members.length === 0) continue;
		for (const p of members) grouped.add(p.id);
		groups.push({ space, projects: members });
	}
	if (groups.length === 0) return null;

	const rest = eligible.filter((p) => !grouped.has(p.id));
	groups.push({ space: null, projects: rest });
	return groups;
}
