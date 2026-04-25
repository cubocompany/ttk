name: TinyToken
description: >
  Prompt compression — ativa quando usuário menciona /tiny, compress prompt,
  save tokens, ou pede compressão de prompts. Dois modos: local (regras, instantâneo)
  ou ollama (modelo local, 60-80% redução).
trigger: manual
inclusion: manual
---

# TinyToken via Kiro Hook

Este hook aparece como `/tiny` no menu de slash commands do Kiro IDE.
No Kiro CLI não há slash commands — a skill é ativada por semântica.

Ao ser invocado, ativar compressão de prompts conforme instruções do SKILL.md.
