#!/usr/bin/env node
import pc from "picocolors"
import prompts from "prompts"
import { TOOLS, getTool, getInstallableTools } from "../installer/paths.js"
import { installTool, uninstallTool, isInstalled } from "../installer/installer.js"

// ─── Banner ───────────────────────────────────────────────────────────────────

function banner(): void {
  console.log()
  console.log(pc.cyan("  ╔╦╗╦╔╗╔╦ ╦╔╦╗╔═╗╦╔═╔═╗╔╗╔"))
  console.log(pc.cyan("   ║ ║║║║╚╦╝ ║ ║ ║╠╩╗║╣ ║║║"))
  console.log(pc.cyan("   ╩ ╩╝╚╝ ╩  ╩ ╚═╝╩ ╩╚═╝╝╚╝"))
  console.log()
  console.log(pc.bold("  🗜️  TTK v3 (Tiny Token Kit)") + pc.dim(" — Prompt compression for AI agents"))
  console.log(pc.dim("  by Cubo Company\n"))
}

// ─── Ollama probe ─────────────────────────────────────────────────────────────

async function checkOllama(): Promise<boolean> {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 2000)
    const resp = await fetch("http://localhost:11434/api/tags", {
      signal: ctrl.signal,
    }).finally(() => clearTimeout(timer))
    return resp.ok
  } catch {
    return false
  }
}

// ─── Commands ─────────────────────────────────────────────────────────────────

function help(): void {
  console.log(pc.bold("Usage:"))
  console.log("  npx @cubocompany/ttk " + pc.cyan("init") + "         Instalador interativo")
  console.log("  npx @cubocompany/ttk " + pc.cyan("status") + "       Status de instalação")
  console.log("  npx @cubocompany/ttk " + pc.cyan("mechanisms") + "   Como /tiny funciona em cada ferramenta")
  console.log("  npx @cubocompany/ttk " + pc.cyan("uninstall") + "    Remover TTK")
  console.log()
  console.log(pc.bold("Comandos no agente após instalar:"))
  console.log()
  console.log("  " + pc.cyan("/tiny") + pc.dim("                   Ativa compressão local (full)"))
  console.log("  " + pc.cyan("/tiny lite") + pc.dim("              Remove filler, mantém estrutura"))
  console.log("  " + pc.cyan("/tiny full") + pc.dim("              Sem artigos + fragmentos + abreviações"))
  console.log("  " + pc.cyan("/tiny ultra") + pc.dim("             Máxima compressão + → para causalidade"))
  console.log("  " + pc.cyan("/tiny ollama") + pc.dim("            Modelo local Ollama (padrão: qwen2.5:3b)"))
  console.log("  " + pc.cyan("/tiny ollama gemma4") + pc.dim("     Especificar modelo"))
  console.log("  " + pc.cyan("/tiny off") + pc.dim("               Desativar"))
  console.log()
  console.log(pc.yellow("  ℹ  ") + pc.dim("No OpenCode, o plugin intercepta ANTES do LLM (real interception)."))
  console.log(pc.yellow("  ℹ  ") + pc.dim("Execute 'mechanisms' para ver como cada ferramenta funciona.\n"))
}

function statusCmd(): void {
  banner()
  console.log(pc.bold("  Status de instalação:\n"))

  for (const tool of getInstallableTools()) {
    const installed = isInstalled(tool)
    const icon = installed ? pc.green("✓") : pc.dim("○")
    console.log(`  ${icon}  ${tool.emoji}  ${pc.bold(tool.label.padEnd(26))} ${installed ? pc.green("instalado") : pc.dim("não instalado")}`)
  }
  console.log()
}

function mechanismsCmd(): void {
  banner()
  console.log(pc.bold("  Como /tiny funciona em cada ferramenta:\n"))

  for (const tool of getInstallableTools()) {
    console.log(`  ${tool.emoji}  ${pc.bold(tool.label)}`)
    console.log(pc.dim(`     Slash:     `) + tool.mechanism.slash)
    console.log(pc.dim(`     Intercept: `) + tool.mechanism.intercept)
    console.log()
  }
}

