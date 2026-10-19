import fs from "node:fs";
import crypto from "node:crypto";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import { expect } from "@playwright/test";
const hash = (file) =>
  crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
export async function verifyBlenderModel(check) {
  const manifest = JSON.parse(
    fs.readFileSync("public/models/city-manifest.json"),
  );
  check(
    "使用指定 Blender 源文件且源文件未被导出流程改写",
    manifest.source === "blender/city_model.blend" &&
      manifest.sourceUnchanged &&
      hash(manifest.source) === manifest.sourceSha256,
  );
  check(
    "生产模型与开发资源完全一致",
    hash("public/models/city.glb") === manifest.modelSha256 &&
      hash("dist/models/city.glb") === manifest.modelSha256,
  );
  const io = new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({ "meshopt.decoder": MeshoptDecoder }),
    doc = await io.read("public/models/city.glb"),
    root = doc.getRoot(),
    animation = root.listAnimations()[0];
  check(
    "模型保留 32 秒动画与 246 条变换通道",
    root.listAnimations().length === 1 &&
      animation.listChannels().length === 246 &&
      Math.abs(
        Math.max(
          ...animation.listSamplers().map((s) => s.getInput().getArray().at(-1)),
        ) - 32,
      ) < 0.001,
  );
  const tags = new Set(
    root
      .listNodes()
      .map((n) => n.getExtras().place)
      .filter(Boolean),
  );
  check(
    "七个内容入口、高架与机场均直接绑定模型对象",
    [
      "about",
      "projects",
      "research",
      "docs",
      "album",
      "contact",
      "game",
      "airport",
      "highway",
    ].every((id) => tags.has(id)),
  );
  const roles = root.listNodes().map((n) => n.getExtras().cityRole);
  check(
    "原模型 24 辆车、16 位行人和 2 艘船的控制器均保留",
    roles.filter((r) => r === "car_controller").length === 24 &&
      roles.filter((r) => r === "pedestrian_controller").length === 16 &&
      roles.filter((r) => r === "boat_controller").length === 2,
  );
  // Compare every exported track against the Blender source at its first/end samples.
  const source = JSON.parse(
    fs.readFileSync("evidence/model-export/city-export.json"),
  );
  const tracks = new Map(source.animations.map((a) => [a.node, a]));
  let compared = 0,
    rotationError = 0,
    positionError = 0;
  for (const channel of animation.listChannels()) {
    const sampler = channel.getSampler(),
      output = sampler.getOutput(),
      size = output.getElementSize(),
      values = output.getArray(),
      original = tracks.get(channel.getTargetNode().getName())?.[
        channel.getTargetPath()
      ];
    if (!original) continue;
    for (const [a, b] of [
      [values.slice(0, size), original.slice(0, size)],
      [values.slice(-size), original.slice(-size)],
    ]) {
      if (size === 4)
        rotationError = Math.max(
          rotationError,
          1 - Math.abs(a.reduce((s, v, i) => s + v * b[i], 0)),
        );
      else
        positionError = Math.max(
          positionError,
          ...a.map((v, i) => Math.abs(v - b[i])),
        );
      compared++;
    }
  }
  check(
    "压缩动画的起止姿态与 Blender 源关键帧一致",
    compared === 492 && rotationError < 0.001 && positionError < 0.04,
    `旋转误差 ${rotationError.toFixed(7)}，位置量化误差 ${positionError.toFixed(4)}`,
  );
  return manifest;
}
export async function verify3DControls(page, check, screenshot) {
  const map = page.locator(".model-city");
  await expect(map).toHaveAttribute("data-model-loaded", "true");
  await expect(page.locator(".city-canvas")).toBeVisible();
  check(
    "首页通过 WebGL 实时渲染模型，未使用参考图或渲染图背景",
    (await page
      .locator(".model-city img,.model-city image,.model-city video")
      .count()) === 0,
  );
  check(
    "真实绘制调用低于 80 次且实际三角形超过 10 万",
    Number(await map.getAttribute("data-draw-calls")) < 80 &&
      Number(await map.getAttribute("data-triangles")) > 100000,
  );
  await page.locator(".map-hints").click();
  await expect(map).toHaveClass(/show-entrances/);
  await screenshot(page, "city-entrances");
  await page.locator(".map-hints").click();
  const before = await map.getAttribute("data-camera-position");
  await page.locator(".map-rotate").click();
  await expect(map).not.toHaveAttribute("data-camera-position", before);
  await screenshot(page, "city-rotated");
  await page.locator(".map-reset").click();
  await expect(map).toHaveAttribute("data-camera-position", "[126,154,170]");
  check("旋转按钮可改变真实相机，复位可恢复默认方向", true);
  const oldView = await map.getAttribute("data-camera-position");
  await page.locator(".map-quiet").click();
  await expect(page.locator(".quiet-exit")).toBeFocused();
  await expect(page.locator(".site-header")).not.toBeVisible();
  await expect(page.locator(".model-entrances")).not.toBeVisible();
  await screenshot(page, "city-immersive");
  await page.keyboard.press("Escape");
  await expect(page.locator(".map-quiet")).toBeFocused();
  await expect(map).toHaveAttribute("data-camera-position", oldView);
  check("沉浸模式隐藏界面，Esc 恢复镜头与焦点", true);
  const time = Number(await map.getAttribute("data-animation-time"));
  await expect
    .poll(async () => Number(await map.getAttribute("data-animation-time")))
    .toBeGreaterThan(time + 0.15);
  await page.locator(".map-motion").click();
  await expect(map).toHaveAttribute("data-animation-paused", "true");
  const stopped = await map.getAttribute("data-animation-time");
  await page.waitForTimeout(180);
  check(
    "原生模型动画播放正常且暂停按钮能停止时间轴",
    stopped === (await map.getAttribute("data-animation-time")),
  );
  await page.locator(".map-motion").click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(map).toHaveAttribute("data-animation-paused", "true");
  await page.waitForTimeout(60);
  const reduced = await map.getAttribute("data-animation-time");
  await page.waitForTimeout(180);
  check(
    "减少动态偏好自动停止全部模型动画",
    reduced === (await map.getAttribute("data-animation-time")),
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
}
export async function clickModel(page, id) {
  const marker = page.locator(`[data-place="${id}"]`);
  await marker.focus();
  await page.waitForTimeout(100);
  const p = await marker.evaluate((el) => ({
    x: Number(el.dataset.hitX),
    y: Number(el.dataset.hitY),
  }));
  await page.mouse.click(p.x, p.y);
}
