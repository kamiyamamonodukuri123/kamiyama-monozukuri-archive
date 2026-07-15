import type { PrismaClient, User } from "../generated/prisma/client.js";
import type { AppEnv } from "./env.js";

export type AppBindings = {
  Bindings: AppEnv;
  Variables: {
    prisma: PrismaClient;
  };
};

export type AuthenticatedUser = User;

export class ApiError extends Error {
  constructor(
    public readonly status: 400 | 401 | 403 | 404 | 409 | 413 | 500 | 503,
    message: string,
  ) {
    super(message);
  }
}

export function requireConfigured(value: string, name: string): string {
  if (!value || value.startsWith("REPLACE_")) {
    throw new ApiError(503, `${name}が設定されていません。`);
  }
  return value;
}
