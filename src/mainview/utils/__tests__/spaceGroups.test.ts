import { groupProjectsForDashboard } from "../spaceGroups";
import type { Project, Space, SpacesFile } from "../../../shared/types";

const proj = (id: string, over?: Partial<Project>): Project => ({
	id,
	name: id,
	path: `/tmp/${id}`,
	setupScript: "",
	devScript: "",
	cleanupScript: "",
	defaultBaseBranch: "main",
	createdAt: "2025-01-01T00:00:00Z",
	...over,
});

const sp = (id: string, projectIds: string[], over?: Partial<Space>): Space => ({
	id,
	name: id,
	parentId: null,
	projectIds,
	createdAt: 1,
	...over,
});

const fileOf = (spaces: Space[], order?: string[]): SpacesFile => ({
	version: 1,
	spaces,
	order: order ?? spaces.map((s) => s.id),
});

describe("groupProjectsForDashboard", () => {
	it("returns null when there are no active spaces", () => {
		expect(groupProjectsForDashboard([proj("a")], fileOf([]))).toBeNull();
		expect(groupProjectsForDashboard([proj("a")], fileOf([sp("sp_x", ["a"], { deleted: true })]))).toBeNull();
	});

	it("orders groups by the order array and projects by each space's projectIds", () => {
		const projects = [proj("a"), proj("b"), proj("c")];
		const file = fileOf([sp("sp_1", ["b", "a"]), sp("sp_2", ["c"])], ["sp_2", "sp_1"]);
		const groups = groupProjectsForDashboard(projects, file)!;
		expect(groups.map((g) => g.space?.id ?? "rest")).toEqual(["sp_2", "sp_1", "rest"]);
		expect(groups[1].projects.map((p) => p.id)).toEqual(["b", "a"]);
	});

	it("repeats a project under each of its spaces", () => {
		const projects = [proj("a"), proj("b")];
		const file = fileOf([sp("sp_1", ["a"]), sp("sp_2", ["a", "b"])]);
		const groups = groupProjectsForDashboard(projects, file)!;
		expect(groups[0].projects.map((p) => p.id)).toEqual(["a"]);
		expect(groups[1].projects.map((p) => p.id)).toEqual(["a", "b"]);
	});

	it("collects membership-less projects into the trailing null group, preserving input order", () => {
		const projects = [proj("z"), proj("a"), proj("m")];
		const file = fileOf([sp("sp_1", ["a"])]);
		const groups = groupProjectsForDashboard(projects, file)!;
		const rest = groups[groups.length - 1];
		expect(rest.space).toBeNull();
		expect(rest.projects.map((p) => p.id)).toEqual(["z", "m"]);
	});

	it("skips dangling project ids silently and drops a space with no resolvable member", () => {
		const projects = [proj("a")];
		const file = fileOf([sp("sp_1", ["ghost", "a"]), sp("sp_2", ["ghost-only"])]);
		const groups = groupProjectsForDashboard(projects, file)!;
		expect(groups.map((g) => g.space?.id ?? "rest")).toEqual(["sp_1", "rest"]);
		expect(groups[0].projects.map((p) => p.id)).toEqual(["a"]);
	});

	it("returns null when every space resolves to zero members (all dangling)", () => {
		expect(groupProjectsForDashboard([proj("a")], fileOf([sp("sp_1", ["ghost"])]))).toBeNull();
	});

	it("keeps the builtin Ops project out of every group including the bottom block", () => {
		const ops = proj("ops", { kind: "virtual", builtin: true });
		const projects = [ops, proj("a"), proj("b")];
		const file = fileOf([sp("sp_1", ["a"])]);
		const groups = groupProjectsForDashboard(projects, file)!;
		for (const g of groups) {
			expect(g.projects.some((p) => p.id === "ops")).toBe(false);
		}
	});
});
