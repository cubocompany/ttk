import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import type { Tool, InstallStep } from "./paths.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// After `bun build`, the CLI is a single bundle at dist/cli/index.js.
// The plugin bundle lives at dist/plugin/index.js (sibling of cli/).
// skill/ is always two levels above dist/ (i.e. package root).
//
// In source (src/installer/installer.ts), __dirname = src/installer/
//   → ../../skill  = skill/            ✓
//   → ../plugin    = src/plugin/       (dev only — never read as file)
//
// In bundle (dist/cli/index.js), __dirname = dist/cli/
//   → ../../skill  = skill/            ✓
//   → ../plugin    = dist/plugin/      ✓
const SKILL_DIR = path.resolve(__dirname, "..", "..", "skill")

// Probe both possible locations: dist/plugin/ (bundle) and src/plugin/ (dev)
// The installer.ts "plugin-js" handler checks fs.existsSync(PLUGIN_DIST)
// and returns "skip" with a helpful message if not found.
const _distPlugin = path.resolve(__dirname, "..", "plugin", "index.js")
const _srcPlugin  = path.resolve(__dirname, "..", "..", "dist", "plugin", "index.js")
const PLUGIN_DIST = fs.existsSync(_distPlugin) ? _distPlugin : _srcPlugin

// ─── Result types ─────────────────────────────────────────────────────────────

export type InstallStatus = "ok" | "skip" | "error" | "not-found" | "removed"

export interface InstallResult {
  path: string
  status: InstallStatus
  note?: string
}

// ─── File helpers ─────────────────────────────────────────────────────────────

function mkdirp(dir: string): void {
  fs.mkdirSync(dir, { recursive: true })
}

function readSkillFile(rel: string): string {
  return fs.readFileSync(path.join(SKILL_DIR, rel), "utf-8")
}

function writeFile(filePath: string, content: string): void {
  mkdirp(path.dirname(filePath))
  fs.writeFileSync(filePath, content, "utf-8")
}

function appendIfMissing(filePath: string, content: string, marker: string): void {
  mkdirp(path.dirname(filePath))
  const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf-8") : ""
  if (!existing.includes(marker)) {
    fs.appendFileSync(filePath, "\n" + content, "utf-8")
  }
}

function copySkillDir(dest: string): void {
  mkdirp(dest)
  fs.copyFileSync(path.join(SKILL_DIR, "SKILL.md"), path.join(dest, "SKILL.md"))

  for (const subdir of ["scripts", "references"] as const) {
    const srcDir = path.join(SKILL_DIR, subdir)
    const destDir = path.join(dest, subdir)
    mkdirp(destDir)
    for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
      if (entry.isFile()) {
        fs.copyFileSync(path.join(srcDir, entry.name), path.join(destDir, entry.name))
      }
    }
  }
}

// ─── Content builders ─────────────────────────────────────────────────────────

function buildCursorMdc(): string {
  return `---
description: TTK (Tiny Token Kit) prompt compression. Activate when user says /tiny, compress prompt, save tokens, or minimize tokens. Handles local rule-based and Ollama model compression.
globs:
alwaysApply: false
---

# TTK (Tiny Token Kit) — Prompt Compression

When user types \`/tiny\` (with optional args), activate compression mode.

**Parse args:**
- empty or \`local\` → local full compression
- \`lite\` / \`full\` / \`ultra\` → local at level
- \`ollama\` → ollama qwen2.5:3b
- \`ollama <model>\` → ollama with model
- \`off\` → deactivate

**Local rules (active after /tiny):**
Remove articles/filler/hedging/pleasantries. Fragments OK. Abbreviate: DB/auth/cfg/fn/app/env/repo. Keep code exact.
- lite: filler only
- full: articles+abbrev+fragments
- ultra: max abbrev + X → Y for causality

**Ollama mode:** use bash tool to POST to \`http://localhost:11434/api/generate\` with model and system: "Compress maximally. Keep code exact. Output ONLY compressed text." Fall back to local if unreachable.

Confirm: \`✓ TTK [mode] active\`. Stay active until \`/tiny off\`.
`
}

function buildAgentsSnippet(): string {
  return readSkillFile("commands/tinytoken_agents_snippet.md")
}

// ─── Step handlers ────────────────────────────────────────────────────────────

type StepHandler = (step: InstallStep) => InstallResult

