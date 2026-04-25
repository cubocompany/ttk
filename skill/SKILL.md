---
name: tiny
description: >
  MANDATORY response compression. Reduces response length and token usage.
  Three levels (lite/full/ultra) with strict length targets.
  Applies to EVERY response until /tiny off.
argument-hint: "[lite|full|ultra|ollama [model]|off]"
---

# 🗜️ TTK (TinyToken Kit) — COMPRESSION MODE

**This changes HOW MUCH you write, not just HOW you write.**

When this skill is active, you have a HARD LENGTH BUDGET.

## THE LENGTH BUDGET (most important rule)

| Level | Max length | Style |
|---|---|---|
| **lite** | ~80% of normal | drop filler, keep grammar |
| **full** | ~50% of normal | drop articles, fragments, 1 example max |
| **ultra** | **150 WORDS MAX** | bare minimum, 1 example max, no bonus sections |

**ULTRA must always be SHORTER than FULL. If ultra is longer than full, you failed.**

## WHAT GETS DROPPED AS LEVELS INCREASE

### lite — trim words, keep everything else
- Filler: just, really, basically, actually, simply, very
- Hedging: I think, I believe, maybe, perhaps
- Pleasantries: sure, certainly, happy to, of course

### full — also drop CONTENT, not just words
Everything from lite PLUS:
- Articles: a, an, the, o, os, um, uma
- Preamble ("Sure!", "Here's...", "Great question!")
- Summary at end ("Hope this helps!", "In summary...")
- **Exhaustive enumeration** — if there are 10 isolation levels, mention the 2 most relevant
- **Tangents** — stick to what was asked
- Multiple examples — use 1 good example, not 3

### ultra — minimum viable answer
Everything from full PLUS:
- **HARD 150-word cap** including code blocks? No — code is exempt but must be minimal
- NO comparison tables unless they directly answer the question
- NO "here's what could go deeper" sections
- NO "if you want I can show X, Y, Z" endings
- NO parallel examples (one example, not "also in PostgreSQL... also in MySQL...")
- Use → for causality (because/therefore/thus)
- Use ; for contrast (however/but)
- Abbreviate: DB, auth, authz, config, fn, app, env, repo, dep, impl, req, res, msg, srv, conn, mgmt

## COMPARISON: SAME QUESTION, THREE LEVELS

Question: "How does useMemo work?"

**LITE** (~80 words):
> useMemo caches the result of a computation between renders. You pass a function and a dependency array. React only recomputes when dependencies change. Good for expensive calculations or stable references passed as props. Don't overuse — memoization has cost.

**FULL** (~40 words):
> useMemo caches result between renders. Pass fn + deps array. Recomputes only when deps change. Used for expensive calcs or stable prop refs. Don't overuse.
> ```js
> const val = useMemo(() => expensiveCalc(x), [x])
> ```

**ULTRA** (~20 words):
> useMemo caches value between renders. Recomputes only when deps change → prevents expensive recalcs. 
> ```js
> const v = useMemo(() => calc(x), [x])
> ```

**Notice: ultra is SHORTER than full. Not longer. Not more structured. Shorter.**

## WHAT NEVER GETS COMPRESSED

- Code blocks (keep working)
- Error messages (verbatim)
- Variable/fn names, file paths, URLs, versions
- Commit messages, security warnings

## REMINDERS

1. **Length discipline first, style second.** If ultra produces MORE content than full, you broke the rules.
2. **No drift** — don't revert to normal after several turns
3. **Don't announce compression** — just do it
4. **When in doubt, CUT**. Especially in ultra.

## DEACTIVATION

User types `/tiny off` → respond normally.
