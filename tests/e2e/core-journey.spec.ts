import { test, expect } from "../../playwright-fixture";

/**
 * Core user-journey E2E test.
 *
 * Strategy:
 *  – Auth is mocked via Supabase's local-storage session injection so we
 *    never hit a real login form.
 *  – Supabase REST / Edge-Function calls are intercepted with Playwright
 *    route handlers so the test is fully offline and deterministic.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MOCK_USER_ID = "00000000-0000-0000-0000-000000000001";
const MOCK_PROJECT_ID = "e2e-test-project-0001";

const mockCostItems = [
  {
    id: "ci-001",
    project_id: MOCK_PROJECT_ID,
    original_description: "Concrete foundation C30/37",
    interpreted_scope: "Foundation concrete works",
    quantity: 120,
    unit: "m³",
    original_unit_price: 1800,
    recommended_unit_price: 2100,
    benchmark_min: 1600,
    benchmark_typical: 2000,
    benchmark_max: 2500,
    total_price: 252000,
    status: "ok",
    trade: "Structural",
    sheet_name: "Sheet1",
    ai_comment: "Price is within market range",
    match_confidence: 0.92,
    mutation_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "ci-002",
    project_id: MOCK_PROJECT_ID,
    original_description: "Steel reinforcement B500B",
    interpreted_scope: "Rebar supply and installation",
    quantity: 15000,
    unit: "kg",
    original_unit_price: 18,
    recommended_unit_price: 22,
    benchmark_min: 16,
    benchmark_typical: 20,
    benchmark_max: 25,
    total_price: 330000,
    status: "review",
    trade: "Structural",
    sheet_name: "Sheet1",
    ai_comment: "Slightly below market average",
    match_confidence: 0.85,
    mutation_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "ci-003",
    project_id: MOCK_PROJECT_ID,
    original_description: "Interior painting – walls",
    interpreted_scope: "Two-coat emulsion paint on plastered walls",
    quantity: 800,
    unit: "m²",
    original_unit_price: 95,
    recommended_unit_price: 110,
    benchmark_min: 80,
    benchmark_typical: 100,
    benchmark_max: 130,
    total_price: 88000,
    status: "ok",
    trade: "Finishes",
    sheet_name: "Sheet1",
    ai_comment: null,
    match_confidence: 0.78,
    mutation_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const mockProject = {
  id: MOCK_PROJECT_ID,
  name: "E2E Test Project",
  country: "SE",
  currency: "SEK",
  project_type: "new_construction_residential",
  status: "ready",
  notes: null,
  project_notes: null,
  total_items: mockCostItems.length,
  total_value: mockCostItems.reduce((s, i) => s + i.total_price, 0),
  issues_count: 1,
  user_id: MOCK_USER_ID,
  pending_benchmark_update: false,
  pending_update_dismissed_at: null,
  pending_update_since: null,
  pending_update_summary: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

// Inject a fake Supabase session into localStorage so the app thinks we're
// logged in.
async function injectAuthSession(page: import("@playwright/test").Page) {
  const fakeSession = {
    access_token: "fake-access-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: "fake-refresh-token",
    user: {
      id: MOCK_USER_ID,
      aud: "authenticated",
      role: "authenticated",
      email: "e2e@test.com",
      email_confirmed_at: new Date().toISOString(),
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: { full_name: "E2E Tester" },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  };

  // Supabase JS client stores the session under this key pattern
  await page.addInitScript((session) => {
    const key = Object.keys(localStorage).find((k) =>
      k.startsWith("sb-") && k.endsWith("-auth-token")
    );
    // If we can't find the key yet, set a plausible one
    const storageKey = key ?? "sb-qlkotadfcaqqmduehsko-auth-token";
    localStorage.setItem(storageKey, JSON.stringify(session));
  }, fakeSession);
}

// ---------------------------------------------------------------------------
// Supabase REST API interceptor
// ---------------------------------------------------------------------------

/** Intercept all Supabase PostgREST / auth / functions calls */
async function setupApiMocks(page: import("@playwright/test").Page) {
  const supabaseUrl = /qlkotadfcaqqmduehsko\.supabase\.co/;

  // ---------- Auth ----------
  await page.route(
    (url) => supabaseUrl.test(url.hostname) && url.pathname.includes("/auth/"),
    async (route) => {
      const url = route.request().url();
      // getSession / getUser
      if (url.includes("/auth/v1/user") || url.includes("/auth/v1/token")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: MOCK_USER_ID,
            aud: "authenticated",
            role: "authenticated",
            email: "e2e@test.com",
            app_metadata: {},
            user_metadata: { full_name: "E2E Tester" },
          }),
        });
      }
      return route.fulfill({ status: 200, body: "{}" });
    }
  );

  // ---------- Projects list (Dashboard) ----------
  await page.route(
    (url) =>
      supabaseUrl.test(url.hostname) &&
      url.pathname.includes("/rest/v1/projects") &&
      !url.searchParams.has("id"),
    async (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([mockProject]),
      });
    }
  );

  // ---------- Single project ----------
  await page.route(
    (url) =>
      supabaseUrl.test(url.hostname) &&
      url.pathname.includes("/rest/v1/projects") &&
      (url.searchParams.get("id")?.includes(MOCK_PROJECT_ID) ||
        url.search.includes(MOCK_PROJECT_ID)),
    async (route) => {
      const method = route.request().method();
      if (method === "PATCH" || method === "POST") {
        return route.fulfill({ status: 200, body: JSON.stringify(mockProject) });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([mockProject]),
      });
    }
  );

  // ---------- Cost items ----------
  await page.route(
    (url) =>
      supabaseUrl.test(url.hostname) &&
      url.pathname.includes("/rest/v1/cost_items"),
    async (route) => {
      const method = route.request().method();
      if (method === "POST") {
        // Insert – return items with processing status
        return route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify(
            mockCostItems.map((i) => ({ ...i, status: "clarification" }))
          ),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "content-range": `0-${mockCostItems.length - 1}/${mockCostItems.length}` },
        body: JSON.stringify(mockCostItems),
      });
    }
  );

  // ---------- Profiles ----------
  await page.route(
    (url) =>
      supabaseUrl.test(url.hostname) &&
      url.pathname.includes("/rest/v1/profiles"),
    async (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: MOCK_USER_ID,
            email: "e2e@test.com",
            full_name: "E2E Tester",
            company: "Test Corp",
            email_notifications: true,
            project_alerts: true,
            weekly_digest: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ]),
      });
    }
  );

  // ---------- User roles ----------
  await page.route(
    (url) =>
      supabaseUrl.test(url.hostname) &&
      url.pathname.includes("/rest/v1/user_roles"),
    async (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          { id: "role-1", user_id: MOCK_USER_ID, role: "user", created_at: new Date().toISOString() },
        ]),
      });
    }
  );

  // ---------- Project members ----------
  await page.route(
    (url) =>
      supabaseUrl.test(url.hostname) &&
      url.pathname.includes("/rest/v1/project_members"),
    async (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    }
  );

  // ---------- Project invitations ----------
  await page.route(
    (url) =>
      supabaseUrl.test(url.hostname) &&
      url.pathname.includes("/rest/v1/project_invitations"),
    async (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    }
  );

  // ---------- Cost item mutations ----------
  await page.route(
    (url) =>
      supabaseUrl.test(url.hostname) &&
      url.pathname.includes("/rest/v1/cost_item_mutations"),
    async (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    }
  );

  // ---------- Cost item comments ----------
  await page.route(
    (url) =>
      supabaseUrl.test(url.hostname) &&
      url.pathname.includes("/rest/v1/cost_item_comments"),
    async (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    }
  );

  // ---------- Estimate trust scores ----------
  await page.route(
    (url) =>
      supabaseUrl.test(url.hostname) &&
      url.pathname.includes("/rest/v1/estimate_trust_scores"),
    async (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    }
  );

  // ---------- Uploaded files ----------
  await page.route(
    (url) =>
      supabaseUrl.test(url.hostname) &&
      url.pathname.includes("/rest/v1/uploaded_files"),
    async (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    }
  );

  // ---------- Share tokens ----------
  await page.route(
    (url) =>
      supabaseUrl.test(url.hostname) &&
      url.pathname.includes("/rest/v1/project_share_tokens"),
    async (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    }
  );

  // ---------- Edge Functions (analyze-cost-items) ----------
  await page.route(
    (url) =>
      supabaseUrl.test(url.hostname) &&
      url.pathname.includes("/functions/v1/analyze-cost-items"),
    async (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          results: mockCostItems.map((item) => ({
            id: item.id,
            recommended_unit_price: item.recommended_unit_price,
            benchmark_min: item.benchmark_min,
            benchmark_typical: item.benchmark_typical,
            benchmark_max: item.benchmark_max,
            status: item.status,
            ai_comment: item.ai_comment,
            interpreted_scope: item.interpreted_scope,
            match_confidence: item.match_confidence,
          })),
        }),
      });
    }
  );

  // ---------- Edge Functions (parse-excel) ----------
  await page.route(
    (url) =>
      supabaseUrl.test(url.hostname) &&
      url.pathname.includes("/functions/v1/parse-excel"),
    async (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ items_created: mockCostItems.length }),
      });
    }
  );

  // ---------- Storage upload ----------
  await page.route(
    (url) =>
      supabaseUrl.test(url.hostname) &&
      url.pathname.includes("/storage/"),
    async (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ Key: "project-files/test.xlsx" }),
      });
    }
  );

  // ---------- RPC calls ----------
  await page.route(
    (url) =>
      supabaseUrl.test(url.hostname) &&
      url.pathname.includes("/rest/v1/rpc/"),
    async (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(true),
      });
    }
  );

  // ---------- Catch-all for any remaining supabase calls ----------
  await page.route(
    (url) => supabaseUrl.test(url.hostname),
    async (route) => {
      // Let realtime websocket connections pass through
      if (route.request().url().includes("realtime")) {
        return route.abort();
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]",
      });
    }
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Core User Journey", () => {
  test.beforeEach(async ({ page }) => {
    await setupApiMocks(page);
    await injectAuthSession(page);
  });

  test("Step 1-2: User logs in and sees the Dashboard with New Project button", async ({
    page,
  }) => {
    await page.goto("/");
    // Dashboard should render with the "New Project" button
    await expect(page.getByRole("link", { name: /new project/i })).toBeVisible({
      timeout: 15000,
    });
  });

  test("Step 3: User creates a new project with details", async ({ page }) => {
    await page.goto("/project/new");

    // Fill project name
    await page.getByLabel(/project name/i).fill("E2E Test Project");

    // Select country: Sweden
    await page.getByLabel(/country/i).click();
    await page.getByRole("option", { name: /sweden/i }).click();

    // Currency should auto-fill to SEK
    await expect(page.locator("text=SEK")).toBeVisible();

    // Select project type
    await page.getByLabel(/project type/i).click();
    await page.getByRole("option").first().click();

    // Continue button should be enabled
    const continueBtn = page.getByRole("button", { name: /continue/i });
    await expect(continueBtn).toBeEnabled();
    await continueBtn.click();

    // Step 2: Input method selection should appear
    await expect(page.getByText(/how would you like to add cost items/i)).toBeVisible();
  });

  test("Step 4-6: User navigates to project detail and sees cost items table", async ({
    page,
  }) => {
    await page.goto(`/project/${MOCK_PROJECT_ID}`);

    // Project name should be visible
    await expect(page.getByText("E2E Test Project")).toBeVisible({ timeout: 15000 });

    // Cost items table should render with our mock data rows
    await expect(page.getByText("Concrete foundation C30/37")).toBeVisible();
    await expect(page.getByText("Steel reinforcement B500B")).toBeVisible();
    await expect(page.getByText("Interior painting – walls")).toBeVisible();
  });

  test("Step 7-8: Insights panel and Executive Summary render with correct totals", async ({
    page,
  }) => {
    await page.goto(`/project/${MOCK_PROJECT_ID}`);

    // Wait for project to load
    await expect(page.getByText("E2E Test Project")).toBeVisible({ timeout: 15000 });

    // The Executive Summary / overview tab should show budget totals
    // Total CAPEX = sum of all total_price = 252000 + 330000 + 88000 = 670000
    // Check that some representation of the total value is shown
    await expect(
      page.getByText(/670/).first()
    ).toBeVisible({ timeout: 10000 });
  });

  test("Step 9: Export Report dialog opens", async ({ page }) => {
    await page.goto(`/project/${MOCK_PROJECT_ID}`);

    // Wait for the page to load
    await expect(page.getByText("E2E Test Project")).toBeVisible({ timeout: 15000 });

    // Click the Export button
    const exportBtn = page.getByRole("button", { name: /export/i });
    await exportBtn.click();

    // Assert the export dialog is visible
    await expect(
      page.getByRole("dialog").or(page.locator("[role=dialog]"))
    ).toBeVisible({ timeout: 5000 });
  });
});
