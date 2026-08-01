import { randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { pool } from "../../api/src/db/pool";

let createdClientEmail: string | null = null;

test.afterEach(async () => {
  if (!createdClientEmail) return;

  const connection = await pool.connect();
  try {
    await connection.query("BEGIN");
    const clients = await connection.query<{ id: string }>(
      "SELECT id FROM clients WHERE email = $1",
      [createdClientEmail]
    );
    if (clients.rowCount !== null && clients.rowCount > 1) {
      throw new Error("E2E cleanup matched more than one client.");
    }
    if (clients.rows[0]) {
      await connection.query("DELETE FROM invoices WHERE client_id = $1", [clients.rows[0].id]);
      await connection.query("DELETE FROM clients WHERE id = $1", [clients.rows[0].id]);
    }
    await connection.query("COMMIT");
  } catch (error) {
    await connection.query("ROLLBACK");
    throw error;
  } finally {
    connection.release();
    createdClientEmail = null;
  }
});

test.afterAll(async () => {
  await pool.end();
});

test("client to paid PDF invoice journey", async ({ page }, testInfo) => {
  const marker = randomUUID();
  const businessName = `PT E2E InvoicePro ${marker.slice(0, 8)}`;
  createdClientEmail = `e2e-${marker}@example.test`;

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Invoice operations" })).toBeVisible();

  await page.getByRole("button", { name: "Clients", exact: true }).click();
  await page.getByLabel("Business name").fill(businessName);
  await page.getByLabel("Contact name").fill("E2E Operator");
  await page.getByLabel("Email").fill(createdClientEmail);
  await page.getByLabel("Billing address").fill("Jl. Automated Browser Test No. 1, Jakarta");
  await page.getByRole("button", { name: "Create client" }).click();
  await expect(page.getByRole("status")).toContainText("Client created.");
  await expect(page.getByRole("heading", { name: businessName })).toBeVisible();

  await page.getByRole("button", { name: "Invoices", exact: true }).click();
  const invoiceForm = page.locator(".invoice-form-panel");
  await invoiceForm.getByRole("combobox", { name: "Client", exact: true }).selectOption({
    label: businessName
  });
  await invoiceForm.getByLabel("Description").fill("Automated invoice workflow validation");
  await invoiceForm.getByLabel("Quantity").fill("2");
  await invoiceForm.getByLabel("Unit price").fill("250000");
  await invoiceForm.getByLabel("Notes").fill("Created by the Playwright end-to-end test.");
  await invoiceForm.getByRole("button", { name: "Create draft invoice" }).click();

  await expect(page.getByRole("status")).toContainText("Draft invoice created.");
  const detailPanel = page.locator(".invoice-detail-panel");
  const invoiceHeading = detailPanel.getByRole("heading", { name: /^INV-/ });
  await expect(invoiceHeading).toBeVisible();
  const invoiceNumber = (await invoiceHeading.textContent())?.trim();
  if (!invoiceNumber) throw new Error("Created invoice number was not rendered.");
  expect(invoiceNumber).toMatch(/^INV-\d{6}-\d{6,}$/);
  await expect(detailPanel).toContainText("IDR 555,000.00");
  await expect(detailPanel).toContainText("Draft");

  await detailPanel.getByRole("button", { name: "Send invoice" }).click();
  await expect(page.getByRole("status")).toContainText("Invoice marked sent.");
  await expect(detailPanel).toContainText("Sent");

  const downloadPromise = page.waitForEvent("download");
  await detailPanel.getByRole("button", { name: "Download PDF" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`${invoiceNumber}.pdf`);
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const pdfBytes = await readFile(downloadPath!);
  expect(pdfBytes.subarray(0, 4).toString("ascii")).toBe("%PDF");
  expect(pdfBytes.byteLength).toBeGreaterThan(1_000);

  await detailPanel.getByRole("button", { name: "Mark paid" }).click();
  await expect(page.getByRole("status")).toContainText("Invoice marked paid.");
  await expect(detailPanel).toContainText("Paid");
  await expect(page.getByText("IDR 0.00", { exact: true }).first()).toBeVisible();

  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(horizontalOverflow).toBe(false);

  if (process.env.CAPTURE_DEMO_SCREENSHOTS === "1") {
    const screenshotDirectory = path.resolve(testInfo.config.rootDir, "../../../docs/screenshots");
    await mkdir(screenshotDirectory, { recursive: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
      fullPage: true,
      path: path.join(screenshotDirectory, "invoice-workspace-desktop.png")
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await detailPanel.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(screenshotDirectory, "invoice-detail-mobile.png")
    });
  }
});
