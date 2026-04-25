// ─── Compression types ────────────────────────────────────────────────────────

export type CompressionLevel = "lite" | "full" | "ultra"
export type CompressionMode = "local" | "ollama"

export interface ParsedArgs {
  mode: CompressionMode
  level: CompressionLevel
  model: string
  off: boolean
  explicitModel: boolean
}

export interface CompressionStats {
  originalWords: number
  compressedWords: number
  originalChars: number
  compressedChars: number
  wordReductionPct: number
  charReductionPct: number
}

// ─── Plugin session state ─────────────────────────────────────────────────────

export interface TinyTokenState {
  active: boolean
  mode: CompressionMode
  level: CompressionLevel
  model: string
  ollamaUrl: string
}

export const DEFAULT_STATE: Readonly<TinyTokenState> = {
  active: false,
  mode: "local",
  level: "full",
  model: "qwen2.5:3b",
  ollamaUrl: "http://localhost:11434",
} as const

// ─── Ollama types ─────────────────────────────────────────────────────────────

export interface OllamaCheckResult {
  ok: boolean
  url: string
  models: string[]
}

export interface OllamaGenerateRequest {
  model: string
  prompt: string
  system: string
  stream: false
  options: { temperature: number; num_predict: number }
}

export interface OllamaGenerateResponse {
  response: string
  done: boolean
}

// ─── SDK-aligned types ────────────────────────────────────────────────────────
// These match @opencode-ai/sdk exactly so the hook signatures stay in sync

import type { Message, Part } from "@opencode-ai/sdk"

/**
 * One entry in the messages array passed to experimental.chat.messages.transform.
 * Matches the SDK definition: { info: Message; parts: Part[] }
 */
export interface TransformMessage {
  info: Message
  parts: Part[]
}
