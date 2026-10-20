import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
fs.mkdirSync("evidence", { recursive: true });
const origin = "http://127.0.0.1:5191";
const report = { passed: false, checks: [], browserErrors: [] };
const check = (name) => {
  report.checks.push(name);
  console.log(`PASS ${name}`);
};
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    "5191",
    "--strictPort",
  ],
  { stdio: "ignore", windowsHide: true },
);
const zoomValue = async (page) =>
  Number(await page.locator(".model-city").getAttribute("data-camera-zoom"));
const display = (page) => page.locator(".zoom-controls > span");
let browser;
try {
  await expect
    .poll(
      async () => {
        if (server.exitCode !== null)
          throw new Error("Preview exited before starting");
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
  const watch = (page) =>
    page.on("pageerror", (error) => report.browserErrors.push(error.message));

  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
  });
  const page = await context.newPage();
  watch(page);
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  let requests = 0;
  await page.route("**/models/city.glb", async (route) => {
    requests++;
    await held;
    await route.continue();
  });
  await page.goto(`${origin}/#city`, { waitUntil: "domcontentloaded" });
  const loader = page.locator("[data-loading-screen]");
  await expect(loader).toBeVisible();
  await expect.poll(() => requests).toBe(1);
  await expect(loader.locator("button, a")).toHaveCount(0);
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(2400);
  await expect(loader).toBeVisible();
  await expect(page).toHaveURL(`${origin}/#city`);
  await expect(page.locator(".model-city")).not.toHaveAttribute(
    "data-model-loaded",
    "true",
  );
  expect(await page.locator("#percentage").textContent()).not.toBe("100%");
  const loadingAudit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(loadingAudit.violations.map((v) => v.id)).toEqual([]);
  await page.screenshot({ path: "evidence/interactions-loading.png" });
  check(
    "首次加载没有跳过按钮，等待期间已请求模型，键盘不能绕过，加载屏无 WCAG A/AA 自动检查问题",
  );
  release();
  await expect(
    page.locator('.model-city[data-model-loaded="true"]'),
  ).toBeVisible({ timeout: 30000 });
  await expect(loader).toHaveCount(0, { timeout: 15000 });
  await expect(page.locator(".app")).toHaveAttribute("data-arrival", "done");
  check("模型加载和组装完成后自动进入城市");

  const map = page.locator(".model-city");
  const plus = page.locator(".zoom-controls button").first();
  const minus = page.locator(".zoom-controls button").last();
  await expect(map).toHaveClass(/show-entrances/);
  await plus.click();
  await expect(map).toHaveAttribute("data-camera-zoom", "1.20");
  await expect(display(page)).toHaveText("120%");
  await minus.click();
  await expect(map).toHaveAttribute("data-camera-zoom", "1.00");
  await expect(display(page)).toHaveText("100%");
  await minus.click();
  await expect(map).toHaveAttribute("data-camera-zoom", "0.83");
  await expect(display(page)).toHaveText("83%");
  for (let i = 0; i < 20 && !(await plus.isDisabled()); i++) await plus.click();
  await expect(plus).toBeDisabled();
  await expect(display(page)).toHaveText("450%");
  await expect(map).toHaveAttribute("data-camera-zoom", "4.50");
  for (let i = 0; i < 25 && !(await minus.isDisabled()); i++)
    await minus.click();
  await expect(minus).toBeDisabled();
  await expect(display(page)).toHaveText("50%");
  await expect(map).toHaveAttribute("data-camera-zoom", "0.50");
  await page.locator(".map-reset").click();
  await expect(display(page)).toHaveText("100%");
  await expect(plus).toBeEnabled();
  await expect(minus).toBeEnabled();
  await map.focus();
  await page.keyboard.press("+");
  await expect(display(page)).toHaveText("120%");
  await page.mouse.move(720, 480);
  await page.mouse.wheel(0, -200);
  await expect.poll(() => zoomValue(page)).toBeGreaterThan(1.2);
  expect(await display(page).textContent()).not.toBe("120%");
  await page.locator(".map-overview").click();
  await expect(map).toHaveAttribute("data-view-mode", "overview");
  expect(await display(page).textContent()).not.toBe("100%");
  await page.locator(".map-reset").click();
  await expect(display(page)).toHaveText("100%");
  const beforeMiddle = await map.getAttribute("data-camera-position");
  await page.mouse.move(720, 480);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(860, 400, { steps: 8 });
  await page.mouse.up({ button: "middle" });
  await expect(map).not.toHaveAttribute("data-camera-position", beforeMiddle);
  await page.locator(".map-reset").click();
  await page.screenshot({ path: "evidence/interactions-desktop.png" });
  check(
    "桌面放大缩小实际改变镜头、同步百分比与上下限，滚轮、键盘、中键旋转和复位正常",
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator(".app")).toHaveAttribute("data-arrival", "done");
  await expect(page.locator("[data-loading-screen]")).toHaveCount(0);
  check("同一会话刷新不会重复播放首次加载画面");
  await context.close();

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const phone = await mobile.newPage();
  watch(phone);
  await phone.goto(`${origin}/#city`, { waitUntil: "domcontentloaded" });
  await expect(phone.locator("[data-loading-screen]")).toBeVisible();
  await expect(phone.locator('[data-arrival="done"]')).toBeVisible({
    timeout: 30000,
  });
  const mobileMap = phone.locator(".model-city");
  await expect(mobileMap).toHaveAttribute("data-model-loaded", "true");
  await phone.locator(".zoom-controls button").first().tap();
  await expect(display(phone)).toHaveText("120%");
  await phone.locator(".zoom-controls button").last().tap();
  await expect(display(phone)).toHaveText("100%");
  await phone.locator(".map-hints").tap();
  const cdp = await mobile.newCDPSession(phone);
  const send = (type, touchPoints) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints });
  const camera = await mobileMap.getAttribute("data-camera-position");
  const target = await mobileMap.getAttribute("data-camera-target");
  await send("touchStart", [{ id: 1, x: 140, y: 350 }]);
  await send("touchMove", [{ id: 1, x: 175, y: 360 }]);
  await send("touchMove", [{ id: 1, x: 220, y: 370 }]);
  await send("touchEnd", []);
  await expect(mobileMap).not.toHaveAttribute("data-camera-position", camera);
  await expect(mobileMap).toHaveAttribute("data-camera-target", target);
  await expect(mobileMap).toHaveAttribute("data-camera-zoom", "1.00");
  await expect(phone).toHaveURL(`${origin}/#city`);
  check("手机单指滑动只旋转视角，不平移目标且不误入建筑");

  await phone.locator(".map-reset").tap();
  await send("touchStart", [
    { id: 1, x: 135, y: 380 },
    { id: 2, x: 255, y: 380 },
  ]);
  await send("touchMove", [
    { id: 1, x: 110, y: 380 },
    { id: 2, x: 280, y: 380 },
  ]);
  await send("touchMove", [
    { id: 1, x: 85, y: 380 },
    { id: 2, x: 305, y: 380 },
  ]);
  await send("touchEnd", []);
  await expect.poll(() => zoomValue(phone)).toBeGreaterThan(1.2);
  const spread = await zoomValue(phone);
  expect(await display(phone).textContent()).not.toBe("100%");
  await send("touchStart", [
    { id: 1, x: 85, y: 380 },
    { id: 2, x: 305, y: 380 },
  ]);
  await send("touchMove", [
    { id: 1, x: 110, y: 380 },
    { id: 2, x: 280, y: 380 },
  ]);
  await send("touchMove", [
    { id: 1, x: 145, y: 380 },
    { id: 2, x: 245, y: 380 },
  ]);
  await send("touchEnd", []);
  await expect.poll(() => zoomValue(phone)).toBeLessThan(spread);
  await expect(phone).toHaveURL(`${origin}/#city`);
  check("手机双指拨开放大、聚拢缩小，百分比同步且不触发建筑导航");
  await phone.locator(".map-reset").tap();
  const hit = await phone
    .locator('[data-place="docs"]')
    .evaluate((el) => ({
      x: Number(el.dataset.hitX),
      y: Number(el.dataset.hitY),
    }));
  await send("touchStart", [
    { id: 1, ...hit },
    { id: 2, x: hit.x + 20, y: hit.y },
  ]);
  await send("touchEnd", [{ id: 2, x: hit.x + 20, y: hit.y }]);
  await send("touchEnd", []);
  await phone.waitForTimeout(850);
  await expect(phone).toHaveURL(`${origin}/#city`);
  await send("touchStart", [{ id: 1, x: 140, y: 350 }]);
  await send("touchCancel", []);
  await phone.locator(".map-hints").tap();
  await phone.screenshot({ path: "evidence/interactions-mobile.png" });
  await phone.locator('[data-place="docs"]').tap();
  await expect(phone).toHaveURL(`${origin}/#docs`, { timeout: 10000 });
  check("双指先后松开不误触建筑，取消手势后仍可正常点击入口");
  await mobile.close();

  const reduced = await browser.newContext({
    reducedMotion: "reduce",
    viewport: { width: 390, height: 844 },
  });
  const quiet = await reduced.newPage();
  watch(quiet);
  let releaseReduced;
  const waiting = new Promise((resolve) => {
    releaseReduced = resolve;
  });
  await quiet.route("**/models/city.glb", async (route) => {
    await waiting;
    await route.continue();
  });
  await quiet.goto(`${origin}/#city`, { waitUntil: "domcontentloaded" });
  await expect(quiet.locator("[data-loading-screen]")).toBeVisible();
  await expect(quiet.locator("[data-loading-screen] button")).toHaveCount(0);
  releaseReduced();
  await expect(quiet.locator('[data-arrival="done"]')).toBeVisible({
    timeout: 30000,
  });
  await expect(quiet.locator(".model-city")).toHaveAttribute(
    "data-model-loaded",
    "true",
  );
  check("减少动态效果时使用静态加载提示，并等待模型准备完成");
  await reduced.close();

  const failed = await browser.newContext();
  const fallback = await failed.newPage();
  watch(fallback);
  await fallback.route("**/models/city.glb", (route) => route.abort("failed"));
  await fallback.goto(`${origin}/#city`, { waitUntil: "domcontentloaded" });
  await expect(fallback.locator('[data-arrival="done"]')).toBeVisible({
    timeout: 15000,
  });
  await expect(
    fallback.getByRole("button", { name: "重新加载" }),
  ).toBeVisible();
  await expect(fallback.locator(".city-dock")).not.toHaveAttribute("inert");
  await fallback.locator('.dock-item[title="文档图书馆"]').click();
  await expect(fallback).toHaveURL(`${origin}/#docs`, { timeout: 10000 });
  check("模型加载失败时自动展示重试和可用导航，不停留在加载画面");
  await failed.close();

  expect(report.browserErrors).toEqual([]);
  check("全部浏览器场景没有未捕获错误");
  report.passed = true;
} catch (error) {
  report.error = error.stack || String(error);
  console.error(error);
  process.exitCode = 1;
} finally {
  fs.writeFileSync(
    "evidence/city-interactions.json",
    JSON.stringify(report, null, 2),
  );
  await browser?.close();
  server.kill();
}
