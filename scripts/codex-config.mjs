#!/usr/bin/env node
/**
 * Manage the Signal Recycler entry in ~/.codex/config.toml.
 *
 * Usage:
 *   node scripts/codex-config.mjs install   # add the [model_providers.signal_recycler] block
 *   node scripts/codex-config.mjs uninstall # remove it
 *
 * Both operations are idempotent and a backup of the original file is written
 * to ~/.codex/config.toml.bak.signal-recycler the first time we modify it.
 */

import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const CONFIG_PATH = path.join(os.homedir(), ".codex", "config.toml")
const BACKUP_PATH = `${CONFIG_PATH}.bak.signal-recycler`
const MARK_BEGIN = "# >>> signal-recycler (managed) >>>"
const MARK_END = "# <<< signal-recycler (managed) <<<"

const BLOCK = [
  MARK_BEGIN,
  "[model_providers.signal_recycler]",
  'name = "Signal Recycler"',
  'base_url = "http://127.0.0.1:3001/proxy/v1"',
  'env_key = "OPENAI_API_KEY"',
  'wire_api = "responses"',
  MARK_END
].join("\n")

const command = process.argv[2]
if (command !== "install" && command !== "uninstall") {
  console.error("Usage: codex-config.mjs <install|uninstall>")
  process.exit(1)
}

if (!fs.existsSync(path.dirname(CONFIG_PATH))) {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true })
}

const original = fs.existsSync(CONFIG_PATH) ? fs.readFileSync(CONFIG_PATH, "utf8") : ""

if (original && !fs.existsSync(BACKUP_PATH)) {
  fs.writeFileSync(BACKUP_PATH, original)
  console.log(`📦 Backup written: ${BACKUP_PATH}`)
}

const cleaned = stripManagedBlock(original)

if (command === "install") {
  const next = cleaned.length > 0 && !cleaned.endsWith("\n") ? `${cleaned}\n\n${BLOCK}\n` : `${cleaned}${cleaned ? "\n" : ""}${BLOCK}\n`
  fs.writeFileSync(CONFIG_PATH, next)
  console.log("✓ Added [model_providers.signal_recycler] to ~/.codex/config.toml")
  console.log("")
  console.log("Run codex through the proxy with:")
  console.log("  codex -c model_provider='\"signal_recycler\"' \"your prompt...\"")
  console.log("")
  console.log("Or set it as the default by adding this line near the top of ~/.codex/config.toml:")
  console.log('  model_provider = "signal_recycler"')
} else {
  fs.writeFileSync(CONFIG_PATH, cleaned)
  console.log("✓ Removed Signal Recycler block from ~/.codex/config.toml")
  if (fs.existsSync(BACKUP_PATH)) {
    console.log(`  Backup of pre-install state still available at ${BACKUP_PATH}`)
  }
}

function stripManagedBlock(text) {
  if (!text) return ""
  const startIdx = text.indexOf(MARK_BEGIN)
  if (startIdx === -1) return text
  const endMarkerIdx = text.indexOf(MARK_END, startIdx)
  if (endMarkerIdx === -1) return text // malformed, leave alone
  const endIdx = endMarkerIdx + MARK_END.length
  const before = text.slice(0, startIdx).replace(/\n+$/, "")
  const after = text.slice(endIdx).replace(/^\n+/, "")
  if (!before) return after
  if (!after) return `${before}\n`
  return `${before}\n\n${after}`
}