async function initCmd(): Promise<void> {
  banner()

  console.log(
    pc.bold("  Bem-vindo!") +
    " TTK (Tiny Token Kit) adiciona compressão de prompts ao seu agente.\n" +
    pc.dim("  No OpenCode, usa ") +
    pc.white("experimental.chat.messages.transform") +
    pc.dim(" — o mesmo hook do Superpowers.\n")
  )

  // Step 1: Ferramentas
  const toolChoices = getInstallableTools().map(t => ({
    title: `${t.emoji}  ${t.label}`,
    description: t.description + " — " + t.mechanism.slash,
    value: t.id,
  }))

  const { toolIds } = await prompts(
    {
      type: "multiselect",
      name: "toolIds",
      message: "Para quais ferramentas instalar o TTK?",
      choices: toolChoices,
      hint: "Espaço para selecionar, Enter para confirmar",
      instructions: false,
      min: 1,
    },
    { onCancel: () => { console.log(pc.dim("\n  Cancelado.\n")); process.exit(0) } },
  )

  if (!toolIds || toolIds.length === 0) {
    console.log(pc.yellow("  Nenhuma ferramenta selecionada."))
    process.exit(0)
  }

  // Step 2: Escopo
  const { scope } = await prompts(
    {
      type: "select",
      name: "scope",
      message: "Instalar globalmente ou só no projeto atual?",
      choices: [
        { title: "🌍  Global  " + pc.dim("— disponível em todos os projetos (recomendado)"), value: "global" },
        { title: "📁  Projeto atual  " + pc.dim("— só neste diretório"), value: "project" },
      ],
    },
    { onCancel: () => { console.log(pc.dim("\n  Cancelado.\n")); process.exit(0) } },
  )

  const projectDir: string | undefined = scope === "project" ? process.cwd() : undefined

  // Step 3: Ollama
  console.log()
  const ollamaOk = await checkOllama()
  if (!ollamaOk) {
    console.log(pc.yellow("  ⚠  Ollama não detectado.") + " Para modo ollama, instale depois:")
    console.log(pc.dim("     Linux/Mac: curl -fsSL https://ollama.ai/install.sh | sh"))
    console.log(pc.dim("     Windows:   https://ollama.ai"))
    console.log(pc.dim("     Depois:    ollama pull qwen2.5:3b"))
  } else {
    console.log(pc.green("  ✓  Ollama detectado!") + " Use " + pc.bold("/tiny ollama qwen2.5:3b"))
  }
  console.log()

  // Step 4: Confirmar
  const { confirm } = await prompts(
    {
      type: "confirm",
      name: "confirm",
      message: `Instalar TTK para ${toolIds.length} ferramenta(s) (${scope === "global" ? "global" : "projeto atual"})?`,
      initial: true,
    },
    { onCancel: () => { console.log(pc.dim("\n  Cancelado.\n")); process.exit(0) } },
  )

  if (!confirm) {
    console.log(pc.dim("\n  Nada instalado.\n"))
    process.exit(0)
  }

  // Step 5: Instalar
  console.log()
  let allOk = true

  for (const toolId of toolIds as string[]) {
    const tool = getTool(toolId)
    if (!tool) continue

    console.log(`  ${tool.emoji}  ${pc.bold("Instalando para " + tool.label + "...")}`)

    const opts = projectDir !== undefined ? { projectDir } : {}
    const results = await installTool(tool, opts)

    for (const r of results) {
      const p = r.path.replace(process.env["HOME"] ?? "", "~")
      if (r.status === "ok") {
        console.log(`     ${pc.green("✓")}  ${pc.dim(p)}`)
        if (r.note) console.log(`        ${pc.dim(r.note)}`)
      } else if (r.status === "error") {
        console.log(`     ${pc.red("✗")}  ${p}: ${r.note ?? "erro desconhecido"}`)
        allOk = false
      } else {
        console.log(`     ${pc.dim("–")}  ${r.note ?? r.status}`)
      }
    }

    // Nota específica por ferramenta
    if (toolId === "opencode") {
      console.log(`     ${pc.cyan("★")}  ${pc.dim("Plugin instalado — intercepta prompts ANTES do LLM via hook.")}`)
    }
    if (toolId === "kiro") {
      console.log(`     ${pc.yellow("⚠")}  ${pc.dim("Kiro CLI: sem slash. Skill ativa por semântica do prompt.")}`)
    }
    if (["windsurf", "codex-cli", "gemini-cli"].includes(toolId)) {
      console.log(`     ${pc.yellow("⚠")}  ${pc.dim("Sem slash nativo. LLM simula /tiny pelo contexto injetado.")}`)
    }

    console.log()
  }

  // Step 6: Resultado final
  if (allOk) {
    console.log(pc.green(pc.bold("  ✅  Instalação completa!\n")))
  } else {
    console.log(pc.yellow("  ⚠️  Instalação com alguns erros.\n"))
  }

  console.log(pc.bold("  Como usar:\n"))
  console.log(`  1. Abra seu agente de IA`)
  console.log(`  2. Digite ${pc.cyan("/tiny")} para ativar compressão`)
  console.log(`  3. Digite ${pc.cyan("/tiny ollama qwen2.5:3b")} para 60-80% de compressão`)
  console.log(`  4. Digite ${pc.cyan("/tiny off")} para desativar`)
  console.log()
  console.log(pc.dim("  Execute 'npx @cubocompany/ttk mechanisms' para detalhes técnicos.\n"))
}

