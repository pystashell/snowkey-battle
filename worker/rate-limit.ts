export type TokenBucket = { tokens: number; updatedAt: number };
type Budget = { burst: number; perSecond: number };

export const ADMISSION_BUDGETS = {
  create: { burst: 8, perSecond: 6 / 60 },
  join: { burst: 30, perSecond: 30 / 60 },
} satisfies Record<string, Budget>;
export const COMMAND_BUDGET = { burst: 80, perSecond: 30 };

export function consumeToken(previous: TokenBucket | undefined, budget: Budget, now: number) {
  const updatedAt = Math.max(now, previous?.updatedAt ?? now);
  const tokens = Math.min(budget.burst,
    (previous?.tokens ?? budget.burst) + Math.max(0, now - (previous?.updatedAt ?? now)) * budget.perSecond / 1000);
  const allowed = tokens >= 1;
  return {
    allowed,
    bucket: { tokens: allowed ? tokens - 1 : tokens, updatedAt },
    retryAfter: allowed ? 0 : Math.max(1, Math.ceil((1 - tokens) / budget.perSecond)),
  };
}

export async function checkAdmission(request: Request, env: Env, kind: keyof typeof ADMISSION_BUDGETS) {
  // CF-Connecting-IP is supplied by Cloudflare, unlike user-controlled forwarding headers.
  // Keep only an opaque digest in DO names and no raw IP in stored budgets.
  const address = request.headers.get("CF-Connecting-IP") ?? "local-development";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(address));
  const key = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return env.GAME_ROOMS.getByName(`admission:${kind}:${key}`).fetch(
    new Request(`https://room.internal/internal/admission/${kind}`, { method: "POST" }),
  );
}