const HANDLERS: Record<string, StepHandler> = {
  "plugin-js": (step) => {
    if (!fs.existsSync(PLUGIN_DIST)) {
      return { path: step.path, status: "skip", note: "Plugin not built — run `pnpm build` first" }
    }
    writeFile(step.path, fs.readFileSync(PLUGIN_DIST, "utf-8"))
    return { path: step.path, status: "ok", note: step.label }
  },

  "skill-dir": (step) => {
    copySkillDir(step.path)
    return { path: step.path, status: "ok", note: step.label }
  },

  "command-file": (step) => {
    const commandsDir = path.dirname(step.path)
    mkdirp(commandsDir)
    for (const file of ["tiny.md", "tiny-help.md"]) {
      const srcFile = path.join(SKILL_DIR, "commands", file)
      if (fs.existsSync(srcFile)) {
        fs.copyFileSync(srcFile, path.join(commandsDir, file))
      }
    }
    return { path: commandsDir, status: "ok" as const, note: step.label }
  },

  "kiro-steering": (step) => {
    writeFile(step.path, readSkillFile("kiro-hook.md"))
    return { path: step.path, status: "ok", note: step.label }
  },

  "cursor-rule": (step) => {
    writeFile(step.path, buildCursorMdc())
    return { path: step.path, status: "ok", note: step.label }
  },

  "cursor-command": (step) => {
    writeFile(step.path, readSkillFile("commands/tiny_cursor.md"))
    return { path: step.path, status: "ok", note: step.label }
  },

  "rules-append": (step) => {
    appendIfMissing(step.path, buildAgentsSnippet(), "TTK")
    return { path: step.path, status: "ok", note: step.label }
  },

  "agents-append": (step) => {
    appendIfMissing(step.path, buildAgentsSnippet(), "TTK")
    return { path: step.path, status: "ok", note: step.label }
  },
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function installTool(
  tool: Tool,
  opts: { projectDir?: string } = {},
): Promise<InstallResult[]> {
  const steps = opts.projectDir
    ? getProjectSteps(tool, opts.projectDir)
    : tool.installs

  return steps.map(step => {
    try {
      const handler = HANDLERS[step.type]
      if (!handler) {
        return { path: step.path, status: "skip" as const, note: `Unknown step type: ${step.type}` }
      }
      return handler(step)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { path: step.path, status: "error" as const, note: msg }
    }
  })
}

export function uninstallTool(tool: Tool): InstallResult[] {
  return tool.installs.map(step => {
    if (!fs.existsSync(step.path)) {
      return { path: step.path, status: "not-found" as const }
    }
    const stat = fs.statSync(step.path)
    if (stat.isDirectory()) {
      fs.rmSync(step.path, { recursive: true, force: true })
    } else {
      fs.unlinkSync(step.path)
    }
    return { path: step.path, status: "removed" as const }
  })
}

export function isInstalled(tool: Tool): boolean {
  const primary = tool.installs[0]
  if (!primary) return false
  return fs.existsSync(primary.path)
}

// ─── Project-scope steps ──────────────────────────────────────────────────────

function getProjectSteps(tool: Tool, projectDir: string): InstallStep[] {
  const map: Record<string, InstallStep[]> = {
    opencode: [
      { type: "skill-dir", path: path.join(projectDir, ".opencode", "skills", "tinytoken"), label: "Skill (projeto)" },
      { type: "command-file", path: path.join(projectDir, ".opencode", "commands", "tiny.md"), label: "Slash command /tiny (projeto)" },
    ],
    "claude-code": [
      { type: "skill-dir", path: path.join(projectDir, ".claude", "skills", "tinytoken"), label: "Skill (projeto)" },
    ],
    kiro: [
      { type: "skill-dir", path: path.join(projectDir, ".kiro", "skills", "tinytoken"), label: "Skill (projeto)" },
      { type: "kiro-steering", path: path.join(projectDir, ".kiro", "steering", "tiny.md"), label: "Steering /tiny (projeto)" },
    ],
    cursor: [
      { type: "cursor-rule", path: path.join(projectDir, ".cursor", "rules", "tinytoken.mdc"), label: "Rule de projeto" },
      { type: "cursor-command", path: path.join(projectDir, ".cursor", "commands", "tiny.md"), label: "Slash command /tiny (projeto)" },
    ],
    windsurf: [
      { type: "rules-append", path: path.join(projectDir, ".windsurfrules"), label: "Regra de projeto" },
    ],
    "codex-cli": [
      { type: "agents-append", path: path.join(projectDir, "AGENTS.md"), label: "AGENTS.md projeto" },
    ],
    "gemini-cli": [
      { type: "agents-append", path: path.join(projectDir, "GEMINI.md"), label: "GEMINI.md projeto" },
    ],
  }
  return map[tool.id] ?? tool.installs
}
