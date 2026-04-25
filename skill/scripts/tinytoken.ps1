<#
.SYNOPSIS
    TinyToken — Prompt compression preprocessor for PowerShell/Windows.

.DESCRIPTION
    Compresses prompts before they reach the main LLM.
    Two modes: local (rule-based) or ollama (local model compression).

.PARAMETER Prompt
    The prompt text to compress.

.PARAMETER Mode
    Compression mode: 'local' or 'ollama'. Default: local.

.PARAMETER Level
    Compression intensity: 'lite', 'full', 'ultra'. Default: full.

.PARAMETER Model
    Ollama model name. Default: qwen2.5:3b.

.PARAMETER OllamaUrl
    Ollama API URL. Default: http://localhost:11434.

.PARAMETER PassThru
    If set, outputs ONLY the compressed text (no stats), useful for piping.

.EXAMPLE
    .\tinytoken.ps1 -Prompt "Please help me understand React hooks"
    .\tinytoken.ps1 -Prompt "Explain database pooling" -Mode ollama -Model "qwen2.5:3b"
    "your prompt" | .\tinytoken.ps1 -Mode ollama
    .\tinytoken.ps1 -Prompt "verbose prompt" -PassThru | opencode -p
#>

param(
    [Parameter(ValueFromPipeline = $true)]
    [string]$Prompt,

    [ValidateSet("local", "ollama")]
    [string]$Mode = "local",

    [ValidateSet("lite", "full", "ultra")]
    [string]$Level = "full",

    [string]$Model = "qwen2.5:3b",

    [string]$OllamaUrl = "http://localhost:11434",

    [switch]$PassThru
)

# --- Filler/hedging word lists ---
$FillerEN = @(
    '\bjust\b', '\breally\b', '\bbasically\b', '\bactually\b', '\bsimply\b',
    '\bvery\b', '\bquite\b', '\brather\b', '\bpretty much\b'
)
$HedgingEN = @(
    '\bI think\b', '\bI believe\b', '\bI guess\b',
    '\bit seems like\b', '\bit appears that\b', '\bmaybe\b', '\bperhaps\b'
)
$PleasantriesEN = @(
    '\bsure\b', '\bcertainly\b', '\bof course\b', '\bhappy to\b',
    '\bglad to\b', '\bno problem\b', '\bplease\b',
    '\bCould you please\b', '\bWould you mind\b',
    '\bI would appreciate if\b', '\bI was wondering if\b'
)
$VerbosePhrases = @{
    'in order to' = 'to'
    'a lot of' = 'many'
    'due to the fact that' = 'because'
    'at this point in time' = 'now'
    'in the event that' = 'if'
    'for the purpose of' = 'for'
}
$ArticlesEN = @('\ba\b', '\ban\b', '\bthe\b')
$AbbrevFull = @{
    'implementation' = 'impl'; 'implement' = 'impl'
    'configuration' = 'config'; 'configure' = 'config'
    'database' = 'DB'; 'function' = 'fn'; 'application' = 'app'
    'environment' = 'env'; 'repository' = 'repo'; 'directory' = 'dir'
    'dependencies' = 'deps'; 'dependency' = 'dep'
    'authentication' = 'auth'; 'authorization' = 'authz'
}
$AbbrevUltra = @{
    'request' = 'req'; 'response' = 'res'; 'message' = 'msg'
    'server' = 'srv'; 'connection' = 'conn'; 'management' = 'mgmt'
    'development' = 'dev'; 'production' = 'prod'; 'information' = 'info'
    'parameters' = 'params'; 'parameter' = 'params'
    'specification' = 'spec'; 'documentation' = 'docs'
}
$CausalityUltra = @{
    'because' = '→'; 'since' = '→'; 'therefore' = '→'
    'thus' = '→'; 'hence' = '→'
    'however' = ';'; 'but' = ';'; 'although' = ';'
}

function Remove-Patterns {
    param([string]$Text, [string[]]$Patterns)
    foreach ($p in $Patterns) {
        $Text = $Text -replace $p, ''
    }
    return $Text
}

