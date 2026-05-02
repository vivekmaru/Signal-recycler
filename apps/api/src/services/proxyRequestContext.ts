import { countPlaybookBlocks, stripPlaybookBlocks } from "../playbook.js";

export type ProxyRequestContext = {
  internalSignalRecyclerRequest: boolean;
  query: string;
  querySource: "user_input" | "instructions" | "none";
  strippedPlaybookBlocks: number;
};

export function analyzeProxyRequestContext(body: unknown): ProxyRequestContext {
  const parsed = parseStringBody(body);
  const internalSignalRecyclerRequest = isSignalRecyclerInternalRequest(parsed);
  const strippedPlaybookBlocks = countPlaybookBlocks(extractRawText(parsed));

  const userQuery = extractUserTextFromRequest(parsed);
  if (userQuery.length > 0) {
    return {
      internalSignalRecyclerRequest,
      query: userQuery,
      querySource: "user_input",
      strippedPlaybookBlocks
    };
  }

  const instructionQuery = extractInstructionsText(parsed);
  if (instructionQuery.length > 0) {
    return {
      internalSignalRecyclerRequest,
      query: instructionQuery,
      querySource: "instructions",
      strippedPlaybookBlocks
    };
  }

  return {
    internalSignalRecyclerRequest,
    query: "",
    querySource: "none",
    strippedPlaybookBlocks
  };
}

export function isSignalRecyclerInternalRequest(body: unknown): boolean {
  const parsed = parseStringBody(body);
  if (!isPlainObject(parsed)) return false;

  if (hasSignalRecyclerClassifierSchema(parsed)) return true;
  return hasClassifierPromptMarker(parsed.input) || hasClassifierPromptMarker(parsed.messages);
}

function hasSignalRecyclerClassifierSchema(body: Record<string, unknown>): boolean {
  const textFormat = body.text;
  if (!isPlainObject(textFormat)) return false;
  const format = textFormat.format;
  if (!isPlainObject(format)) return false;
  return format.name === "signal_recycler_classifier";
}

function hasClassifierPromptMarker(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasClassifierPromptMarker);
  if (!isPlainObject(value)) return false;

  const role = typeof value.role === "string" ? value.role.toLowerCase() : null;
  if (role !== "system" && role !== "developer") return false;

  const text = [extractPlainText(value.text), extractPlainText(value.content)]
    .filter((part) => part.length > 0)
    .join("\n");
  return text.includes("Classify this Codex turn for Signal Recycler.");
}

function extractUserTextFromRequest(body: unknown): string {
  if (!isPlainObject(body)) return "";
  return [extractUserText(body.input), extractUserText(body.messages)]
    .filter((part) => part.length > 0)
    .join("\n\n");
}

function extractInstructionsText(body: unknown): string {
  if (!isPlainObject(body)) return "";
  return extractPlainText(body.instructions);
}

function extractUserText(value: unknown): string {
  if (typeof value === "string") return cleanRetrievalText(value);
  if (Array.isArray(value)) {
    return value.map(extractUserText).filter((part) => part.length > 0).join("\n");
  }
  if (!isPlainObject(value)) return "";

  const role = typeof value.role === "string" ? value.role.toLowerCase() : null;
  if (role && role !== "user") return "";

  const text = extractUserText(value.text);
  const content = extractUserText(value.content);
  return [text, content].filter((part) => part.length > 0).join("\n");
}

function extractPlainText(value: unknown): string {
  if (typeof value === "string") return cleanRetrievalText(value);
  if (Array.isArray(value)) {
    return value.map(extractPlainText).filter((part) => part.length > 0).join("\n");
  }
  if (!isPlainObject(value)) return "";

  const parts = [
    extractPlainText(value.instructions),
    extractPlainText(value.input),
    extractPlainText(value.messages),
    extractPlainText(value.text),
    extractPlainText(value.content)
  ];
  return parts.filter((part) => part.length > 0).join("\n");
}

function extractRawText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map(extractRawText).filter((part) => part.length > 0).join("\n");
  }
  if (!isPlainObject(value)) return "";

  const parts = [
    extractRawText(value.instructions),
    extractRawText(value.input),
    extractRawText(value.messages),
    extractRawText(value.text),
    extractRawText(value.content)
  ];
  return parts.filter((part) => part.length > 0).join("\n");
}

function cleanRetrievalText(value: string): string {
  return stripPlaybookBlocks(value).trim();
}

function parseStringBody(body: unknown): unknown {
  if (typeof body !== "string") return body;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return body;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
