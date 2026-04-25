import os from "os"
import path from "path"

const HOME = os.homedir()

// OpenCode always uses ~/.config/opencode regardless of OS.
// On Windows: C:\Users\<user>\.config\opencode
// On Linux/Mac: ~/.config/opencode
// It does NOT use %APPDATA%.
const XDG = process.env["XDG_CONFIG_HOME"] ?? path.join(HOME, ".config")

// ─── Install step types ───────────────────────────────────────────────────────

export type InstallStepType =
  | "plugin-js"       // compiled .js plugin → OpenCode plugins dir
  | "skill-dir"       // full skill directory (SKILL.md + scripts + refs)
  | "command-file"    // OpenCode commands/tiny.md
  | "kiro-steering"   // Kiro steering with inclusion:manual
  | "cursor-rule"     // Cursor .mdc rule
  | "cursor-command"  // Cursor .cursor/commands/tiny.md
  | "rules-append"    // append snippet to .windsurfrules
  | "agents-append"   // append snippet to AGENTS.md / GEMINI.md

export interface InstallStep {
  type: InstallStepType
  path: string
  label: string
}

// ─── Tool mechanisms ─────────────────────────────────────────────────────────

export interface ToolMechanism {
  slash: string
  intercept: string
  args: string
}

// ─── Tool definition ──────────────────────────────────────────────────────────

export interface Tool {
  id: string
  label: string
  description: string
  emoji: string
  mechanism: ToolMechanism
  installs: InstallStep[]
}

// ─── Tool registry ────────────────────────────────────────────────────────────

export const TOOLS: Tool[] = [
  {
    id: "opencode",
    label: "OpenCode",
    description: "Open-source coding agent (anomalyco)",
    emoji: "⚡",
    mechanism: {
      slash: "Plugin hook intercepta ANTES do LLM — interceptação real via experimental.chat.messages.transform",
      intercept: "Plugin JS em ~/.config/opencode/plugins/ — mesmo mecanismo do Superpowers",
      args: "/tiny [lite|full|ultra|ollama [model]|off] — parsed pelo plugin diretamente",
    },
    installs: [
      {
        type: "plugin-js",
        path: path.join(XDG, "opencode", "plugins", "tinytoken.js"),
        label: "Plugin global (hook de interceptação)",
      },
      {
        type: "skill-dir",
        path: path.join(XDG, "opencode", "skills", "tinytoken"),
        label: "Skill global (auto-trigger por semântica)",
      },
      {
        type: "command-file",
        path: path.join(XDG, "opencode", "commands", "tiny.md"),
        label: "Slash command /tiny (fallback sem plugin)",
      },
    ],
  },
  {
    id: "claude-code",
    label: "Claude Code",
    description: "Anthropic's terminal coding agent",
    emoji: "🤖",
    mechanism: {
      slash: "SKILL.md name:tiny → /tiny nativo com autocomplete",
      intercept: "!`cmd` no SKILL.md executa ANTES do LLM — interceptação real",
      args: "$ARGUMENTS, $0 $1 posicionais",
    },
    installs: [
      {
        type: "skill-dir",
        path: path.join(HOME, ".claude", "skills", "tinytoken"),
        label: "Skill global",
      },
    ],
  },
  {
    id: "kiro",
    label: "Kiro IDE / Kiro CLI",
    description: "AWS AI coding agent (Agent Skills native)",
    emoji: "🪄",
    mechanism: {
      slash: "IDE: skill aparece em / dropdown. CLI: sem slash — só auto-match por semântica",
      intercept: "Auto-ativação por semântica. steering/tiny.md com inclusion:manual = /tiny no IDE",
      args: "Sem args posicionais — skill carregada por matching semântico",
    },
    installs: [
      {
        type: "skill-dir",
        path: path.join(HOME, ".kiro", "skills", "tinytoken"),
        label: "Skill global (auto-trigger)",
      },
      {
        type: "kiro-steering",
        path: path.join(HOME, ".kiro", "steering", "tiny.md"),
        label: "Steering manual → /tiny no IDE",
      },
    ],
  },
  {
    id: "cursor",
    label: "Cursor",
    description: "AI-first editor (VS Code-based)",
    emoji: "🖱️",
    mechanism: {
      slash: ".cursor/commands/tiny.md → /tiny no dropdown do Agent (por projeto)",
      intercept: "Rule .mdc injeta contexto em toda sessão. Ollama via bash tool por instrução",
      args: "Sem $ARGUMENTS nativo — usuário passa como texto após /tiny",
    },
    installs: [
      {
        type: "cursor-rule",
        path: path.join(HOME, ".cursor", "rules", "tinytoken.mdc"),
        label: "Rule global (contexto sempre injetado)",
      },
      {
        type: "cursor-command",
        path: path.join(HOME, ".cursor", "commands", "tiny.md"),
        label: "Template de comando (copie para .cursor/commands/ no projeto)",
      },
    ],
  },
  {
    id: "windsurf",
    label: "Windsurf (Codeium)",
    description: "Codeium AI code editor",
    emoji: "🏄",
    mechanism: {
      slash: "Sem slash commands customizáveis nativos",
      intercept: "~/.windsurfrules lido em todo session — LLM simula /tiny",
      args: "Via instrução de texto no contexto global",
    },
    installs: [
      {
        type: "skill-dir",
        path: path.join(HOME, ".codeium", "windsurf", "skills", "tinytoken"),
        label: "Skill dir",
      },
      {
        type: "rules-append",
        path: path.join(HOME, ".windsurfrules"),
        label: "Regra global",
      },
    ],
  },
  {
    id: "codex-cli",
    label: "Codex CLI (OpenAI)",
    description: "OpenAI's terminal coding agent",
    emoji: "🔷",
    mechanism: {
      slash: "Sem slash commands nativos",
      intercept: "AGENTS.md lido globalmente — LLM simula /tiny",
      args: "Via instrução de texto no contexto global",
    },
    installs: [
      {
        type: "skill-dir",
        path: path.join(HOME, ".codex", "skills", "tinytoken"),
        label: "Skill dir",
      },
      {
        type: "agents-append",
        path: path.join(HOME, ".codex", "AGENTS.md"),
        label: "AGENTS.md global",
      },
    ],
  },
  {
    id: "gemini-cli",
    label: "Gemini CLI (Google)",
    description: "Google's terminal AI coding agent",
    emoji: "♊",
    mechanism: {
      slash: "Sem slash commands nativos",
      intercept: "GEMINI.md lido globalmente — LLM simula /tiny",
      args: "Via instrução de texto no contexto global",
    },
    installs: [
      {
        type: "skill-dir",
        path: path.join(HOME, ".gemini", "skills", "tinytoken"),
        label: "Skill dir",
      },
      {
        type: "agents-append",
        path: path.join(HOME, ".gemini", "GEMINI.md"),
        label: "GEMINI.md global",
      },
    ],
  },
]

export function getTool(id: string): Tool | undefined {
  return TOOLS.find(t => t.id === id)
}

export function getInstallableTools(): Tool[] {
  return TOOLS
}
