import type { CompressionStats } from "../types/index.js"

export function computeStats(original: string, compressed: string): CompressionStats {
  const originalWords = original.split(/\s+/).filter(Boolean).length
  const compressedWords = compressed.split(/\s+/).filter(Boolean).length
  const originalChars = original.length
  const compressedChars = compressed.length

  return {
    originalWords,
    compressedWords,
    originalChars,
    compressedChars,
    wordReductionPct: Math.round((1 - compressedWords / Math.max(originalWords, 1)) * 100 * 10) / 10,
    charReductionPct: Math.round((1 - compressedChars / Math.max(originalChars, 1)) * 100 * 10) / 10,
  }
}
