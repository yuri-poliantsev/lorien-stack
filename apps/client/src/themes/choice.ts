export const THEME_STORAGE_KEY = "lorien.theme";

export type ThemeChoiceSource = "query" | "storage" | "default";

export type ThemeChoice = {
  id: string;
  source: ThemeChoiceSource;
};

export function resolveThemeId(input: {
  search: string;
  stored: string | null;
  ids: readonly string[];
}): ThemeChoice {
  const fallback = input.ids[0];
  if (fallback === undefined) {
    throw new Error("ThemeRegistry has no entries");
  }
  const query = queryThemeId(input.search);
  if (query !== undefined && input.ids.includes(query)) {
    return { id: query, source: "query" };
  }
  if (input.stored !== null && input.ids.includes(input.stored)) {
    return { id: input.stored, source: "storage" };
  }
  return { id: fallback, source: "default" };
}

export function nextThemeId(current: string, ids: readonly string[]): string {
  const fallback = ids[0];
  if (fallback === undefined) {
    throw new Error("ThemeRegistry has no entries");
  }
  const index = ids.indexOf(current);
  if (index < 0) {
    return fallback;
  }
  return ids[(index + 1) % ids.length] ?? fallback;
}

export function persistThemeId(
  id: string,
  location: Pick<Location, "href">,
  history: Pick<History, "replaceState" | "state">,
  storage: Pick<Storage, "setItem">,
): void {
  const url = new URL(location.href);
  url.searchParams.set("theme", id);
  history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
  storage.setItem(THEME_STORAGE_KEY, id);
}

export function readStoredThemeId(storage: Pick<Storage, "getItem">): string | null {
  try {
    return storage.getItem(THEME_STORAGE_KEY);
  } catch {
    return null;
  }
}

function queryThemeId(search: string): string | undefined {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const value = new URLSearchParams(raw).get("theme");
  if (value === null || value.length === 0) {
    return undefined;
  }
  return value;
}
