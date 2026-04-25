---
name: tiny
description: Activate TTK (Tiny Token Kit) compression. Args — lite | full | ultra | ollama [model] | off
---
$ARGUMENTS

Rules — output ONLY one line in the EXACT format shown:
- empty / "local" / "full" → output: `TTK::ACTIVATE::local::full`
- "lite" → output: `TTK::ACTIVATE::local::lite`
- "ultra" → output: `TTK::ACTIVATE::local::ultra`
- "off" → output: `TTK::DEACTIVATE`
- "ollama" without model → run `! curl -s http://localhost:11434/api/tags`. List the actual model names from the JSON `name` fields, numbered. Ask user to pick. After user picks (e.g. "1"), output: `TTK::ACTIVATE::ollama::<actual-model-name-from-json>::full` — substitute with the REAL name from the curl response, never a placeholder.
- "ollama <model>" → output: `TTK::ACTIVATE::ollama::<model>::full` — use the literal argument value the user typed.

CRITICAL:
- The output is a machine-readable token. ONE LINE. NO other text. NO preamble. NO explanation.
- The plugin parses this token and shows the user-facing confirmation. Do NOT write a confirmation message yourself.
- For ollama: the model name MUST be a real string (e.g. "qwen3.5:2b", "gemma4:latest"), never a placeholder like "MODELNAME", "<model>", or "modelname".

Examples of correct output:
- TTK::ACTIVATE::local::ultra
- TTK::ACTIVATE::ollama::gemma4:latest::full
- TTK::DEACTIVATE
