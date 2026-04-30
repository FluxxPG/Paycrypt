import { config } from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const loadEnvFile = (envPath, override) => {
  if (existsSync(envPath)) {
    config({ path: envPath, override });
  }
};

export const loadRepoEnv = () => {
  loadEnvFile(path.join(repoRoot, ".env"), false);
  loadEnvFile(path.join(process.cwd(), ".env"), false);
  loadEnvFile(path.join(repoRoot, ".env.local"), true);
  loadEnvFile(path.join(process.cwd(), ".env.local"), true);
};
