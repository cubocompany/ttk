# Harness Integration Guide — TinyToken

## OpenCode

OpenCode suporta **Custom Tools** — a forma mais limpa de integrar TinyToken.

### Custom Tool (recomendado)

O arquivo `opencode-tool/tinytoken.ts` é um custom tool nativo do OpenCode. Ele registra uma tool chamada `tinytoken` que a LLM pode chamar automaticamente.

**Instalação por projeto:**

```bash
# Linux/Mac
mkdir -p .opencode/tools
cp opencode-tool/tinytoken.ts .opencode/tools/tinytoken.ts

# Windows (PowerShell)
New-Item -ItemType Directory -Force -Path ".opencode\tools"
Copy-Item opencode-tool\tinytoken.ts .opencode\tools\tinytoken.ts
```

**Instalação global:**

```bash
# Linux/Mac
mkdir -p ~/.config/opencode/tools
cp opencode-tool/tinytoken.ts ~/.config/opencode/tools/tinytoken.ts

# Windows (PowerShell)
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.config\opencode\tools"
Copy-Item opencode-tool\tinytoken.ts "$env:USERPROFILE\.config\opencode\tools\tinytoken.ts"
```

Após copiar, a LLM dentro do OpenCode terá acesso à tool `tinytoken` e poderá comprimir prompts quando solicitado.

### CLI Pipe

Para uso não-interativo (scripts, automação):

```bash
# Linux
echo "seu prompt verboso" | tinytoken ollama full | xargs -0 opencode -p

# Windows PowerShell
.\tinytoken.ps1 -Prompt "seu prompt verboso" -Mode ollama -PassThru | ForEach-Object { opencode -p $_ }

# Python (cross-platform)
python tinytoken.py --mode ollama "seu prompt" | opencode -p
```

### Shell Alias

**Linux/Mac (`~/.bashrc` ou `~/.zshrc`):**

```bash
tiny() {
    local mode="${1:-local}"
    local level="${2:-full}"
    shift 2 2>/dev/null || true
    local prompt="$*"
    local compressed
    compressed=$(echo "$prompt" | tinytoken "$mode" "$level")
    opencode -p "$compressed"
}
```

**Windows PowerShell (`$PROFILE`):**

```powershell
function tiny {
    param(
        [string]$Mode = "local",
        [string]$Level = "full",
        [Parameter(ValueFromRemainingArguments)]
        [string[]]$Words
    )
    $prompt = $Words -join " "
    $compressed = & tinytoken.ps1 -Prompt $prompt -Mode $Mode -Level $Level -PassThru
    opencode -p $compressed
}
```

---

## Claude Code

### Shell Alias

```bash
# ~/.bashrc ou ~/.zshrc
tiny-claude() {
    local mode="${1:-ollama}"
    local level="${2:-full}"
    shift 2 2>/dev/null || true
    local compressed
    compressed=$(echo "$*" | tinytoken "$mode" "$level")
    claude -p "$compressed"
}
```

### Windows

```powershell
function tiny-claude {
    param(
        [string]$Mode = "ollama",
        [string]$Level = "full",
        [Parameter(ValueFromRemainingArguments)]
        [string[]]$Words
    )
    $prompt = $Words -join " "
    $compressed = & tinytoken.ps1 -Prompt $prompt -Mode $Mode -Level $Level -PassThru
    claude -p $compressed
}
```

---

## aider

```bash
# Linux/Mac
tiny-aider() {
    local compressed
    compressed=$(echo "$*" | tinytoken ollama full)
    aider --message "$compressed"
}
```

```powershell
# Windows
function tiny-aider {
    param([Parameter(ValueFromRemainingArguments)][string[]]$Words)
    $prompt = $Words -join " "
    $compressed = & tinytoken.ps1 -Prompt $prompt -Mode ollama -PassThru
    aider --message $compressed
}
```

---

## Qualquer CLI genérico

O padrão é sempre o mesmo: comprimir → pipe para o CLI.

```bash
# Linux — wrapper genérico
compressed=$(echo "seu prompt" | tinytoken ollama full)
<qualquer-cli> -p "$compressed"
```

```powershell
# Windows — wrapper genérico
$compressed = .\tinytoken.ps1 -Prompt "seu prompt" -Mode ollama -PassThru
& <qualquer-cli> -p $compressed
```

---

## Python API

Para integração programática em qualquer ferramenta Python:

```python
from tinytoken import compress

# Local
result = compress("seu prompt verboso", mode="local", level="ultra")

# Ollama
result = compress("seu prompt verboso", mode="ollama", model="qwen2.5:3b")

# Usar com Anthropic SDK
from anthropic import Anthropic
client = Anthropic()
response = client.messages.create(
    model="claude-sonnet-4-20250514",
    max_tokens=1024,
    messages=[{"role": "user", "content": result}]
)
```

---

## Modelos Ollama recomendados

| Modelo | RAM | Velocidade | Qualidade |
|--------|-----|-----------|-----------|
| `qwen2.5:3b` | ~2GB | Rápido | Melhor custo-benefício |
| `llama3.2:3b` | ~2GB | Rápido | Boa alternativa |
| `phi3:mini` | ~2.3GB | Rápido | Bom |
| `gemma2:2b` | ~1.6GB | Mais rápido | Mínimo viável |
