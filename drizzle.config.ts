import { defineConfig } from "drizzle-kit";

const runtimeDir = process.env.BUI_RUNTIME_DIR || `${process.env.HOME || process.cwd()}/.config/opencode/bui`;
const dbPath = process.env.BUI_DB_PATH || `${runtimeDir}/opencode-bui.db`;

export default defineConfig({
  out: "./drizzle",
  schema: "./packages/opencode-bui-bridge/src/infra/db/db.schema.ts",
  dialect: "sqlite",
  dbCredentials: {
    url: `file:${dbPath}`,
  },
});
