import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "dev3-terminal-paths-"));
const worktree = join(tmp, "worktree");
const projectDir = join(tmp, "project");

vi.mock("../../data", () => ({
	getProject: vi.fn(async (projectId: string) => {
		if (projectId !== "proj-1") throw new Error("unknown project");
		return { id: "proj-1", kind: "git", path: projectDir };
	}),
	getTask: vi.fn(async (_project: unknown, taskId: string) => {
		if (taskId !== "task-1") throw new Error("unknown task");
		return { id: "task-1", worktreePath: worktree };
	}),
	// The whole temp dir is a registered project so preview/open scope checks
	// (home dir + project roots) pass for the fixtures created below.
	loadProjects: vi.fn(async () => [{ id: "proj-1", kind: "git", path: tmp }]),
}));

vi.mock("../shared", () => ({
	log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../../electrobun-platform", () => ({
	Utils: { openPath: vi.fn() },
}));
vi.mock("../../spawn", () => ({
	spawn: vi.fn(),
}));

import { terminalPathHandlers as appHandlers } from "../terminal-paths";

beforeAll(() => {
	mkdirSync(join(worktree, "src"), { recursive: true });
	mkdirSync(projectDir, { recursive: true });
	writeFileSync(join(worktree, "src", "index.ts"), "export {};\n");
	writeFileSync(join(projectDir, "readme.md"), "# hi\n");
	writeFileSync(join(tmp, "notes.txt"), "hello\n");
});

afterAll(() => {
	rmSync(tmp, { recursive: true, force: true });
});

describe("resolveTerminalPaths", () => {
	it("resolves absolute paths without any project context", async () => {
		const { resolved } = await appHandlers.resolveTerminalPaths({
			paths: [join(tmp, "notes.txt"), "/definitely/not/here.txt"],
		});
		expect(resolved[join(tmp, "notes.txt")]).toEqual({
			path: join(tmp, "notes.txt"),
			kind: "file",
		});
		expect(resolved["/definitely/not/here.txt"]).toBeNull();
	});

	it("resolves relative paths against the task worktree first, then the project dir", async () => {
		const { resolved } = await appHandlers.resolveTerminalPaths({
			taskId: "task-1",
			projectId: "proj-1",
			paths: ["src/index.ts", "readme.md", "missing.md", "src"],
		});
		expect(resolved["src/index.ts"]).toEqual({
			path: join(worktree, "src", "index.ts"),
			kind: "file",
		});
		expect(resolved["readme.md"]).toEqual({
			path: join(projectDir, "readme.md"),
			kind: "file",
		});
		expect(resolved["missing.md"]).toBeNull();
		expect(resolved["src"]).toEqual({ path: join(worktree, "src"), kind: "directory" });
	});

	it("keeps the project base when the task id is not a real task (project terminal)", async () => {
		const { resolved } = await appHandlers.resolveTerminalPaths({
			taskId: "project-session-key",
			projectId: "proj-1",
			paths: ["readme.md"],
		});
		expect(resolved["readme.md"]).toEqual({
			path: join(projectDir, "readme.md"),
			kind: "file",
		});
	});

	it("expands ~ against the home directory", async () => {
		const { resolved } = await appHandlers.resolveTerminalPaths({ paths: ["~"] });
		expect(resolved["~"]).toEqual({ path: homedir(), kind: "directory" });
	});

	it("relative paths resolve to null without a project context", async () => {
		const { resolved } = await appHandlers.resolveTerminalPaths({ paths: ["src/index.ts"] });
		expect(resolved["src/index.ts"]).toBeNull();
	});
});

describe("readFilePreview", () => {
	it("returns text content for small text files", async () => {
		const result = await appHandlers.readFilePreview({ path: join(tmp, "notes.txt") });
		expect(result).toEqual({ kind: "text", content: "hello\n", truncated: false, size: 6 });
	});

	it("classifies directories, missing paths and binary files", async () => {
		expect(await appHandlers.readFilePreview({ path: worktree })).toEqual({ kind: "directory" });
		expect(await appHandlers.readFilePreview({ path: join(tmp, "nope.txt") })).toEqual({
			kind: "not-found",
		});
		const binPath = join(tmp, "blob.bin");
		writeFileSync(binPath, Buffer.from([0x89, 0x00, 0x01, 0x02]));
		expect(await appHandlers.readFilePreview({ path: binPath })).toEqual({
			kind: "binary",
			size: 4,
		});
	});

	it("rejects relative paths", async () => {
		expect(await appHandlers.readFilePreview({ path: "relative/path.txt" })).toEqual({
			kind: "not-found",
		});
	});

	it("refuses paths outside the home dir and registered projects", async () => {
		expect(await appHandlers.readFilePreview({ path: "/etc/hosts" })).toEqual({
			kind: "not-found",
		});
		await expect(
			appHandlers.openTerminalPath({ path: "/etc/hosts", mode: "system" }),
		).rejects.toThrow(/outside the allowed/);
	});

	it("returns a data URL for images", async () => {
		const pngPath = join(tmp, "dot.png");
		// 1x1 transparent PNG
		writeFileSync(
			pngPath,
			Buffer.from(
				"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
				"base64",
			),
		);
		const result = await appHandlers.readFilePreview({ path: pngPath });
		expect(result.kind).toBe("image");
		if (result.kind === "image") {
			expect(result.dataUrl.startsWith("data:image/png;base64,")).toBe(true);
		}
	});
});
