import { defineConfig } from "vitest/config";

// Tests run against a separate *_test database (compose credentials), never the dev DB,
// and never read .env. CI provides DATABASE_URL for its own epl_test service.
const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  (process.env.CI ? process.env.DATABASE_URL : undefined) ??
  "postgresql://postgres:postgres@127.0.0.1:5432/epl_test";

if (!/\/[^/?]+_test(\?|$)/.test(databaseUrl ?? "")) {
  throw new Error("Refusing to run tests: database name must end with _test");
}

const testEnv = {
  DATABASE_URL: databaseUrl as string,
  REDIS_URL: process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:6379/15",
  NEXTAUTH_SECRET: "test-only-nextauth-secret-not-for-production",
  MFA_ENCRYPTION_KEY: "0".repeat(64),
  UPLOAD_DIR: "/tmp/epl-test-uploads",
  NODE_ENV: "test",
};
// globalSetup runs in this process, so it needs the same values.
Object.assign(process.env, testEnv);

export default defineConfig({
  test: {
    globalSetup: ["./src/test/global-setup.ts"],
    fileParallelism: false,
    env: testEnv,
  },
});
