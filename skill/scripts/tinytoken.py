#!/usr/bin/env python3
"""
TinyToken — Prompt compression preprocessor.

Compresses prompts before they reach the main LLM.
Two modes: local (rule-based) or ollama (local model compression).

Usage:
    # As CLI
    echo "your prompt" | python tinytoken.py --mode ollama --model qwen2.5:3b
    python tinytoken.py --mode local --level ultra "your prompt here"
    
    # As library
    from tinytoken import compress
    result = compress("your verbose prompt", mode="ollama")
"""

import argparse
import re
import sys
import json

try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False


OLLAMA_SYSTEM_PROMPT = """You are a prompt compression engine. Your ONLY job is to rewrite the user's prompt in the most token-efficient way possible while preserving ALL technical meaning, intent, and specificity. Rules:
- Remove articles, filler, pleasantries, hedging
- Use fragments, abbreviations, arrows for causality
- Keep code, error messages, variable names EXACT
- Keep all specific values, versions, configurations EXACT
- Output ONLY the compressed prompt, nothing else
- Do NOT answer the prompt, just compress it
- Do NOT add any explanation or meta-commentary"""


# --- Filler word lists ---

FILLER_EN = [
    r'\bjust\b', r'\breally\b', r'\bbasically\b', r'\bactually\b', r'\bsimply\b',
    r'\bvery\b', r'\bquite\b', r'\brather\b', r'\bpretty much\b',
]

HEDGING_EN = [
    r'\bI think\b', r'\bI believe\b', r'\bI guess\b', r'\bit seems like\b',
    r'\bit appears that\b', r'\bmaybe\b', r'\bperhaps\b',
]

PLEASANTRIES_EN = [
    r'\bsure\b', r'\bcertainly\b', r'\bof course\b', r'\bhappy to\b',
    r'\bglad to\b', r'\bno problem\b', r'\bplease\b',
    r'\bCould you please\b', r'\bWould you mind\b',
    r'\bI would appreciate if\b', r'\bI was wondering if\b',
]

VERBOSE_PHRASES = {
    r'\bin order to\b': 'to',
    r'\ba lot of\b': 'many',
    r'\bdue to the fact that\b': 'because',
    r'\bat this point in time\b': 'now',
    r'\bin the event that\b': 'if',
    r'\bfor the purpose of\b': 'for',
}

FILLER_PT = [
    r'\bapenas\b', r'\bbasicamente\b', r'\brealmente\b', r'\bsimplesmente\b',
    r'\bmuito\b', r'\bbastante\b',
]

HEDGING_PT = [
    r'\beu acho que\b', r'\beu acredito que\b', r'\bparece que\b',
    r'\btalvez\b', r'\bquem sabe\b',
]

PLEASANTRIES_PT = [
    r'\bclaro\b', r'\bcertamente\b', r'\bcom prazer\b', r'\bsem problema\b',
    r'\bpor favor\b', r'\bvocê poderia\b', r'\bseria possível\b',
]

ARTICLES_EN = [r'\ba\b', r'\ban\b', r'\bthe\b']
ARTICLES_PT = [r'\bo\b', r'\bos\b', r'\ba\b', r'\bas\b', r'\bum\b', r'\buma\b', r'\buns\b', r'\bumas\b']

ABBREVIATIONS_FULL = {
    r'\bimplementation\b': 'impl', r'\bimplement\b': 'impl',
    r'\bconfiguration\b': 'config', r'\bconfigure\b': 'config',
    r'\bdatabase\b': 'DB',
    r'\bfunction\b': 'fn',
    r'\bapplication\b': 'app',
    r'\benvironment\b': 'env',
    r'\brepository\b': 'repo',
    r'\bdirectory\b': 'dir',
    r'\bdependencies\b': 'deps', r'\bdependency\b': 'dep',
    r'\bauthentication\b': 'auth',
    r'\bauthorization\b': 'authz',
}

ABBREVIATIONS_ULTRA = {
    r'\brequest\b': 'req',
    r'\bresponse\b': 'res',
    r'\bmessage\b': 'msg',
    r'\bserver\b': 'srv',
    r'\bconnection\b': 'conn',
    r'\bmanagement\b': 'mgmt',
    r'\bdevelopment\b': 'dev',
    r'\bproduction\b': 'prod',
    r'\binformation\b': 'info',
    r'\bparameters?\b': 'params',
    r'\bspecification\b': 'spec',
    r'\bdocumentation\b': 'docs',
}

CAUSALITY_ULTRA = {
    r'\bbecause\b': '→',
    r'\bsince\b': '→',
    r'\bas a result\b': '→',
    r'\btherefore\b': '→',
    r'\bthus\b': '→',
    r'\bhence\b': '→',
    r'\band then\b': '→',
    r'\bafter that\b': '→',
    r'\bsubsequently\b': '→',
    r'\bhowever\b': ';',
    r'\bbut\b': ';',
    r'\balthough\b': ';',
}


def _apply_patterns(text: str, patterns: list[str], replacement: str = '') -> str:
    for p in patterns:
        text = re.sub(p, replacement, text, flags=re.IGNORECASE)
    return text


