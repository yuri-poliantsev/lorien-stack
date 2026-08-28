import {
  parseWakeRequest,
  type WakeRequest,
} from "@bot-space/contracts";

export const WAKE_TIMEOUT_MS = 8000;

export type WakeOutcome =
  | { kind: "acknowledged"; status: number }
  | { kind: "failed"; status: number }
  | { kind: "indeterminate"; reason: "timeout" | "network" };

export type RequestWakeInput = {
  webhookUrl: string;
  senderKey: string;
  request: WakeRequest;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

export async function requestWake(input: RequestWakeInput): Promise<WakeOutcome> {
  const timeoutMs = input.timeoutMs ?? WAKE_TIMEOUT_MS;
  const fetchImpl = input.fetchImpl ?? fetch;
  const payload = parseWakeRequest(input.request);
  if (!payload.ok) {
    return { kind: "failed", status: 400 };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    const response = await fetchImpl(input.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.senderKey}`,
        "X-Automation-Key": input.senderKey,
      },
      body: JSON.stringify({
        schemaVersion: payload.value.schemaVersion,
        botId: payload.value.botId,
        prompt: payload.value.prompt,
      }),
      signal: controller.signal,
    });
    if (response.status === 200) {
      return { kind: "acknowledged", status: 200 };
    }
    return { kind: "failed", status: response.status };
  } catch (error) {
    if (isTimeout(error)) {
      return { kind: "indeterminate", reason: "timeout" };
    }
    return { kind: "indeterminate", reason: "network" };
  } finally {
    clearTimeout(timer);
  }
}

function isTimeout(error: unknown): boolean {
  if (error instanceof Error && error.name === "AbortError") {
    return true;
  }
  if (error instanceof Error && error.name === "TimeoutError") {
    return true;
  }
  return false;
}
