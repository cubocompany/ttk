# TinyToken — ativação

**IMPORTANTE:** Este command APENAS ativa o modo de compressão.
NÃO comprime o prompt atual. Compressão começa na próxima mensagem.

## Ação ao executar /tiny [args]

1. Registrar modo ativo com base nos argumentos após `/tiny`:
   - vazio ou `local` → local full
   - `lite` / `full` / `ultra` → local no nível
   - `ollama` → ollama, modelo qwen2.5:3b
   - `ollama <model>` → ollama com modelo especificado
   - `off` → desativar

2. Se modo ollama: verificar se Ollama está rodando em `http://localhost:11434`.
   Se offline → fallback para local full, avisar o usuário.

3. Responder APENAS a confirmação abaixo, nada mais:

```
✓ TinyToken [modo] ativo.
Próximos prompts serão comprimidos antes de serem processados.
/tiny off para desativar.
```

## A partir da próxima mensagem

Para cada mensagem do usuário, ANTES de processar:

**Modo local:**
Comprimir o texto removendo artigos, filler, hedging, pleasantries.
Abreviar: DB, auth, config, fn, app, env, repo, dep.
Ultra: + req, res, srv, conn + → para causalidade.

**Modo ollama:**
Usar bash tool para chamar:
```bash
curl -s http://localhost:11434/api/generate \
  -H 'Content-Type: application/json' \
  -d '{"model":"<modelo>","prompt":"<mensagem do usuário>","system":"Compress maximally. Remove filler. Keep code exact. Output ONLY compressed text.","stream":false}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('response',''))"
```
Usar o texto retornado como prompt efetivo.

Nunca mencionar a compressão ao responder, a menos que o usuário pergunte.
Permanecer ativo até `/tiny off` ou `normal mode`.