function Replace-Words {
    param([string]$Text, [hashtable]$Map)
    foreach ($key in $Map.Keys) {
        $Text = $Text -replace "\b$key\b", $Map[$key]
    }
    return $Text
}

function Compress-Local {
    param([string]$Text, [string]$Level)

    $result = $Text

    if ($Level -in @('lite', 'full', 'ultra')) {
        $result = Remove-Patterns -Text $result -Patterns $FillerEN
        $result = Remove-Patterns -Text $result -Patterns $HedgingEN
        $result = Remove-Patterns -Text $result -Patterns $PleasantriesEN
        $result = Replace-Words -Text $result -Map $VerbosePhrases
    }

    if ($Level -in @('full', 'ultra')) {
        $result = Remove-Patterns -Text $result -Patterns $ArticlesEN
        $result = Replace-Words -Text $result -Map $AbbrevFull
    }

    if ($Level -eq 'ultra') {
        $result = Replace-Words -Text $result -Map $AbbrevUltra
        $result = Replace-Words -Text $result -Map $CausalityUltra
    }

    # Clean whitespace
    $result = ($result -replace '  +', ' ' -replace ' +\.', '.' -replace ' +,', ',').Trim()
    return $result
}

function Compress-Ollama {
    param([string]$Text, [string]$Model, [string]$Url)

    $systemPrompt = @"
You are a prompt compression engine. Your ONLY job is to rewrite the user's prompt in the most token-efficient way possible while preserving ALL technical meaning, intent, and specificity. Rules:
- Remove articles, filler, pleasantries, hedging
- Use fragments, abbreviations, arrows for causality
- Keep code, error messages, variable names EXACT
- Keep all specific values, versions, configurations EXACT
- Output ONLY the compressed prompt, nothing else
- Do NOT answer the prompt, just compress it
- Do NOT add any explanation or meta-commentary
"@

    try {
        $null = Invoke-RestMethod -Uri "$Url/api/tags" -TimeoutSec 3 -ErrorAction Stop
    }
    catch {
        Write-Host "[TinyToken] Ollama unreachable at $Url. Falling back to local." -ForegroundColor Yellow
        return Compress-Local -Text $Text -Level "full"
    }

    try {
        $body = @{
            model   = $Model
            prompt  = $Text
            system  = $systemPrompt
            stream  = $false
            options = @{ temperature = 0.1; num_predict = 2048 }
        } | ConvertTo-Json -Depth 3

        $response = Invoke-RestMethod -Uri "$Url/api/generate" `
            -Method Post -Body $body -ContentType "application/json" -TimeoutSec 30

        if ($response.response) {
            return $response.response.Trim()
        }
        else {
            Write-Host "[TinyToken] Empty Ollama response. Falling back to local." -ForegroundColor Yellow
            return Compress-Local -Text $Text -Level "full"
        }
    }
    catch {
        Write-Host "[TinyToken] Ollama error: $_. Falling back to local." -ForegroundColor Yellow
        return Compress-Local -Text $Text -Level "full"
    }
}

# --- Main ---

if (-not $Prompt) {
    Write-Host "Error: No prompt provided." -ForegroundColor Red
    Write-Host 'Usage: .\tinytoken.ps1 -Prompt "your prompt" [-Mode local|ollama] [-Level lite|full|ultra]'
    exit 1
}

$origWords = ($Prompt -split '\s+').Count

switch ($Mode) {
    "local" { $compressed = Compress-Local -Text $Prompt -Level $Level }
    "ollama" { $compressed = Compress-Ollama -Text $Prompt -Model $Model -Url $OllamaUrl }
}

$compWords = ($compressed -split '\s+').Count
$reduction = [math]::Round((1 - $compWords / [math]::Max($origWords, 1)) * 100)

if ($PassThru) {
    Write-Output $compressed
}
else {
    Write-Host ""
    Write-Host "  TinyToken Prompt Compressor" -ForegroundColor Cyan
    Write-Host "  Mode: $Mode | Level: $Level | Model: $Model" -ForegroundColor DarkGray
    Write-Host "  $origWords → $compWords words ($reduction% reduction)" -ForegroundColor Green
    Write-Host "  ---" -ForegroundColor DarkGray
    Write-Host ""
    Write-Output $compressed
}
