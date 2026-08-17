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

test("the ad-media upload surface requires an authenticated workspace", async ({ page }) => {
  await page.goto("/media");
  await expect(page).toHaveURL(/\/login\?.*next=%2Fmedia/);
  await expect(page.getByRole("heading", { name: "Sign in to your workspace" })).toBeVisible();
});

test("stream monitor requires an authenticated administrator", async ({ page }) => {
  await page.goto("/monitor");
  await expect(page).toHaveURL(/\/login\?.*next=%2Fmonitor/);
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

test("viewer access validation remains public but rejects malformed requests", async ({ request }) => {
  const response = await request.post("/api/v1/streams/access", { data: { passcode: "12" } });
  expect(response.status()).toBe(400);
  await expect(response.json()).resolves.toMatchObject({ error: "Enter a valid six-digit code and viewer details." });
});

test("stream heartbeat and session ending require a validated viewer cookie", async ({ request }) => {
  const heartbeat = await request.post("/api/v1/streams/heartbeat", { data: { mediaId: crypto.randomUUID(), eventKey: crypto.randomUUID(), positionSeconds: 1, clientEventAt: new Date().toISOString(), pageVisible: true, isPlaying: true } });
  expect(heartbeat.status()).toBe(401);
  const end = await request.post("/api/v1/streams/end");
  expect(end.status()).toBe(401);
});

test("business creation and viewer CSV reports require an administrator session", async ({ page, request }) => {
  await page.goto("/business");
  await expect(page).toHaveURL(/\/login\?.*next=%2Fbusiness/);
  const report = await request.get("/api/reports/stream-viewers.csv", { maxRedirects: 0 });
  expect(report.status()).toBe(307);
  expect(report.headers()["location"]).toContain("/login");
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
