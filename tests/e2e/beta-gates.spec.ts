import { expect, test } from "@playwright/test";

test("health endpoint reports the running service without caching", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  await expect(response.json()).resolves.toMatchObject({ status: "ok", service: "loopline-central" });
});

test("protected pages require a successful session", async ({ page }) => {
  await page.goto("/overview");
  await expect(page).toHaveURL(/\/login\?.*next=%2Foverview/);
  await expect(page.getByRole("heading", { name: "Sign in to your workspace" })).toBeVisible();
});

test("public signup is invitation-only", async ({ page }) => {
  await page.goto("/signup");
  await expect(page).toHaveURL(/\/login\?message=invitation-required/);
  await expect(page.getByText("Access is invitation-only", { exact: false }).first()).toBeVisible();
});

test("malformed private stream credentials are not disclosed", async ({ page }) => {
  const response = await page.goto("/stream/not-a-channel/not-a-key");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "This part of the network is not connected yet." })).toBeVisible();
});

test("security headers protect the browser surface", async ({ request }) => {
  const response = await request.get("/login");
  const headers = response.headers();
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("no-referrer");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
});

test("login remains usable on a phone-sized display", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(page.locator("input[name='password']")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});
