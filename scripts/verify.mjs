import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { applyPublicMetadata } from "./public-metadata.mjs";
import { verifyPublicMetadata } from "./verify-public-metadata.mjs";
import {
  verifyBlenderModel,
  verify3DControls,
  clickModel,
} from "./verify-blender-city.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
fs.mkdirSync("evidence", { recursive: true });
const report = {
  checks: [],
  browserErrors: [],
  accessibility: [],
  screenshots: [],
};
const hash = (file) =>
  crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const check = (name, passed, detail = "") => {
  report.checks.push({ name, passed, detail });
  console.log(
    `${passed ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`,
  );
  if (!passed) throw new Error(name);
};
const screenshot = async (page, name) => {
  await page.mouse.move(0, 0);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => {})),
    );
  });
  await page.screenshot({
    path: `evidence/${name}.png`,
    fullPage: true,
    animations: "disabled",
  });
  report.screenshots.push(`evidence/${name}.png`);
};
const audit = async (page, name) => {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => {})),
    );
  });
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  const violations = result.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    nodes: v.nodes.map((n) => ({
      target: n.target,
      summary: n.failureSummary,
    })),
  }));
  report.accessibility.push({ name, violations });
  check(
    `${name}: WCAG A/AA 自动检查`,
    violations.length === 0,
    violations.map((v) => v.id).join(", "),
  );
};
let server;
let browser;
try {
  const original = path.resolve(root, "..");
  const tracked = JSON.parse(fs.readFileSync("evidence/original-hashes.json"));
  check(
    "原工作区受保护文件未修改",
    Object.entries(tracked).every(
      ([file, sha]) =>
        !fs.existsSync(path.join(original, file)) ||
        hash(path.join(original, file)) === sha,
    ),
  );
  const docs = fs
    .readdirSync("document", { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((dir) =>
      fs
        .readdirSync(`document/${dir.name}`)
        .filter((name) => /\.(md|txt)$/i.test(name) && !/^readme\./i.test(name))
        .map((name) => ({
          category: dir.name,
          name,
          title: name.replace(/\.[^.]+$/, "").replace(/^\d+[_\-\s.]+/, ""),
        })),
    );
  const photos = fs
    .readdirSync("photo")
    .filter((name) => /\.(jpe?g|png|webp)$/i.test(name));
  check(
    "19 篇文档与 15 张原始照片齐全",
    docs.length === 19 && photos.length === 15,
  );
  check(
    "文档、照片与研究原文逐文件一致",
    [
      ...docs.map((d) => `document/${d.category}/${d.name}`),
      ...photos.map((p) => `photo/${p}`),
      "src/content/research.md",
      "src/content/site.ts",
    ].every(
      (file) =>
        !fs.existsSync(path.join(original, file)) ||
        hash(path.join(original, file)) === hash(file),
    ),
  );
  check(
    "竞速游戏完整保留",
    !fs.existsSync(path.join(original, "game/game.html")) ||
      hash("public/game/game.html") ===
        hash(path.join(original, "game/game.html")),
  );

  const publicMetadata = JSON.parse(
    fs.readFileSync("data/public-metadata.json", "utf8"),
  );
  const snapshot = JSON.parse(fs.readFileSync("data/repos.json", "utf8"));
  const previous = JSON.parse(
    fs.readFileSync(path.join(original, "data/repos.json"), "utf8"),
  );
  check(
    "仓库信息保留，仅替换明确配置的公开描述",
    JSON.stringify(snapshot.repos) ===
      JSON.stringify(applyPublicMetadata(previous.repos, publicMetadata)),
  );
  const privacyRefresh = await verifyPublicMetadata(root);
  fs.writeFileSync(
    "evidence/public-metadata-check.json",
    JSON.stringify(privacyRefresh, null, 2),
  );
  check(
    "实际快照刷新匿名化 JSON 与 JS，并保留其他仓库描述",
    privacyRefresh.publicDescriptions &&
      privacyRefresh.bothFormats &&
      privacyRefresh.unconfiguredUnchanged,
  );
  check(
    "抓取失败或公开描述配置异常时不覆盖已有快照",
    privacyRefresh.failurePreservesFiles &&
      privacyRefresh.invalidConfigPreservesFiles,
  );
  const identity = /\u59dc\u535a\u6eaa|jiang\s+boxi/i;
  const textFiles = (directory) =>
    fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory())
        return ["node_modules", "evidence", ".git"].includes(entry.name)
          ? []
          : textFiles(file);
      return /\.(tsx?|mjs|js|json|md|html|css|txt|svg)$/i.test(entry.name)
        ? [file]
        : [];
    });
  const privateFiles = textFiles(root)
    .filter((file) => identity.test(fs.readFileSync(file, "utf8")))
    .map((file) => path.relative(root, file));
  check(
    "新版源码、内容、说明与生产产物中无真实姓名",
    privateFiles.length === 0,
    privateFiles.join(", "),
  );

  await verifyBlenderModel(check);
  const log = fs.openSync("evidence/test-server.log", "w");
  server = spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "preview",
      "--host",
      "127.0.0.1",
      "--port",
      "5175",
    ],
    { cwd: root, stdio: ["ignore", log, log], windowsHide: true },
  );
  const origin = "http://127.0.0.1:5175";
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(origin)).ok) break;
    } catch {
      /* starting server */
    }
    if (i === 79) throw new Error("Preview server did not start");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({
    channel: process.env.BROWSER_CHANNEL || "msedge",
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 960 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => report.browserErrors.push(error.message));
  const go = async (route) => {
    await page.goto(`${origin}/#${route}`, { waitUntil: "domcontentloaded" });
    if (route !== "city") await page.locator(".inside").waitFor();
    else {
      await page.locator('.model-city[data-model-loaded="true"]').waitFor();
      await page.locator('[data-arrival="done"]').waitFor({ timeout: 15000 });
    }
  };
  await page.goto(`${origin}/#city`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-loading-screen]")).toBeVisible();
  await page.locator('[data-arrival="done"]').waitFor({ timeout: 15000 });
  await page.locator('.model-city[data-model-loaded="true"]').waitFor();
  check("首次进入使用 load 中的小车加载画面", true);
  await expect(page.locator(".city-building")).toHaveCount(7);
  check("首页呈现 7 栋可进入建筑", true);
  await screenshot(page, "home-desktop");
  await audit(page, "桌面首页");
  await verify3DControls(page, check, screenshot);
  await page.locator(".map-overview").click();
  await expect(page.locator(".model-city")).toHaveAttribute(
    "data-view-mode",
    "overview",
  );
  await screenshot(page, "city-overview");
  await page.locator(".map-reset").click();
  check("城市总览与中心复位可用", true);
  const mapBounds = await page.locator(".city-viewport").boundingBox();
  check(
    "城市铺满整个浏览器视口",
    mapBounds.x === 0 &&
      mapBounds.y === 0 &&
      mapBounds.width === 1440 &&
      mapBounds.height === 960,
  );
  const cameraBeforeDrag = await page
    .locator(".model-city")
    .getAttribute("data-camera-target");
  await page.mouse.move(90, 160);
  await page.mouse.down();
  await page.mouse.move(245, 230, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator(".model-city")).not.toHaveAttribute(
    "data-camera-target",
    cameraBeforeDrag,
  );
  check("鼠标拖动移动镜头且不误入建筑", page.url().endsWith("#city"));
  await page.locator(".map-reset").click();
  const beforeRotate = await page
    .locator(".model-city")
    .getAttribute("data-camera-position");
  await page.mouse.move(720, 480);
  await page.mouse.down({ button: "middle" });
  await expect(page.locator(".model-city")).toHaveClass(/is-rotating/);
  await page.mouse.move(900, 360, { steps: 10 });
  await page.mouse.up({ button: "middle" });
  await expect(page.locator(".model-city")).not.toHaveClass(/is-rotating/);
  await expect
    .poll(async () =>
      page.locator(".model-city").getAttribute("data-camera-position"),
    )
    .not.toBe(beforeRotate);
  await page.waitForTimeout(150);
  const afterMiddle = await page
    .locator(".model-city")
    .getAttribute("data-camera-position");
  await page.waitForTimeout(120);
  await expect(page.locator(".model-city")).toHaveAttribute(
    "data-camera-position",
    afterMiddle,
  );
  await page.mouse.move(720, 480);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(900, 360, { steps: 6 });
  await page.mouse.up({ button: "right" });
  await expect(page.locator(".model-city")).toHaveAttribute(
    "data-camera-position",
    afterMiddle,
  );
  check("按住鼠标中键旋转视角，右键拖动不改变视角", true);
  await page.locator(".map-reset").click();
  await page.mouse.move(720, 480);
  await page.mouse.wheel(0, -350);
  await expect
    .poll(async () =>
      Number(
        await page.locator(".city-viewport").getAttribute("data-camera-zoom"),
      ),
    )
    .toBeGreaterThan(1);
  await screenshot(page, "city-explored");
  await page.locator(".map-reset").click();
  await expect(page.locator(".city-viewport")).toHaveAttribute(
    "data-camera-zoom",
    "1.00",
  );
  await page.locator(".zoom-controls button").first().click();
  await expect(page.locator(".city-viewport")).toHaveAttribute(
    "data-camera-zoom",
    "1.20",
  );
  await page.locator(".city-viewport").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".model-city")).not.toHaveAttribute(
    "data-camera-target",
    "[0,1.8,0]",
  );
  await page.keyboard.press("+");
  await expect(page.locator(".city-viewport")).toHaveAttribute(
    "data-camera-zoom",
    "1.44",
  );
  await page.keyboard.press("Home");
  await expect(page.locator(".model-city")).toHaveAttribute(
    "data-camera-target",
    "[0,1.8,0]",
  );
  check("滚轮、缩放按钮、键盘平移缩放与复位可用", true);
  await clickModel(page, "highway");
  await expect(page.locator(".race-veil")).toBeVisible();
  const race = page.frameLocator(".race-frame");
  await expect(race.locator("#mobile-speed")).toBeVisible();
  check(
    "点击上高架经过渡进入原版竞速游戏",
    page.url().includes("/game/play.html"),
  );
  await go("city");
  const touchContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const touchPage = await touchContext.newPage();
  touchPage.on("pageerror", (error) =>
    report.browserErrors.push(error.message),
  );
  await touchPage.goto(`${origin}/#city`, { waitUntil: "networkidle" });
  await touchPage.locator('.model-city[data-model-loaded="true"]').waitFor();
  await touchPage.locator('[data-arrival="done"]').waitFor({ timeout: 15000 });
  const cdp = await touchContext.newCDPSession(touchPage);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { id: 1, x: 125, y: 400 },
      { id: 2, x: 265, y: 400 },
    ],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [
      { id: 1, x: 90, y: 400 },
      { id: 2, x: 300, y: 400 },
    ],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect
    .poll(async () =>
      Number(
        await touchPage
          .locator(".city-viewport")
          .getAttribute("data-camera-zoom"),
      ),
    )
    .toBeGreaterThan(1);
  const touchX = await touchPage
    .locator(".city-viewport")
    .getAttribute("data-camera-target");
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ id: 1, x: 180, y: 420 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ id: 1, x: 130, y: 470 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(touchPage.locator(".city-viewport")).not.toHaveAttribute(
    "data-camera-target",
    touchX,
  );
  check(
    "手机触摸拖动与双指缩放可用且不误入建筑",
    touchPage.url().endsWith("#city"),
  );
  await touchContext.close();

  await page.locator(".guide-button").click();
  await expect(page.locator(".guide-dialog")).toBeVisible();
  await expect(page.locator(".guide-places button")).toHaveCount(7);
  await page.keyboard.press("Escape");
  await expect(page.locator(".guide-dialog")).not.toBeVisible();
  check("城市导览可打开、键盘关闭", true);

  const names = {
    about: "你好，我是",
    projects: "项目大厦",
    research: "Agent 协作体系",
    docs: "文档图书馆",
    album: "摄影馆",
    contact: "如果你也有",
    game: "街角游戏厅",
  };
  for (const [id, name] of Object.entries(names)) {
    await page.locator('.model-city[data-model-loaded="true"]').waitFor();
    await clickModel(page, id);
    await page.waitForURL(`**/#${id}`);
    await expect(page.locator(".inside h1").first()).toContainText(name);
    await page.locator(".back-button").click();
    if (id === "about")
      await expect(page.locator(".entry-transition.is-leave")).toBeVisible();
    await page.waitForURL("**/#city");
    await expect(page.locator(".app")).not.toHaveClass(/is-returning/);
    await page.locator(".city-building").first().waitFor();
  }
  check("全部 7 个建筑入口可用，返回城市有反向过渡", true);
  await page.locator('.model-city[data-model-loaded="true"]').waitFor();
  await clickModel(page, "projects");
  await expect(page.locator(".entry-transition")).toBeVisible();
  await page.waitForURL("**/#projects");
  await expect(page.locator(".repo-card")).toHaveCount(9);
  const repos = JSON.parse(fs.readFileSync("data/repos.json")).repos;
  for (const repo of repos) {
    const link = page.locator(".repo-card").filter({
      has: page.getByRole("heading", { name: repo.name, exact: true }),
    });
    await expect(link).toHaveAttribute("href", repo.url);
    if (repo.description) await expect(link).toContainText(repo.description);
    await expect(link.locator("time")).toHaveText(repo.pushedAt.slice(0, 10));
  }
  check("项目门窗动画、9 个仓库及描述/链接/日期保留", true);
  await screenshot(page, "projects-desktop");
  await audit(page, "项目工作室");
  await go("about");
  await expect(page.locator(".body-copy")).toContainText(
    "从桌面小工具到全栈小应用，边做边学",
  );
  await expect(page.locator(".about-facts")).toContainText(
    "Python · TypeScript",
  );
  await screenshot(page, "about-desktop");
  await expect(page.locator(".inside-about")).not.toContainText(identity);
  check("个人介绍保留学校与技术信息并只使用 APpery", true);

  await go("docs");
  await expect(page.locator(".doc-card")).toHaveCount(19);
  await page.getByRole("link", { name: /fastapi 10/ }).click();
  await expect(page.locator(".doc-card")).toHaveCount(10);
  await page.getByRole("link", { name: /langchain 9/ }).click();
  await expect(page.locator(".doc-card")).toHaveCount(9);
  await page.getByRole("link", { name: /vue 0/ }).click();
  await expect(page.locator(".empty-note")).toBeVisible();
  await page.locator(".doc-tabs a").first().click();
  await page.getByRole("textbox", { name: "查找笔记" }).fill("RAG");
  await expect(page.locator(".doc-card")).toHaveCount(2);
  await page.getByRole("textbox", { name: "查找笔记" }).fill("");
  await screenshot(page, "docs-desktop");
  await audit(page, "文档分类与搜索");
  for (const doc of docs) {
    const slug = doc.name.replace(/\.[^.]+$/, "");
    await go(
      `docs/${encodeURIComponent(doc.category)}/${encodeURIComponent(slug)}`,
    );
    await expect(page.locator(".doc-reader-head h1")).toHaveText(doc.title);
    check(
      `文档可直接访问：${doc.category}/${doc.title}`,
      await page
        .locator(".markdown-body")
        .innerText()
        .then((t) => t.length > 100),
    );
  }
  await go(`docs/fastapi/${encodeURIComponent("001_认识FastAPI与最小应用")}`);
  await page.locator(".doc-pager a").last().click();
  await expect(page.locator(".doc-reader-head h1")).toHaveText(
    "路径参数与查询参数",
  );
  await page.keyboard.press("Escape");
  await expect(page.locator(".doc-tabs .is-active")).toContainText("fastapi");
  await page.keyboard.press("Escape");
  await expect(page.locator(".doc-card")).toHaveCount(19);
  check("文档相邻篇跳转与 Esc 分级返回", true);
  await go(`docs/fastapi/${encodeURIComponent("001_认识FastAPI与最小应用")}`);
  await screenshot(page, "document-desktop");
  await audit(page, "文档阅读器");

  await go("research");
  await expect(page.locator(".research-body pre.mermaid svg")).toHaveCount(2, {
    timeout: 20000,
  });
  await expect(page.locator(".research-body")).toContainText(
    "本机角色与模型映射",
  );
  await screenshot(page, "research-desktop");
  check("研究全文及 2 个 Mermaid 图表正常展示", true);

  await go("album");
  await expect(page.locator(".photo-frame")).toHaveCount(15);
  await page.locator(".photo-frame").first().click();
  await expect(page.locator(".lightbox")).toBeVisible();
  await expect(page.locator(".lightbox-image img")).toHaveJSProperty(
    "complete",
    true,
  );
  await expect(page.locator(".lightbox-image > span")).toHaveText("01 / 15");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".lightbox-image > span")).toHaveText("02 / 15");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator(".lightbox-image > span")).toHaveText("15 / 15");
  await page.keyboard.press("Tab");
  check(
    "照片弹层保持键盘焦点、支持原图与循环翻页",
    (await page.evaluate(() =>
      Boolean(document.activeElement?.closest(".lightbox")),
    )) && Boolean(await page.locator(".photo-original").getAttribute("href")),
  );
  await page.keyboard.press("Escape");
  await expect(page.locator(".lightbox")).not.toBeVisible();
  check("关闭照片后仍停留在相册", page.url().endsWith("#album"));
  await screenshot(page, "album-desktop");
  await audit(page, "摄影馆");

  await go("contact");
  for (const text of [
    "appery003@gmail.com",
    "2465787629",
    "thissappery",
    "github.com/APpery1",
  ])
    await expect(page.locator(".contact-list")).toContainText(text);
  await page.getByRole("button", { name: "复制 微信" }).click();
  check(
    "联系方式复制到真实剪贴板",
    (await page.evaluate(() => navigator.clipboard.readText())) ===
      "thissappery",
  );
  await screenshot(page, "contact-desktop");
  await audit(page, "联系邮局");
  await page.evaluate(() => {
    navigator.clipboard.writeText = async () => {
      throw new Error("clipboard unavailable");
    };
  });
  await page.getByRole("button", { name: "复制 QQ" }).click();
  await expect(page.getByRole("status")).toContainText("手动复制");
  check("剪贴板不可用时提供手动复制提示", true);

  await go("city");
  await page.locator(".airport-locate").click();
  await expect(page.locator(".city-viewport")).toHaveAttribute(
    "data-camera-zoom",
    "1.70",
  );
  await screenshot(page, "airport-desktop");
  await clickModel(page, "airport");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator(".city-airport")).toHaveAttribute(
    "aria-label",
    "Airport, switch to 中文",
  );
  check("机场可定位，点击机场切换到英文", true);
  await page.locator(".map-reset").click();
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await screenshot(page, "home-english");
  check("英文界面与语言偏好刷新后保留", true);
  await go("about");
  await expect(page.locator(".body-copy")).toContainText("I'm APpery");
  await expect(page.locator(".inside-about")).not.toContainText(identity);
  await expect(page.locator('meta[name="description"]')).not.toHaveAttribute(
    "content",
    identity,
  );
  check("英文简介与元信息不包含真实姓名", true);
  await go("city");
  await page.locator(".airport-locate").click();
  await clickModel(page, "airport");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await page.locator(".map-reset").click();
  check("点击机场可切回中文", true);
  await page.locator(".theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "night");
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "night");
  await screenshot(page, "home-night");
  await audit(page, "夜间首页");
  await go("contact");
  await audit(page, "夜间联系页");
  await page.locator(".theme-toggle").click();
  check("日夜切换及偏好刷新后保留", true);

  for (const width of [320, 390, 768, 1366]) {
    await page.setViewportSize({ width, height: width < 760 ? 844 : 768 });
    for (const route of ["city", "contact", "docs", "album"]) {
      await go(route);
      check(
        `${width}px ${route} 无横向溢出`,
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
      );
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await go("city");
  await screenshot(page, "home-mobile");
  await audit(page, "手机首页");
  await page.locator(".map-overview").click();
  await screenshot(page, "city-overview-mobile");
  await expect(page.locator(".model-city")).toHaveAttribute(
    "data-view-mode",
    "overview",
  );
  await page.locator(".map-reset").click();
  await expect(page.locator(".city-viewport")).toHaveAttribute(
    "data-camera-zoom",
    "1.00",
  );
  check("手机总览与复位恢复漫游正常", true);
  await go("contact");
  await screenshot(page, "contact-mobile");
  await audit(page, "手机联系页");
  await go("album");
  await screenshot(page, "album-mobile");
  await go(`docs/fastapi/${encodeURIComponent("001_认识FastAPI与最小应用")}`);
  await screenshot(page, "document-mobile");
  await go("game");
  await page.getByRole("link", { name: "进入游戏" }).click();
  const raceFrame = page.frameLocator(".race-frame");
  await expect(raceFrame.locator("#mobile-speed")).toBeVisible();
  await raceFrame.locator("#race-scene").focus();
  await page.keyboard.down("w");
  await page.waitForFunction(
    () =>
      Number(
        document
          .querySelector(".race-frame")
          ?.contentDocument?.querySelector("#mobile-speed")?.textContent,
      ) > 60,
  );
  await page.keyboard.up("w");
  await raceFrame.locator(".site-back").click();
  await expect(page.locator(".race-veil")).toBeVisible();
  await expect(page.locator(".inside h1").first()).toContainText("项目大厦");
  check("原竞速游戏可运行、可驾驶并可返回新站", true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await go("city");
  await expect(page.locator(".model-city")).toHaveAttribute(
    "data-animation-paused",
    "true",
  );
  const reducedTime = await page
    .locator(".model-city")
    .getAttribute("data-animation-time");
  await page.waitForTimeout(180);
  check(
    "减少动态偏好下模型动画停止",
    reducedTime ===
      (await page.locator(".model-city").getAttribute("data-animation-time")),
  );
  await page.locator(".building-docs").focus();
  await page.keyboard.press("Enter");
  await page.waitForURL("**/#docs");
  check(
    "减少动态偏好下键盘可直接进入建筑",
    (await page.locator(".entry-transition").count()) === 0,
  );
  check(
    "浏览器无未捕获异常",
    report.browserErrors.length === 0,
    report.browserErrors.join(", "),
  );
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.failure = error.stack;
  console.error(error);
  process.exitCode = 1;
} finally {
  fs.writeFileSync(
    "evidence/verification.json",
    JSON.stringify(report, null, 2),
  );
  if (browser) await browser.close();
  if (server) server.kill();
}
