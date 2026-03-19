import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, "..", ".env");

let parsedEnv = {};

try {
  if (fs.existsSync(envPath)) {
    parsedEnv = dotenv.parse(fs.readFileSync(envPath));
  }
} catch (error) {
  console.error("[envService] failed to parse backend/.env", error);
}

export function getEnvValue(key, fallback = "") {
  const runtimeValue = process.env[key];
  if (runtimeValue !== undefined && runtimeValue !== "") {
    return runtimeValue;
  }

  const fileValue = parsedEnv[key];
  if (fileValue !== undefined && fileValue !== "") {
    return fileValue;
  }

  return fallback;
}

export function getBooleanEnv(key, fallback = false) {
  const value = String(getEnvValue(key, "")).trim().toLowerCase();
  if (!value) {
    return fallback;
  }

  if (["1", "true", "yes", "on"].includes(value)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(value)) {
    return false;
  }

  return fallback;
}
