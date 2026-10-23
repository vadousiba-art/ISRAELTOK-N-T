import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

const STATUS: Record<string, number> = {
  NOT_MEMBER: 401,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  RATE_LIMIT: 429,
  INVALID: 400,
  INVALID_INVITE: 400,
  USERNAME_TAKEN: 409,
  AI_UNAVAILABLE: 503,
  NOT_CONFIGURED: 503,
};

// Postgres functions raise 'CODE|Human message'. Map those (and raw driver
// errors) onto an AppError with a sensible HTTP status.
export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof ZodError) {
    return new AppError("INVALID", `Invalid input: ${err.issues[0]?.message ?? "nope"}`, 400);
  }
  const e = err as { message?: string; code?: string };
  const msg = e?.message ?? String(err);
  const m = msg.match(/([A-Z_]{3,30})\|([^\n]+)/);
  if (m) return new AppError(m[1], m[2].trim(), STATUS[m[1]] ?? 400);
  if (e?.code === "23514" || e?.code === "22P02" || e?.code === "23502" || e?.code === "22001")
    return new AppError("INVALID", "That input is cursed. The database rejected it.", 400);
  if (e?.code === "23505") return new AppError("INVALID", "That already exists.", 409);
  if (e?.code === "23503") return new AppError("NOT_FOUND", "That thing does not exist (anymore).", 404);
  if (e?.code === "42501" || /permission denied/i.test(msg))
    return new AppError("FORBIDDEN", "Access denied. The bouncer said no.", 403);
  console.error("[itn] unexpected error", err);
  return new AppError("INTERNAL", "Something exploded on our end. Probably a skill issue (ours).", 500);
}

export function errorResponse(err: unknown) {
  const e = toAppError(err);
  return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: e.status });
}

export async function handle<T>(fn: () => Promise<T>) {
  try {
    const data = await fn();
    return NextResponse.json({ data: data ?? null });
  } catch (err) {
    return errorResponse(err);
  }
}
