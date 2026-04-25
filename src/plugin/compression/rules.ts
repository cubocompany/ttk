import type { CompressionLevel } from "../types/index.js"

// ─── Pattern lists ────────────────────────────────────────────────────────────

const FILLER_EN = [
  /\bjust\b/gi, /\breally\b/gi, /\bbasically\b/gi, /\bactually\b/gi,
  /\bsimply\b/gi, /\bvery\b/gi, /\bquite\b/gi, /\brather\b/gi,
  /\bpretty much\b/gi,
]

const HEDGING_EN = [
  /\bI think\b/gi, /\bI believe\b/gi, /\bI guess\b/gi,
  /\bit seems like\b/gi, /\bit appears that\b/gi,
  /\bmaybe\b/gi, /\bperhaps\b/gi,
]

const PLEASANTRIES_EN = [
  /\bsure\b/gi, /\bcertainly\b/gi, /\bof course\b/gi,
  /\bhappy to\b/gi, /\bglad to\b/gi, /\bno problem\b/gi,
  /\bplease\b/gi, /\bCould you please\b/gi, /\bWould you mind\b/gi,
  /\bI would appreciate if\b/gi, /\bI was wondering if\b/gi,
]

const VERBOSE_EN: Array<[RegExp, string]> = [
  [/\bin order to\b/gi, "to"],
  [/\ba lot of\b/gi, "many"],
  [/\bdue to the fact that\b/gi, "because"],
  [/\bat this point in time\b/gi, "now"],
  [/\bin the event that\b/gi, "if"],
  [/\bfor the purpose of\b/gi, "for"],
]

const FILLER_PT = [
  /\bapenas\b/gi, /\bbasicamente\b/gi, /\brealmente\b/gi,
  /\bsimplesmente\b/gi, /\bmuito\b/gi, /\bbastante\b/gi,
]

const HEDGING_PT = [
  /\beu acho que\b/gi, /\beu acredito que\b/gi, /\bparece que\b/gi,
  /\btalvez\b/gi, /\bquem sabe\b/gi,
]

const PLEASANTRIES_PT = [
  /\bclaro\b/gi, /\bcertamente\b/gi, /\bcom prazer\b/gi,
  /\bsem problema\b/gi, /\bpor favor\b/gi,
  /\bvocê poderia\b/gi, /\bseria possível\b/gi,
]

const ARTICLES_EN = [/\ba\b/gi, /\ban\b/gi, /\bthe\b/gi]
const ARTICLES_PT = [/\bo\b/gi, /\bos\b/gi, /\bas\b/gi, /\bum\b/gi, /\buma\b/gi, /\buns\b/gi, /\bumas\b/gi]

const ABBREV_FULL: Array<[RegExp, string]> = [
  [/\bimplementation\b/gi, "impl"], [/\bimplement\b/gi, "impl"],
  [/\bconfiguration\b/gi, "config"], [/\bconfigure\b/gi, "config"],
  [/\bdatabase\b/gi, "DB"],
  [/\bfunction\b/gi, "fn"],
  [/\bapplication\b/gi, "app"],
  [/\benvironment\b/gi, "env"],
  [/\brepository\b/gi, "repo"],
  [/\bdirectory\b/gi, "dir"],
  [/\bdependencies\b/gi, "deps"], [/\bdependency\b/gi, "dep"],
  [/\bauthentication\b/gi, "auth"],
  [/\bauthorization\b/gi, "authz"],
]

const ABBREV_ULTRA: Array<[RegExp, string]> = [
  [/\brequest\b/gi, "req"],
  [/\bresponse\b/gi, "res"],
  [/\bmessage\b/gi, "msg"],
  [/\bserver\b/gi, "srv"],
  [/\bconnection\b/gi, "conn"],
  [/\bmanagement\b/gi, "mgmt"],
  [/\bdevelopment\b/gi, "dev"],
  [/\bproduction\b/gi, "prod"],
  [/\binformation\b/gi, "info"],
  [/\bparameters?\b/gi, "params"],
  [/\bspecification\b/gi, "spec"],
  [/\bdocumentation\b/gi, "docs"],
]

const CAUSALITY_ULTRA: Array<[RegExp, string]> = [
  [/\bbecause\b/gi, "→"], [/\bsince\b/gi, "→"],
  [/\bas a result\b/gi, "→"], [/\btherefore\b/gi, "→"],
  [/\bthus\b/gi, "→"], [/\bhence\b/gi, "→"],
  [/\band then\b/gi, "→"], [/\bafter that\b/gi, "→"],
  [/\bsubsequently\b/gi, "→"],
  [/\bhowever\b/gi, ";"], [/\bbut\b/gi, ";"], [/\balthough\b/gi, ";"],
]

// ─── Helper functions ─────────────────────────────────────────────────────────

function removePatterns(text: string, patterns: RegExp[]): string {
  return patterns.reduce((t, p) => t.replace(p, ""), text)
}

function replacePatterns(text: string, pairs: Array<[RegExp, string]>): string {
  return pairs.reduce((t, [p, r]) => t.replace(p, r), text)
}

function cleanWhitespace(text: string): string {
  return text
    .replace(/  +/g, " ")
    .replace(/ +\./g, ".")
    .replace(/ +,/g, ",")
    .trim()
}

// ─── Main compressor ──────────────────────────────────────────────────────────

export function compressLocal(text: string, level: CompressionLevel): string {
  let result = text

  // All levels: remove filler, hedging, pleasantries (EN + PT)
  result = removePatterns(result, FILLER_EN)
  result = removePatterns(result, HEDGING_EN)
  result = removePatterns(result, PLEASANTRIES_EN)
  result = replacePatterns(result, VERBOSE_EN)
  result = removePatterns(result, FILLER_PT)
  result = removePatterns(result, HEDGING_PT)
  result = removePatterns(result, PLEASANTRIES_PT)

  if (level === "full" || level === "ultra") {
    result = removePatterns(result, ARTICLES_EN)
    result = removePatterns(result, ARTICLES_PT)
    result = replacePatterns(result, ABBREV_FULL)
  }

  if (level === "ultra") {
    result = replacePatterns(result, ABBREV_ULTRA)
    result = replacePatterns(result, CAUSALITY_ULTRA)
  }

  return cleanWhitespace(result)
}
