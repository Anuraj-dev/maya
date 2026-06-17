import Anthropic from "@anthropic-ai/sdk";
import { loadConfig } from "../config/index.ts";

/**
 * Minimal, near-zero-cost connectivity check for the Anthropic key. One tiny Haiku call,
 * no tools/thinking/effort, capped at a few output tokens — costs a fraction of a cent.
 * Used to validate a freshly-pasted key without spending the real-task budget.
 */
export async function pingAnthropic(): Promise<void> {
  const config = await loadConfig();
  const key = config.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!key) {
    console.error(
      "\n❌ No Anthropic key found. Paste it into maya/.env (ANTHROPIC_API_KEY=...) and retry.\n",
    );
    process.exitCode = 1;
    return;
  }

  const model = config.brain.defaultModel;
  const client = new Anthropic({ apiKey: key });
  console.error(`\n🔌 Pinging ${model} …`);
  try {
    const res = await client.messages.create({
      model,
      max_tokens: 16,
      messages: [{ role: "user", content: 'Reply with exactly: "Maya online."' }],
    });
    const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    const { input_tokens, output_tokens } = res.usage;
    console.log(`\n✅ ${text || "(ok)"}`);
    console.error(`   key works · ${model} · ${input_tokens} in / ${output_tokens} out tokens\n`);
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      console.error(`\n❌ ${err.status} ${err.name}: ${err.message}\n`);
    } else {
      console.error(`\n❌ ${err instanceof Error ? err.message : String(err)}\n`);
    }
    process.exitCode = 1;
  }
}
