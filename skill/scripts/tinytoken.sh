#!/usr/bin/env bash
# tinytoken.sh — Prompt compression preprocessor
# Usage: echo "your prompt" | tinytoken.sh [mode] [level] [model]
#
# Modes:
#   local   — rule-based compression (default)
#   ollama  — send to local Ollama model for compression
#
# Levels (local mode only):
#   lite    — remove filler, keep structure
#   full    — drop articles, fragments OK (default)
#   ultra   — max abbreviation, arrows, minimal
#
# Model (ollama mode only):
#   Any Ollama model name. Default: qwen2.5:3b
#
# Examples:
#   echo "Please help me fix this bug" | ./tinytoken.sh
#   echo "Please help me fix this bug" | ./tinytoken.sh local ultra
#   echo "Please help me fix this bug" | ./tinytoken.sh ollama full qwen2.5:3b
#   cat prompt.txt | ./tinytoken.sh ollama

set -euo pipefail

MODE="${1:-local}"
LEVEL="${2:-full}"
MODEL="${3:-qwen2.5:3b}"
OLLAMA_URL="${TINYTOKEN_OLLAMA_URL:-http://localhost:11434}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Read prompt from stdin
PROMPT=""
if [ ! -t 0 ]; then
    PROMPT=$(cat)
fi

# Also accept prompt as remaining args if no stdin
if [ -z "$PROMPT" ]; then
    shift 2>/dev/null || true
    shift 2>/dev/null || true  
    shift 2>/dev/null || true
    PROMPT="$*"
fi

if [ -z "$PROMPT" ]; then
    echo -e "${RED}Error: No prompt provided.${NC}"
    echo "Usage: echo \"your prompt\" | tinytoken.sh [mode] [level] [model]"
    echo "   or: tinytoken.sh local full \"your prompt here\""
    exit 1
fi

# Count original tokens (rough estimate: words * 1.3)
ORIG_WORDS=$(echo "$PROMPT" | wc -w | tr -d ' ')
ORIG_TOKENS=$(echo "$ORIG_WORDS * 1.3" | bc 2>/dev/null || echo "$ORIG_WORDS")