def _apply_dict(text: str, mapping: dict[str, str]) -> str:
    for pattern, repl in mapping.items():
        text = re.sub(pattern, repl, text, flags=re.IGNORECASE)
    return text


def _clean_whitespace(text: str) -> str:
    text = re.sub(r'  +', ' ', text)
    text = re.sub(r' +\.', '.', text)
    text = re.sub(r' +,', ',', text)
    return text.strip()


def compress_local(text: str, level: str = 'full') -> str:
    """Compress text using rule-based compression."""
    result = text

    # Lite: remove filler, hedging, pleasantries
    if level in ('lite', 'full', 'ultra'):
        result = _apply_patterns(result, FILLER_EN)
        result = _apply_patterns(result, HEDGING_EN)
        result = _apply_patterns(result, PLEASANTRIES_EN)
        result = _apply_dict(result, VERBOSE_PHRASES)
        result = _apply_patterns(result, FILLER_PT)
        result = _apply_patterns(result, HEDGING_PT)
        result = _apply_patterns(result, PLEASANTRIES_PT)

    # Full: drop articles, abbreviate
    if level in ('full', 'ultra'):
        result = _apply_patterns(result, ARTICLES_EN)
        result = _apply_patterns(result, ARTICLES_PT)
        result = _apply_dict(result, ABBREVIATIONS_FULL)

    # Ultra: max abbreviation, causality arrows
    if level == 'ultra':
        result = _apply_dict(result, ABBREVIATIONS_ULTRA)
        result = _apply_dict(result, CAUSALITY_ULTRA)

    return _clean_whitespace(result)


def compress_ollama(
    text: str,
    model: str = 'qwen2.5:3b',
    ollama_url: str = 'http://localhost:11434',
    timeout: int = 30,
) -> str:
    """Compress text using a local Ollama model."""
    if not HAS_REQUESTS:
        print("Warning: 'requests' not installed. Falling back to local mode.", file=sys.stderr)
        return compress_local(text, 'full')

    try:
        # Check connectivity
        requests.get(f'{ollama_url}/api/tags', timeout=3)
    except Exception:
        print(f"Warning: Ollama not reachable at {ollama_url}. Falling back to local.", file=sys.stderr)
        return compress_local(text, 'full')

    try:
        resp = requests.post(
            f'{ollama_url}/api/generate',
            json={
                'model': model,
                'prompt': text,
                'system': OLLAMA_SYSTEM_PROMPT,
                'stream': False,
                'options': {'temperature': 0.1, 'num_predict': 2048},
            },
            timeout=timeout,
        )
        resp.raise_for_status()
        compressed = resp.json().get('response', '').strip()
        if not compressed:
            raise ValueError("Empty response")
        return compressed
    except Exception as e:
        print(f"Warning: Ollama error ({e}). Falling back to local mode.", file=sys.stderr)
        return compress_local(text, 'full')


def compress(
    text: str,
    mode: str = 'local',
    level: str = 'full',
    model: str = 'qwen2.5:3b',
    ollama_url: str = 'http://localhost:11434',
) -> str:
    """
    Main compression function.
    
    Args:
        text: The prompt to compress
        mode: 'local' for rule-based, 'ollama' for local model
        level: 'lite', 'full', or 'ultra' (local mode only)
        model: Ollama model name (ollama mode only)
        ollama_url: Ollama API URL
    
    Returns:
        Compressed prompt string
    """
    if mode == 'ollama':
        return compress_ollama(text, model=model, ollama_url=ollama_url)
    return compress_local(text, level=level)


def stats(original: str, compressed: str) -> dict:
    """Calculate compression statistics."""
    orig_words = len(original.split())
    comp_words = len(compressed.split())
    orig_chars = len(original)
    comp_chars = len(compressed)
    return {
        'original_words': orig_words,
        'compressed_words': comp_words,
        'original_chars': orig_chars,
        'compressed_chars': comp_chars,
        'word_reduction_pct': round((1 - comp_words / max(orig_words, 1)) * 100, 1),
        'char_reduction_pct': round((1 - comp_chars / max(orig_chars, 1)) * 100, 1),
    }


def parse_arguments(arguments_str: str) -> dict:
    """
    Parse $ARGUMENTS string from any skill invocation.
    Handles: '', 'local', 'lite', 'full', 'ultra', 'off',
             'ollama', 'ollama gemma4', 'ollama qwen2.5:3b', 'ollama gemma4:latest'
    Returns dict with keys: mode, level, model, off
    """
    parts = arguments_str.strip().split()
    result = {'mode': 'local', 'level': 'full', 'model': 'qwen2.5:3b', 'off': False}

    if not parts:
        return result

    first = parts[0].lower()

    if first == 'off':
        result['off'] = True
    elif first == 'ollama':
        result['mode'] = 'ollama'
        # Second token is the model — preserves colons: gemma4, qwen2.5:3b, llama3.2:latest
        if len(parts) >= 2:
            result['model'] = parts[1]
    elif first in ('lite', 'full', 'ultra'):
        result['level'] = first
    # 'local' or unknown: use defaults

    return result


