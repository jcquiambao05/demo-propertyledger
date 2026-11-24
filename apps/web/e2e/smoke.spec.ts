import { test, expect } from "@playwright/test";

test("home redirects to sign-in and shows Eagle Property Ledger branding", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Eagle Property Ledger/);
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
});
