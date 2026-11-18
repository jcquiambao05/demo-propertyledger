import { test, expect } from "@playwright/test";

test("home page loads and shows title", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/E Property Ledger/);
  await expect(page.getByRole("heading", { name: "E Property Ledger" })).toBeVisible();
});
