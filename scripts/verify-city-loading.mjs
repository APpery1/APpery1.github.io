import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
fs.mkdirSync("evidence", { recursive: true });
const model = fs.readFileSync("dist/models/city.glb");
const report = { passed: false, checks: [], browserErrors: [] };
const check = (name) => {
  report.checks.push(name);
  console.log(`PASS ${name}`);
};
let scenario = "chunked";
let modelRequests = 0;
let fontRequests = 0;
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".glb": "model/gltf-binary",
  ".ttf": "font/ttf",
  ".svg": "image/svg+xml",
};
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(
    new URL(request.url, "http://localhost").pathname,
  );
  const file = path.resolve(
    "dist",
    pathname === "/" ? "index.html" : `.${pathname}`,
  );
  if (
    !file.startsWith(`${path.resolve("dist")}${path.sep}`) ||
    !fs.existsSync(file)
  ) {
    response.writeHead(404).end();
    return;
  }
  if (pathname.endsWith(".ttf")) fontRequests++;
  if (pathname === "/models/city.glb") {
    modelRequests++;
    const bytes = zlib.gzipSync(
      scenario === "truncated" ? model.subarray(0, model.length / 2) : model,
    );
    response.writeHead(200, {
      "Content-Type": "model/gltf-binary",
      "Content-Encoding": "gzip",
      "Cache-Control": "no-store",
    });
    // Deliberately stream gzip without Content-Length, as some CDN responses do.
    const size = Math.ceil(bytes.length / 16);
    let offset = 0;
    const timer = setInterval(() => {
      response.write(bytes.subarray(offset, offset + size));
      offset += size;
      if (offset >= bytes.length) {
        clearInterval(timer);
        response.end();
      }
    }, 70);
    response.on("close", () => clearInterval(timer));
    return;
  }
  const compressed = /\.(html|js|css|svg)$/.test(file);
  const bytes = compressed
    ? zlib.gzipSync(fs.readFileSync(file))
    : fs.readFileSync(file);
  response.writeHead(200, {
    "Content-Type": types[path.extname(file)] || "application/octet-stream",
    "Content-Length": bytes.length,
    "Cache-Control": "no-store",
    ...(compressed ? { "Content-Encoding": "gzip" } : {}),
  });
  response.end(bytes);
});
await new Promise((resolve) => server.listen(5193, "127.0.0.1", resolve));
const origin = "http://127.0.0.1:5193";
let browser;
try {
  browser = await chromium.launch({
    channel: process.env.BROWSER_CHANNEL || "msedge",
    headless: true,
  });
  for (const device of [
    { name: "desktop", viewport: { width: 1440, height: 960 } },
    {
      name: "mobile",
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    },
  ]) {
    const { name, ...options } = device;
    scenario = "chunked";
    modelRequests = 0;
    fontRequests = 0;
    const context = await browser.newContext(options);
    const page = await context.newPage();
    page.on("pageerror", (error) => report.browserErrors.push(error.message));
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await page.addInitScript(() => {
      window.cityArrivalTime = 0;
      new MutationObserver(() => {
        if (
          !window.cityArrivalTime &&
          document.querySelector('[data-arrival="done"]')
        )
          window.cityArrivalTime = performance.now();
      }).observe(document, {
        subtree: true,
        attributes: true,
        childList: true,
      });
    });
    await page.goto(`${origin}/#city`, { waitUntil: "domcontentloaded" });
    const loader = page.locator("[data-loading-screen]");
    await expect(loader).toBeVisible();
    await expect(loader.locator("button")).toHaveCount(0);
    await expect
      .poll(async () =>
        Number(
          (await page.locator("#percentage").textContent()).replace("%", ""),
        ),
      )
      .toBeGreaterThan(8);
    await expect(loader).toBeVisible();
    expect(fontRequests).toBe(0);
    expect(await page.locator("#percentage").textContent()).not.toBe("100%");
    await expect(page.locator('[data-arrival="done"]')).toBeVisible({
      timeout: 15000,
    });
    await expect(page.locator(".model-city")).toHaveAttribute(
      "data-model-loaded",
      "true",
    );
    expect(modelRequests).toBe(1);
    await expect.poll(() => fontRequests).toBe(2);
    const timings = await page.evaluate(() => ({
      firstFrame: performance.getEntriesByName("city-first-frame")[0].startTime,
      arrived: window.cityArrivalTime,
    }));
    const startsEarly = await page.evaluate(() => {
      const entries = performance.getEntriesByType("resource");
      return (
        entries.find((entry) => entry.name.endsWith("/city.glb")).startTime <
        entries.find((entry) => /\/assets\/index-.*\.js$/.test(entry.name))
          .responseEnd
      );
    });
    expect(startsEarly).toBe(true);
    expect(timings.arrived).toBeGreaterThanOrEqual(timings.firstFrame);
    expect(timings.arrived - timings.firstFrame).toBeLessThan(1000);
    check(
      `${name}: 压缩分块响应无 Content-Length 时进度仍前进，模型仅请求一次、早于主脚本完成启动，字体延后且首帧完成后进入`,
    );
    await context.close();
  }

  scenario = "truncated";
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => report.browserErrors.push(error.message));
  await page.goto(`${origin}/#city`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "重新加载" })).toBeVisible({
    timeout: 15000,
  });
  await expect(page.locator('[data-arrival="done"]')).toBeVisible();
  await expect(page.locator(".model-city")).not.toHaveAttribute(
    "data-model-loaded",
    "true",
  );
  scenario = "chunked";
  await page.getByRole("button", { name: "重新加载" }).tap();
  await expect(page.locator(".model-city")).toHaveAttribute(
    "data-model-loaded",
    "true",
    { timeout: 15000 },
  );
  await expect(page.locator(".zoom-controls button").first()).toBeEnabled();
  check("模型响应中断时显示失败提示，重新加载能重新下载并正常进入城市");
  await context.close();
  expect(report.browserErrors).toEqual([]);
  check("压缩传输和失败重试没有未捕获浏览器错误");
  report.passed = true;
} catch (error) {
  report.error = error.stack || String(error);
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
  fs.writeFileSync(
    "evidence/city-loading-verification.json",
    JSON.stringify(report, null, 2),
  );
}
