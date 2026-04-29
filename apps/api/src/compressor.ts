// Chars to keep at the start of a compressed item so context isn't completely lost.
const PREVIEW_CHARS = 400

// Output types from the Responses API that can carry large noisy payloads.
const COMPRESSIBLE_TYPES = new Set([
  "shell_call_output",
  "local_shell_call_output",
  "function_call_output"
])

export type CompressResult = {
  items: unknown[]
  charsRemoved: number
  tokensRemoved: number
  compressions: number
}

/**
 * Decide whether a piece of output text qualifies as noise worth compressing.
 *
 * Trade-offs to consider:
 *  - Too aggressive: risk losing context Codex needs to reason about the failure
 *  - Too conservative: large stack traces bloat the context and cost real tokens
 *  - Pattern-based is safer than length-only: only compress when there's a clear
 *    error signal, not just because the output is long
 *
 * The PREVIEW_CHARS at the top of the file controls how much you keep even
 * when the content IS noisy — tune that if you want a larger preview window.
 *
 * You have access to the full `text` string. Return true to compress, false to
 * leave untouched. The function is only called when text.length > PREVIEW_CHARS,
 * so you don't need to re-check length here.
 */
function isNoisyContent(text: string): boolean {
  const NOISE_PATTERNS = [
    /\berror:/i,
    /\bfailed\b/i,
    /traceback \(most recent call last\)/i,
    /stack trace:/i,
    /\bnpm ERR!/i,
    /\bEACCES\b/,
    /\bENOENT\b/,
    /\bSyntaxError\b/,
    /\bTypeError\b/,
    /\bReferenceError\b/,
    /\d+ (errors?|failures?)/i,
    /FAILED \d+/,
    /✗|✕|FAIL\b/
  ]
  return NOISE_PATTERNS.some((p) => p.test(text))
}

function tryCompressItem(item: unknown): { item: unknown; charsRemoved: number } | null {
  if (!isPlainObject(item)) return null
  if (!COMPRESSIBLE_TYPES.has(String(item["type"]))) return null

  const output = item["output"]
  if (typeof output !== "string") return null
  if (output.length <= PREVIEW_CHARS) return null
  if (!isNoisyContent(output)) return null

  const preview = output.slice(0, PREVIEW_CHARS)
  const charsRemoved = output.length - PREVIEW_CHARS
  return {
    item: {
      ...item,
      output: `${preview}\n… [Signal Recycler: compressed ${charsRemoved} chars of noise from this output]`
    },
    charsRemoved
  }
}

export function compressHistory(items: unknown[]): CompressResult {
  let charsRemoved = 0
  let compressions = 0

  const compressed = items.map((item) => {
    const result = tryCompressItem(item)
    if (!result) return item
    charsRemoved += result.charsRemoved
    compressions++
    return result.item
  })

  return {
    items: compressed,
    charsRemoved,
    tokensRemoved: Math.round(charsRemoved / 4),
    compressions
  }
}

export function compressRequestBody(body: unknown): { body: unknown; result: CompressResult | null } {
  if (!isPlainObject(body)) return { body, result: null }
  if (!Array.isArray(body["input"])) return { body, result: null }

  const result = compressHistory(body["input"] as unknown[])
  if (result.charsRemoved === 0) return { body, result: null }

  return { body: { ...body, input: result.items }, result }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
