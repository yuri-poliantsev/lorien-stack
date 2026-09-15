import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  THEME_STORAGE_KEY,
  nextThemeId,
  persistThemeId,
  resolveThemeId,
} from "./choice.ts";

const ids = ["starcraft", "forest"] as const;

describe("resolveThemeId", () => {
  it("prefers a registered query param", () => {
    assert.deepEqual(
      resolveThemeId({ search: "?theme=forest", stored: "starcraft", ids }),
      { id: "forest", source: "query" },
    );
  });

  it("uses localStorage when the query is missing or unknown", () => {
    assert.deepEqual(
      resolveThemeId({ search: "", stored: "forest", ids }),
      { id: "forest", source: "storage" },
    );
    assert.deepEqual(
      resolveThemeId({ search: "?theme=nope", stored: "forest", ids }),
      { id: "forest", source: "storage" },
    );
  });

  it("falls back to the first registered theme", () => {
    assert.deepEqual(
      resolveThemeId({ search: "", stored: null, ids }),
      { id: "starcraft", source: "default" },
    );
    assert.deepEqual(
      resolveThemeId({ search: "?theme=nope", stored: "ghost", ids }),
      { id: "starcraft", source: "default" },
    );
  });
});

describe("nextThemeId", () => {
  it("cycles in registry order", () => {
    assert.equal(nextThemeId("starcraft", ids), "forest");
    assert.equal(nextThemeId("forest", ids), "starcraft");
    assert.equal(nextThemeId("ghost", ids), "starcraft");
  });
});

describe("persistThemeId", () => {
  it("writes the id to the URL and localStorage", () => {
    const calls: { url: string; stored: string } = { url: "", stored: "" };
    persistThemeId(
      "starcraft",
      { href: "http://localhost:5182/" },
      {
        state: null,
        replaceState(_state, _title, url) {
          calls.url = String(url);
        },
      },
      {
        setItem(key, value) {
          assert.equal(key, THEME_STORAGE_KEY);
          calls.stored = value;
        },
      },
    );
    assert.equal(calls.url, "/?theme=starcraft");
    assert.equal(calls.stored, "starcraft");
  });
});