def check_ollama(url: str = 'http://localhost:11434', timeout: int = 3) -> dict:
    """
    Pure-Python Ollama check — identical on Windows, Linux, Mac.
    No curl, no shell redirects, no platform-specific behaviour.
    Returns {'ok': bool, 'url': str, 'models': list[str]}
    """
    result: dict = {'ok': False, 'url': url, 'models': []}
    if not HAS_REQUESTS:
        return result
    try:
        resp = requests.get(f'{url}/api/tags', timeout=timeout)
        if resp.ok:
            data = resp.json()
            result['ok'] = True
            result['models'] = [m['name'] for m in data.get('models', [])]
    except Exception:
        pass
    return result


def main():
    parser = argparse.ArgumentParser(description='TinyToken — Prompt compression preprocessor')
    sub = parser.add_subparsers(dest='cmd')

    # ── check: cross-platform Ollama probe (replaces !curl) ──────────────────
    p_check = sub.add_parser('check', help='Check Ollama status (JSON)')
    p_check.add_argument('--url', default='http://localhost:11434')

    # ── run: parse $ARGUMENTS string then compress stdin ─────────────────────
    p_run = sub.add_parser('run', help='Parse $ARGUMENTS and compress prompt')
    p_run.add_argument('arguments', nargs='?', default='',
                       help='$ARGUMENTS string e.g. "ollama gemma4" or "ultra"')
    p_run.add_argument('--url', default='http://localhost:11434')
    p_run.add_argument('--prompt', default='')

    # ── compress: direct use ─────────────────────────────────────────────────
    p_compress = sub.add_parser('compress', help='Compress a prompt directly')
    p_compress.add_argument('prompt', nargs='*')
    p_compress.add_argument('--mode', choices=['local', 'ollama'], default='local')
    p_compress.add_argument('--level', choices=['lite', 'full', 'ultra'], default='full')
    p_compress.add_argument('--model', default='qwen2.5:3b')
    p_compress.add_argument('--url', default='http://localhost:11434')
    p_compress.add_argument('--stats', action='store_true')
    p_compress.add_argument('--json', dest='as_json', action='store_true')

    # Legacy flat interface (no subcommand) — backwards compat
    parser.add_argument('prompt', nargs='*')
    parser.add_argument('--mode', choices=['local', 'ollama'], default='local')
    parser.add_argument('--level', choices=['lite', 'full', 'ultra'], default='full')
    parser.add_argument('--model', default='qwen2.5:3b')
    parser.add_argument('--url', default='http://localhost:11434')
    parser.add_argument('--stats', action='store_true')
    parser.add_argument('--json', dest='as_json', action='store_true')
    parser.add_argument('--passthru', action='store_true')

    args = parser.parse_args()

    # ── check ─────────────────────────────────────────────────────────────────
    if args.cmd == 'check':
        print(json.dumps(check_ollama(url=args.url), ensure_ascii=False))
        return

    # ── run ───────────────────────────────────────────────────────────────────
    if args.cmd == 'run':
        parsed = parse_arguments(args.arguments)

        if parsed['off']:
            print(json.dumps({'action': 'deactivate'}))
            return

        text = args.prompt
        if not text and not sys.stdin.isatty():
            text = sys.stdin.read().strip()
        if not text:
            print(json.dumps({'error': 'no prompt'}), file=sys.stderr)
            sys.exit(1)

        if parsed['mode'] == 'ollama':
            probe = check_ollama(url=args.url)
            if not probe['ok']:
                print(
                    f"[TinyToken] Ollama not reachable at {args.url} — falling back to local full",
                    file=sys.stderr
                )
                parsed['mode'] = 'local'
                parsed['level'] = 'full'

        compressed = compress(
            text, mode=parsed['mode'], level=parsed['level'],
            model=parsed['model'], ollama_url=args.url
        )
        s = stats(text, compressed)
        print(json.dumps({
            'compressed': compressed,
            'mode': parsed['mode'],
            'level': parsed['level'],
            'model': parsed['model'],
            'stats': s,
        }, ensure_ascii=False))
        return

    # ── legacy / compress ─────────────────────────────────────────────────────
    if not sys.stdin.isatty():
        text = sys.stdin.read().strip()
    elif getattr(args, 'prompt', None):
        text = ' '.join(args.prompt)
    else:
        parser.error("No prompt provided. Pipe via stdin or pass as argument.")
        return

    compressed = compress(text, mode=args.mode, level=args.level,
                          model=args.model, ollama_url=args.url)

    if getattr(args, 'as_json', False):
        output: dict = {'original': text, 'compressed': compressed,
                        'mode': args.mode, 'level': args.level}
        if args.stats:
            output['stats'] = stats(text, compressed)
        print(json.dumps(output, ensure_ascii=False, indent=2))
    elif getattr(args, 'passthru', False):
        print(compressed)
    else:
        if args.stats:
            s = stats(text, compressed)
            print(f"[TinyToken] {s['original_words']}→{s['compressed_words']} words "
                  f"({s['word_reduction_pct']}% reduction)", file=sys.stderr)
        print(compressed)


if __name__ == '__main__':
    main()
