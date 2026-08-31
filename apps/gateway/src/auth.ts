import type { BotId } from "@lorien-stack/contracts";

export type AuthConfig = {
  clientToken: string;
  allowlistedBotIds: ReadonlySet<string>;
};

export type AuthFailure = {
  ok: false;
  status: 401 | 403;
  error: string;
};

export type AuthSuccess = {
  ok: true;
  botId: BotId;
};

export type AuthResult = AuthSuccess | AuthFailure;

export function extractBearerToken(authorization: string | undefined): string | undefined {
  if (authorization === undefined) {
    return undefined;
  }
  const match = /^Bearer\s+(\S+)/i.exec(authorization.trim());
  if (match === null) {
    return undefined;
  }
  const token = match[1];
  return token === undefined || token.length === 0 ? undefined : token;
}

export function authorizePrompt(input: {
  token: string | undefined;
  botId: BotId;
  config: AuthConfig;
}): AuthResult {
  if (input.config.clientToken.length === 0 || input.token === undefined) {
    return { ok: false, status: 401, error: "unauthorized" };
  }
  if (input.token !== input.config.clientToken) {
    return { ok: false, status: 401, error: "unauthorized" };
  }
  if (!input.config.allowlistedBotIds.has(input.botId)) {
    return { ok: false, status: 403, error: "bot not allowlisted" };
  }
  return { ok: true, botId: input.botId };
}
