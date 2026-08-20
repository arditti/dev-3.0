import { useState } from "react";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { useFocusTrap } from "../utils/useFocusTrap";
import { isBuiltinOpsProject, type Project, type Space } from "../../shared/types";
import { api } from "../rpc";
import { toast } from "../toast";
import { useT } from "../i18n";

interface AddProjectsToSpaceModalProps {
	space: Space;
	projects: Project[];
	onClose: () => void;
	/** Hand off to the Add Project flow, pre-linked to this space. */
	onCreateProject?: (space: Space) => void;
}

/** Adds existing projects to one space — the space header's `+`. */
function AddProjectsToSpaceModal({ space, projects, onClose, onCreateProject }: AddProjectsToSpaceModalProps) {
	const t = useT();
	const trapRef = useFocusTrap<HTMLDivElement>();
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [saving, setSaving] = useState(false);
	const [query, setQuery] = useState("");

	useEscapeKey(onClose);

	const members = projects.filter(
		(p) => !p.deleted && !isBuiltinOpsProject(p) && !space.projectIds.includes(p.id),
	);
	const q = query.trim().toLowerCase();
	// Match on name and path — a project is often recognised by where it lives.
	const candidates = q
		? members.filter((p) => `${p.name} ${p.path}`.toLowerCase().includes(q))
		: members;

	function toggle(projectId: string) {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(projectId)) next.delete(projectId);
			else next.add(projectId);
			return next;
		});
	}

	async function handleAdd() {
		if (selected.size === 0 || saving) return;
		setSaving(true);
		try {
			// One call per project: membership is keyed by project, not by space.
			for (const projectId of selected) {
				const current = await api.request.getSpaces({});
				const own = current.spaces
					.filter((s) => !s.deleted && s.projectIds.includes(projectId))
					.map((s) => s.id);
				await api.request.setProjectSpaces({ projectId, spaceIds: [...new Set([...own, space.id])] });
			}
			onClose();
		} catch (err) {
			toast.error(t("spaces.failedUpdate", { error: String(err) }));
			setSaving(false);
		}
	}

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
			onMouseDown={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
		>
			<div
				ref={trapRef}
				role="dialog"
				aria-modal="true"
				aria-labelledby="add-projects-to-space-title"
				tabIndex={-1}
				className="bg-overlay border border-edge rounded-2xl shadow-2xl w-[26rem] p-6 space-y-4 outline-none"
			>
				<h2 id="add-projects-to-space-title" className="text-fg text-lg font-semibold">
					{t("spaces.addProjectsTitle", { name: space.name })}
				</h2>

				<input
					type="text"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder={t("spaces.addProjectsSearch")}
					autoFocus
					className="w-full bg-elevated border border-edge rounded-lg px-3 py-2 text-sm text-fg placeholder-fg-muted outline-none focus:border-accent/50 transition-colors"
					data-testid="add-to-space-search"
				/>

				<div className="max-h-56 overflow-y-auto rounded-lg border border-edge divide-y divide-edge/40">
					{candidates.map((project) => (
						<label
							key={project.id}
							className="flex items-center gap-2.5 px-3 py-2 hover:bg-elevated-hover transition-colors cursor-pointer"
						>
							<input
								type="checkbox"
								checked={selected.has(project.id)}
								onChange={() => toggle(project.id)}
								className="w-3.5 h-3.5 rounded accent-accent"
								data-testid={`add-to-space-${project.id}`}
							/>
							<span className="text-xs text-fg truncate">{project.name}</span>
						</label>
					))}
					{candidates.length === 0 && (
						<div className="px-3 py-4 text-xs text-fg-muted text-center">
							{q ? t("spaces.noProjectsMatch") : t("spaces.allProjectsInSpace")}
						</div>
					)}
				</div>

				<div className="flex items-center gap-2">
					{onCreateProject && (
						<button
							type="button"
							onClick={() => onCreateProject(space)}
							className="flex items-center gap-1.5 px-2 py-1.5 -ml-2 text-sm rounded-lg text-accent hover:bg-elevated transition-colors"
							data-testid="add-to-space-new-project"
						>
							<svg aria-hidden="true" focusable="false" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
							</svg>
							{t("spaces.addProjectsNewProject")}
						</button>
					)}
					<span className="flex-1" />
					<button
						type="button"
						onClick={onClose}
						className="px-3 py-1.5 text-sm rounded-lg text-fg-2 hover:text-fg hover:bg-elevated transition-colors"
					>
						{t("spaces.cancel")}
					</button>
					<button
						type="button"
						onClick={handleAdd}
						disabled={selected.size === 0 || saving}
						className="px-3 py-1.5 text-sm rounded-lg bg-accent text-white hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
						data-testid="add-to-space-submit"
					>
						{t("spaces.addProjectsSubmit")}
					</button>
				</div>
			</div>
		</div>
	);
}

export default AddProjectsToSpaceModal;
