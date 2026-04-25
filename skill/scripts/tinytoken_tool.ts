import { tool } from "@opencode-ai/plugin"

/**
 * TinyToken — Custom tool for OpenCode
 * 
 * Compresses prompts before they reach the main LLM.
 * Two modes: local (regex rules) or ollama (local model compression).
 * 
 * Place this file in:
 *   - .opencode/tools/tinytoken.ts  (per project)
 *   - ~/.config/opencode/tools/tinytoken.ts  (global)
 */
export default tool({
  description:
    "Compress a prompt to reduce token usage before sending to the main LLM. " +
    "Supports 'local' mode (rule-based, instant) and 'ollama' mode (local model rewrites the prompt). " +
    "Use when the user says /tiny, 'compress prompt', 'save tokens', or wants token-efficient communication.",
  args: {
    prompt: tool.schema.string().describe("The prompt text to compress"),
    mode: tool.schema
      .enum(["local", "ollama"])
      .default("local")
      .describe("Compression mode: 'local' for regex rules, 'ollama' for local model"),
    level: tool.schema
      .enum(["lite", "full", "ultra"])
      .default("full")
      .describe("Compression intensity (local mode only)"),
    model: tool.schema
      .string()
      .default("qwen2.5:3b")
      .describe("Ollama model name (ollama mode only)"),
    ollama_url: tool.schema
      .string()
      .default("http://localhost:11434")
      .describe("Ollama API URL"),
  },
  async execute(args) {
    const { prompt, mode, level, model, ollama_url } = args
    const originalWords = prompt.split(/\s+/).length

    if (mode === "ollama") {
      return await compressOllama(prompt, model, ollama_url, originalWords)
    }
    return compressLocal(prompt, level, originalWords)
  },
})

// --- Local compression ---

const FILLER_EN = [
  /\bjust\b/gi, /\breally\b/gi, /\bbasically\b/gi, /\bactually\b/gi,
  /\bsimply\b/gi, /\bvery\b/gi, /\bquite\b/gi, /\brather\b/gi,
  /\bpretty much\b/gi,
]

const HEDGING_EN = [
  /\bI think\b/gi, /\bI believe\b/gi, /\bI guess\b/gi,
  /\bit seems like\b/gi, /\bit appears that\b/gi,
  /\bmaybe\b/gi, /\bperhaps\b/gi,
]

const PLEASANTRIES_EN = [
  /\bsure\b/gi, /\bcertainly\b/gi, /\bof course\b/gi,
  /\bhappy to\b/gi, /\bglad to\b/gi, /\bno problem\b/gi,
  /\bCould you please\b/gi, /\bWould you mind\b/gi,
  /\bI would appreciate if\b/gi, /\bI was wondering if\b/gi,
  /\bplease\b/gi,
]

const VERBOSE_PHRASES: Record<string, string> = {
  "in order to": "to",
  "a lot of": "many",
  "due to the fact that": "because",
  "at this point in time": "now",
  "in the event that": "if",
  "for the purpose of": "for",
}

const ARTICLES_EN = [/\ba\b/gi, /\ban\b/gi, /\bthe\b/gi]

const ABBREV_FULL: Record<string, string> = {
  implementation: "impl", implement: "impl",
  configuration: "config", configure: "config",
  database: "DB", function: "fn", application: "app",
  environment: "env", repository: "repo", directory: "dir",
  dependencies: "deps", dependency: "dep",
  authentication: "auth", authorization: "authz",
}

const ABBREV_ULTRA: Record<string, string> = {
  request: "req", response: "res", message: "msg",
  server: "srv", connection: "conn", management: "mgmt",
  development: "dev", production: "prod", information: "info",
  parameters: "params", parameter: "params",
  specification: "spec", documentation: "docs",
}

const CAUSALITY_ULTRA: Record<string, string> = {
  because: "→", since: "→", therefore: "→",
  thus: "→", hence: "→", however: ";", but: ";", although: ";",
}

function removePatterns(text: string, patterns: RegExp[]): string {
  for (const p of patterns) text = text.replace(p, "")
  return text
}

function replaceWords(text: string, map: Record<string, string>): string {
  for (const [word, repl] of Object.entries(map)) {
    text = text.replace(new RegExp(`\\b${word}\\b`, "gi"), repl)
  }
  return text
}

function cleanSpaces(text: string): string {
  return text.replace(/  +/g, " ").replace(/ +\./g, ".").replace(/ +,/g, ",").trim()
}

function compressLocal(text: string, level: string, originalWords: number): string {
  let result = text

  // Lite+
  if (["lite", "full", "ultra"].includes(level)) {
    result = removePatterns(result, FILLER_EN)
    result = removePatterns(result, HEDGING_EN)
    result = removePatterns(result, PLEASANTRIES_EN)
    result = replaceWords(result, VERBOSE_PHRASES)
  }

  // Full+
  if (["full", "ultra"].includes(level)) {
    result = removePatterns(result, ARTICLES_EN)
    result = replaceWords(result, ABBREV_FULL)
  }

  // Ultra
  if (level === "ultra") {
    result = replaceWords(result, ABBREV_ULTRA)
    result = replaceWords(result, CAUSALITY_ULTRA)
  }

  result = cleanSpaces(result)
  const compressedWords = result.split(/\s+/).length
  const reduction = Math.round((1 - compressedWords / Math.max(originalWords, 1)) * 100)

  return [
    `[TinyToken local/${level}] ${originalWords}→${compressedWords} words (${reduction}% reduction)`,
    `---`,
    result,
  ].join("\n")
}

// --- Ollama compression ---

const OLLAMA_SYSTEM = `You are a prompt compression engine. Your ONLY job is to rewrite the user's prompt in the most token-efficient way possible while preserving ALL technical meaning, intent, and specificity. Rules:
- Remove articles, filler, pleasantries, hedging
- Use fragments, abbreviations, arrows for causality
- Keep code, error messages, variable names EXACT
- Keep all specific values, versions, configurations EXACT
- Output ONLY the compressed prompt, nothing else
- Do NOT answer the prompt, just compress it
- Do NOT add any explanation or meta-commentary`

async function compressOllama(
  text: string,
  model: string,
  ollamaUrl: string,
  originalWords: number,
): Promise<string> {
  try {
    const resp = await fetch(`${ollamaUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt: text,
        system: OLLAMA_SYSTEM,
        stream: false,
        options: { temperature: 0.1, num_predict: 2048 },
      }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!resp.ok) {
      return `[TinyToken] Ollama error ${resp.status}. Falling back to local.\n` +
        compressLocal(text, "full", originalWords)
    }

    const data = await resp.json()
    const compressed = data?.response?.trim()

    if (!compressed) {
      return `[TinyToken] Empty Ollama response. Falling back to local.\n` +
        compressLocal(text, "full", originalWords)
    }

    const compressedWords = compressed.split(/\s+/).length
    const reduction = Math.round((1 - compressedWords / Math.max(originalWords, 1)) * 100)

    return [
      `[TinyToken ollama/${model}] ${originalWords}→${compressedWords} words (${reduction}% reduction)`,
      `---`,
      compressed,
    ].join("\n")
  } catch (err) {
    return `[TinyToken] Ollama unreachable. Falling back to local.\n` +
      compressLocal(text, "full", originalWords)
  }
}
