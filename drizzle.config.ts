import { defineConfig } from "drizzle-kit";

if (!process.env.ACADEMY_DATABASE_URL) {
  throw new Error("ACADEMY_DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.ACADEMY_DATABASE_URL,
  },
});
