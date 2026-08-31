import type { ActivityEvent } from "@lorien-stack/contracts";

export const MAX_SNIPPET_CHARS = 64;
export const MAX_ABS_PATH_CHARS = 40;

const HOST_PATH_RE =
  /(?:\/(?:home|opt|usr|var|tmp|Users|root|workspace)\/[^\s"'<>]+)|(?:[A-Za-z]:\\[^\s"'<>]+)/g;

export function redactLongAbsolutePaths(text: string): string {
  return text.replace(HOST_PATH_RE, (match) => {
    if (match.length <= MAX_ABS_PATH_CHARS) {
      return match;
    }
    const parts = match.split(/[/\\]/).filter((part) => part.length > 0);
    const base = parts.at(-1);
    if (base === undefined) {
      return "[path]";
    }
    return `[${base}]`;
  });
}

export function clipSnippet(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= MAX_SNIPPET_CHARS) {
    return compact;
  }
  return `${compact.slice(0, MAX_SNIPPET_CHARS - 1)}…`;
}

export function absoluteHostPaths(text: string): string[] {
  return text.match(HOST_PATH_RE) ?? [];
}

export type ActivityRow = {
  id: string;
  role: ActivityEvent["role"];
  toolName: string | undefined;
  snippet: string;
};

export function summarizeEvent(event: ActivityEvent): ActivityRow {
  const cleaned = redactLongAbsolutePaths(event.text);
  const snippet = clipSnippet(cleaned);
  if (event.role === "tool") {
    return {
      id: event.id,
      role: "tool",
      toolName: event.toolName,
      snippet,
    };
  }
  return {
    id: event.id,
    role: event.role,
    toolName: undefined,
    snippet,
  };
}
