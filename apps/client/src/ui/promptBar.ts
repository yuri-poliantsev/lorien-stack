import type { BotId } from "@bot-space/contracts";

import { isPromptEnabled } from "../store.ts";

export type WakeStatus =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "acknowledged" }
  | { kind: "failed"; detail: string }
  | { kind: "indeterminate" };

export type PromptBarModel = {
  selectedBotId: BotId | undefined;
  status: WakeStatus;
};

export type PromptBarHandle = {
  update: (model: PromptBarModel) => void;
  clearInput: () => void;
};

export { isPromptEnabled };

function statusLabel(status: WakeStatus): string {
  switch (status.kind) {
    case "idle":
      return "";
    case "sending":
      return "sending";
    case "acknowledged":
      return "acknowledged";
    case "failed":
      return `failed ${status.detail}`;
    case "indeterminate":
      return "indeterminate";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function mountPromptBar(
  root: HTMLElement,
  input: {
    token: string;
    promptUrl: string;
    selectedBotId: () => BotId | undefined;
    onStatus: (status: WakeStatus) => void;
  },
): PromptBarHandle {
  root.dataset.testid = "prompt-bar";
  const form = document.createElement("form");
  form.className = "prompt-form";
  const field = document.createElement("input");
  field.type = "text";
  field.name = "prompt";
  field.autocomplete = "off";
  field.placeholder = "Wake a selected bot";
  field.dataset.testid = "prompt-input";
  const send = document.createElement("button");
  send.type = "submit";
  send.textContent = "Wake";
  send.dataset.testid = "prompt-send";
  const statusEl = document.createElement("span");
  statusEl.className = "wake-status";
  statusEl.dataset.testid = "wake-status";
  form.append(field, send, statusEl);
  root.replaceChildren(form);

  function syncEnabled(selectedBotId: BotId | undefined): void {
    const enabled = isPromptEnabled(selectedBotId);
    field.disabled = !enabled;
    send.disabled = !enabled;
    form.dataset.enabled = enabled ? "true" : "false";
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const botId = input.selectedBotId();
    if (!isPromptEnabled(botId) || botId === undefined) {
      return;
    }
    const prompt = field.value.trim();
    if (prompt.length === 0) {
      return;
    }
    field.value = "";
    input.onStatus({ kind: "sending" });
    void (async () => {
      try {
        const res = await fetch(input.promptUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${input.token}`,
          },
          body: JSON.stringify({ botId, prompt }),
        });
        let body: unknown;
        try {
          body = (await res.json()) as unknown;
        } catch {
          body = undefined;
        }
        const outcome =
          typeof body === "object" &&
          body !== null &&
          "outcome" in body &&
          typeof body.outcome === "string"
            ? body.outcome
            : undefined;
        if (outcome === "acknowledged") {
          input.onStatus({ kind: "acknowledged" });
          return;
        }
        if (outcome === "indeterminate") {
          input.onStatus({ kind: "indeterminate" });
          return;
        }
        input.onStatus({ kind: "failed", detail: String(res.status) });
      } catch {
        input.onStatus({ kind: "failed", detail: "network" });
      }
    })();
  });

  syncEnabled(undefined);

  return {
    update(model) {
      syncEnabled(model.selectedBotId);
      statusEl.textContent = statusLabel(model.status);
      statusEl.dataset.kind = model.status.kind;
    },
    clearInput() {
      field.value = "";
    },
  };
}
