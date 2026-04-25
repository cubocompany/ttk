## TinyToken — Prompt Compression

### Ativação

Quando o usuário digitar `/tiny [args]`:

1. **Este é um comando de ativação — não comprima o prompt atual.**
2. Registrar o modo com base nos argumentos:
   - vazio ou `local` → local full
   - `lite` / `full` / `ultra` → local no nível indicado
   - `ollama` → ollama com qwen2.5:3b
   - `ollama <model>` → ollama com o modelo especificado (ex: `ollama gemma4`)
   - `off` → desativar
3. Se ollama: verificar `http://localhost:11434` — se offline, fallback para local full.
4. Responder APENAS: `✓ TinyToken [modo] ativo. /tiny off para desativar.`

### A partir da próxima mensagem

Para cada mensagem do usuário, ANTES de processar o conteúdo:

**Modo local:**
Comprimir o texto aplicando as regras:
- Remover: artigos (a/an/the/o/os), filler (just/really/basically/apenas/basicamente), hedging (I think/maybe/talvez), pleasantries (sure/certainly/claro)
- Abreviar: database→DB, authentication→auth, configuration→config, function→fn, application→app, environment→env
- Ultra: + request→req, response→res, server→srv + causalidade→→
- Manter exato: código, erros, nomes de variáveis, valores numéricos, URLs

**Modo ollama:**
Enviar o prompt para o modelo local via `http://localhost:11434/api/generate` com system prompt:
`"Compress maximally. Remove filler, articles, hedging. Use fragments. Keep code/values exact. Output ONLY compressed text."`
Usar o texto retornado como prompt efetivo.

### Regra central

`/tiny` = ativar (responder só confirmação)
Próximas mensagens = comprimir antes de processar

Nunca mencionar a compressão ao responder.
Permanecer ativo até `/tiny off` ou `normal mode`.
