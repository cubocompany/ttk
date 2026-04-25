import type { Hooks } from "@opencode-ai/plugin"
import type { TextPart } from "@opencode-ai/sdk"
import type { TinyTokenState, TransformMessage, CompressionLevel } from "../types/index.js"
import { parseArgs } from "./args-parser.js"
import { compressLocal } from "../compression/rules.js"
import { checkOllama, compressWithOllama } from "../compression/ollama.js"

type ShowToastFn = (opts: { title?: string; message: string; variant?: "info"|"success"|"warning"|"error"; duration?: number }) => Promise<void>

// Module-level single active state — simpler than Map keyed by sessionID
// Since sessionID between hooks may mismatch, we use a global active state
// (TinyToken is a per-process toggle anyway — user doesn't use it per-session)
let globalActive: TinyTokenState | null = null

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getText(parts: TransformMessage["parts"]): string {
  return parts.find((p): p is TextPart => p.type === "text")?.text ?? ""
}

function setText(parts: TransformMessage["parts"], text: string): void {
  const idx = parts.findIndex(p => p.type === "text")
  if (idx !== -1) (parts[idx] as TextPart).text = text
}

function modeLabel(state: TinyTokenState): string {
  if (state.mode === "ollama") return `ollama/${state.model} + local/${state.level}`
  return `local/${state.level}`
}

function modeEmoji(state: TinyTokenState): string {
  if (state.mode === "ollama") return "🦙"
  const e: Record<string, string> = { lite: "🔵", full: "🟡", ultra: "🔴" }
  return e[state.level] ?? "🗜️"
}

// Inline instruction — prepended to user message when compression is active
// Focus on BOTH volume (length) and style (word choice), in that order:
//   lite  = same content, ~80% length
//   full  = core content only, ~50% length
//   ultra = minimum viable answer, ~25% length
function buildInlineInstruction(state: TinyTokenState): string {
  if (state.level === "lite") {
    return `[🗜️ TTK LITE: keep content; trim filler (just/really/basically), hedging (I think/maybe), pleasantries. Aim ~80% of normal length.]`
  }
  if (state.level === "full") {
    return `[🗜️ TTK FULL: answer core question only — no tangents, no exhaustive enumeration. Drop articles/filler/hedging/preamble. Fragments OK. Abbreviate: DB/auth/config/fn/app/env/repo. Max 1 example. Aim ~50% of normal length.]`
  }
  // ultra — MUST be shorter than full, not longer
  return `[🗜️ TTK ULTRA: MINIMUM answer. Max 150 words. ONE example max. NO extra sections, NO "next steps", NO summary tables, NO alternative levels of isolamento/ACID unless directly asked. Drop articles/filler/hedging. Abbreviate: DB/auth/config/fn/app/env/repo/req/res/msg/srv/conn. Use → for causality, ; for contrast. Bare fragments. Shorter than FULL level — if you write more than 150 words you failed.]`
}


function buildCommandConfirmation(state: TinyTokenState | null): string {
  if (!state?.active) return `✓ TTK desativado.`
  return `✓ TTK [${modeLabel(state)}] ativo. Reply with only: ✓`
}

// ─── Hook factory ─────────────────────────────────────────────────────────────

