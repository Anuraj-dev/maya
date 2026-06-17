import type { MayaState } from "./state.ts";

/**
 * Maya's eyes. Two glowing almond irises whose colour, dilation, gaze and motion are driven
 * entirely by the current state (via the `data-state` attribute + CSS). Speaking adds a
 * voice-pulse; listening adds a sonar ring; thinking adds orbiting thought-motes.
 */
export function Eyes({ state, speaking }: { state: MayaState; speaking: boolean }) {
  return (
    <div className="eyes" data-state={state} aria-hidden="true">
      <div className="aura" />
      <div className="eye-row">
        <Eye side="left" />
        <Eye side="right" />
      </div>

      {/* sonar rings while listening */}
      <div className="sonar">
        <span />
        <span />
        <span />
      </div>

      {/* orbiting motes while thinking */}
      <div className="motes">
        {Array.from({ length: 6 }).map((_, i) => (
          <span key={i} style={{ ["--i" as string]: i }} />
        ))}
      </div>

      {/* voice bars while speaking */}
      <div className="voice" data-on={speaking}>
        {Array.from({ length: 7 }).map((_, i) => (
          <span key={i} style={{ ["--i" as string]: i }} />
        ))}
      </div>
    </div>
  );
}

function Eye({ side }: { side: "left" | "right" }) {
  return (
    <div className={`eye eye--${side}`}>
      <div className="eye__socket">
        <div className="eye__iris">
          <div className="eye__ring" />
          <div className="eye__pupil" />
          <div className="eye__glint" />
        </div>
        <div className="eye__lid eye__lid--top" />
        <div className="eye__lid eye__lid--bottom" />
        <div className="eye__lash" />
      </div>
    </div>
  );
}
