import "dotenv/config";
import { defineConfig } from "prisma/config";

const configuredUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!configuredUrl) throw new Error("DIRECT_URL or DATABASE_URL must be configured.");

const directUrl = new URL(configuredUrl);
directUrl.searchParams.set("sslmode", "require");
directUrl.searchParams.set("uselibpqcompat", "true");
directUrl.searchParams.set("connect_timeout", "30");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: directUrl.toString(),
  },
});