export function createMessagesTransformHook(
  sessions: Map<string, TinyTokenState>,
  showToast: ShowToastFn,
): Pick<Hooks, "command.execute.before" | "experimental.chat.messages.transform"> {
  return {

    // ── /tiny command handler ────────────────────────────────────────────────
    "command.execute.before": async (
      input: { command: string; sessionID: string; arguments: string },
      output: { parts: TransformMessage["parts"] },
    ): Promise<void> => {
      if (input.command !== "tiny") return

      const sid = input.sessionID
      if (!sessions.has(sid)) {
        sessions.set(sid, {
          active: false, mode: "local", level: "full",
          model: "gemma4", ollamaUrl: "http://localhost:11434",
        })
      }
      const state = sessions.get(sid)!
      const parsed = parseArgs(input.arguments.trim())

      if (parsed.off) {
        state.active = false
        globalActive = null
        setText(output.parts, buildCommandConfirmation(state))
        await showToast({ title: "TTK", message: "Desativado", variant: "info", duration: 2500 })
        return
      }

      // /tiny ollama (no model) → let template show model picker
      if (parsed.mode === "ollama" && !parsed.explicitModel) return

      const prevLevel = state.level
      state.mode = parsed.mode
      state.model = parsed.model
      state.level = parsed.mode === "ollama" ? prevLevel : parsed.level
      state.active = true

      if (parsed.mode === "ollama") {
        const probe = await checkOllama(state.ollamaUrl)
        if (!probe.ok) {
          state.mode = "local"
          state.level = prevLevel
          console.warn(`[TTK] Ollama offline — fallback to local/${state.level}`)
          await showToast({ title: "TTK", message: `🦙 Ollama offline — fallback local/${state.level}`, variant: "warning", duration: 4000 })
        } else {
          state.ollamaUrl = probe.url
        }
      }

      // Sync to global for cross-session reliability
      globalActive = state

      await showToast({
        title: `${modeEmoji(state)} TTK`,
        message: `Modo ativo: ${modeLabel(state)}`,
        variant: "success", duration: 3000,
      })

      setText(output.parts, buildCommandConfirmation(state))
    },

    // ── Message compression ──────────────────────────────────────────────────
    "experimental.chat.messages.transform": async (
      _input: {},
      output: { messages: TransformMessage[] },
    ): Promise<void> => {
      const lastUserIdx = output.messages.findLastIndex(m => m.info.role === "user")
      if (lastUserIdx === -1) return

      const entry = output.messages[lastUserIdx]!
      const text = getText(entry.parts)
      if (!text) return

      // ── Detect machine-readable activation token from command template ──────
      // Format: "TTK::ACTIVATE::local::LEVEL" or "TTK::ACTIVATE::ollama::MODEL::LEVEL" or "TTK::DEACTIVATE"
      // The plugin parses this token and replaces it with a user-facing confirmation
      const tokenLine = text.split(/[\r\n]/).map(l => l.trim()).find(l => /^TTK::(ACTIVATE|DEACTIVATE)/.test(l))
      if (tokenLine) {
        const parts = tokenLine.split("::").map(p => p.trim()).filter(Boolean)
        // parts[0] = "TTK", parts[1] = "ACTIVATE" or "DEACTIVATE"
        const action = parts[1]
        const sid = entry.info.sessionID
        if (!sessions.has(sid)) {
          sessions.set(sid, { active: false, mode: "local", level: "full", model: "gemma4", ollamaUrl: "http://localhost:11434" })
        }
        const state = sessions.get(sid)!

        if (action === "DEACTIVATE") {
          state.active = false
          globalActive = null
          setText(entry.parts, buildCommandConfirmation(state))
          await showToast({ title: "TTK", message: "Desativado", variant: "info", duration: 2500 })
          return
        }

        // ACTIVATE: parts[2] = "local"|"ollama"
        const modeOrLevel = parts[2]
        if (modeOrLevel === "ollama") {
          // parts[3] = model name (may contain `:` like "gemma4:latest"), parts[4] = level
          const model = parts[3] ?? ""
          const level = (parts[4] as CompressionLevel) ?? "full"
          // Validate model name — reject placeholders
          const isValid = model && !/[<>]/.test(model) && !/\s/.test(model) &&
                          !/^(MODEL|MODELNAME|model|modelname|MODEL_NAME)$/.test(model)
          if (!isValid) {
            console.warn(`[TTK] Invalid model name from template: "${model}"`)
            await showToast({ title: "TTK", message: `Nome de modelo inválido: "${model}"`, variant: "error", duration: 4000 })
            setText(entry.parts, `⚠️ TTK: nome de modelo inválido: "${model}". Tente /tiny ollama <nome-do-modelo>.`)
            return
          }
          // Probe Ollama
          const probe = await checkOllama(state.ollamaUrl)
          if (!probe.ok) {
            state.mode = "local"
            state.level = level
            state.active = true
            globalActive = state
            await showToast({ title: "TTK", message: `🦙 Ollama offline — fallback local/${level}`, variant: "warning", duration: 4000 })
          } else {
            state.ollamaUrl = probe.url
            state.mode = "ollama"
            state.model = model.replace(/:latest$/, "")
            state.level = level
            state.active = true
            globalActive = state
            await showToast({
              title: `🦙 TTK`,
              message: `Modo ativo: ${modeLabel(state)}`,
              variant: "success", duration: 3000,
            })
          }
        } else {
          // local mode: parts[2] is "local", parts[3] is the level
          const level = (parts[3] as CompressionLevel) ?? "full"
          state.mode = "local"
          state.level = level
          state.active = true
          globalActive = state
          await showToast({
            title: `${modeEmoji(state)} TTK`,
            message: `Modo ativo: ${modeLabel(state)}`,
            variant: "success", duration: 3000,
          })
        }

        // Replace machine token with user-facing confirmation
        setText(entry.parts, buildCommandConfirmation(state))
        return
      }

      // Detect legacy /tiny off message (backwards compat)
      if (/✓ TTK (desativado|off)/.test(text)) {
        globalActive = null
        const s = sessions.get(entry.info.sessionID)
        if (s) s.active = false
        return
      }

      // Skip confirmation messages themselves
      if (/✓ TTK/.test(text) || text.includes("Reply with only")) {
        return
      }

      // Find active state: session first, global fallback
      const sid = entry.info.sessionID
      let state = sessions.get(sid)
      if (!state?.active) state = globalActive ?? undefined
      if (!state?.active) {
        return
      }


      // 1. Compress user input
      let compressed = text
      if (state.mode === "ollama") {
        const startMs = Date.now()
        const result = await compressWithOllama(text, state.model, state.ollamaUrl, state.level)
        const elapsedMs = Date.now() - startMs
        if (result.ok && result.text) {
          compressed = result.text
          // Visible confirmation that Ollama actually ran
          const origLen = text.length
          const newLen = compressed.length
          const reduction = origLen > 0 ? Math.round((1 - newLen / origLen) * 100) : 0
          await showToast({
            title: `🦙 Ollama: ${state.model}`,
            message: `${origLen}→${newLen} chars (-${reduction}%) em ${(elapsedMs/1000).toFixed(1)}s`,
            variant: "success", duration: 3000,
          })
        } else {
          compressed = compressLocal(text, state.level)
          const errMsg = result.error ?? "unknown error"
          console.warn(`[TTK] Ollama failed (${errMsg}) — local fallback`)
          await showToast({
            title: "🦙 Ollama falhou",
            message: `${errMsg} — usando local/${state.level}`,
            variant: "warning", duration: 5000,
          })
        }
      } else {
        compressed = compressLocal(text, state.level)
      }

      // 2. Prepend inline instruction — this is what makes the LLM compress its response
      const instruction = buildInlineInstruction(state)
      const finalText = `${instruction}\n\n${compressed}`

      setText(entry.parts, finalText)
    },
  }
}
