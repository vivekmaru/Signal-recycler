type RuleLike = {
  id: string;
  rule: string;
  category: string;
};

type MessageInput = {
  type: "message";
  role: string;
  content: string | unknown[];
  [key: string]: unknown;
};

const PLAYBOOK_START = "<signal-recycler-playbook>";
const PLAYBOOK_END = "</signal-recycler-playbook>";

export function renderPlaybookBlock(rules: RuleLike[]): string {
  if (rules.length === 0) return "";

  const body = rules
    .map((rule, index) => `${index + 1}. [${rule.category}] ${rule.rule}`)
    .join("\n");

  return [
    PLAYBOOK_START,
    "Signal Recycler Playbook",
    "These approved project constraints were learned from previous Codex work. Follow them before taking action.",
    body,
    PLAYBOOK_END
  ].join("\n");
}

export function injectPlaybookRules<T>(input: T, rules: RuleLike[]): T {
  if (rules.length === 0) return input;

  if (typeof input === "string") {
    return injectIntoText(input, rules) as T;
  }

  if (Array.isArray(input)) {
    const block = renderPlaybookBlock(rules);
    const withoutExisting = input.filter((item) => {
      if (!isPlainObject(item)) return true;
      const msg = item as MessageInput;
      return !(
        msg.type === "message" &&
        msg.role === "system" &&
        typeof msg.content === "string" &&
        msg.content.includes(PLAYBOOK_START)
      );
    });
    return [{ type: "message", role: "system", content: block }, ...withoutExisting] as T;
  }

  return input;
}

export function injectIntoRequestBody(body: unknown, rules: RuleLike[]): unknown {
  if (!isPlainObject(body) || rules.length === 0) return body;

  const copy = { ...body };
  if ("input" in copy) {
    copy.input = injectPlaybookRules(copy.input, rules);
    return copy;
  }

  if (Array.isArray(copy.messages)) {
    copy.messages = injectIntoMessages(copy.messages, rules);
    return copy;
  }

  if (typeof copy.instructions === "string") {
    copy.instructions = injectIntoText(copy.instructions, rules);
    return copy;
  }

  copy.input = injectIntoText("", rules);
  return copy;
}

function injectIntoText(text: string, rules: RuleLike[]): string {
  const cleaned = stripPlaybookBlocks(text).trimStart();
  const block = renderPlaybookBlock(rules);
  return `${block}\n\n${cleaned}`.trim();
}

function injectIntoMessages(messages: unknown[], rules: RuleLike[]): unknown[] {
  const block = renderPlaybookBlock(rules);
  const withoutExisting = messages.filter((message) => {
    if (!isPlainObject(message)) return true;
    return typeof message.content !== "string" || !message.content.includes(PLAYBOOK_START);
  });

  return [{ role: "system", content: block }, ...withoutExisting];
}

export function stripPlaybookBlocks(text: string): string {
  let cleaned = text;
  while (true) {
    const start = cleaned.indexOf(PLAYBOOK_START);
    const end = cleaned.indexOf(PLAYBOOK_END);
    if (start === -1 || end === -1 || end < start) return cleaned;
    cleaned = `${cleaned.slice(0, start)}${cleaned.slice(end + PLAYBOOK_END.length)}`;
  }
}

export function countPlaybookBlocks(text: string): number {
  let count = 0;
  let cursor = text;
  while (true) {
    const start = cursor.indexOf(PLAYBOOK_START);
    const end = cursor.indexOf(PLAYBOOK_END);
    if (start === -1 || end === -1 || end < start) return count;
    count += 1;
    cursor = cursor.slice(end + PLAYBOOK_END.length);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
