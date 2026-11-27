// Run after npm run build. Only uses a loopback preview; no deployed site required.
import { preview } from "vite";
import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";

const manifest = JSON.parse(fs.readFileSync("public/models/city-manifest.json"));
assert.equal(crypto.createHash("sha256").update(fs.readFileSync(manifest.source)).digest("hex"), manifest.sourceSha256);
assert.equal(manifest.duration * manifest.fps, 14400);
const glb = fs.readFileSync("dist/models/city.glb");
assert.equal(crypto.createHash("sha256").update(glb).digest("hex"), manifest.modelSha256);
const model = JSON.parse(glb.toString("utf8", 20, 20 + glb.readUInt32LE(12)));
const day = model.scenes[model.scene].extras.daylight;
assert.equal(day.samples.length, 97);
for (const name of Object.values(day.hands)) assert(model.nodes.some(n => n.name === name));
for (const name of Object.keys(day.emission)) assert(model.materials.some(m => m.name === name), name);
assert(day.samples[24].energy > day.samples[72].energy);
assert(day.samples[24].glow['Street | opal globe'] < day.samples[72].glow['Street | opal globe']);

const server = await preview({ preview: { host: "127.0.0.1", port: 0, open: false } });
let browser;
try {
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || "msedge" });
  for (const [zone, local, frame] of [["Asia/Shanghai", "06:00", 1], ["America/New_York", "17:00", 6601]]) {
    const context = await browser.newContext({ timezoneId: zone, reducedMotion: "reduce", viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const errors = []; page.on("pageerror", e => errors.push(e.message));
    page.on("console", msg => { if (msg.type() === "error" && /WebGL|shader/i.test(msg.text())) errors.push(msg.text()); });
    await page.clock.setFixedTime(new Date("2026-01-01T22:00:00Z"));
    await page.addInitScript(() => sessionStorage.setItem("appery-city-arrived", "1"));
    await page.goto(server.resolvedUrls.local[0]);
    const map = page.locator(".model-city"), select = page.locator(".city-time-control select");
    await expect(map).toHaveAttribute("data-model-loaded", "true", { timeout: 60000 });
    await expect(map).toHaveAttribute("data-city-frame", String(frame));
    await expect(page.locator(".city-time-control")).toContainText(local);
    console.log(zone, local, 'draws:', await map.getAttribute('data-draw-calls'));
    assert(Number(await map.getAttribute('data-draw-calls')) < 80, 'draw-call budget');
    const views = new Set();
    for (const [mode, at] of [["dawn", 1], ["noon", 3601], ["dusk", 7201], ["midnight", 10800]]) {
      await select.selectOption(mode);
      await expect(map).toHaveAttribute("data-city-frame", String(at));
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const png = await page.locator(".city-canvas").screenshot();
      views.add(crypto.createHash('sha256').update(png).digest('hex'));
    }
    assert.equal(views.size, 4, 'Expected four distinct city renders');
    await select.selectOption("local");
    await expect(map).toHaveAttribute("data-city-frame", String(frame));
    if (zone === "Asia/Shanghai") {
      await page.clock.setFixedTime(new Date("2026-01-02T21:59:59Z"));
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect(map).toHaveAttribute('data-city-frame', '14400');
      await page.clock.setFixedTime(new Date("2026-01-02T22:00:00Z"));
      await expect(map).toHaveAttribute('data-city-frame', '1', { timeout: 12000 });
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log("PASS local time in two time zones, day rollover, four renders, return to local time");
} finally {
  await browser?.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}
