import { useEffect, useState } from "react";
import { useT } from "../i18n";
import { api, isElectrobun } from "../rpc";
import { toast } from "../toast";
import { useFocusTrap } from "../utils/useFocusTrap";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { formatBytes } from "../utils/formatBytes";
import { writeClipboardText } from "../utils/clipboard-write";
import type { FilePreviewResult } from "../../shared/types";
import { MarkdownDocument } from "./pr-review/markdown";

interface FilePreviewModalProps {
	path: string;
	onClose: () => void;
}

/**
 * In-app preview for a file path Cmd/Ctrl+Clicked in terminal output — the
 * "Preview in dev3" mode of the File path click action setting, and the only
 * mode in browser/remote sessions (host-side open would be invisible there).
 */
export default function FilePreviewModal({ path, onClose }: FilePreviewModalProps) {
	const t = useT();
	const trapRef = useFocusTrap<HTMLDivElement>();
	useEscapeKey(onClose);
	const [preview, setPreview] = useState<FilePreviewResult | null>(null);
	const [showRaw, setShowRaw] = useState(false);

	useEffect(() => {
		let stale = false;
		setPreview(null);
		setShowRaw(false);
		api.request
			.readFilePreview({ path })
			.then((result) => {
				if (!stale) setPreview(result);
			})
			.catch(() => {
				if (!stale) setPreview({ kind: "not-found" });
			});
		return () => {
			stale = true;
		};
	}, [path]);

	const isMarkdown = /\.(md|markdown)$/i.test(path);
	const textContent = preview?.kind === "text" ? preview.content : null;

	function renderBody() {
		if (!preview) {
			return <p className="text-fg-3 text-sm p-6">{t("terminal.filePreviewLoading")}</p>;
		}
		switch (preview.kind) {
			case "text":
				return (
					<div className="min-h-0 flex-1 overflow-auto p-4">
						{isMarkdown && !showRaw ? (
							<MarkdownDocument body={preview.content} />
						) : (
							<pre className="font-mono text-xs leading-relaxed text-fg whitespace-pre-wrap break-words">
								{preview.content}
							</pre>
						)}
						{preview.truncated && (
							<p className="mt-4 text-fg-muted text-xs">{t("terminal.filePreviewTruncated")}</p>
						)}
					</div>
				);
			case "image":
				return (
					<div className="min-h-0 flex-1 overflow-auto p-4 flex items-center justify-center">
						<img src={preview.dataUrl} alt={path} className="max-w-full max-h-full object-contain" />
					</div>
				);
			case "binary":
				return (
					<p className="text-fg-3 text-sm p-6">
						{t("terminal.filePreviewBinary", { size: formatBytes(preview.size) })}
					</p>
				);
			case "too-large":
				return (
					<p className="text-fg-3 text-sm p-6">
						{t("terminal.filePreviewTooLarge", { size: formatBytes(preview.size) })}
					</p>
				);
			case "directory":
				return <p className="text-fg-3 text-sm p-6">{t("terminal.filePreviewDirectory")}</p>;
			case "not-found":
				return <p className="text-fg-3 text-sm p-6">{t("terminal.filePreviewNotFound")}</p>;
		}
	}

	async function handleCopyPath() {
		const method = await writeClipboardText(path);
		if (method !== "failed") toast.success(t("terminal.filePreviewCopied"));
	}

	async function handleCopyContent() {
		if (textContent === null) return;
		const method = await writeClipboardText(textContent);
		if (method !== "failed") toast.success(t("terminal.filePreviewContentCopied"));
	}

	async function handleOpen(mode: "system" | "reveal") {
		try {
			await api.request.openTerminalPath({ path, mode });
		} catch (err) {
			toast.error(t("terminal.pathLinkOpenFailed", { error: String(err) }));
		}
	}

	const fileMissing = preview?.kind === "not-found";
	const footerButton =
		"px-3 py-1.5 text-sm rounded-lg text-fg-2 hover:text-fg hover:bg-elevated transition-colors";

	return (
		<div
			className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
			onMouseDown={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
		>
			<div
				ref={trapRef}
				role="dialog"
				aria-modal="true"
				aria-labelledby="file-preview-title"
				tabIndex={-1}
				className="bg-overlay border border-edge rounded-2xl shadow-2xl w-[min(56rem,92vw)] max-h-[85vh] flex flex-col outline-none"
			>
				<div className="flex items-center gap-3 px-4 py-3 border-b border-edge">
					<h2
						id="file-preview-title"
						className="min-w-0 flex-1 text-fg text-sm font-mono truncate"
						title={path}
						dir="rtl"
					>
						{/* dir=rtl truncates the head, keeping the filename visible */}
						<span dir="ltr">{path}</span>
					</h2>
					{isMarkdown && textContent !== null && (
						<div className="shrink-0 flex rounded-lg border border-edge overflow-hidden text-xs">
							{([false, true] as const).map((raw) => (
								<button
									key={String(raw)}
									type="button"
									onClick={() => setShowRaw(raw)}
									aria-pressed={showRaw === raw}
									className={`px-2.5 py-1 transition-colors ${
										showRaw === raw
											? "bg-accent/10 text-accent"
											: "bg-raised text-fg-3 hover:text-fg"
									}`}
								>
									{raw ? t("terminal.filePreviewRaw") : t("terminal.filePreviewRendered")}
								</button>
							))}
						</div>
					)}
					<button
						type="button"
						onClick={onClose}
						aria-label={t("common.close")}
						className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-fg-3 hover:text-fg hover:bg-elevated transition-colors"
					>
						✕
					</button>
				</div>
				{renderBody()}
				<div className="flex items-center flex-wrap justify-end gap-2 px-4 py-3 border-t border-edge">
					{textContent !== null && (
						<button type="button" onClick={handleCopyContent} className={footerButton}>
							{t("terminal.filePreviewCopyContent")}
						</button>
					)}
					<button type="button" onClick={handleCopyPath} className={footerButton}>
						{t("terminal.filePreviewCopyPath")}
					</button>
					{!fileMissing && (
						<button type="button" onClick={() => handleOpen("reveal")} className={footerButton}>
							{t("terminal.filePreviewOpenFolder")}
						</button>
					)}
					{isElectrobun && !fileMissing && (
						<button type="button" onClick={() => handleOpen("system")} className={footerButton}>
							{t("terminal.filePreviewOpenSystem")}
						</button>
					)}
					<button
						type="button"
						onClick={onClose}
						className="px-4 py-1.5 text-sm rounded-lg bg-accent-fill text-white hover:bg-accent-fill-hover transition-colors"
					>
						{t("common.close")}
					</button>
				</div>
			</div>
		</div>
	);
}
