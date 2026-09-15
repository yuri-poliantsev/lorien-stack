import type { ActivityEvent } from "@lorien-stack/contracts";

export type Action =
  | "reading"
  | "writing"
  | "shell"
  | "talking"
  | "thinking"
  | "unknown";

const TOOL_ACTIONS: Record<string, Action> = {
  read_file: "reading",
  read: "reading",
  grep: "reading",
  glob: "reading",
  list_dir: "reading",
  glob_file_search: "reading",
  codebase_search: "reading",
  semanticsearch: "reading",
  search_codebase: "reading",
  web_search: "reading",
  websearch: "reading",
  webfetch: "reading",
  browser_navigate: "reading",
  browser_snapshot: "reading",
  readlints: "reading",
  read_lints: "reading",
  edit_file: "writing",
  write: "writing",
  strreplace: "writing",
  search_replace: "writing",
  applypatch: "writing",
  apply_patch: "writing",
  editnotebook: "writing",
  edit_notebook: "writing",
  delete: "writing",
  delete_file: "writing",
  shell: "shell",
  run_terminal_cmd: "shell",
  bash: "shell",
  bashtool: "shell",
};

const PATH_KEYS = ["path", "target_file", "file_path", "filePath", "file"] as const;

const PATH_TOKEN =
  /(?:~\/|\/)?(?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+(?:\.[A-Za-z0-9]+)?/;

export function actionFromEvent(event: ActivityEvent): Action {
  if (event.role === "tool") {
    return TOOL_ACTIONS[event.toolName.toLowerCase()] ?? "unknown";
  }
  if (event.role === "assistant") {
    return "talking";
  }
  if (event.role === "user") {
    return "thinking";
  }
  return "unknown";
}

export function pathFromToolEvent(event: ActivityEvent): string | undefined {
  if (event.role !== "tool") {
    return undefined;
  }
  const text = event.text;
  if (text.length === 0) {
    return undefined;
  }
  return pathFromJsonText(text) ?? firstPathToken(text);
}

export function nametagFromBotName(name: string): string {
  return name.normalize("NFKC");
}

function pathFromJsonText(text: string): string | undefined {
  try {
    return pathFromUnknown(JSON.parse(text) as unknown);
  } catch {
    return undefined;
  }
}

function pathFromUnknown(value: unknown): string | undefined {
  if (typeof value === "string") {
    return firstPathToken(value);
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  for (const key of PATH_KEYS) {
    const item = record[key];
    if (typeof item === "string" && item.length > 0) {
      return item;
    }
  }
  return undefined;
}

function firstPathToken(text: string): string | undefined {
  const match = PATH_TOKEN.exec(text);
  if (match === null || match[0].includes("://")) {
    return undefined;
  }
  return match[0];
}
