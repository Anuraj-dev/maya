import { loadConfig, type Config } from "../config/index.ts";
import { buildTools, type MayaTool, type ToolDeps, toolSpecs } from "../tools/index.ts";
import { closeBrowser } from "../tools/browser.ts";
import { classify } from "../safety/floor.ts";
import { SYSTEM_PROMPT } from "./system-prompt.ts";
import { createBrain, type Brain, type ToolCall, type ToolOutcome } from "../brain/index.ts";
import { createTts, type TtsBackend } from "../voice/tts.ts";
import { loadMemory, formatMemoryBlock } from "../memory/store.ts";

/**
 * Where the loop reports what Maya is doing. The terminal sink (default) prints; the live
 * sink broadcasts to the overlay. Keeping this an interface means the loop itself is the
 * single source of truth for the irreversible floor regardless of the front-end.
 */
export interface MayaSink {
  thinking(): void | Promise<void>;
  say(text: string): void | Promise<void>;
  toolStart(id: string, name: string, input: Record<string, unknown>): void | Promise<void>;
  toolEnd(id: string, status: "done" | "failed"): void | Promise<void>;
  /** Returns true to allow the irreversible action, false to deny it. */
  confirm(name: string, reason: string, category: string): Promise<boolean>;
  idle(): void | Promise<void>;
  error(message: string): void | Promise<void>;
}

/**
 * Provider-agnostic tool-use loop. Every tool call passes through the irreversible floor
 * before executing (manual loop, so the guard is unavoidable). One typed command in, drive
 * the tools, surface Maya's spoken reply + each step through the sink.
 */
export async function runOnce(
  text: string,
  opts: {
    provider?: Config["brain"]["provider"];
    sink?: MayaSink;
    speak?: boolean;
    /** Daemon-injected capabilities (voice_ask, …). */
    deps?: ToolDeps;
    /** Checked between steps; when it flips true the loop stops cleanly ("Maya, stop"). */
    abort?: { aborted: boolean };
    /** Reuse the caller's config instead of reloading (daemon owns one config). */
    config?: Config;
    /**
     * When true the browser is left open after the task (daemon manages lifecycle across tasks).
     * Default false: browser is closed so the one-shot `maya ask` CLI doesn't leave Chromium open.
     */
    keepBrowser?: boolean;
  } = {},
): Promise<void> {
  const config = opts.config ?? (await loadConfig());
  if (opts.provider) config.brain.provider = opts.provider;

  // A custom sink owns its own speaking (the daemon speaks via its persistent TTS); only the
  // default terminal sink needs a TTS here. createTts falls back to NullTts if piper is absent.
  const tts = !opts.sink && opts.speak !== false ? await createTts(config) : undefined;
  const sink = opts.sink ?? terminalSink(tts);

  const tools = buildTools(config, opts.deps ?? {});

  // Inject persistent memory into the system prompt so Maya starts each session aware.
  const memoryNotes = await loadMemory();
  const system = SYSTEM_PROMPT + formatMemoryBlock(memoryNotes);

  let brain: Brain;
  try {
    brain = createBrain({ system, tools: toolSpecs(tools), config });
  } catch (err) {
    await sink.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
    return;
  }
  console.error(`🧠 ${brain.label}\n`);

  try {
    await sink.thinking();
    let step = await brain.start(text);
    while (true) {
      if (opts.abort?.aborted) break;
      if (step.text) await sink.say(step.text);
      if (step.toolCalls.length === 0) break;
      if (opts.abort?.aborted) break;

      const outcomes: ToolOutcome[] = [];
      for (const call of step.toolCalls) outcomes.push(await runTool(tools, call, sink));
      if (opts.abort?.aborted) break;
      await sink.thinking();
      step = await brain.continueWith(outcomes);
    }
    await sink.idle();
  } catch (err) {
    tts?.stop();
    await sink.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  } finally {
    if (!opts.keepBrowser) await closeBrowser();
  }
}

async function runTool(
  tools: Record<string, MayaTool>,
  call: ToolCall,
  sink: MayaSink,
): Promise<ToolOutcome> {
  const tool = tools[call.name];
  if (!tool) return { id: call.id, name: call.name, content: `Unknown tool: ${call.name}`, isError: true };

  await sink.toolStart(call.id, call.name, call.input);

  // Irreversible-action floor: intercept BEFORE executing — independent of the model.
  const verdict = classify({ name: call.name, input: call.input });
  if (verdict.requiresConfirmation) {
    const allowed = await sink.confirm(
      call.name,
      verdict.reason ?? "do something irreversible",
      verdict.category ?? "irreversible",
    );
    if (!allowed) {
      await sink.toolEnd(call.id, "failed");
      return {
        id: call.id,
        name: call.name,
        content: `User DENIED this action (${verdict.category}). Do not retry; choose another approach or stop.`,
        isError: false,
      };
    }
  }

  try {
    const content = await tool.execute(call.input);
    await sink.toolEnd(call.id, "done");
    return { id: call.id, name: call.name, content, isError: false };
  } catch (err) {
    await sink.toolEnd(call.id, "failed");
    return {
      id: call.id,
      name: call.name,
      content: `Tool ${call.name} failed: ${err instanceof Error ? err.message : String(err)}`,
      isError: true,
    };
  }
}

/** Default front-end: prints to the terminal and speaks via TTS; confirmations via stdin y/N. */
function terminalSink(tts?: TtsBackend): MayaSink {
  return {
    thinking() {},
    async say(text) {
      console.log(`\n🗣️  ${text}\n`);
      await tts?.speak(text);
    },
    toolStart(_id, name, input) {
      console.error(`  ⚙️  ${name}(${JSON.stringify(input)})`);
    },
    toolEnd() {},
    confirm(name, reason) {
      const answer = prompt(`\n⚠️  Maya wants to ${reason} via ${name}. Allow? (y/N)`);
      return Promise.resolve(answer?.trim().toLowerCase() === "y");
    },
    idle() {},
    error(message) {
      console.error(`\n❌ ${message}\n`);
    },
  };
}
