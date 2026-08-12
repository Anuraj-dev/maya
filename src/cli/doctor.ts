import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { CONFIG_PATH, loadConfig } from "../config/index.ts";
import { validateDocsIndex } from "../docs-index/validate.ts";
import type { CommandResult } from "./types.ts";

type DoctorSeverity = "required" | "optional";

interface DoctorCheck {
  id: string;
  label: string;
  severity: DoctorSeverity;
  ok: boolean;
  summary: string;
  nextStep?: string;
  details?: Record<string, unknown>;
}

interface DoctorReport {
  ok: boolean;
  checks: DoctorCheck[];
  summary: {
    requiredPassed: number;
    requiredFailed: number;
    optionalPassed: number;
    optionalFailed: number;
  };
}

const PACKAGE_JSON_PATH = join(import.meta.dir, "..", "..", "package.json");
const CLI_ENTRY_PATH = join(import.meta.dir, "..", "index.ts");
const DEFAULT_DOCS_INDEX_ROOT = join(import.meta.dir, "..", "..");

function pushCheck(
  checks: DoctorCheck[],
  check: DoctorCheck,
): void {
  checks.push(check);
}

async function checkPackageJson(checks: DoctorCheck[]): Promise<void> {
  try {
    const raw = await readFile(PACKAGE_JSON_PATH, "utf8");
    const pkg = JSON.parse(raw) as { name?: string; packageManager?: string; bin?: Record<string, string> };
    pushCheck(checks, {
      id: "package-json",
      label: "package.json",
      severity: "required",
      ok: pkg.name === "maya" && typeof pkg.packageManager === "string",
      summary: pkg.name === "maya" && typeof pkg.packageManager === "string"
        ? `Found Maya package manifest (${pkg.packageManager}).`
        : "package.json is missing the expected Maya package metadata.",
      nextStep: pkg.name === "maya" && typeof pkg.packageManager === "string"
        ? undefined
        : "Restore the Maya package.json manifest.",
      details: {
        path: PACKAGE_JSON_PATH,
        packageName: pkg.name ?? null,
        packageManager: pkg.packageManager ?? null,
        bin: pkg.bin?.maya ?? null,
      },
    });
  } catch (error) {
    pushCheck(checks, {
      id: "package-json",
      label: "package.json",
      severity: "required",
      ok: false,
      summary: "Could not read package.json.",
      nextStep: "Restore package.json or fix its JSON syntax.",
      details: {
        path: PACKAGE_JSON_PATH,
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

function checkBunRuntime(checks: DoctorCheck[]): void {
  const ok = typeof Bun?.version === "string" && Bun.version.length > 0 && existsSync(process.execPath);
  pushCheck(checks, {
    id: "bun-runtime",
    label: "Bun runtime",
    severity: "required",
    ok,
    summary: ok
      ? `Running on Bun ${Bun.version}.`
      : "Bun runtime details are not available.",
    nextStep: ok ? undefined : "Install Bun and invoke Maya through the Bun runtime.",
    details: {
      version: Bun?.version ?? null,
      execPath: process.execPath,
    },
  });
}

function checkCliEntry(checks: DoctorCheck[]): void {
  const ok = existsSync(CLI_ENTRY_PATH);
  pushCheck(checks, {
    id: "cli-entry",
    label: "CLI entry",
    severity: "required",
    ok,
    summary: ok ? "Found src/index.ts." : "Missing src/index.ts.",
    nextStep: ok ? undefined : "Restore src/index.ts so the Maya CLI can boot.",
    details: {
      path: CLI_ENTRY_PATH,
    },
  });
}

async function checkConfig(checks: DoctorCheck[]): Promise<void> {
  const hasConfigFile = existsSync(CONFIG_PATH);

  try {
    const config = await loadConfig();
    pushCheck(checks, {
      id: "config",
      label: "Config",
      severity: "required",
      ok: true,
      summary: hasConfigFile
        ? "Config loaded successfully."
        : "Config file is absent; Maya defaults are valid.",
      details: {
        path: CONFIG_PATH,
        exists: hasConfigFile,
        brainProvider: config.brain.provider,
        anthropicApiKey: config.anthropicApiKey ? "[redacted]" : null,
        geminiApiKey: config.geminiApiKey ? "[redacted]" : null,
      },
    });
  } catch (error) {
    pushCheck(checks, {
      id: "config",
      label: "Config",
      severity: "required",
      ok: false,
      summary: "Config could not be loaded.",
      nextStep: `Fix ${CONFIG_PATH} so it matches the Maya config schema.`,
      details: {
        path: CONFIG_PATH,
        exists: hasConfigFile,
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

function docsIndexRoot(): string {
  return process.env.MAYA_DOCTOR_DOCS_ROOT || DEFAULT_DOCS_INDEX_ROOT;
}

async function checkDocsIndex(checks: DoctorCheck[]): Promise<void> {
  const root = docsIndexRoot();

  try {
    let registeredTools: Array<{ name: string; dependencyGated: boolean }> = [];
    let registeredCommands: string[] = [];
    if (process.env.MAYA_DOCTOR_DOCS_ROOT === undefined) {
      const [{ listCliToolSpecs }, { COMMAND_SPECS }] = await Promise.all([
        import("./tool.ts"),
        import("./specs.ts"),
      ]);
      registeredTools = (await listCliToolSpecs()).map((tool) => ({
        name: tool.name,
        dependencyGated: false,
      }));
      registeredCommands = COMMAND_SPECS.map((spec) => spec.path.join(" "));
    }
    const index = validateDocsIndex(root, registeredTools, registeredCommands);
    pushCheck(checks, {
      id: "docs-index",
      label: "Docs index",
      severity: "required",
      ok: true,
      summary: `Docs index catalogs validated (schemaVersion ${index.schemaVersion}).`,
      details: {
        root,
        schemaVersion: index.schemaVersion,
      },
    });
  } catch (error) {
    pushCheck(checks, {
      id: "docs-index",
      label: "Docs index",
      severity: "required",
      ok: false,
      summary: "Docs index validation failed.",
      nextStep: "Fix the docs-index catalogs or their referenced paths, then rerun maya doctor.",
      details: {
        root,
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

function skillCheck(agent: "claude" | "codex"): DoctorCheck {
  const skillPath = join(
    homedir(),
    agent === "claude" ? ".claude" : ".codex",
    "skills",
    "maya",
    "SKILL.md",
  );
  const ok = existsSync(skillPath);
  const label = agent === "claude" ? "Claude Code skill" : "Codex skill";
  return {
    id: `skill-${agent}`,
    label,
    severity: "required",
    ok,
    summary: ok ? "Maya skill is installed." : "Maya skill is not installed.",
    nextStep: ok ? undefined : `Run \`maya setup ${agent}\` to install the Maya skill into ${skillPath}.`,
    details: {
      agent,
      skillPath,
    },
  };
}

async function moduleAvailable(name: string): Promise<boolean> {
  try {
    await import(name);
    return true;
  } catch {
    return false;
  }
}

async function commandOnPath(name: string): Promise<boolean> {
  return (await Bun.which(name)) !== null;
}

async function playwrightHealth(): Promise<
  | { kind: "module-missing" }
  | { kind: "browser-missing"; executablePath: string }
  | { kind: "ok"; executablePath: string }
> {
  try {
    const { chromium } = await import("playwright");
    const explicit = process.env.MAYA_DOCTOR_PLAYWRIGHT_EXECUTABLE;
    const bundled = explicit || chromium.executablePath();
    const executablePath = explicit
      ? explicit
      : existsSync(bundled)
        ? bundled
        : await Bun.which("google-chrome-stable")
          ?? await Bun.which("google-chrome")
          ?? (existsSync("/opt/google/chrome/chrome") ? "/opt/google/chrome/chrome" : bundled);
    return existsSync(executablePath)
      ? { kind: "ok", executablePath }
      : { kind: "browser-missing", executablePath };
  } catch {
    return { kind: "module-missing" };
  }
}

async function checkOptionalCapabilities(checks: DoctorCheck[]): Promise<void> {
  const playwright = await playwrightHealth();
  pushCheck(checks, {
    id: "playwright",
    label: "Playwright",
    severity: "optional",
    ok: playwright.kind === "ok",
    summary:
      playwright.kind === "ok"
        ? "Playwright module and a compatible Chrome executable are available."
        : playwright.kind === "browser-missing"
          ? "Playwright module is available, but the Chromium executable is missing."
          : "Playwright module is missing.",
    nextStep: playwright.kind === "ok"
      ? undefined
      : "Install Google Chrome or run `bun install` and `bunx playwright install chromium`.",
    details:
      playwright.kind === "module-missing"
        ? { executablePath: null }
        : { executablePath: playwright.executablePath },
  });

  const wlPasteOk = await commandOnPath("wl-paste");
  pushCheck(checks, {
    id: "wl-paste",
    label: "Clipboard watcher (wl-paste)",
    severity: "optional",
    ok: wlPasteOk,
    summary: wlPasteOk ? "`wl-paste` is on PATH." : "`wl-paste` is not on PATH.",
    nextStep: wlPasteOk ? undefined : "Install `wl-clipboard` for the Linux clipboard wake-word path.",
  });

  const screenshotOk = await commandOnPath("import");
  pushCheck(checks, {
    id: "imagemagick-import",
    label: "Desktop screenshots (import)",
    severity: "optional",
    ok: screenshotOk,
    summary: screenshotOk ? "`import` is on PATH." : "`import` is not on PATH.",
    nextStep: screenshotOk ? undefined : "Install ImageMagick so `maya screenshot` can capture the desktop.",
  });

  const paplayOk = await commandOnPath("paplay");
  pushCheck(checks, {
    id: "paplay",
    label: "PulseAudio playback (paplay)",
    severity: "optional",
    ok: paplayOk,
    summary: paplayOk ? "`paplay` is on PATH." : "`paplay` is not on PATH.",
    nextStep: paplayOk ? undefined : "Install PulseAudio or PipeWire compatibility so Maya can play voice output.",
  });

  const piperOk = await commandOnPath("piper");
  pushCheck(checks, {
    id: "piper",
    label: "Voice synthesis (piper)",
    severity: "optional",
    ok: piperOk,
    summary: piperOk ? "`piper` is on PATH." : "`piper` is not on PATH.",
    nextStep: piperOk ? undefined : "Install Piper so Maya can synthesize speech locally.",
  });

  const hyprvoxOk = await commandOnPath("hyprvox");
  pushCheck(checks, {
    id: "hyprvox",
    label: "Wake-word capture (hyprvox)",
    severity: "optional",
    ok: hyprvoxOk,
    summary: hyprvoxOk ? "`hyprvox` is on PATH." : "`hyprvox` is not on PATH.",
    nextStep: hyprvoxOk ? undefined : "Install hyprvox if you want the push-to-talk and wake-word flow.",
  });
}

function summarize(checks: DoctorCheck[]): DoctorReport["summary"] {
  const required = checks.filter((check) => check.severity === "required");
  const optional = checks.filter((check) => check.severity === "optional");
  return {
    requiredPassed: required.filter((check) => check.ok).length,
    requiredFailed: required.filter((check) => !check.ok).length,
    optionalPassed: optional.filter((check) => check.ok).length,
    optionalFailed: optional.filter((check) => !check.ok).length,
  };
}

function renderText(report: DoctorReport): string {
  const lines = [`Maya doctor: ${report.ok ? "OK" : "FAIL"}`, ""];

  const required = report.checks.filter((check) => check.severity === "required");
  const optional = report.checks.filter((check) => check.severity === "optional");

  lines.push(`Required (${report.summary.requiredPassed} passed, ${report.summary.requiredFailed} failed)`);
  for (const check of required) {
    lines.push(`${check.ok ? "✓" : "✗"} ${check.label} — ${check.summary}`);
    if (check.nextStep) lines.push(`  next: ${check.nextStep}`);
  }

  lines.push("");
  lines.push(`Optional (${report.summary.optionalPassed} passed, ${report.summary.optionalFailed} failed)`);
  for (const check of optional) {
    lines.push(`${check.ok ? "✓" : "✗"} ${check.label} — ${check.summary}`);
    if (check.nextStep) lines.push(`  next: ${check.nextStep}`);
  }

  return lines.join("\n");
}

export async function runDoctor(): Promise<CommandResult> {
  const checks: DoctorCheck[] = [];

  checkBunRuntime(checks);
  await checkPackageJson(checks);
  checkCliEntry(checks);
  await checkConfig(checks);
  await checkDocsIndex(checks);
  pushCheck(checks, skillCheck("claude"));
  pushCheck(checks, skillCheck("codex"));
  await checkOptionalCapabilities(checks);

  const summary = summarize(checks);
  const report: DoctorReport = {
    ok: summary.requiredFailed === 0,
    checks,
    summary,
  };

  process.exitCode = report.ok ? 0 : 1;

  return {
    text: renderText(report),
    data: report,
  };
}
