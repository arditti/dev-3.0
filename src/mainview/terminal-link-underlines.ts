import type { Terminal } from "ghostty-web";
import type { BufferRange } from "./terminal-file-links";

/**
 * Persistent underlines for file-path links in the terminal. ghostty-web only
 * underlines the ONE link range currently hovered, so detected paths are
 * invisible until the mouse finds them — this overlay canvas (pointer-events:
 * none, stacked over the terminal canvas) underlines every resolved path link
 * in the viewport so they read as links at a glance.
 */

// Same blue ghostty-web hardcodes for its hover underline (#4A90E2), slightly
// translucent so the persistent decoration stays quieter than the hover state.
const UNDERLINE_COLOR = "rgba(74, 144, 226, 0.55)";
const REDRAW_DEBOUNCE_MS = 120;

/**
 * Map a viewport row to an absolute buffer row (scrollback + screen), the
 * same math ghostty-web's click handler uses.
 */
export function viewportRowToAbsolute(viewportRow: number, viewportY: number, scrollbackLength: number): number {
	const n = Math.max(0, Math.floor(viewportY));
	if (n > 0 && viewportRow < n) return scrollbackLength - n + viewportRow;
	return scrollbackLength + (viewportRow - n);
}

export interface FilePathUnderlinesHandle {
	scheduleRedraw(): void;
	dispose(): void;
}

export function installFilePathUnderlines(options: {
	term: Terminal;
	container: HTMLElement;
	linksForRow: (absoluteRow: number) => Promise<BufferRange[]>;
}): FilePathUnderlinesHandle {
	const { term, container, linksForRow } = options;
	if (typeof getComputedStyle === "function" && getComputedStyle(container).position === "static") {
		container.style.position = "relative";
	}
	const overlay = document.createElement("canvas");
	overlay.style.position = "absolute";
	overlay.style.pointerEvents = "none";
	overlay.style.left = "0";
	overlay.style.top = "0";
	overlay.dataset.role = "file-path-underlines";
	container.appendChild(overlay);
	const ctx = overlay.getContext("2d");

	let disposed = false;
	let redrawTimer: ReturnType<typeof setTimeout> | undefined;
	let generation = 0;

	function termCanvas(): HTMLCanvasElement | null {
		for (const canvas of container.querySelectorAll("canvas")) {
			if (canvas !== overlay) return canvas;
		}
		return null;
	}

	function syncSize(): { w: number; h: number; dpr: number } | null {
		const canvas = termCanvas();
		if (!canvas) return null;
		const w = canvas.clientWidth;
		const h = canvas.clientHeight;
		const dpr = window.devicePixelRatio || 1;
		overlay.style.left = `${canvas.offsetLeft}px`;
		overlay.style.top = `${canvas.offsetTop}px`;
		overlay.style.width = `${w}px`;
		overlay.style.height = `${h}px`;
		if (overlay.width !== w * dpr || overlay.height !== h * dpr) {
			overlay.width = w * dpr;
			overlay.height = h * dpr;
		}
		return { w, h, dpr };
	}

	async function redraw(): Promise<void> {
		if (disposed || !ctx || !term.renderer) return;
		const gen = ++generation;
		const size = syncSize();
		if (!size) return;
		const charWidth = term.renderer.charWidth;
		const charHeight = term.renderer.charHeight;
		if (!charWidth || !charHeight) return;
		const buffer = term.buffer.active;
		const scrollback = Math.max(0, buffer.length - term.rows);
		const viewportY = term.viewportY;
		const rowRanges = await Promise.all(
			Array.from({ length: term.rows }, (_, viewportRow) =>
				linksForRow(viewportRowToAbsolute(viewportRow, viewportY, scrollback)),
			),
		);
		if (disposed || gen !== generation) return;
		ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
		ctx.clearRect(0, 0, size.w, size.h);
		ctx.strokeStyle = UNDERLINE_COLOR;
		ctx.lineWidth = 1;
		const drawn = new Set<string>();
		for (const ranges of rowRanges) {
			for (const range of ranges) {
				const key = `${range.start.y}:${range.start.x}-${range.end.y}:${range.end.x}`;
				if (drawn.has(key)) continue;
				drawn.add(key);
				for (let absRow = range.start.y; absRow <= range.end.y; absRow++) {
					const n = Math.max(0, Math.floor(viewportY));
					const viewportRow = absRow < scrollback ? absRow - (scrollback - n) : absRow - scrollback + n;
					if (viewportRow < 0 || viewportRow >= term.rows) continue;
					const fromX = absRow === range.start.y ? range.start.x : 0;
					const toX = absRow === range.end.y ? range.end.x : term.cols - 1;
					const y = (viewportRow + 1) * charHeight - 1.5;
					ctx.beginPath();
					ctx.moveTo(fromX * charWidth, y);
					ctx.lineTo((toX + 1) * charWidth, y);
					ctx.stroke();
				}
			}
		}
	}

	function scheduleRedraw(): void {
		if (disposed) return;
		clearTimeout(redrawTimer);
		redrawTimer = setTimeout(() => {
			void redraw();
		}, REDRAW_DEBOUNCE_MS);
	}

	// No onResize subscription: the container ResizeObserver + the onRender
	// that follows any reflow already cover size changes.
	const subscriptions = [
		term.onRender(() => scheduleRedraw()),
		term.onScroll(() => scheduleRedraw()),
	];
	const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => scheduleRedraw()) : null;
	resizeObserver?.observe(container);
	scheduleRedraw();

	return {
		scheduleRedraw,
		dispose() {
			disposed = true;
			clearTimeout(redrawTimer);
			for (const sub of subscriptions) sub.dispose();
			resizeObserver?.disconnect();
			overlay.remove();
		},
	};
}
