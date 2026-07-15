import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import type { AppEnv } from "./env.js";

export function createPrisma(env: AppEnv): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: env.DATABASE_URL,
    connectionTimeoutMillis: 30_000,
    max: 1,
    ssl: { rejectUnauthorized: false },
  });
  return new PrismaClient({ adapter });
}
