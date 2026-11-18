import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Apply migrations to the *_test database before any test file runs.
export default function setup() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  execSync("npx prisma migrate deploy --schema packages/db/prisma/schema.prisma", {
    cwd: root,
    env: process.env,
    stdio: ["ignore", "ignore", "inherit"],
  });
}
