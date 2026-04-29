// Chars to keep at the start and end of a compressed item so context isn't completely lost.
const KEEP_HEAD = 400
const KEEP_TAIL = 400

// Minimum net characters saved to justify the compression overhead.
const MIN_SAVING = 200

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
 * We now keep both a head and tail window to ensure we don't lose the final
 * error message which is usually at the bottom of a stack trace.
 */
function isNoisyContent(text: string): boolean {
  const NOISE_PATTERNS = [
    /\berror\b/i,
    /\bfailed\b/i,
    /traceback \(most recent call last\)/i,
    /stack trace:/i,
    /\bnpm ERR!/i,
    /\bEACCES\b/,
    /\bENOENT\b/,
    /\bSyntaxError\b/,
    /\bTypeError\b/,
    /\bReferenceError\b/,
    /[1-9]\d* (errors?|failures?)/i,
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
  
  // Only compress if the output is long enough to have a head, tail, AND meaningful savings.
  if (output.length <= KEEP_HEAD + KEEP_TAIL + MIN_SAVING) return null
  if (!isNoisyContent(output)) return null

  const head = output.slice(0, KEEP_HEAD)
  const tail = output.slice(-KEEP_TAIL)
  const rawRemoved = output.length - (KEEP_HEAD + KEEP_TAIL)
  
  const marker = `\n… [Signal Recycler: compressed ${rawRemoved} chars of noise] …\n`
  const netRemoved = rawRemoved - marker.length

  // If the marker overhead eats up too much of the savings, skip it.
  if (netRemoved < MIN_SAVING) return null

  return {
    item: {
      ...item,
      output: `${head}${marker}${tail}`
    },
    charsRemoved: netRemoved
  }
}

export function compressHistory(items: unknown[]): CompressResult {
  let netCharsRemoved = 0
  let compressions = 0

  const compressed = items.map((item) => {
    const result = tryCompressItem(item)
    if (!result) return item
    netCharsRemoved += result.charsRemoved
    compressions++
    return result.item
  })

  return {
    items: compressed,
    charsRemoved: netCharsRemoved,
    // Use the net characters removed for a more accurate token estimate.
    tokensRemoved: Math.round(netCharsRemoved / 4),
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
