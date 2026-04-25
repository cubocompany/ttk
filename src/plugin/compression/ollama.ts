import type { OllamaCheckResult, CompressionLevel } from "../types/index.js"

const SYSTEM_PROMPTS: Record<CompressionLevel, string> = {
  lite: `You are a prompt compression engine. Remove only filler words and hedging, keep full sentence structure.
CRITICAL: Output the compressed prompt in the SAME LANGUAGE as the input. If input is Portuguese, output Portuguese. If English, output English. Never translate.
Remove (in any language): just/só/apenas, really/realmente, basically/basicamente, actually/na verdade, simply/simplesmente, very/muito, I think/eu acho, I believe/eu acredito, maybe/talvez, perhaps/talvez, sure/claro, certainly/certamente, please/por favor, could you/você poderia.
Keep ALL technical content exact: code, variables, errors, versions, URLs.
Output ONLY the compressed prompt — do NOT answer it. No explanation.`,

  full: `You are a prompt compression engine. Rewrite in compact fragment-style while preserving ALL meaning.
CRITICAL: Output the compressed prompt in the SAME LANGUAGE as the input. If input is Portuguese, output Portuguese. If English, output English. Never translate.
Remove articles (a/an/the/o/os/a/as/um/uma), filler, hedging, pleasantries. Use fragments. Abbreviate: DB, auth, config, fn, app, env, repo, dep, impl.
Keep ALL technical content exact: code, variables, errors, versions, URLs.
Output ONLY the compressed prompt — do NOT answer it. No explanation.`,

  ultra: `You are a prompt compression engine. Maximum compression, preserve ALL technical meaning.
CRITICAL: Output the compressed prompt in the SAME LANGUAGE as the input. If input is Portuguese, output Portuguese. If English, output English. Never translate.
Remove all articles (a/an/the/o/os/a/as/um/uma), filler, hedging, pleasantries. Aggressive abbreviations: DB, auth, authz, config, fn, app, env, repo, dep, impl, req, res, msg, srv, conn, mgmt.
Causality: use → instead of "because/therefore/thus/porque/portanto/então". Contrast: use ; instead of "however/but/porém/mas".
Keep ALL code snippets, variable names, error messages, versions, URLs exact.
Output ONLY the compressed prompt — do NOT answer it. No explanation.`,
}

const FALLBACK_ADDRESSES = ["http://127.0.0.1:11434", "http://localhost:11434"]

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response | null> {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    const resp = await fetch(url, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(timer))
    return resp
  } catch {
    return null
  }
}

// Ollama accepts "gemma4" but not "gemma4:latest" in some versions
// Strip ":latest" suffix to maximize compatibility
function normalizeModel(model: string): string {
  return model.endsWith(":latest") ? model.slice(0, -7) : model
}

export async function checkOllama(preferredUrl: string, timeoutMs = 5000): Promise<OllamaCheckResult> {
  const addresses = [preferredUrl, ...FALLBACK_ADDRESSES.filter(a => a !== preferredUrl)]

  for (const addr of addresses) {
    const resp = await fetchWithTimeout(`${addr}/api/tags`, {}, timeoutMs)
    if (resp?.ok) {
      try {
        const data = await resp.json() as { models?: Array<{ name: string }> }
        const models = data.models?.map(m => m.name) ?? []
        if (addr !== preferredUrl) console.info(`[TTK] Ollama found at ${addr}`)
        return { ok: true, url: addr, models }
      } catch { /* continue */ }
    }
  }

  return { ok: false, url: preferredUrl, models: [] }
}

export interface CompressResult {
  ok: boolean
  text?: string
  error?: string
}

export async function compressWithOllama(
  text: string,
  model: string,
  url: string,
  level: CompressionLevel = "full",
  timeoutMs = 30_000,
): Promise<CompressResult> {
  const normalizedModel = normalizeModel(model)
  // Embed system instructions directly in prompt for maximum Ollama version compatibility
  // Some Ollama versions return 400 when "system" or "options" fields are present
  const systemPrompt = SYSTEM_PROMPTS[level]
  const fullPrompt = `${systemPrompt}\n\nCompress this prompt:\n${text}`

  const body = {
    model: normalizedModel,
    prompt: fullPrompt,
    stream: false,
    // Disable thinking/reasoning mode for thinking models (qwen3, deepseek-r1, etc).
    // Compression is a mechanical task — we want the answer, not internal deliberation.
    // Older Ollama versions ignore unknown fields, so this is safe.
    think: false,
  }

  const init: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }

  const addresses = [url, ...FALLBACK_ADDRESSES.filter(a => a !== url)]

  let lastError = "no response"
  for (const addr of addresses) {
    const resp = await fetchWithTimeout(`${addr}/api/generate`, init, timeoutMs)
    if (resp === null) {
      lastError = `timeout after ${timeoutMs / 1000}s or network error`
      continue
    }
    if (resp.ok) {
      try {
        const data = await resp.json() as { response?: string }
        const result = data.response?.trim()
        if (result) {
          if (addr !== url) console.info(`[TTK] Used ${addr}`)
          return { ok: true, text: result }
        }
        lastError = "empty response from Ollama"
      } catch (e) {
        lastError = `JSON parse error: ${e}`
      }
    } else {
      lastError = `HTTP ${resp.status} for model "${normalizedModel}"`
      console.warn(`[TTK] /api/generate at ${addr} returned ${resp.status} for model "${normalizedModel}"`)
    }
  }

  return { ok: false, error: lastError }
}
