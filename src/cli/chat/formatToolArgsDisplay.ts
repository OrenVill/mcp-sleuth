/** Pretty-print tool args for the terminal approval card (plain text). */

function tryParseEmbeddedJson(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return value;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

/** Expand string fields that contain JSON (e.g. execute_tools.tools_json). */
export function normalizeToolArgsForDisplay(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === 'string') {
      out[key] = tryParseEmbeddedJson(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function summarizeBatchToolArgs(args: Record<string, unknown>): string | null {
  const raw = args.tools_json ?? args.tools;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) return `${parsed.length} nested tool call(s)`;
    } catch {
      return null;
    }
  }
  if (Array.isArray(raw)) return `${raw.length} nested tool call(s)`;
  return null;
}

export function wrapPlainLine(line: string, width: number): string[] {
  if (width < 8) return [line.slice(0, width)];
  if (line.length <= width) return [line];

  const out: string[] = [];
  let rest = line;
  while (rest.length > width) {
    let breakAt = rest.lastIndexOf(' ', width);
    if (breakAt < Math.floor(width * 0.4)) breakAt = width;
    out.push(rest.slice(0, breakAt));
    rest = rest.slice(breakAt).trimStart();
  }
  if (rest.length > 0) out.push(rest);
  return out;
}

export function formatToolArgsDisplayLines(
  args: Record<string, unknown>,
  options: { innerWidth: number; maxLines?: number },
): string[] {
  const { innerWidth, maxLines = 28 } = options;
  const summary = summarizeBatchToolArgs(args);
  const normalized = normalizeToolArgsForDisplay(args);
  const json = JSON.stringify(normalized, null, 2);
  const lines: string[] = [];
  if (summary) lines.push(summary);
  for (const line of json.split('\n')) {
    lines.push(...wrapPlainLine(line, innerWidth));
  }
  if (lines.length > maxLines) {
    const omitted = lines.length - maxLines + 1;
    return [...lines.slice(0, maxLines - 1), `… ${omitted} more lines`];
  }
  return lines;
}

export function boxRow(text: string, boxWidth: number): string {
  const inner = Math.max(1, boxWidth - 4);
  let body = text;
  if (body.length > inner) body = `${body.slice(0, inner - 1)}…`;
  return `│ ${body.padEnd(inner)} │`;
}
