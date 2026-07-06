# Agent entry — maya

BEFORE doing anything in this repo:
1. Read `docs/STATE.md` — the current state of the project (what's done, what's in progress, gotchas).
2. Skim `docs/INDEX.md` — the map of every doc and what it's for.

Then read ONLY the further docs your task needs. Do not scan the repo blindly — that wastes tokens; the
docs exist so you don't have to.

At the END of a work session, run `/checkpoint` — it rewrites `docs/STATE.md` and logs the session so the
next agent (or you tomorrow) starts cheap.

- Conventions: `docs/conventions.md`
- Full decision log (why we chose things): `docs/decisions.md` (+ formal ADRs in `docs/adr/`)
- Complex features are planned in `docs/specs/` (see `/spec`)

---

# Model Delegation Rules

Primary model in this project is **Fable 5**. To save Fable 5's tokens, the two task
categories below must be delegated to a **Sonnet 5** subagent (via the `Agent` tool with
`model: "sonnet"`) instead of being done directly. Only read the subagent's final report —
never duplicate its work by also doing it yourself afterward.

## 1. Browser use → delegate to Sonnet 5

- Any task that needs `mcp__claude-in-chrome__*` tools (navigate, click, type, screenshot,
  read_page, get_page_text, etc.) must be run by a Sonnet 5 subagent, not called directly.
- Give the subagent a self-contained prompt: the URL/site, the exact actions to take, and what
  to report back (e.g. "navigate to raja-dev.me, list the sections and their content").
- Relay the subagent's report to the user; do not re-fetch the same page yourself to check.

## 2. Codebase reading → delegate to Sonnet 5

- Do not use `Read`/`Grep`/`Explore` yourself to answer "what's in the codebase" or general
  exploration questions.
- Spawn a Sonnet 5 subagent (`subagent_type: "Explore"` or `"general-purpose"`,
  `model: "sonnet"`) to read the relevant files and return a concise summary.
- Only read files directly yourself when you are about to edit them and need to verify their
  exact current content immediately before the edit.

## Why

Browser page content and codebase reads are large and consumed once. Pushing those reads onto
a Sonnet 5 subagent keeps that bulk out of Fable 5's context — Fable 5 only ever sees the
subagent's short summary, not the raw pages/files.
