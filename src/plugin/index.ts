import path from "path"
import fs from "fs"
import { fileURLToPath } from "url"
import type { Plugin, Config } from "@opencode-ai/plugin"
import type { TinyTokenState } from "./types/index.js"
import { createMessagesTransformHook } from "./hooks/messages-transform.js"
import { createSessionCleanupHook } from "./hooks/session-cleanup.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SKILLS_DIR = path.resolve(__dirname, "..", "..", "skill")

const sessions = new Map<string, TinyTokenState>()

// showToast helper — wraps client.tui.showToast
type ShowToastFn = (opts: { title?: string; message: string; variant?: "info"|"success"|"warning"|"error"; duration?: number }) => Promise<void>

function makeToaster(client: any): ShowToastFn {
  return async (opts) => {
    try {
      await client?.tui?.showToast?.({
        url: "/tui/show-toast",
        body: {
          title: opts.title,
          message: opts.message,
          variant: opts.variant ?? "info",
          duration: opts.duration ?? 3000,
        },
      })
    } catch {
      // Toast API unavailable — silent fallback
    }
  }
}

const TinyTokenPlugin: Plugin = async (ctx) => {
  const showToast = makeToaster((ctx as any).client)

  // Expose showToast to the hooks
  const hookFactory = createMessagesTransformHook(sessions, showToast)
  const cleanupFactory = createSessionCleanupHook(sessions)

  return {
    config: async (config: Config & { skills?: { paths?: string[] } }) => {
      config.skills ??= {}
      config.skills.paths ??= []
      if (!config.skills.paths.includes(SKILLS_DIR)) {
        config.skills.paths.push(SKILLS_DIR)
      }
    },

    ...hookFactory,
    ...cleanupFactory,
  }
}

export default TinyTokenPlugin