compress_local() {
    local text="$1"
    local level="$2"
    local result="$text"

    # --- LITE: remove filler and hedging ---
    if [[ "$level" == "lite" || "$level" == "full" || "$level" == "ultra" ]]; then
        # English filler
        result=$(echo "$result" | sed -E '
            s/\b(just|really|basically|actually|simply|very|quite|rather|pretty much)\b//gi
            s/\b(I think|I believe|I guess|it seems like|it appears that|maybe|perhaps)\b//gi
            s/\b(sure|certainly|of course|happy to|glad to|no problem)\b//gi
            s/\b(Could you please|Would you mind|I would appreciate if|I was wondering if)\b//gi
            s/\b(in order to)\b/to/gi
            s/\b(a lot of)\b/many/gi
            s/\b(due to the fact that)\b/because/gi
            s/\b(at this point in time)\b/now/gi
            s/\b(in the event that)\b/if/gi
            s/\b(for the purpose of)\b/for/gi
        ')
        # Portuguese filler
        result=$(echo "$result" | sed -E '
            s/\b(apenas|basicamente|realmente|simplesmente|muito|bastante)\b//gi
            s/\b(eu acho que|eu acredito que|parece que|talvez|quem sabe)\b//gi
            s/\b(claro|certamente|com prazer|sem problema|por favor)\b//gi
            s/\b(você poderia|seria possível|eu gostaria que|eu estava pensando se)\b//gi
        ')
    fi

    # --- FULL: drop articles, use fragments ---
    if [[ "$level" == "full" || "$level" == "ultra" ]]; then
        # English articles
        result=$(echo "$result" | sed -E 's/\b(a|an|the)\b//gi')
        # Portuguese articles
        result=$(echo "$result" | sed -E 's/\b(o|os|a|as|um|uma|uns|umas)\b//gi')
        # Verbose phrases → short
        result=$(echo "$result" | sed -E '
            s/\b(implement|implementation)\b/impl/gi
            s/\b(configure|configuration)\b/config/gi
            s/\b(database)\b/DB/gi
            s/\b(function)\b/fn/gi
            s/\b(application)\b/app/gi
            s/\b(environment)\b/env/gi
            s/\b(repository)\b/repo/gi
            s/\b(directory)\b/dir/gi
            s/\b(dependency|dependencies)\b/deps/gi
            s/\b(authentication)\b/auth/gi
            s/\b(authorization)\b/authz/gi
        ')
    fi

    # --- ULTRA: max abbreviation ---
    if [[ "$level" == "ultra" ]]; then
        result=$(echo "$result" | sed -E '
            s/\b(request)\b/req/gi
            s/\b(response)\b/res/gi
            s/\b(message)\b/msg/gi
            s/\b(server)\b/srv/gi
            s/\b(connection)\b/conn/gi
            s/\b(management)\b/mgmt/gi
            s/\b(development)\b/dev/gi
            s/\b(production)\b/prod/gi
            s/\b(information)\b/info/gi
            s/\b(parameter|parameters)\b/params/gi
            s/\b(specification)\b/spec/gi
            s/\b(documentation)\b/docs/gi
            s/\b(because|since|as a result)\b/→/gi
            s/\b(therefore|so|thus|hence)\b/→/gi
            s/\b(and then|after that|subsequently)\b/→/gi
            s/\b(however|but|although)\b/; /gi
        ')
    fi

    # Clean up multiple spaces
    result=$(echo "$result" | sed -E 's/  +/ /g; s/^ +//; s/ +$//; s/ +\./\./g; s/ +,/,/g')

    echo "$result"
}

compress_ollama() {
    local text="$1"
    local model="$2"

    local SYSTEM_PROMPT='You are a prompt compression engine. Your ONLY job is to rewrite the user'\''s prompt in the most token-efficient way possible while preserving ALL technical meaning, intent, and specificity. Rules:
- Remove articles, filler, pleasantries, hedging
- Use fragments, abbreviations, arrows for causality
- Keep code, error messages, variable names EXACT
- Keep all specific values, versions, configurations EXACT
- Output ONLY the compressed prompt, nothing else
- Do NOT answer the prompt, just compress it
- Do NOT add any explanation or meta-commentary'

    # Check if Ollama is reachable
    if ! curl -s --connect-timeout 3 "${OLLAMA_URL}/api/tags" > /dev/null 2>&1; then
        echo -e "${YELLOW}Warning: Ollama not reachable at ${OLLAMA_URL}. Falling back to local mode.${NC}" >&2
        compress_local "$text" "full"
        return
    fi

    # Check if model is available
    local available_models
    available_models=$(curl -s "${OLLAMA_URL}/api/tags" | grep -o "\"name\":\"[^\"]*\"" | sed 's/"name":"//;s/"//' 2>/dev/null || echo "")
    
    if ! echo "$available_models" | grep -qi "$(echo "$model" | cut -d: -f1)"; then
        echo -e "${YELLOW}Warning: Model '${model}' not found. Available: ${available_models}${NC}" >&2
        echo -e "${YELLOW}Falling back to local mode.${NC}" >&2
        compress_local "$text" "full"
        return
    fi

    # Send to Ollama
    local response
    response=$(curl -s --max-time 30 "${OLLAMA_URL}/api/generate" \
        -H "Content-Type: application/json" \
        -d "$(jq -n \
            --arg model "$model" \
            --arg prompt "$text" \
            --arg system "$SYSTEM_PROMPT" \
            '{
                model: $model,
                prompt: $prompt,
                system: $system,
                stream: false,
                options: { temperature: 0.1, num_predict: 2048 }
            }'
        )" 2>/dev/null)

    if [ $? -ne 0 ] || [ -z "$response" ]; then
        echo -e "${YELLOW}Warning: Ollama request failed. Falling back to local mode.${NC}" >&2
        compress_local "$text" "full"
        return
    fi

    local compressed
    compressed=$(echo "$response" | jq -r '.response // empty' 2>/dev/null)

    if [ -z "$compressed" ]; then
        echo -e "${YELLOW}Warning: Empty response from Ollama. Falling back to local mode.${NC}" >&2
        compress_local "$text" "full"
        return
    fi

    echo "$compressed"
}

# --- Main ---

echo -e "${CYAN}╔══════════════════════════════════════╗${NC}" >&2
echo -e "${CYAN}║  🗜️  TinyToken Prompt Compressor     ║${NC}" >&2
echo -e "${CYAN}╚══════════════════════════════════════╝${NC}" >&2
echo -e "${CYAN}Mode: ${GREEN}${MODE}${CYAN} | Level: ${GREEN}${LEVEL}${CYAN} | Model: ${GREEN}${MODEL}${NC}" >&2
echo -e "${CYAN}Original: ~${ORIG_WORDS} words${NC}" >&2
echo "" >&2

case "$MODE" in
    local)
        COMPRESSED=$(compress_local "$PROMPT" "$LEVEL")
        ;;
    ollama)
        COMPRESSED=$(compress_ollama "$PROMPT" "$MODEL")
        ;;
    *)
        echo -e "${RED}Unknown mode: $MODE. Use 'local' or 'ollama'.${NC}" >&2
        exit 1
        ;;
esac

# Stats
COMP_WORDS=$(echo "$COMPRESSED" | wc -w | tr -d ' ')
if [ "$ORIG_WORDS" -gt 0 ]; then
    SAVINGS=$(( 100 - (COMP_WORDS * 100 / ORIG_WORDS) ))
else
    SAVINGS=0
fi

echo -e "${GREEN}Compressed: ~${COMP_WORDS} words (${SAVINGS}% reduction)${NC}" >&2
echo "---" >&2

# Output compressed prompt to stdout (so it can be piped)
echo "$COMPRESSED"
