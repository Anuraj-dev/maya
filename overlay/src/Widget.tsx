import { useEffect, useRef, type PointerEvent } from "react";
import { useMockMaya } from "./mock.ts";
import { useLiveMaya } from "./live.ts";
import { STATE_LABEL, type MayaState } from "./state.ts";

// Caption longer than this threshold opens the speech bubble
const BUBBLE_THRESHOLD = 48;

const EMOTION_GLYPH: Record<MayaState, string> = {
  idle:      "◌",
  listening: "◉",
  thinking:  "◎",
  acting:    "▸",
  speaking:  "◈",
  awaiting:  "◇",
  error:     "✕",
};

function WidgetEye({ side }: { side: "left" | "right" }) {
  return (
    <div className={`w-eye w-eye--${side}`}>
      <div className="w-eye__socket">
        <div className="w-eye__iris">
          <div className="w-eye__ring" />
          <div className="w-eye__pupil" />
          <div className="w-eye__glint" />
        </div>
        <div className="w-eye__lid w-eye__lid--top" />
        <div className="w-eye__lid w-eye__lid--bottom" />
      </div>
    </div>
  );
}

export function Widget() {
  const mock = useMockMaya();
  const live = useLiveMaya();
  const isLive = live.connected && live.snap !== null;
  const snap = isLive ? live.snap! : mock.snap;
  const { state, caption } = snap;

  // The step Maya is on right now — kept visible under the eyes so you always see what she's doing.
  const activeTask = [...snap.tasks].reverse().find((t) => t.status === "running") ?? snap.tasks.at(-1);
  const activity =
    state === "acting" && activeTask
      ? `${activeTask.label}${activeTask.detail ? ` · ${activeTask.detail}` : ""}`
      : null;

  const showBubble = caption.length > BUBBLE_THRESHOLD;

  // Esc anywhere aborts the in-flight command ("Maya, stop" equivalent).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isLive) live.abort();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isLive, live]);

  // Mark body transparent (Electron window background)
  useEffect(() => {
    document.body.classList.add("widget-mode");
    return () => document.body.classList.remove("widget-mode");
  }, []);

  // Tell Electron to grow/shrink the window for bubble
  useEffect(() => {
    window.electronAPI?.setBubble(showBubble);
  }, [showBubble]);

  // Drag support for frameless window
  const dragRef = useRef<{ startX: number; startY: number } | null>(null);

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest(".w-bubble")) return;
    dragRef.current = { startX: e.screenX, startY: e.screenY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    const dx = e.screenX - dragRef.current.startX;
    const dy = e.screenY - dragRef.current.startY;
    dragRef.current = { startX: e.screenX, startY: e.screenY };
    window.electronAPI?.moveWindow(dx, dy);
  }
  function onPointerUp() { dragRef.current = null; }

  return (
    <div
      className="w-card"
      data-state={state}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* ambient glow */}
      <div className="w-aura" />

      {/* eyes */}
      <div className="w-eyes" data-state={state} aria-hidden="true">
        <div className="w-sonar"><span /><span /><span /></div>
        <WidgetEye side="left" />
        <WidgetEye side="right" />
      </div>

      {/* emotion row — glyph + state label */}
      <div className="w-emotion">
        <span className="w-emotion__glyph">{EMOTION_GLYPH[state]}</span>
        <span className="w-emotion__label">{STATE_LABEL[state]}</span>
      </div>

      {/* current action — always visible while Maya is doing something */}
      {activity && (
        <p className="w-activity" key={activity}>{activity}</p>
      )}

      {/* short caption stays inline */}
      {caption && !showBubble && (
        <p className="w-caption" key={caption}>{caption}</p>
      )}

      {/* long response opens speech bubble below the card */}
      {showBubble && (
        <div className="w-bubble" key={caption}>
          <div className="w-bubble__tail" aria-hidden="true" />
          <p className="w-bubble__text">{caption}</p>
        </div>
      )}
    </div>
  );
}
