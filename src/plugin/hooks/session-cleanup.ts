import type { Hooks } from "@opencode-ai/plugin"
import type { Event } from "@opencode-ai/sdk"
import type { TinyTokenState } from "../types/index.js"

export function createSessionCleanupHook(
  sessions: Map<string, TinyTokenState>,
): Pick<Hooks, "event"> {
  return {
    event: async ({ event }: { event: Event }): Promise<void> => {
      if (event.type === "session.deleted") {
        const props = event.properties as { sessionID?: string } | undefined
        const sessionId = props?.sessionID
        if (typeof sessionId === "string") {
          sessions.delete(sessionId)
        }
      }
    },
  }
}
