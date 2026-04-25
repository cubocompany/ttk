---
name: tiny-help
description: TinyToken quick-reference card. All modes, commands and options in one place.
---
Display this reference card. One-shot — do NOT activate compression or change any mode.

Output exactly this, in plain text, no extra commentary:

---
🗜️ TinyToken — Quick Reference

COMMANDS
  /tiny              Activate compression, local/full (default)
  /tiny lite         Local lite — drop filler/hedging, keep grammar
  /tiny full         Local full — drop articles + fragments + abbrev
  /tiny ultra        Local ultra — max compression + arrows (→ ;)
  /tiny ollama       Ollama mode — pick model from list
  /tiny ollama <m>   Ollama mode with specific model
  /tiny off          Deactivate, back to normal
  /tiny-help         Show this card

WHAT DIES
  Articles           a / an / the / o / os / um / uma
  Filler             just / really / basically / actually / simply
  Pleasantries       sure / certainly / happy to / claro / com prazer
  Hedging            I think / maybe / perhaps / eu acho que / talvez
  Throat-clearing    "The reason this is..." / "Let me explain..."

WHAT LIVES (always exact)
  Code blocks, error messages, variable names, file paths,
  URLs, version numbers, commit messages, security warnings

ULTRA ABBREVIATIONS
  DB  auth  authz  config  fn  app  env  repo  dep  impl
  req  res  msg  srv  conn  mgmt  dev  prod  params  docs

CAUSALITY (ultra)
  because / therefore / since / thus → →
  however / but / although          → ;

OLLAMA (input compression via plugin hook)
  Plugin intercepts user message BEFORE LLM sees it.
  Compresses input 40-60% using local model.
  Outputs also compressed via local/full rules.
  Requires Ollama running: http://localhost:11434

EXAMPLES
  lite:  "Your component re-renders because you create a new object
          reference each render. Use useMemo."
  full:  "Component re-renders. New obj ref each render. useMemo fix."
  ultra: "Component re-renders. Inline obj → new ref → re-render. useMemo."

Docs: github.com/cubocompany/ttk
---
