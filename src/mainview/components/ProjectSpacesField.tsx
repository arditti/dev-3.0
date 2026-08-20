import { useRef, useState } from "react";
import { spacesOfProject } from "../../shared/types";
import { api } from "../rpc";
import { toast } from "../toast";
import { useT } from "../i18n";
import { useSpaces } from "../useSpaces";
import SpacePicker from "./SpacePicker";

type ProjectSpacesFieldProps =
	| { projectId: string; mode?: "connected" }
	/** Deferred mode: pure controlled value for forms where the project id does
	 *  not exist yet (create-project). No RPC calls happen inside the field. */
	| { mode: "deferred"; value: string[]; onChange: (spaceIds: string[]) => void };

/**
 * Self-contained membership field: chips of the current spaces plus an Edit
 * affordance opening the SpacePicker. Owns its own RPC calls and toasts in
 * connected mode, so host forms never grow spaces state management.
 */
function ProjectSpacesField(props: ProjectSpacesFieldProps) {
	const t = useT();
	const { spaces, file } = useSpaces();
	const [pickerOpen, setPickerOpen] = useState(false);
	const anchorRef = useRef<HTMLButtonElement>(null);

	const connected = props.mode !== "deferred";
	const selectedIds = connected
		? spacesOfProject(file.spaces, (props as { projectId: string }).projectId).map((s) => s.id)
		: (props as { value: string[] }).value;

	async function persist(nextIds: string[]) {
		if (!connected) {
			(props as { onChange: (ids: string[]) => void }).onChange(nextIds);
			return;
		}
		const { projectId } = props as { projectId: string };
		try {
			const { autoDeleted } = await api.request.setProjectSpaces({ projectId, spaceIds: nextIds });
			for (const space of autoDeleted) {
				toast.info(t("spaces.autoDeleted", { name: space.name }));
			}
		} catch (err) {
			toast.error(t("spaces.failedUpdate", { error: String(err) }));
		}
	}

	function handleToggle(spaceId: string) {
		const next = selectedIds.includes(spaceId)
			? selectedIds.filter((id) => id !== spaceId)
			: [...selectedIds, spaceId];
		void persist(next);
	}

	// Inline create needs a first member (a space is never empty), so it only
	// exists in connected mode where the project id is real.
	async function handleCreateNew(name: string) {
		const { projectId } = props as { projectId: string };
		try {
			await api.request.createSpace({ name, projectIds: [projectId] });
		} catch (err) {
			toast.error(t("spaces.failedCreate", { error: String(err) }));
		}
	}

	const selectedSpaces = spaces.filter((s) => selectedIds.includes(s.id));

	return (
		<div data-testid="project-spaces-field">
			<div className="flex items-center gap-1.5 flex-wrap">
				{selectedSpaces.map((space) => (
					<span
						key={space.id}
						className="inline-flex items-center px-2 py-0.5 rounded-md bg-raised border border-edge text-xs text-fg-2"
						data-testid={`space-chip-${space.id}`}
					>
						{space.name}
					</span>
				))}
				{selectedSpaces.length === 0 && (
					<span className="text-xs text-fg-muted">{t("spaces.none")}</span>
				)}
				<button
					ref={anchorRef}
					type="button"
					onClick={() => setPickerOpen(true)}
					className="inline-flex items-center px-2 py-0.5 rounded-md text-xs text-fg-3 hover:text-fg hover:bg-elevated border border-transparent hover:border-edge transition-colors"
					data-testid="project-spaces-edit"
				>
					{t("spaces.edit")}
				</button>
			</div>
			{pickerOpen && anchorRef.current && (
				<SpacePicker
					spaces={spaces}
					selectedIds={selectedIds}
					onToggle={handleToggle}
					onCreateNew={connected ? handleCreateNew : undefined}
					anchorEl={anchorRef.current}
					onClose={() => setPickerOpen(false)}
				/>
			)}
		</div>
	);
}

export default ProjectSpacesField;