async function uninstallCmd(): Promise<void> {
  banner()

  const choices = getInstallableTools()
    .filter(t => isInstalled(t))
    .map(t => ({ title: `${t.emoji}  ${t.label}`, value: t.id }))

  if (choices.length === 0) {
    console.log(pc.dim("  Nenhuma ferramenta com TTK instalado.\n"))
    process.exit(0)
  }

  const { toolIds } = await prompts({
    type: "multiselect",
    name: "toolIds",
    message: "Remover TTK de quais ferramentas?",
    choices,
    hint: "Espaço para selecionar, Enter para confirmar",
    instructions: false,
  })

  if (!toolIds?.length) {
    console.log(pc.dim("  Nada selecionado.\n"))
    process.exit(0)
  }

  const { confirm } = await prompts({
    type: "confirm",
    name: "confirm",
    message: `Remover TTK de ${toolIds.length} ferramenta(s)?`,
    initial: false,
  })

  if (!confirm) {
    console.log(pc.dim("  Cancelado.\n"))
    process.exit(0)
  }

  console.log()
  for (const id of toolIds as string[]) {
    const tool = getTool(id)
    if (!tool) continue
    console.log(`  ${tool.emoji}  ${pc.bold("Removendo de " + tool.label + "...")}`)
    const results = uninstallTool(tool)
    for (const r of results) {
      const p = r.path.replace(process.env["HOME"] ?? "", "~")
      console.log(`     ${r.status === "removed" ? pc.green("✓") : pc.dim("○")}  ${pc.dim(p)} ${r.status}`)
    }
    console.log()
  }

  console.log(pc.bold("  Concluído.\n"))
}

// ─── Entry point ──────────────────────────────────────────────────────────────

const [,, cmd] = process.argv

switch (cmd) {
  case "init":        await initCmd();        break
  case "status":      statusCmd();             break
  case "mechanisms":  mechanismsCmd();         break
  case "uninstall":
  case "remove":      await uninstallCmd();    break
  case "help":
  case "--help":
  case "-h":          banner(); help();        break
  default:            banner(); help();        break
}
