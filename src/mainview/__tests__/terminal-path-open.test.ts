import { describe, it, expect, vi, beforeEach } from "vitest";
import { activateOsc8Uri, OPEN_FILE_PREVIEW_EVENT, type OpenFilePreviewDetail } from "../terminal-path-open";
import { api } from "../rpc";
import { toast } from "../toast";

vi.mock("../rpc", () => ({
	isElectrobun: false,
	api: {
		request: {
			resolveTerminalPaths: vi.fn(),
			getGlobalSettings: vi.fn(),
			openTerminalPath: vi.fn(),
		},
	},
}));

vi.mock("../toast", () => ({
	toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

const resolveTerminalPaths = api.request.resolveTerminalPaths as unknown as ReturnType<typeof vi.fn>;
const t = ((key: string, vars?: Record<string, string>) =>
	`${key}:${JSON.stringify(vars ?? {})}`) as unknown as Parameters<typeof activateOsc8Uri>[1]["t"];

function previewed(): Promise<OpenFilePreviewDetail> {
	return new Promise((resolve) => {
		window.addEventListener(
			OPEN_FILE_PREVIEW_EVENT,
			(event) => resolve((event as CustomEvent<OpenFilePreviewDetail>).detail),
			{ once: true },
		);
	});
}

describe("activateOsc8Uri", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("opens a resolved file URI through the backend gate, carrying the line", async () => {
		resolveTerminalPaths.mockResolvedValue({ resolved: { "/repo/src/a.ts": { path: "/repo/src/a.ts", kind: "file" } } });
		const detail = previewed();
		await activateOsc8Uri("file:///repo/src/a.ts:12:5", { t, taskId: "task-1", projectId: "proj-1" });
		expect(resolveTerminalPaths).toHaveBeenCalledWith({ taskId: "task-1", projectId: "proj-1", paths: ["/repo/src/a.ts"] });
		expect(await detail).toEqual({ path: "/repo/src/a.ts", line: 12, taskId: "task-1" });
	});

	it("says so when the backend refuses the path, and opens nothing", async () => {
		resolveTerminalPaths.mockResolvedValue({ resolved: { "/etc/passwd": null } });
		const open = vi.spyOn(window, "open").mockReturnValue(null);
		await activateOsc8Uri("file:///etc/passwd", { t });
		expect(open).not.toHaveBeenCalled();
		expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("terminal.fileLinkNotFound"), expect.anything());
		open.mockRestore();
	});

	it("never hands a file URI to window.open when it cannot become a path", async () => {
		const open = vi.spyOn(window, "open").mockReturnValue(null);
		await activateOsc8Uri("file:///tmp/%zz", { t });
		expect(open).not.toHaveBeenCalled();
		expect(resolveTerminalPaths).not.toHaveBeenCalled();
		expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("terminal.fileLinkUnreadable"), expect.anything());
		open.mockRestore();
	});

	it("opens a non-file URI externally", async () => {
		const open = vi.spyOn(window, "open").mockReturnValue(null);
		await activateOsc8Uri("https://example.com/pr/1", { t });
		expect(open).toHaveBeenCalledWith("https://example.com/pr/1", "_blank", "noopener,noreferrer");
		expect(resolveTerminalPaths).not.toHaveBeenCalled();
		open.mockRestore();
	});

	it("reports a failed resolve instead of throwing into the click handler", async () => {
		resolveTerminalPaths.mockRejectedValue(new Error("rpc down"));
		await activateOsc8Uri("file:///repo/a.ts", { t });
		expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("terminal.pathLinkOpenFailed"), expect.anything());
	});
});
