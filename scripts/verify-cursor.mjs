import fs from "node:fs";
import { spawn } from "node:child_process";
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

fs.mkdirSync("evidence", { recursive: true });
const origin = "http://127.0.0.1:5194";
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    "5194",
    "--strictPort",
  ],
  { stdio: "ignore", windowsHide: true },
);
const report = { passed: false, checks: [], browserErrors: [] };
const check = (name) => {
  report.checks.push(name);
  console.log(`PASS ${name}`);
};
let browser;
try {
  await expect
    .poll(
      async () => {
        if (server.exitCode !== null) throw new Error("Preview stopped");
        try {
          return (await fetch(origin)).ok;
        } catch {
          return false;
        }
      },
      { timeout: 15000 },
    )
    .toBe(true);
  browser = await chromium.launch({
    channel: process.env.BROWSER_CHANNEL || "msedge",
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
  });
  await context.addInitScript(() =>
    sessionStorage.setItem("appery-city-arrived", "1"),
  );
  const page = await context.newPage();
  page.on("pageerror", (error) => report.browserErrors.push(error.message));
  await page.goto(`${origin}/#city`, { waitUntil: "domcontentloaded" });
  const cursor = page.locator(".town-cursor");
  const map = page.locator(".model-city");
  await expect(map).toHaveAttribute("data-model-loaded", "true", {
    timeout: 30000,
  });
  await expect(cursor).toHaveAttribute("data-visible", "false");
  await page.mouse.move(90, 160);
  await expect(cursor).toHaveAttribute("data-visible", "true");
  await expect(cursor).toHaveAttribute("data-mode", "pan");
  await expect(page.locator(".city-canvas")).toHaveCSS("cursor", "none");
  await expect(cursor).toHaveCSS("pointer-events", "none");
  const coords = await cursor.evaluate((el) => {
    const m = new DOMMatrix(getComputedStyle(el).transform);
    return { x: m.m41 + 4, y: m.m42 + 3 };
  });
  expect(coords).toEqual({ x: 90, y: 160 });
  await page.screenshot({ path: "evidence/cursor-city-day.png" });
  check("折纸指针热点与鼠标坐标一致，不拦截点击且未移动前不显示");

  const guide = page.locator(".guide-button");
  await guide.hover();
  await expect(cursor).toHaveAttribute("data-mode", "link");
  await expect(cursor.locator(".town-cursor-halo")).toHaveCSS(
    "opacity",
    "0.85",
  );
  await page.screenshot({ path: "evidence/cursor-hover.png" });
  await page.mouse.down();
  await expect(cursor).toHaveAttribute("data-pressed", "true");
  await page.mouse.up();
  await expect(page.locator(".guide-dialog")).toBeVisible();
  await page.locator(".guide-close").hover();
  await expect(cursor).toHaveAttribute("data-visible", "true");
  await expect(cursor).toHaveAttribute("data-mode", "link");
  expect(await cursor.evaluate((el) => el.matches(":popover-open"))).toBe(true);
  await page.screenshot({ path: "evidence/cursor-guide.png" });
  await page.locator(".guide-close").click();
  check("按钮悬停显示定位环，按下有反馈，弹窗里继续显示且按钮可用");

  await page.mouse.move(90, 160);
  const beforePan = await map.getAttribute("data-camera-target");
  await page.mouse.down();
  await page.mouse.move(200, 200, { steps: 8 });
  await expect(cursor).toHaveAttribute("data-mode", "drag");
  await expect(map).not.toHaveAttribute("data-camera-target", beforePan);
  await page.screenshot({ path: "evidence/cursor-drag.png" });
  await page.mouse.up();
  await page.locator(".map-reset").click();
  await page.mouse.move(720, 480);
  const beforeRotate = await map.getAttribute("data-camera-position");
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(860, 400, { steps: 8 });
  await expect(cursor).toHaveAttribute("data-mode", "rotate");
  await expect(map).not.toHaveAttribute("data-camera-position", beforeRotate);
  await page.screenshot({ path: "evidence/cursor-rotate.png" });
  await page.mouse.up({ button: "middle" });
  await page.locator(".map-reset").click();
  await page.locator(".zoom-controls button").first().click();
  await expect(page.locator(".zoom-controls > span")).toHaveText("120%");
  await page.locator(".map-reset").click();
  check("左键拖动切换罗盘十字，中键旋转切换弧形箭头，地图平移旋转缩放保持正常");

  await page.locator(".theme-toggle").click();
  await guide.hover();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "night");
  expect(
    await cursor.evaluate((el) =>
      getComputedStyle(el).getPropertyValue("--cursor-accent").trim(),
    ),
  ).toBe("#f0b18a");
  await page.screenshot({ path: "evidence/cursor-city-night.png" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(cursor.locator(".town-cursor-mark")).toHaveCSS(
    "transition-duration",
    "0s",
  );
  await page.emulateMedia({ forcedColors: "active" });
  await page.mouse.move(100, 150);
  await expect(cursor).toHaveAttribute("data-visible", "false");
  await expect(page.locator("html")).not.toHaveClass(/has-town-cursor/);
  await page.emulateMedia({
    forcedColors: "none",
    reducedMotion: "no-preference",
  });
  await page.locator(".theme-toggle").click();
  check("夜间指针配色自适应，减少动态停用过渡，高对比模式恢复系统指针");

  await page.goto(`${origin}/#docs`, { waitUntil: "domcontentloaded" });
  const search = page.locator(".doc-search input");
  await search.hover();
  await expect(cursor).toHaveAttribute("data-visible", "false");
  await expect(page.locator("html")).not.toHaveClass(/has-town-cursor/);
  await search.fill("FastAPI");
  await expect(search).toHaveValue("FastAPI");
  await page.locator(".back-button").hover();
  await expect(cursor).toHaveAttribute("data-visible", "true");
  await page.keyboard.press("Tab");
  await expect(cursor).toHaveAttribute("data-visible", "false");
  await page.goto(`${origin}/#about`, { waitUntil: "domcontentloaded" });
  await page.locator(".body-copy").hover();
  await expect(cursor).toHaveAttribute("data-visible", "false");
  await page.locator(".body-copy").click({ clickCount: 3 });
  expect(
    await page.evaluate(() => window.getSelection()?.toString().length ?? 0),
  ).toBeGreaterThan(0);
  await page.goto(`${origin}/#docs`, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".doc-search input")).toBeVisible();
  await page.locator(".back-button").hover();
  await expect(cursor).toHaveAttribute("data-visible", "true");
  await expect(cursor).toHaveAttribute("aria-hidden", "true");
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => {})),
    );
  });
  const audit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  fs.writeFileSync(
    "evidence/cursor-audit.json",
    JSON.stringify(audit.violations, null, 2),
  );
  expect(audit.violations.map((v) => v.id)).toEqual([]);
  check(
    "文本区域和输入保留系统指针，键盘导航不留下悬浮指针，文档页无障碍检查通过",
  );
  await context.close();

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  await mobile.addInitScript(() =>
    sessionStorage.setItem("appery-city-arrived", "1"),
  );
  const phone = await mobile.newPage();
  phone.on("pageerror", (error) => report.browserErrors.push(error.message));
  await phone.goto(`${origin}/#city`, { waitUntil: "domcontentloaded" });
  await expect(phone.locator(".model-city")).toHaveAttribute(
    "data-model-loaded",
    "true",
    { timeout: 30000 },
  );
  await phone.locator(".zoom-controls button").first().tap();
  await expect(phone.locator(".zoom-controls > span")).toHaveText("120%");
  await expect(phone.locator(".town-cursor")).toHaveAttribute(
    "data-visible",
    "false",
  );
  await expect(phone.locator("html")).not.toHaveClass(/has-town-cursor/);
  await phone.screenshot({ path: "evidence/cursor-mobile.png" });
  await mobile.close();
  check("纯触屏设备不显示鼠标装饰，触摸按钮不受影响");
  expect(report.browserErrors).toEqual([]);
  report.passed = true;
} catch (error) {
  report.error = error.stack || String(error);
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill();
  fs.writeFileSync(
    "evidence/cursor-verification.json",
    JSON.stringify(report, null, 2),
  );
}
