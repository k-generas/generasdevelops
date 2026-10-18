// WARNING: never run `drizzle-kit push` against the Lovable Cloud database.
// drizzle/schema.ts is intentionally blank, so push would try to drop every
// table. Apply SQL from drizzle/migrations (and supabase/migrations) instead.
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./drizzle/schema.ts",
  out: "./drizzle/migrations",
  dbCredentials: {
    url: process.env.LOVABLE_DB_MIGRATION_URL ?? "",
  },
});
