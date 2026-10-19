import { spawn } from "node:child_process";
import fs from "node:fs";
import { chromium } from "@playwright/test";
const port = 5176,
  log = fs.openSync("evidence/city-capture-server.log", "w"),
  server = spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    { stdio: ["ignore", log, log], windowsHide: true },
  );
let browser;
try {
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}`)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 960 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/#city`, {
    waitUntil: "networkidle",
  });
  await page
    .locator('.model-city[data-model-loaded="true"]')
    .waitFor({ timeout: 30000 });
  await page.waitForTimeout(250);
  await page.waitForTimeout(200);
  await page.screenshot({ path: "evidence/blender-draft-desktop.png" });
  await page.locator(".map-overview").click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: "evidence/blender-draft-overview.png" });
  await page.locator(".map-quiet").click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: "evidence/blender-draft-clean.png" });
  await page.keyboard.press("Escape");
  await page.locator(".map-hints").click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: "evidence/blender-draft-hints.png" });
  await page.locator(".map-hints").click();
  await page.locator(".theme-toggle").click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: "evidence/blender-draft-night.png" });
  await page.locator(".theme-toggle").click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".map-reset").click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: "evidence/blender-draft-mobile.png" });
  console.log(
    JSON.stringify({
      errors,
      buildings: await page.locator(".city-building").count(),
      renderer: await page
        .locator(".model-city")
        .evaluate((el) => ({ ...el.dataset })),
      images: await page.locator(".model-city image,.model-city img").count(),
    }),
  );
} finally {
  await browser?.close();
  server.kill();
}
