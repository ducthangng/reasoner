import { useCallback, useRef, useState } from "react";

const STORAGE_KEY = "reasoner.panelWidth";
const DEFAULT_WIDTH = 440;
const MIN_WIDTH = 280;
/** Always leave at least this much room for the PDF or map. */
const MIN_REMAINING = 360;

function clamp(width: number): number {
  const max = Math.max(MIN_WIDTH, Math.min(1000, window.innerWidth - MIN_REMAINING));
  return Math.round(Math.min(max, Math.max(MIN_WIDTH, width)));
}

/** Width of the left info column, remembered across visits. */
export function usePanelWidth() {
  const [width, setWidthState] = useState(() => {
    const saved = Number(localStorage.getItem(STORAGE_KEY));
    return saved > 0 ? clamp(saved) : DEFAULT_WIDTH;
  });
  const setWidth = useCallback((w: number) => {
    const next = clamp(w);
    setWidthState(next);
    localStorage.setItem(STORAGE_KEY, String(next));
  }, []);
  const reset = useCallback(() => {
    setWidthState(DEFAULT_WIDTH);
    localStorage.removeItem(STORAGE_KEY);
  }, []);
  return { width, setWidth, reset };
}

interface Props {
  width: number;
  onResize: (width: number) => void;
  onReset: () => void;
}

/**
 * Drag handle on the right edge of the info column. Drag to resize, double-click to reset,
 * or focus it and use the arrow keys.
 */
export function ColumnResizer({ width, onResize, onReset }: Props) {
  const drag = useRef<{ startX: number; startWidth: number; frame: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startWidth: width, frame: 0 };
    document.body.classList.add("col-resizing");
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const next = d.startWidth + (e.clientX - d.startX);
    // Re-layout at most once per frame; the PDF re-renders when its pane width changes.
    cancelAnimationFrame(d.frame);
    d.frame = requestAnimationFrame(() => onResize(next));
  };

  const end = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    drag.current = null;
    document.body.classList.remove("col-resizing");
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 80 : 20;
    if (e.key === "ArrowLeft") onResize(width - step);
    else if (e.key === "ArrowRight") onResize(width + step);
    else if (e.key === "Home") onReset();
    else return;
    e.preventDefault();
  };

  return (
    <div
      className="col-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panel"
      aria-valuenow={width}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
    />
  );
}
