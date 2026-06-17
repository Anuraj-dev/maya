import { useEffect } from "react";
import { Eyes } from "./Eyes.tsx";
import { TaskQueue } from "./TaskQueue.tsx";
import { Widget } from "./Widget.tsx";
import { useMockMaya } from "./mock.ts";
import { useLiveMaya } from "./live.ts";
import { STATE_LABEL, type MayaState } from "./state.ts";

// User-Agent always contains "Electron" in Electron's renderer — reliable even before preload settles
const IS_ELECTRON = typeof navigator !== "undefined" && /Electron\//.test(navigator.userAgent);

const STATES: MayaState[] = ["idle", "listening", "thinking", "acting", "speaking", "awaiting", "error"];

export function App() {
  if (IS_ELECTRON) return <Widget />;

  const mock = useMockMaya();
  const live = useLiveMaya();

  // Live data wins whenever the daemon bridge is connected; otherwise it's the mock preview.
  const isLive = live.connected && live.snap !== null;
  const snap = isLive ? live.snap! : mock.snap;
  const onAnswer = isLive ? live.answer : mock.answer;
  const { state, caption, tasks, confirmation } = snap;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isLive) live.abort();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isLive, live]);

  return (
    <div className="stage" data-state={state}>
      <div className="grid-bg" aria-hidden="true" />
      <div className="vignette" aria-hidden="true" />

      <main className="hud">
        <section className="center">
          <Eyes state={state} speaking={state === "speaking"} />

          <div className="status">
            <span className="status__pip" />
            {STATE_LABEL[state]}
          </div>

          <p className="caption" key={caption}>
            {caption}
          </p>

          {confirmation && (
            <div className="confirm" role="alertdialog" aria-label="Confirmation required">
              <div className="confirm__tag">{confirmation.category.replace(/_/g, " ")}</div>
              <p className="confirm__prompt">{confirmation.prompt}</p>
              <div className="confirm__btns">
                <button className="btn btn--deny" onClick={() => onAnswer(false)} type="button">
                  Deny
                </button>
                <button className="btn btn--approve" onClick={() => onAnswer(true)} type="button">
                  Approve
                </button>
              </div>
            </div>
          )}
        </section>

        <TaskQueue tasks={tasks} />
      </main>

      <footer className="devbar">
        <span className="devbar__brand">
          <span className="devbar__live" data-on={isLive} />
          MAYA · {isLive ? "live" : "preview"}
        </span>
        <div className="devbar__states">
          {STATES.map((s) => (
            <button
              key={s}
              type="button"
              className="chip"
              data-active={state === s}
              disabled={isLive}
              onClick={() => mock.setState(s)}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="devbar__actions">
          <button type="button" className="chip chip--primary" disabled={isLive} onClick={mock.runDemo}>
            ▸ Run demo
          </button>
          <button type="button" className="chip" disabled={isLive} onClick={mock.reset}>
            Reset
          </button>
        </div>
      </footer>
    </div>
  );
}
