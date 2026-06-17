import type { TaskItem, TaskStatus } from "./state.ts";

/** The live task queue — every tool call Maya makes streams in here as a row. */
export function TaskQueue({ tasks }: { tasks: TaskItem[] }) {
  return (
    <aside className="queue" aria-label="Task queue">
      <div className="queue__head">
        <span className="queue__dot" />
        Task queue
      </div>
      {tasks.length === 0 ? (
        <p className="queue__empty">No tasks yet.</p>
      ) : (
        <ul className="queue__list">
          {tasks.map((t) => (
            <li key={t.id} className="task" data-status={t.status}>
              <StatusIcon status={t.status} />
              <span className="task__label">
                {t.label}
                {t.detail && <span className="task__detail"> · {t.detail}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

function StatusIcon({ status }: { status: TaskStatus }) {
  const common = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", strokeWidth: 2 };
  switch (status) {
    case "pending":
      return (
        <svg {...common} className="task__icon" stroke="currentColor" aria-label="pending">
          <circle cx="12" cy="12" r="9" opacity="0.4" />
          <path d="M12 7v5l3 2" strokeLinecap="round" />
        </svg>
      );
    case "running":
      return (
        <svg {...common} className="task__icon task__icon--spin" stroke="currentColor" aria-label="running">
          <path d="M21 12a9 9 0 1 1-6.2-8.55" strokeLinecap="round" />
        </svg>
      );
    case "done":
      return (
        <svg {...common} className="task__icon" stroke="currentColor" aria-label="done">
          <circle cx="12" cy="12" r="9" opacity="0.4" />
          <path d="M8 12.5l2.5 2.5L16 9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "failed":
      return (
        <svg {...common} className="task__icon" stroke="currentColor" aria-label="failed">
          <circle cx="12" cy="12" r="9" opacity="0.4" />
          <path d="M9 9l6 6M15 9l-6 6" strokeLinecap="round" />
        </svg>
      );
  }
}
