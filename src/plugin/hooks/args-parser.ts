import type { ParsedArgs, CompressionLevel, CompressionMode } from "../types/index.js"

const LEVELS = new Set<CompressionLevel>(["lite", "full", "ultra"])

function isLevel(v: string): v is CompressionLevel {
  return LEVELS.has(v as CompressionLevel)
}

/**
 * Parse the text that follows /tiny.
 *
 * Handles:
 *   /tiny              → local full
 *   /tiny local        → local full
 *   /tiny lite         → local lite
 *   /tiny full         → local full
 *   /tiny ultra        → local ultra
 *   /tiny ollama       → ollama gemma4:latest
 *   /tiny ollama phi3  → ollama phi3
 *   /tiny ollama gemma4:latest → ollama gemma4:latest
 *   /tiny off          → deactivate
 */
export function parseArgs(raw: string): ParsedArgs {
  const parts = raw.trim().split(/\s+/).filter(Boolean)
  const result: ParsedArgs = {
    mode: "local",
    level: "full",
    model: "gemma4:latest",
    off: false,
    explicitModel: false,
  }

  if (parts.length === 0) return result

  const first = parts[0]!.toLowerCase()

  if (first === "off") {
    result.off = true
    return result
  }

  if (first === "ollama") {
    result.mode = "ollama" satisfies CompressionMode
    // Second token is the model name — preserves colons: gemma4, gemma4:latest, phi3:mini
    if (parts.length >= 2 && parts[1]) {
      result.model = parts[1]
      result.explicitModel = true
    }
    return result
  }

  if (isLevel(first)) {
    result.level = first
    return result
  }

  // "local" or unknown → use defaults
  return result
}

/**
 * Extract the /tiny command arguments from a full user message.
 * Handles two formats:
 *   1. Direct: "/tiny ultra"   (from Claude Code or direct typing)
 *   2. Template expanded by OpenCode commands: "Activate TinyToken. Argument: ultra"
 * Returns null if the message is not a /tiny command.
 */
export function extractTinyCommand(text: string): string | null {
  const trimmed = text.trim()

  // Format 1: /tiny [args]
  const slashMatch = trimmed.match(/^\/tiny\s*(.*?)$/is)
  if (slashMatch) return (slashMatch[1] ?? "").trim()

  // Format 2: OpenCode command template expansion
  // "Activate TinyToken. Argument: <args>\n..."
  // The template body may have more content after the argument line — ignore it
  const templateMatch = trimmed.match(/^Activate TinyToken[.\s].*?Argument:\s*(\S[^\n\r]*?)[\n\r]/is)
  if (templateMatch) return (templateMatch[1] ?? "").trim()

  // Format 2b: single-line template (no newline after)
  const templateMatchSingle = trimmed.match(/^Activate TinyToken[.\s].*?Argument:\s*(\S.*?)$/is)
  if (templateMatchSingle) {
    // Only return first token(s) before "Rules" or newline to avoid capturing the rules table
    const raw = (templateMatchSingle[1] ?? "").split(/\n|Rules/i)[0]!.trim()
    return raw
  }

  return null
}
