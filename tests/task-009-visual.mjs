#!/usr/bin/env node
/*
 * task-009-visual.mjs — task-009「首页标签与视觉打磨」的任务级验收脚本
 *
 * 运行：node tests/task-009-visual.mjs
 * 退出码：0 = 全部通过；1 = 有检查未通过（逐条打印 PASS/FAIL）或输入缺失
 *
 * 覆盖的验收项（与 tasks.json / task-009 的 acceptance 一一对应）：
 *   G1 标签页标题三处一致，且**运行时** zh 与 en 两条路径都验（只验 zh 会漏掉
 *      「切到英文后 i18n.js 又把 document.title 改回去」）
 *   G2 词典仅 page.title 变更；zh/en 键集合与键顺序不变
 *   G3 index.html 结构契约（相邻兄弟 / id / defer 顺序）+ 过期注释已删除
 *      + 相对 r1 基线**只改了这两处**（逐行比对，防止夹带）
 *   G4 无裸动画，且 **reduce 块内不得出现开启型动画值**（reduce 是压制区，不是免检区）
 *      交错上限由「解析全部 animation-delay 换算为 ms」判定（不再是黑名单正则）
 *      无颜色字面量进入组件规则；新增颜色令牌在浅色模式有覆盖
 *      深色模式既有令牌值逐值未变
 *   G5 浅色/深色对比度四项（WCAG 相对亮度，逐通道 linear 化）
 *      阴影可见性为**同层合取**（∃ 一层 blur >= 6px 且 alpha >= 0.08）
 *      外加：首屏光晕**全部色阶**中对比度最低者的文字对比度（本脚本为新增渐变自设的护栏）
 *   G6 越界哨兵：8 个受保护文件 sha256 未变；js/main.js 零改动
 *
 * ── 明确**不**验证（本环境无浏览器自动化，无截图）──────────────────────────
 *   视觉美观度 / 动效手感 / 窄屏重排 / 真实 OS 浅色主题观感 /
 *   backdrop-filter 的实际渲染效果（只验证规则存在）。
 *   这些属 tasks.json 的 userVerification。**本脚本不产出任何截图**，
 *   也不把「CSS 规则写对了」当作「视觉上好看」。
 *
 * ── 两条已知失败形状的防法（L-004 / L-011）────────────────────────────────
 *   L-004 空过：任何「不含 X」型否定断言，都先配一条肯定断言证明被测分支确实执行过。
 *     本脚本的作法：
 *       · 「过期注释已删除」→ 先断言**基线文件里确实有**该文案（证明删的是真东西）；
 *       · 「无裸动画 / 无颜色字面量 / 浅色覆盖完整」→ 三个检测函数都先用**合成用例**
 *         做负向对照，证明它们在缺陷存在时会报错；
 *       · 「标题三处一致」→ 先用**变异词典**跑一遍运行时，断言标题确实被改成了变异值，
 *         证明这条断言不是「反正都过」。
 *   L-011 顺序/时序：本脚本不写「先/后」类断言。唯一涉及时序的一处是
 *     「切到英文之后标题仍为 APpery1」—— 它真的比较两个事件：先断言
 *     documentElement.lang 已变成 'en'（切换确实发生了），再看标题的值。
 *     若切换没发生，前一条断言会先红，不会让后一条空过。
 *
 * ── 基线来源 ──────────────────────────────────────────────────────────────
 *   doc/collaboration/results/backups/task-009/*.pre-r1（Orchestrator 实测 3/3 与
 *   派发基线逐位相同）。G2/G3/G4 的「相对基线只变了什么」依赖这些文件；
 *   基线缺失即判 FAIL（失败关闭），不静默降级为「跳过」。
 *   ★ 本脚本是**任务级**验收（与 tests/task-004-verify.mjs 同类）。task-008 之后
 *     若合法改动 index.html / i18n-dict.js，需把基线重新指向 task-008 的交付快照。
 *
 * ── task-010 加固（本文件是那次任务的唯一交付物）────────────────────────────
 *   经 tester-002 与 Orchestrator 复核，本脚本原有 4 处**测试资产能力边界**（交付物
 *   styles/main.css 本身正确，是**检测器**看不全）。task-010 全部修在检测器侧，
 *   未改动任何被守护文件：
 *   1. ★ 判据 ③ 由 `blur >= 6 || alpha >= 0.08` 改为**同层合取**（∃ 某一层 blur >= 6
 *      且 alpha >= 0.08）。原析取判据的两臂各自在基线上就已成立 ⇒ 对本次改进零保护，
 *      且洞是**成对**的：M8（删远距层）与 N8（远距层 alpha→0.0039）各从一侧溜过
 *      （L-013 对策②b）。★ 注意不能只把 `||` 换成跨层的 `&&`：近距层的 alpha 会替
 *      远距层答到，N8 依旧全绿。
 *   2. `detectBareAnimations` 不再把 reduce 媒体块整块放行：reduce 内**逐条声明**检查，
 *      只放行 `!important` 与 `none/0s/0.01ms` 这类关闭型取值。
 *   3. 交错上限不再用黑名单正则，改为**解析全部 animation-delay 并换算为 ms**，
 *      断言最大值 <= 200ms（原正则漏 `209ms` 与 `3s`）。
 *   4. 光晕护栏不再只取**首个**色阶却自称「最亮处」，改为取**全部色阶**中合成后
 *      文字对比度**最低**者。
 *   ★ 四处修改都各自配了「正向存在性 + 形态负向对照」，以保证新判据**不空过**（L-004）
 *     且**确实有判别力**（能对错误实现判红）。
 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = (rel) => path.join(ROOT, rel);

const FILES = {
  html: P('index.html'),
  css: P('styles/main.css'),
  dict: P('js/i18n-dict.js'),
  i18n: P('js/i18n.js'),
  main: P('js/main.js'),
  backupHtml: P('doc/collaboration/results/backups/task-009/index.html.pre-r1'),
  backupCss: P('doc/collaboration/results/backups/task-009/main.css.pre-r1'),
  backupDict: P('doc/collaboration/results/backups/task-009/i18n-dict.js.pre-r1')
};

/* 越界哨兵：本任务 allowedPaths 之外、受前序任务保护的文件。
   ★ js/i18n-dict.js **不在**本表内 —— 本任务明确放行它的 page.title 单键变更。 */
const SENTINELS = {
  'js/i18n.js': '5bc6f607946b644193aa82b00799533ba9d55e8c164b8fcee685cb5934762263',
  'js/main.js': 'c2b634c67c92b39f77920b45929e64c91b1dda2b813b6165326e4d5e1bad0876',
  'data/site-config.json': '8568ecc7341d9356b77bafa155e67f61e70f2ff37d01490e57cb3156eef32d34',
  'data/repo-overrides.json': '083da23584e045ef6cd3a9a7c48360851b5dcbba47f152b6c70f828f24d2d8f6',
  'data/repos.json': 'd328fc0705579dee84f9523d5220aadad8c5050f56b7ce41681dec2df987d17c',
  'data/repos.js': '1d203e58ff2c14a214a442f5cf5175fdc7d06f23048db97bbc485faf2db217bd',
  'tests/task-003-render.mjs': '6c2134c68fcb875e31a6e962192a4035e1d70a7e6d44bcff9de5bb6f35a8da92',
  'tests/task-004-verify.mjs': 'e5772eea5b870ed67dc9af0daa7149826fda6daee4884c50fed967b6cce575c6'
};

const EXPECTED_TITLE = 'APpery1';
const RETURN_ORDER = ['/js/i18n-dict.js', '/js/i18n.js', '/data/repos.js', '/js/main.js'];
const EXPIRED_COMMENT_PHRASE = '404 是预期的';

/* ------------------------------------------------------------------ *
 * 断言记账
 * ------------------------------------------------------------------ */

const stats = new Map();
const failures = [];
const infos = [];

function check(group, title, condition, detail) {
  const entry = stats.get(group) || { pass: 0, fail: 0 };
  if (condition) {
    entry.pass += 1;
    stats.set(group, entry);
    console.log(`  PASS [${group}] ${title}`);
  } else {
    entry.fail += 1;
    stats.set(group, entry);
    const message = detail ? `${title} → ${detail}` : title;
    failures.push({ group, title: message });
    console.log(`  FAIL [${group}] ${message}`);
  }
  return Boolean(condition);
}

function info(group, title, detail) {
  infos.push(`[${group}] ${title}: ${detail}`);
  console.log(`  INFO [${group}] ${title}: ${detail}`);
}

function section(title) {
  console.log(`\n== ${title} ==`);
}

/* ------------------------------------------------------------------ *
 * 通用工具
 * ------------------------------------------------------------------ */

const readFile = (p) => fs.readFileSync(p, 'utf8');
const sha256 = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

function lineOf(src, index) {
  let n = 1;
  for (let i = 0; i < index && i < src.length; i += 1) {
    if (src[i] === '\n') n += 1;
  }
  return n;
}

/* ------------------------------------------------------------------ *
 * CSS 解析：只做本脚本需要的最小实现（不需要完整 CSS 解析器）
 * ------------------------------------------------------------------ */

/* 注释替换成等长空白（保留换行），使行号与原文一致；
   同时避免把注释里的颜色字面量 / 动画属性当代码扫到。 */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

/* 返回规则列表；把 @media / @supports 递归展开，mediaStack 记录所在媒体查询。
   @keyframes 等其它 at-rule 当作叶子（其内部不是普通声明块）。

   行号还原：递归切片后仍要报出**原文件**的行号。做法是给每个切片带一个 lineBase
   （该切片首字符所在的绝对行号），切片内第 j 个字符的绝对行 = lineBase + lineOf(slice, j) - 1。
   关系恒成立：绝对行号 = lineBase_parent + lineOf(parent, localStart) - 1。 */
function parseRules(css, mediaStack = [], lineBase = 1) {
  const rules = [];
  const n = css.length;
  let i = 0;

  while (i < n) {
    while (i < n && /\s/.test(css[i])) i += 1;
    if (i >= n) break;

    const preludeStart = i;
    while (i < n && css[i] !== '{' && css[i] !== '}' && css[i] !== ';') i += 1;
    if (i >= n) break;

    const prelude = css.slice(preludeStart, i).trim();
    if (css[i] === '}' || css[i] === ';') {
      i += 1;
      continue;
    }

    /* css[i] === '{' */
    const localBodyStart = i + 1;
    let depth = 1;
    i += 1;
    while (i < n && depth > 0) {
      if (css[i] === '{') depth += 1;
      else if (css[i] === '}') depth -= 1;
      i += 1;
    }
    const body = css.slice(localBodyStart, i - 1);
    const line = lineBase + lineOf(css, preludeStart) - 1;
    const bodyLineBase = lineBase + lineOf(css, localBodyStart) - 1;

    if (/^@(media|supports)\b/.test(prelude)) {
      rules.push(...parseRules(body, mediaStack.concat([prelude]), bodyLineBase));
    } else if (/^@/.test(prelude)) {
      rules.push({ kind: 'at', prelude, body, mediaStack, line, bodyLineBase });
    } else {
      rules.push({ kind: 'style', selector: prelude, body, mediaStack, line, bodyLineBase });
    }
  }
  return rules;
}

/* 把声明块切成 [{prop, value, line}]；按括号深度切分，避免被 var(..., ...) 里的逗号骗到。
   行号由 rule.bodyLineBase 还原，因此调用方不必再传整份 CSS。 */
function declarations(rule) {
  const out = [];
  const body = rule.body;
  let depth = 0;
  let start = 0;
  const spans = [];
  for (let i = 0; i < body.length; i += 1) {
    const c = body[i];
    if (c === '(') depth += 1;
    else if (c === ')') depth -= 1;
    else if (c === ';' && depth === 0) {
      spans.push([start, i]);
      start = i + 1;
    }
  }
  spans.push([start, body.length]);

  for (const [s, e] of spans) {
    const text = body.slice(s, e);
    const colon = text.indexOf(':');
    if (colon < 0) continue;
    const prop = text.slice(0, colon).trim().toLowerCase();
    const value = text.slice(colon + 1).trim();
    if (!prop || !value) continue;
    const line = typeof rule.bodyLineBase === 'number'
      ? rule.bodyLineBase + lineOf(body, s) - 1
      : rule.line;
    out.push({ prop, value, line, selector: rule.selector || rule.prelude });
  }
  return out;
}

const isNoPreference = (stack) => stack.some((s) => /prefers-reduced-motion\s*:\s*no-preference/.test(s));
const isReduce = (stack) => stack.some((s) => /prefers-reduced-motion\s*:\s*reduce/.test(s));
const isLightScheme = (stack) => stack.some((s) => /prefers-color-scheme\s*:\s*light/.test(s));

const ANIMATION_PROPS = new Set([
  'animation',
  'animation-name',
  'animation-duration',
  'animation-delay',
  'animation-timing-function',
  'animation-iteration-count',
  'animation-direction',
  'animation-fill-mode',
  'animation-play-state'
]);

/* 「关闭型」动画取值：这些取值不会让元素真的动起来（none / 零时长 / 0.01ms 的压制时长）。 */
const DISABLING_ANIMATION_VALUES = new Set(['none', '0s', '0ms', '0.01ms', '0.001s']);

/* 该动画声明是否「开启型」——即会与「减少动态」偏好直接冲突的那种。
   ★ 判定口径（来自 task-010 的 deliverable / ISSUE-2）：
     · 带 `!important` 的一律放行 —— reduce 块里的压制手段正是 `... !important`，
       它优先级最高，确实能压住别处的动画；
     · 值是 none / 0s / 0.01ms 这类关闭型字面量 → 放行；
     · 其余一律算开启型（`animation: fade 1s ease-out infinite` 没有单位限制）→ 违规。 */
function isEnablingAnimationValue(value) {
  if (/!important\s*$/i.test(value)) return false;
  return !DISABLING_ANIMATION_VALUES.has(String(value).trim().toLowerCase());
}

/* 裸动画检测：位于 prefers-reduced-motion 之外的一切动画属性 / @keyframes 都算缺陷。
   ★ 这里是**否定**断言，故调用方另配合成用例负向对照（见 G4）。

   ★★ ISSUE-2（task-010 修）：本函数原先的写法是
        const guarded = isNoPreference(stack) || isReduce(stack);
        if (rule.kind !== 'style' || guarded) continue;
      即「只要媒体栈里出现 reduce，这条规则就整体放行」。这在方向上是错的：
      reduce 块的作用是**压制**动效，它内部理应只出现关闭型取值；一条整体放行的规则
      意味着 `@media (prefers-reduced-motion: reduce) { .card { animation: fade 2s infinite } }`
      ——也就是与用户的「减少动态」偏好**正面冲突**的代码——能整条溜过检测器。
      ⇒ 现改为：no-preference 仍然整块放行（那是显式的「我就是要动效」选择）；
        reduce 内**逐条声明**检查，只放行 `!important` 与关闭型字面量。 */
function detectBareAnimations(cssText) {
  const css = stripComments(cssText);
  const rules = parseRules(css);
  const violations = [];

  for (const rule of rules) {
    const inNoPreference = isNoPreference(rule.mediaStack);
    const inReduce = isReduce(rule.mediaStack);

    /* @keyframes 只是「定义一个动画」，本身不驱动任何元素 ⇒ 位于
       no-preference 或 reduce 内都放行（reduce 内定义、但只要没有开启型声明引用它，
       就不会真的动起来）；两者之外才算裸定义。 */
    if (rule.kind === 'at' && /^@keyframes\b/.test(rule.prelude)) {
      if (!inNoPreference && !inReduce) {
        violations.push({ line: rule.line, what: rule.prelude, why: '@keyframes 未位于 prefers-reduced-motion 内' });
      }
      continue;
    }
    if (rule.kind !== 'style') continue;
    if (inNoPreference) continue; /* 显式选择开启动效：整块放行 */

    for (const d of declarations(rule)) {
      if (!ANIMATION_PROPS.has(d.prop)) continue;
      if (!inReduce) {
        violations.push({
          line: d.line,
          what: `${d.selector} { ${d.prop}: ${d.value} }`,
          why: '动画属性未位于 prefers-reduced-motion 内'
        });
        continue;
      }
      /* reduce 内：只放行关闭型取值（含 !important 的压制声明） */
      if (isEnablingAnimationValue(d.value)) {
        violations.push({
          line: d.line,
          what: `${d.selector} { ${d.prop}: ${d.value} }`,
          why: 'reduce 块内出现**开启型**动画值，与「减少动态」偏好直接冲突'
        });
      }
    }
  }
  return violations;
}

/* 收集所有声明了 transition* 的选择器（用于「过渡是否可追溯」的取证与计数） */
function collectTransitionDeclarations(cssText) {
  const css = stripComments(cssText);
  const rules = parseRules(css);
  const out = [];
  for (const rule of rules) {
    if (rule.kind !== 'style') continue;
    for (const d of declarations(rule)) {
      if (d.prop === 'transition' || d.prop.startsWith('transition-')) {
        out.push({ line: d.line, selector: d.selector, prop: d.prop, value: d.value });
      }
    }
  }
  return out;
}

/* 把一条 animation-delay 的值解析成**毫秒**数组（支持逗号分隔的多值与 ms / s 两种单位）。
   ★ ISSUE-3（task-010 修）：原判据用黑名单正则 `!/animation-delay:\s*(?:2[1-9]\d|[3-9]\d\d|\d{4,})ms/`
     去挡「超过 200ms」的延迟，有三个独立的洞：
       · `2[1-9]\d` 要求第二位是 1–9，于是 **209ms 漏过**；
       · 正则只匹配 `ms` 后缀，于是 `3s`（=3000ms）**漏过**（它连单位都不对）；
       · 一切书写形式的变体（`0.3s`、`201ms` 之外的 `209 ms` 带空格…）都要靠正则穷举，
         而穷举是**黑名单**——列不全就漏。
     ⇒ 改为**解析全部数值并换算成毫秒**，断言最大值 <= 200ms。白名单式判定，
       单位与书写形式都不再是洞。 */
function parseDelayMs(value) {
  const out = [];
  for (const part of String(value).split(',')) {
    const m = /^\s*(-?(?:\d+\.?\d*|\.\d+))\s*(ms|s)?\s*$/i.exec(part);
    if (!m) continue;
    const n = parseFloat(m[1]);
    const unit = (m[2] || '').toLowerCase();
    if (unit === 's') out.push(n * 1000);
    else if (unit === 'ms') out.push(n);
    else if (n === 0) out.push(0); /* 裸 0 是合法的零时长；裸非零数字在 CSS 里无效，忽略 */
  }
  return out;
}

/* 阴影可见性的**同层**判据：返回「同时满足 blur >= 6 且 alpha >= 0.08」的层。
   ★★ ISSUE-1 / L-013 对策②b（task-010 修）：原判据是
        maxBlur >= 6 || maxAlpha >= 0.08
     两个臂**各自在基线上就已成立**（基线 .card 的近距层 alpha = 0x1f/255 = 0.1216 >= 0.08），
     于是整条判据对「本次新增的远距层」零保护：
       · M8 删掉远距层 ⇒ blur 臂失效，但 alpha 臂救场 ⇒ 绿；
       · N8 把远距层 alpha 压到 0.0039 ⇒ alpha 臂仍由近距层撑着 ⇒ 绿。
     ★ 修法**不能**只是把 `||` 改成 `&&`：`maxBlur >= 6 && maxAlpha >= 0.08` 是**跨层取最大值**，
       近距层的 alpha（0.1216）会替远距层的 alpha（0.0039）答到，N8 依旧全绿（见报告中的实测）。
     ⇒ 必须把两个条件**钉在同一层上**：∃ 某一层，其 blur >= 6 且 alpha >= 0.08。 */
function visibleShadowLayers(layers, minBlur = 6, minAlpha = 0.08) {
  return layers.filter((l) => l.blur >= minBlur && l.alpha >= minAlpha);
}

/* 组件规则里的颜色字面量检测。
   允许：:root（令牌块，第 1、2 节的换肤入口）以及 transparent / currentColor / inherit。 */
const NAMED_COLORS = [
  'red', 'blue', 'green', 'black', 'white', 'gray', 'grey', 'yellow', 'orange', 'purple',
  'pink', 'brown', 'cyan', 'magenta', 'lime', 'navy', 'teal', 'olive', 'maroon', 'silver',
  'gold', 'beige', 'ivory', 'coral', 'salmon', 'khaki', 'violet', 'indigo', 'turquoise',
  'azure', 'tan', 'plum', 'orchid', 'lavender', 'chartreuse', 'aqua', 'fuchsia', 'crimson'
];
const LITERAL_PATTERNS = [
  { re: /#[0-9a-fA-F]{3,8}\b/, kind: 'hex' },
  { re: /\brgba?\s*\(/, kind: 'rgb()' },
  { re: /\bhsla?\s*\(/, kind: 'hsl()' },
  { re: /\b(?:oklch|oklab|lch|lab)\s*\(/, kind: '现代颜色函数' },
  { re: new RegExp(`\\b(?:${NAMED_COLORS.join('|')})\\b`, 'i'), kind: '颜色关键字' }
];

function detectColorLiterals(cssText) {
  const css = stripComments(cssText);
  const rules = parseRules(css);
  const violations = [];

  for (const rule of rules) {
    if (rule.kind !== 'style') continue;
    if (rule.selector.trim() === ':root') continue; /* 令牌块：换肤只改这里，允许字面量 */
    for (const d of declarations(rule)) {
      /* 先摘掉 var() 引用，避免把 --color-red 之类的令牌名当成关键字 */
      const scanned = d.value.replace(/var\([^()]*(?:\([^()]*\)[^()]*)*\)/g, ' ');
      for (const { re, kind } of LITERAL_PATTERNS) {
        const m = re.exec(scanned);
        if (m) {
          violations.push({
            line: d.line,
            what: `${d.selector} { ${d.prop}: ${d.value} }`,
            why: `出现${kind}字面量 ${m[0]}`
          });
          break;
        }
      }
    }
  }
  return violations;
}

/* 取令牌表：base = 顶层 :root（深色默认）；light = @media (prefers-color-scheme: light) 内的 :root。
   响应式断点里的 :root（只改布局令牌）两边都不算。 */
function extractTokens(cssText) {
  const css = stripComments(cssText);
  const rules = parseRules(css);
  const base = {};
  const light = {};
  const baseOrder = [];
  const lightOrder = [];

  for (const rule of rules) {
    if (rule.kind !== 'style' || rule.selector.trim() !== ':root') continue;
    let target = null;
    let order = null;
    if (isLightScheme(rule.mediaStack)) {
      target = light;
      order = lightOrder;
    } else if (rule.mediaStack.length === 0) {
      target = base;
      order = baseOrder;
    }
    if (!target) continue;
    for (const d of declarations(rule)) {
      if (!d.prop.startsWith('--')) continue;
      if (!(d.prop in target)) order.push(d.prop);
      target[d.prop] = d.value;
    }
  }
  return { base, light, baseOrder, lightOrder };
}

const colorTokensOf = (tokens) => Object.keys(tokens).filter((k) => k.startsWith('--color-'));

/* 浅色覆盖完整性：每个 --color-* 令牌都必须有浅色取值。
   ★ 否定式检查，调用方需配合成用例负向对照。 */
function detectMissingLightOverrides(tokens) {
  const missing = [];
  for (const key of colorTokensOf(tokens.base)) {
    if (!(key in tokens.light)) missing.push(key);
  }
  const orphan = [];
  for (const key of Object.keys(tokens.light)) {
    if (!(key in tokens.base)) orphan.push(key);
  }
  return { missing, orphan };
}

/* var() 递归展开（最多 6 层，足够覆盖 --shadow-surface → --shadow-card → --color-shadow） */
function resolveVars(value, tokens, depth = 0) {
  if (depth > 6 || !value.includes('var(')) return value;
  const next = value.replace(/var\(\s*(--[a-zA-Z0-9-]+)\s*(?:,([^()]*))?\)/g, (m, name, fallback) => {
    if (name in tokens) return tokens[name];
    if (typeof fallback === 'string') return fallback.trim();
    return ' ';
  });
  if (next === value) return next;
  return resolveVars(next, tokens, depth + 1);
}

/* ------------------------------------------------------------------ *
 * 颜色与对比度（WCAG 2.x 相对亮度）
 * ------------------------------------------------------------------ */

function parseColor(text) {
  const m = /^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/.exec(text.trim());
  if (!m) return null;
  const hex = m[1];
  const alpha = m[2] ? parseInt(m[2], 16) / 255 : 1;
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
    a: alpha
  };
}

const srgbToLinear = (c255) => {
  const c = c255 / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

const luminance = (c) => 0.2126 * srgbToLinear(c.r) + 0.7152 * srgbToLinear(c.g) + 0.0722 * srgbToLinear(c.b);

function contrast(c1, c2) {
  const a = luminance(c1);
  const b = luminance(c2);
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}

/* 把半透明前景合成到不透明背景上（用于光晕 / 半透明顶栏的合成对比度） */
function composite(fg, bg) {
  const a = fg.a;
  return {
    r: a * fg.r + (1 - a) * bg.r,
    g: a * fg.g + (1 - a) * bg.g,
    b: a * fg.b + (1 - a) * bg.b,
    a: 1
  };
}

const round = (v, digits = 2) => Number(v.toFixed(digits));

/* 把 box-shadow 值解析成层 [{blur, alpha, raw}]（每个颜色分量已解析为 alpha） */
function parseShadowLayers(resolved) {
  const layers = [];
  let depth = 0;
  let start = 0;
  const spans = [];
  for (let i = 0; i < resolved.length; i += 1) {
    const c = resolved[i];
    if (c === '(') depth += 1;
    else if (c === ')') depth -= 1;
    else if (c === ',' && depth === 0) {
      spans.push(resolved.slice(start, i));
      start = i + 1;
    }
  }
  spans.push(resolved.slice(start));

  for (const raw of spans) {
    const layer = raw.trim();
    if (!layer) continue;
    const colorMatch = /#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?/.exec(layer);
    const color = colorMatch ? parseColor(colorMatch[0]) : null;
    const numeric = layer.replace(/#[0-9a-fA-F]{3,8}/g, ' ').replace(/\brgba?\([^)]*\)/g, ' ');
    /* ★ 长度必须允许**无单位的 0**：`0 1px 2px #0f172a1f` 里 x 偏移写作裸 0，
       若要求每个数都带单位，取到的数组会变成 ['1px','2px']，于是把 y 偏移当成模糊半径、
       真正的模糊半径被丢掉（本脚本第一版就如此，报出的 blur 全是 0）。 */
    const lengths = numeric.match(/-?(?:\d+\.?\d*|\.\d+)/g) || [];
    const blur = lengths.length >= 3 ? parseFloat(lengths[2]) : 0;
    layers.push({ raw: layer, blur, alpha: color ? color.a : 1, color });
  }
  return layers;
}

/* 解析渐变里**全部**色阶（颜色字面量），按出现顺序返回。
   ★ ISSUE-4（task-010 修）：光晕护栏原先只取 `/#[0-9a-fA-F]{6}(...)?/.exec(resolved)`，
     即**第一个**十六进制颜色，却把断言文案写成「光晕**最亮处**」。
     两者只在「渐变只有一层色阶、且它恰是最亮的」时才等价 —— 这是**未言明的巧合**，
     不是判据的性质：一旦渐变变成多色阶（或把亮色阶放到后面），护栏就会拿最亮的
     那个色阶之外的某个值去算对比度，从而**低估**风险、静默放行。
     ⇒ 改为解析全部色阶，断言取其中**对比度最低**者（见 G5）。
     `transparent` 按规范等价于 rgba(0,0,0,0)，合成到任何底色上都得到底色本身，
     因此它是一个**真实存在**的色阶、必须一并参与取最低值。 */
function parseGradientStops(resolved) {
  const stops = [];
  const re = /#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?|\btransparent\b|\brgba?\([^)]*\)|\bhsla?\([^)]*\)/g;
  let m;
  while ((m = re.exec(resolved)) !== null) {
    if (/^transparent$/i.test(m[0])) {
      stops.push({ raw: m[0], color: { r: 0, g: 0, b: 0, a: 0 } });
      continue;
    }
    const color = parseColor(m[0]);
    if (color) stops.push({ raw: m[0], color });
  }
  return stops;
}

/* ------------------------------------------------------------------ *
 * 词条表 / 运行时桩
 * ------------------------------------------------------------------ */

/* 在 vm 沙箱里跑 i18n-dict.js，取回 DICT（不依赖 require，
   避免 package.json 的 type 字段影响 .js 的模块判定） */
function loadDictModule(src) {
  const sandbox = {};
  sandbox.module = { exports: {} };
  vm.createContext(sandbox);
  new vm.Script(src, { filename: 'i18n-dict.js' }).runInContext(sandbox);
  return sandbox.module.exports;
}

/* 从真实 index.html 抽出 [data-i18n] 键位，避免桩与真实页面脱节 */
function extractI18nKeys(html) {
  const keys = [];
  const re = /data-i18n="([^"]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) keys.push(m[1]);
  return keys;
}

/*
 * 运行时桩：只实现 i18n.js 真正用到的 API。
 * ★ 桩里记的是**真实交互序列**：点击 .lang-toggle 的 handler 被收集下来，
 *   由调用方显式触发，因此「切到英文」这条路径是真的被走了一遍。
 */
function createI18nHarness({ dict, html, initialLang = null }) {
  const keys = extractI18nKeys(html);
  const nodes = keys.map((key) => ({
    __key: key,
    textContent: '__untouched__',
    getAttribute(name) {
      return name === 'data-i18n' ? key : null;
    }
  }));

  const toggleListeners = [];
  const toggle = {
    addEventListener(type, fn) {
      if (type === 'click') toggleListeners.push(fn);
    }
  };

  const store = {};
  if (initialLang) store['appery-lang'] = initialLang;

  const documentStub = {
    readyState: 'complete',
    title: '（桩初始标题）',
    documentElement: { lang: 'zh-CN' },
    addEventListener() {},
    querySelectorAll(selector) {
      return selector === '[data-i18n]' ? nodes : [];
    },
    querySelector(selector) {
      return selector === '.lang-toggle' ? toggle : null;
    }
  };

  const sandbox = {
    document: documentStub,
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => {
        store[k] = String(v);
      }
    },
    setTimeout: () => 0,
    clearTimeout: () => {}
  };
  sandbox.window = sandbox;
  sandbox.__I18N_DICT__ = dict;

  vm.createContext(sandbox);
  const ctx = sandbox;

  /* 词典已按真实加载顺序（i18n-dict.js 先于 i18n.js）注入 sandbox.__I18N_DICT__，
     调用方随后用 runI18n() 执行 i18n.js —— 与浏览器里的 defer 顺序一致。 */

  return {
    sandbox: ctx,
    nodes,
    store,
    document: documentStub,
    runI18n(i18nSrc) {
      new vm.Script(i18nSrc, { filename: 'i18n.js' }).runInContext(ctx);
    },
    clickToggle() {
      if (toggleListeners.length === 0) return false;
      toggleListeners[0]();
      return true;
    },
    nodeText(key) {
      const node = nodes.find((n) => n.__key === key);
      return node ? node.textContent : null;
    },
    toggleListenerCount: () => toggleListeners.length
  };
}

/* ------------------------------------------------------------------ *
 * 主流程
 * ------------------------------------------------------------------ */

function main() {
  const html = readFile(FILES.html);
  const cssRaw = readFile(FILES.css);
  const dictSrc = readFile(FILES.dict);
  const i18nSrc = readFile(FILES.i18n);
  const backup = {
    html: readFile(FILES.backupHtml),
    css: readFile(FILES.backupCss),
    dict: readFile(FILES.backupDict)
  };

  const DICT = loadDictModule(dictSrc);
  const ZHDICT = loadDictModule(dictSrc);
  const ENMUT = loadDictModule(dictSrc);

  /* ================================================================ *
   * G1 标签页标题
   * ================================================================ */
  section('G1 标签页标题（index.html / 词典 zh / 词典 en / 运行时 zh / 运行时 en）');

  /* --- 静态三处 --- */
  const titleMatches = html.match(/<title>[\s\S]*?<\/title>/g) || [];
  check('G1', 'index.html 恰有 1 个 <title> 元素', titleMatches.length === 1, `实际 ${titleMatches.length} 个`);
  const titleText = titleMatches.length === 1 ? titleMatches[0].replace(/^<title>|<\/title>$/g, '') : null;
  check('G1', `index.html 的 <title> 文本恰为 ${EXPECTED_TITLE}`, titleText === EXPECTED_TITLE, `实际 ${JSON.stringify(titleText)}`);

  check('G1', "词典 zh 的 page.title 恰为 " + EXPECTED_TITLE,
    DICT.zh['page.title'] === EXPECTED_TITLE, `实际 ${JSON.stringify(DICT.zh['page.title'])}`);
  check('G1', "词典 en 的 page.title 恰为 " + EXPECTED_TITLE,
    DICT.en['page.title'] === EXPECTED_TITLE, `实际 ${JSON.stringify(DICT.en['page.title'])}`);
  check('G1', '三处一致（index.html / zh / en）',
    titleText === EXPECTED_TITLE && DICT.zh['page.title'] === titleText && DICT.en['page.title'] === titleText);

  /* --- 运行时 zh：i18n.js 在 applyLang 时按键覆写 document.title --- */
  const zhHarness = createI18nHarness({ dict: ZHDICT, html });
  zhHarness.runI18n(i18nSrc);
  check('G1', '运行时桩已绑定 .lang-toggle 的 click（否则后面的 en 路径是空跑）',
    zhHarness.toggleListenerCount() === 1, `实际绑定 ${zhHarness.toggleListenerCount()} 个 listener`);
  check('G1', '运行时桩确实被 i18n.js 改写（[data-i18n] 节点已被赋值，证明 applyLang 跑过）',
    zhHarness.nodeText('nav.about') === ZHDICT.zh['nav.about'],
    `nav.about 节点实际为 ${JSON.stringify(zhHarness.nodeText('nav.about'))}`);
  check('G1', '运行时 zh：document.title 恰为 ' + EXPECTED_TITLE,
    zhHarness.document.title === EXPECTED_TITLE, `实际 ${JSON.stringify(zhHarness.document.title)}`);

  /* --- 运行时 en（经真实 toggle 切换）--- */
  const clicked = zhHarness.clickToggle();
  check('G1', '切换按钮的 click handler 确实被触发', clicked === true);
  /* ★ L-011：先确认「切换真的发生了」，再断言标题 —— 否则标题断言可能空过 */
  check('G1', '切换后 documentElement.lang 已变为 en（证明 applyLang("en") 确实执行）',
    zhHarness.document.documentElement.lang === 'en',
    `实际 ${JSON.stringify(zhHarness.document.documentElement.lang)}`);
  check('G1', '切换后 [data-i18n] 节点已换成英文（applyLang("en") 的第二条证据）',
    zhHarness.nodeText('nav.about') === ZHDICT.en['nav.about'],
    `nav.about 节点实际为 ${JSON.stringify(zhHarness.nodeText('nav.about'))}`);
  check('G1', '切换后 localStorage 记为 en',
    zhHarness.store['appery-lang'] === 'en', `实际 ${JSON.stringify(zhHarness.store['appery-lang'])}`);
  check('G1', '★ 运行时 en：document.title 仍恰为 ' + EXPECTED_TITLE + '（切英文后未被改回去）',
    zhHarness.document.title === EXPECTED_TITLE, `实际 ${JSON.stringify(zhHarness.document.title)}`);

  /* --- 运行时 en（直接以 en 启动，覆盖「localStorage 已是 en」的路径）--- */
  const enHarness = createI18nHarness({ dict: ENMUT, html, initialLang: 'en' });
  enHarness.runI18n(i18nSrc);
  check('G1', '直接以 en 启动时 documentElement.lang 为 en（证明走的是 en 分支）',
    enHarness.document.documentElement.lang === 'en',
    `实际 ${JSON.stringify(enHarness.document.documentElement.lang)}`);
  check('G1', '直接以 en 启动时 document.title 仍恰为 ' + EXPECTED_TITLE,
    enHarness.document.title === EXPECTED_TITLE, `实际 ${JSON.stringify(enHarness.document.title)}`);

  /* --- 变异对照：证明上面这条断言不是「反正都过」 --- */
  let mutated = false;
  try {
    const mutatedDict = loadDictModule(dictSrc);
    mutatedDict.en['page.title'] = 'MUTATED-TITLE-SENTINEL';
    const mutantHarness = createI18nHarness({ dict: mutatedDict, html, initialLang: 'en' });
    mutantHarness.runI18n(i18nSrc);
    mutated = mutantHarness.document.title === 'MUTATED-TITLE-SENTINEL';
  } catch (err) {
    mutated = false;
  }
  check('G1', '负向对照：把 en 的 page.title 变异后，运行时标题确实变成变异值（证明本组断言有判别力）',
    mutated === true);

  /* ================================================================ *
   * G2 词典：仅 page.title 变更
   * ================================================================ */
  section('G2 词条表（zh/en 键集合与顺序不变；仅 page.title 值变更）');

  const BASE_DICT = loadDictModule(backup.dict);
  check('G2', '基线词条表可读且含 zh/en',
    Boolean(BASE_DICT && BASE_DICT.zh && BASE_DICT.en));

  const zhKeys = Object.keys(DICT.zh);
  const enKeys = Object.keys(DICT.en);
  const baseZhKeys = Object.keys(BASE_DICT.zh);
  const baseEnKeys = Object.keys(BASE_DICT.en);

  check('G2', 'zh 与 en 键集合相同', JSON.stringify([...zhKeys].sort()) === JSON.stringify([...enKeys].sort()));
  check('G2', 'zh 键数量与基线一致', zhKeys.length === baseZhKeys.length, `当前 ${zhKeys.length}，基线 ${baseZhKeys.length}`);
  check('G2', 'en 键数量与基线一致', enKeys.length === baseEnKeys.length, `当前 ${enKeys.length}，基线 ${baseEnKeys.length}`);
  check('G2', 'zh 键**顺序**与基线逐位一致',
    JSON.stringify(zhKeys) === JSON.stringify(baseZhKeys),
    diffFirst(zhKeys, baseZhKeys));
  check('G2', 'en 键**顺序**与基线逐位一致',
    JSON.stringify(enKeys) === JSON.stringify(baseEnKeys),
    diffFirst(enKeys, baseEnKeys));

  const changed = [];
  for (const lang of ['zh', 'en']) {
    for (const key of Object.keys(BASE_DICT[lang])) {
      if (!(key in DICT[lang])) continue;
      if (DICT[lang][key] !== BASE_DICT[lang][key]) changed.push(`${lang}.${key}`);
    }
  }
  check('G2', '相对基线**仅** page.title（zh、en 各一处）的值变更',
    JSON.stringify([...changed].sort()) === JSON.stringify(['en.page.title', 'zh.page.title']),
    `实际变更集 ${JSON.stringify(changed)}`);

  /* ================================================================ *
   * G3 index.html 结构与过期注释
   * ================================================================ */
  section('G3 index.html 结构契约 与 过期注释清理');

  check('G3', 'index.html 含 id="project-grid"', html.includes('id="project-grid"'));
  check('G3', 'index.html 含 id="projects-empty"', html.includes('id="projects-empty"'));
  check('G3', 'index.html 含 id="lang-toggle"', html.includes('id="lang-toggle"'));
  check('G3', 'index.html 含 .project-grid 与 .empty-state 类名',
    html.includes('class="project-grid"') && html.includes('class="empty-state"'));
  check('G3', '★ .project-grid 与 .empty-state 仍为**相邻兄弟**（空状态显隐机制的前提）',
    /<div class="project-grid" id="project-grid"><\/div>\s*<p class="empty-state" id="projects-empty"/.test(html));
  check('G3', '★ 未给 #projects-empty 加内联样式（会与相邻兄弟规则打架）',
    !/<p class="empty-state" id="projects-empty"[^>]*\sstyle=/.test(html));

  const scriptTags = html.match(/<script[^>]*><\/script>/g) || [];
  check('G3', 'index.html 恰有 4 个外链 script 标签', scriptTags.length === 4, `实际 ${scriptTags.length} 个`);
  const srcOrder = scriptTags.map((t) => (/src="([^"]+)"/.exec(t) || [])[1]);
  check('G3', '★ 四个 script 的 src 顺序仍为 i18n-dict → i18n → repos → main',
    JSON.stringify(srcOrder) === JSON.stringify(RETURN_ORDER), `实际 ${JSON.stringify(srcOrder)}`);
  check('G3', '四个 script 均带 defer 且为空标签',
    scriptTags.every((t) => /\sdefer(\s|>)/.test(t)),
    JSON.stringify(scriptTags));

  /* 过期注释：先证明基线里真有这段文案（否定断言的正向配对，L-004） */
  check('G3', '基线的 index.html 里确实存在该过期文案（证明下面删的是真东西）',
    backup.html.includes(EXPIRED_COMMENT_PHRASE) && backup.html.includes('尚不存在'));
  check('G3', '★ 过期注释已删除：index.html 不再出现「' + EXPIRED_COMMENT_PHRASE + '」',
    !html.includes(EXPIRED_COMMENT_PHRASE));
  check('G3', '★ 过期注释已删除：index.html 不再出现「尚不存在」', !html.includes('尚不存在'));

  /* 相对基线只改了这两处：把「标题」与「待删注释块」归一化后逐行比对。
     ★ 注释块必须**逐个注释**匹配后再筛，不能用 <!--[\s\S]*?尚不存在[\s\S]*?-->
       一把梭 —— 那会从文件里**第一个** <!-- 开始吞，把中间大段内容一起吃掉，
       等于在归一化阶段就把差异抹平，使这条比对恒真（自造的空过）。 */
  const dropExpiredComment = (text) => text.replace(/<!--[\s\S]*?-->/g, (m) => (m.includes('尚不存在') ? '' : m));
  const normLines = (text) => dropExpiredComment(text)
    .replace(/<title>[\s\S]*?<\/title>/g, '<title>__TITLE__</title>')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  check('G3', '归一化函数确实从基线里删掉了那个注释块（否则下面的逐行比对是假阴性风险）',
    dropExpiredComment(backup.html) !== backup.html
    && dropExpiredComment(backup.html).length < backup.html.length - 100);

  const curLines = normLines(html);
  const baseLines = normLines(backup.html);
  const lineDiff = diffFirst(curLines, baseLines);
  check('G3', '★ 归一抹掉 <title> 与该注释块后，index.html 与 r1 基线**逐行相同**（无夹带改动）',
    lineDiff === null, lineDiff);

  /* ================================================================ *
   * G4 CSS：裸动画 / 颜色字面量 / 浅色覆盖 / 深色令牌冻结
   * ================================================================ */
  section('G4 styles/main.css 约定');

  /* --- 负向对照：三个检测函数在合成缺陷上都必须报错 --- */
  const syntheticBadAnimation = `
    .card { animation: fade 1s ease both; }
    @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
  `;
  check('G4', '负向对照：裸动画检测器能在合成用例上报出 2 条（动画属性 + @keyframes）',
    detectBareAnimations(syntheticBadAnimation).length === 2,
    `实际 ${detectBareAnimations(syntheticBadAnimation).length} 条`);

  const syntheticGoodAnimation = `
    @media (prefers-reduced-motion: no-preference) {
      @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
      .card { animation: fade 1s ease backwards; }
    }
  `;
  check('G4', '负向对照：包在 no-preference 内的合成用例被检测器判为**无**缺陷',
    detectBareAnimations(syntheticGoodAnimation).length === 0);

  /* --- ISSUE-2 的两条合成对照：reduce 块**不是**免检区 ---------------------
     ★ 判红侧：reduce 块里出现开启型动画声明（无 !important）必须报出。
     ★ 判绿侧：reduce 块里那条通配压制规则本身（全是 !important）必须**不**被误报 ——
       否则「收紧」会退化成「reduce 块里出现任何动画属性都红」，把正确的实现也判红
       （L-010 对策⑤：阈值过高致**正确**实现被判红，与阈值过低同样有害）。 */
  const syntheticReduceLeak = `
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-delay: 0s !important;
        animation-iteration-count: 1 !important;
      }
      @keyframes leak { from { opacity: 0; } to { opacity: 1; } }
      .card { animation: leak 320ms ease-out infinite; }
    }
  `;
  const reduceLeakViolations = detectBareAnimations(syntheticReduceLeak);
  check('G4', '★ 负向对照（ISSUE-2）：reduce 块内的合成用例注入 `animation: … infinite` → 检测器报出恰 1 条',
    reduceLeakViolations.length === 1,
    `实际 ${reduceLeakViolations.length} 条：${reduceLeakViolations.map((v) => `L${v.line} ${v.what}`).join(' | ')}`);
  check('G4', '★ 负向对照（ISSUE-2）：判红理由确实是「reduce 内出现开启型动画值」而非别的性质',
    reduceLeakViolations.length === 1 && /reduce/.test(reduceLeakViolations[0].why)
    && /infinite/.test(reduceLeakViolations[0].what),
    JSON.stringify(reduceLeakViolations));

  const syntheticReduceClean = `
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-delay: 0s !important;
        animation-iteration-count: 1 !important;
      }
      .card { animation: none; }
    }
  `;
  check('G4', '负向对照（ISSUE-2）：reduce 块内的**关闭型**取值（!important 压制 / none）不被误报',
    detectBareAnimations(syntheticReduceClean).length === 0,
    JSON.stringify(detectBareAnimations(syntheticReduceClean)));

  /* --- ISSUE-3 的解析器自证：`3s` 必须被换算成 3000ms -------------------
     ★ 这是「上限断言」的判别力来源：若解析器不认 `s` 单位，`3s` 会被解析成空数组，
       上限断言就只剩 `ms` 一种写法可判 —— 正是原黑名单正则的洞。 */
  check('G4', '★ 负向对照（ISSUE-3）：延迟解析器把 `3s` 换算为 3000ms，而不是解析成空',
    JSON.stringify(parseDelayMs('3s')) === JSON.stringify([3000]),
    JSON.stringify(parseDelayMs('3s')));
  check('G4', '负向对照（ISSUE-3）：延迟解析器能分开处理 `209ms` / `0.2s` / `0`',
    JSON.stringify(parseDelayMs('209ms')) === JSON.stringify([209])
    && JSON.stringify(parseDelayMs('0.2s')) === JSON.stringify([200])
    && JSON.stringify(parseDelayMs('0')) === JSON.stringify([0]),
    JSON.stringify([parseDelayMs('209ms'), parseDelayMs('0.2s'), parseDelayMs('0')]));

  const syntheticBadColor = '.card { border: 1px solid #ff0000; background: rgba(0,0,0,.5); }';
  check('G4', '负向对照：颜色字面量检测器能在合成用例上报错',
    detectColorLiterals(syntheticBadColor).length === 2,
    `实际 ${detectColorLiterals(syntheticBadColor).length} 条`);
  check('G4', '负向对照：var() 引用与 transparent 关键字不被误判',
    detectColorLiterals('.card { color: var(--color-text); border: 1px solid transparent; }').length === 0);

  const syntheticMissing = `
    :root { --color-bg: #000; --color-new: #fff; }
    @media (prefers-color-scheme: light) { :root { --color-bg: #fff; } }
  `;
  check('G4', '负向对照：浅色覆盖检测器能报出缺覆盖的令牌（--color-new）',
    detectMissingLightOverrides(extractTokens(syntheticMissing)).missing.includes('--color-new'));

  /* --- 基于**真实文件**的变异对照：证明真实文件的结构（注释 / 媒体块）
         不会让检测器变瞎。合成用例过得了、真实文件上却瞎掉的检测器是可能的，
         所以这一组用真实 main.css 做底再加缺陷。 --- */
  /* ★ task-010 追加（由变异campaign实测发现，非原 4 条 deliverable）：
     这两条「真实文件变异」对照原先是**绝对计数**（`=== 1`）。绝对计数把「文件当前
     有没有别的违规」耦合了进来 —— 只要有人在被测文件里注入**任何**一条违规
     （哪怕是另一条待测的注入），这条对照也会一并判红，于是变异campaign里出现
     **与目标性质无关的红**（L-014 假红）。ISSUE-2 的对照变异实测就是这样：
     `★ main.css 无裸动画`（目标性质，理由正确）与这条对照（无关）同时变红。
     ⇒ 改为**增量式**：注入 1 条已知缺陷，违规数必须恰好 +1。它表达的仍是同一个意图
       （「检测器在真实文件上不是瞎的」），但不再依赖文件的绝对状态。
       判别力不减：检测器若变瞎，差值为 0，照样判红。 */
  const bareBaseline = detectBareAnimations(cssRaw).length;
  const bareInjected = detectBareAnimations(`${cssRaw}\n.card { animation: none; }\n`).length;
  check('G4', '负向对照（真实文件变异）：向真实 main.css 末尾注入一条裸 animation → 违规数**恰好 +1**',
    bareInjected - bareBaseline === 1,
    `注入前 ${bareBaseline} 条 → 注入后 ${bareInjected} 条（差 ${bareInjected - bareBaseline}）`);
  const litBaseline = detectColorLiterals(cssRaw).length;
  const litInjected = detectColorLiterals(`${cssRaw}\n.card { border-color: #ff0000; }\n`).length;
  check('G4', '负向对照（真实文件变异）：向真实 main.css 注入组件规则颜色字面量 → 违规数**恰好 +1**',
    litInjected - litBaseline === 1,
    `注入前 ${litBaseline} 条 → 注入后 ${litInjected} 条（差 ${litInjected - litBaseline}）`);
  check('G4', '负向对照（真实文件变异）：往真实深色 :root 注入一个无浅色覆盖的 --color-* → 检测器报出它',
    detectMissingLightOverrides(
      extractTokens(cssRaw.replace('  --color-accent: #38bdf8;', '  --color-accent: #38bdf8;\n  --color-injected: #123456;'))
    ).missing.includes('--color-injected'));

  /* --- 真实文件：裸动画 --- */
  const bareAnimations = detectBareAnimations(cssRaw);
  check('G4', '★ main.css 无裸动画（每处 animation / @keyframes 都可追溯到 prefers-reduced-motion）',
    bareAnimations.length === 0,
    bareAnimations.map((v) => `L${v.line} ${v.what}（${v.why}）`).join(' | '));

  const css = stripComments(cssRaw);
  const cssRules = parseRules(css);
  const guardedAnimations = [];
  for (const rule of cssRules) {
    if (rule.kind !== 'style' || !isNoPreference(rule.mediaStack)) continue;
    for (const d of declarations(rule)) {
      if (d.prop === 'animation' || d.prop === 'animation-name') {
        guardedAnimations.push({ selector: d.selector, value: d.value, line: d.line });
      }
    }
  }
  check('G4', '★ 正向上有动画存在（否则「无裸动画」是空过）：no-preference 内至少有 1 处 animation',
    guardedAnimations.length >= 1, `实际 ${guardedAnimations.length} 处`);
  check('G4', '★ 卡片入场动画确实挂在 .project-grid .card 上',
    guardedAnimations.some((a) => a.selector.replace(/\s+/g, ' ').trim() === '.project-grid .card'),
    JSON.stringify(guardedAnimations));
  /* ISSUE-3（task-010 修）：上限判据由「黑名单正则」改为「解析全部 animation-delay
     数值并换算为毫秒」。下面拆成三条，是为了让「没解析到任何延迟」（空过）与
     「延迟超限」（真缺陷）在报告里表现为**不同的**失败，而不是同一条消息的两可解释。 */
  const staggerDelays = [];
  const unparsedDelays = [];
  for (const rule of cssRules) {
    if (rule.kind !== 'style' || !isNoPreference(rule.mediaStack)) continue;
    for (const d of declarations(rule)) {
      if (d.prop !== 'animation-delay') continue;
      const parts = d.value.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
      const parsed = parseDelayMs(d.value);
      for (const ms of parsed) {
        staggerDelays.push({ ms, line: d.line, selector: rule.selector.replace(/\s+/g, ' ').trim(), value: d.value });
      }
      /* ★ 失败关闭（L-004）：解析器对认不出的写法（`calc(…ms)`、`1e3ms`、`var(…)`…）
         是**跳过**的。跳过会让上限断言"看不见"那条延迟 —— 于是「解析全部数值」退化成
         「解析所有碰巧写得规范的数值」，洞只是从一处黑名单挪到了另一处。
         ⇒ 每一段逗号分量都必须被解析出来，否则判红。宁可对生僻写法误报，也不静默放行。 */
      if (parsed.length !== parts.length) {
        unparsedDelays.push(`${rule.selector.replace(/\s+/g, ' ').trim()} { animation-delay: ${d.value} }`);
      }
    }
  }
  check('G4', '★ 失败关闭：no-preference 内每条 animation-delay 都被**完整**解析（认不出的写法判红，不静默跳过）',
    unparsedDelays.length === 0,
    `未能解析：${JSON.stringify(unparsedDelays)}`);
  check('G4', '★ 正向上确实解析到了交错延迟（否则下面的上限断言是空过）',
    staggerDelays.length >= 1,
    `解析到 ${staggerDelays.length} 条：${staggerDelays.map((d) => `L${d.line} ${d.selector} ${d.value}=${d.ms}ms`).join(' | ')}`);
  const maxDelayMs = staggerDelays.length > 0 ? Math.max(...staggerDelays.map((d) => d.ms)) : Infinity;
  check('G4', '★ 交错延迟有上限：全部 animation-delay 换算为 ms 后最大值 <= 200ms',
    maxDelayMs <= 200,
    `最大 ${maxDelayMs}ms；全部延迟 ${JSON.stringify(staggerDelays.map((d) => d.ms))}`);
  check('G4', '交错上限规则本身在盘上：nth-child(n + 6) 固定为 200ms',
    /\.project-grid \.card:nth-child\(n \+ 6\)\s*\{\s*animation-delay:\s*200ms;/.test(css));
  info('G4', '交错延迟清单（逐条换算后）',
    staggerDelays.map((d) => `L${d.line} ${d.selector} = ${d.ms}ms`).join(' | '));

  /* --- 过渡的可追溯性 + scroll-behavior 在 reduce 下关闭 --- */
  const transitions = collectTransitionDeclarations(cssRaw);
  check('G4', '正向上存在 transition 声明（否则下一条「已被 reduce 覆盖」是空过）',
    transitions.length >= 1, `实际 ${transitions.length} 处`);
  let universalReduce = null;
  for (const rule of cssRules) {
    if (rule.kind !== 'style' || !isReduce(rule.mediaStack)) continue;
    if (!/\*/.test(rule.selector)) continue;
    const decls = declarations(rule);
    const has = (p) => decls.some((d) => d.prop === p && d.value.includes('!important'));
    if (has('transition-duration') && has('animation-duration')) universalReduce = decls;
  }
  check('G4', '★ reduce 块内有通配选择器的 transition-duration !important（覆盖全部过渡声明）',
    universalReduce !== null);
  check('G4', '★ reduce 块内同时压住 animation-delay（只压 duration 时延迟仍会先停在首帧）',
    universalReduce !== null && universalReduce.some((d) => d.prop === 'animation-delay' && d.value.includes('!important')));
  check('G4', '★ html 的 scroll-behavior: smooth 与 reduce 下的 scroll-behavior: auto 成对存在',
    /html\s*\{[^}]*scroll-behavior:\s*smooth/.test(css)
    && cssRules.some((r) => r.kind === 'style' && isReduce(r.mediaStack)
      && r.selector.trim() === 'html'
      && declarations(r).some((d) => d.prop === 'scroll-behavior' && d.value === 'auto')));
  info('G4', 'transition 声明清单（供取证）',
    transitions.map((t) => `L${t.line} ${t.selector} { ${t.prop} }`).join(' | '));

  /* --- 颜色字面量 --- */
  const literalViolations = detectColorLiterals(cssRaw);
  check('G4', '★ 组件规则内无颜色字面量（一律引用自定义属性）',
    literalViolations.length === 0,
    literalViolations.map((v) => `L${v.line} ${v.what}（${v.why}）`).join(' | '));
  const tokenBlockLiterals = [];
  for (const rule of cssRules) {
    if (rule.kind !== 'style' || rule.selector.trim() !== ':root') continue;
    for (const d of declarations(rule)) {
      if (/#[0-9a-fA-F]{3,8}\b/.test(d.value)) tokenBlockLiterals.push(d.prop);
    }
  }
  check('G4', '正向上令牌块里确实有颜色字面量（证明检测器不是把一切都放过）',
    tokenBlockLiterals.length >= 9, `实际 ${tokenBlockLiterals.length} 个`);

  /* --- 令牌：浅色覆盖 + 深色冻结 --- */
  const tokens = extractTokens(cssRaw);
  const baseTokens = extractTokens(backup.css);
  const missing = detectMissingLightOverrides(tokens);
  check('G4', '★ 每个 --color-* 令牌都有浅色覆盖（缺失会导致浅色模式拿到深色值）',
    missing.missing.length === 0, `缺覆盖：${JSON.stringify(missing.missing)}`);
  check('G4', '浅色块未定义深色块不存在的令牌（无孤儿令牌）',
    missing.orphan.length === 0, `孤儿：${JSON.stringify(missing.orphan)}`);

  /* 逐值比对既有令牌。
     ★ 判据的作用域按依据收敛（L-010）：acceptance 冻结的是**深色取色**（「深色模式原有
       令牌值不被改动」），其依据是「不要为了修浅色而把深色调色板改坏」。因此这里拆成三条：
         · 深色 --color-* ：必须逐值未变（硬约束）；
         · 深色非颜色令牌：允许清单化变更（本任务 = --container-max，方向菜单①明确要求加宽）；
         · 浅色令牌：允许清单化变更（本任务 = --color-border，为满足 ② 的 vs bg >= 1.20）。
       把这两个例外显式列出而不是放行整类，是为了让「有意的偏离」在测试里可见。 */
  const tokenDiff = (current, baseline) => {
    const out = [];
    for (const key of Object.keys(baseline)) {
      if (!(key in current)) out.push(`${key} 被删除`);
      else if (current[key] !== baseline[key]) out.push(`${key}: ${baseline[key]} → ${current[key]}`);
    }
    return out;
  };

  const baseDiff = tokenDiff(tokens.base, baseTokens.base);
  const baseColorDiff = baseDiff.filter((d) => d.startsWith('--color-'));
  const baseOtherDiff = baseDiff.filter((d) => !d.startsWith('--color-'));
  check('G4', '★ 深色模式既有**颜色**令牌逐值未变',
    baseColorDiff.length === 0, baseColorDiff.join(' | '));
  check('G4', '★ 深色模式非颜色令牌的变更仅限 --container-max（方向菜单①：960px → 1080px）',
    JSON.stringify(baseOtherDiff) === JSON.stringify(['--container-max: 960px → 1080px']),
    `实际 ${JSON.stringify(baseOtherDiff)}`);

  const lightDiff = tokenDiff(tokens.light, baseTokens.light);
  const unexpectedLight = lightDiff.filter((d) => !d.startsWith('--color-border:'));
  check('G4', '★ 浅色模式既有令牌的变更仅限 --color-border（为满足 ② 的 vs bg >= 1.20）',
    unexpectedLight.length === 0, `计划外变更：${JSON.stringify(unexpectedLight)}`);
  info('G4', '浅色令牌变更清单', lightDiff.length === 0 ? '（无）' : lightDiff.join(' | '));

  const newBaseTokens = Object.keys(tokens.base).filter((k) => !(k in baseTokens.base));
  const newLightTokens = Object.keys(tokens.light).filter((k) => !(k in baseTokens.light));
  check('G4', '正向上确实新增了令牌（本任务的视觉变更落盘证据）',
    newBaseTokens.length > 0, `新增：${JSON.stringify(newBaseTokens)}`);
  info('G4', '新增令牌（深色侧）', newBaseTokens.map((k) => `${k}: ${tokens.base[k]}`).join(' | '));
  info('G4', '新增令牌（浅色侧）', newLightTokens.map((k) => `${k}: ${tokens.light[k]}`).join(' | '));

  /* ================================================================ *
   * G5 对比度
   * ================================================================ */
  section('G5 对比度（WCAG 相对亮度；深色与浅色同口径）');

  /* 浅色主题 = 基础 :root + 浅色覆盖：@media (prefers-color-scheme: light) 只覆盖部分令牌，
     未覆盖的仍取基础值。★ 若只用 tokens.light 去解析 var()，像 --shadow-surface 这类
     只在基础块里定义的令牌会解析不到 —— 本脚本第一版就把浅色阴影算成了空值。 */
  const light = { ...tokens.base, ...tokens.light };
  const dark = tokens.base;

  /* 负向对照：把对比度函数本身钉住 */
  check('G5', '负向对照：对比度函数对 #000/#fff 返回 21.00',
    round(contrast(parseColor('#000000'), parseColor('#ffffff'))) === 21, `实际 ${round(contrast(parseColor('#000000'), parseColor('#ffffff')))}`);
  check('G5', '负向对照：同一颜色对比度为 1.00',
    round(contrast(parseColor('#123456'), parseColor('#123456'))) === 1);

  const themes = [
    { name: 'light', t: light },
    { name: 'dark', t: dark }
  ];

  for (const { name, t } of themes) {
    const text = parseColor(t['--color-text']);
    const muted = parseColor(t['--color-text-muted']);
    const surface = parseColor(t['--color-surface']);
    const bg = parseColor(t['--color-bg']);
    const border = parseColor(t['--color-border']);
    check('G5', `①[${name}] --color-text vs --color-surface >= 7:1 (AAA)`,
      text && surface && contrast(text, surface) >= 7,
      text && surface ? `${round(contrast(text, surface))}:1` : '令牌缺失');
    check('G5', `①[${name}] --color-text-muted vs --color-surface >= 4.5:1 (AA)`,
      muted && surface && contrast(muted, surface) >= 4.5,
      muted && surface ? `${round(contrast(muted, surface))}:1` : '令牌缺失');
  }

  /* ② 卡片边界可辨：作用域按依据收敛到**浅色**（基线的实测值就是浅色的 1.23/1.18）。
     ★ 深色侧现状为 1.14，若把该门槛套到深色，就会与「深色既有令牌值不得改动」直接冲突，
       属 L-010 的「约束自相矛盾」；故此处只计算并报告，不作为 PASS 门槛。 */
  const lBorder = parseColor(light['--color-border']);
  const lSurface = parseColor(light['--color-surface']);
  const lBg = parseColor(light['--color-bg']);
  check('G5', '②[light] --color-border vs --color-surface >= 1.20:1',
    contrast(lBorder, lSurface) >= 1.2, `${round(contrast(lBorder, lSurface), 4)}:1`);
  check('G5', '②[light] --color-border vs --color-bg >= 1.20:1',
    contrast(lBorder, lBg) >= 1.2, `${round(contrast(lBorder, lBg), 4)}:1`);
  const dBorder = parseColor(dark['--color-border']);
  const dSurface = parseColor(dark['--color-surface']);
  const dBg = parseColor(dark['--color-bg']);
  info('G5', '②[dark] 仅供参考，**不作门槛**（见脚本内注释）',
    `border vs surface = ${round(contrast(dBorder, dSurface), 4)}:1；border vs bg = ${round(contrast(dBorder, dBg), 4)}:1`);

  /* ④ 面 vs 底填充差：防回归线（现状已满足），不是提升目标 */
  check('G5', '④[light] --color-surface vs --color-bg >= 1.03:1（防回归）',
    contrast(lSurface, lBg) >= 1.03, `${round(contrast(lSurface, lBg), 4)}:1`);
  info('G5', '④[dark] 参考值', `surface vs bg = ${round(contrast(dSurface, dBg), 4)}:1`);
  info('G5', '④[light] 基线值对比', '基线 1.0463:1（令牌未改动，故应逐位一致）');

  /* ③ 浅色阴影必须可见：**存在某一层**同时满足 blur >= 6px 且 alpha >= 0.08。
     按现行判据作用于 .card 的 box-shadow（vary 递归展开后逐层取模糊半径与 alpha）。 */
  let cardShadowDecl = null;
  for (const rule of cssRules) {
    if (rule.kind !== 'style') continue;
    if (rule.selector.replace(/\s+/g, ' ').trim() !== '.card') continue;
    for (const d of declarations(rule)) {
      if (d.prop === 'box-shadow') cardShadowDecl = d.value;
    }
  }
  check('G5', '找到 .card 的 box-shadow 声明', cardShadowDecl !== null);
  if (cardShadowDecl) {
    const lightResolved = resolveVars(cardShadowDecl, light);
    const lightLayers = parseShadowLayers(lightResolved);
    const maxBlur = Math.max(...lightLayers.map((l) => l.blur));
    const maxAlpha = Math.max(...lightLayers.map((l) => l.alpha));
    info('G5', '③[light] .card box-shadow 展开', lightResolved);
    info('G5', '③[light] 各层模糊半径 / alpha',
      lightLayers.map((l) => `blur=${l.blur}px alpha=${round(l.alpha, 4)}`).join(' | '));
    /* ★ 判据 ③ 改为**同层合取**（L-013 对策②b：两侧同时收紧）。
       下面四条一组：
         ① 正向存在性 —— 先证明「确实有远距层」，否则「远距层可见」无从谈起（L-004 空过配对）；
         ② 真判据 —— ∃ 某一层同时满足 blur >= 6 且 alpha >= 0.08；
         ③④ 形态负向对照 —— 把 M8 / N8 两种**单臂消解**形状做成合成用例，证明②有判别力。
             ③④ 的存在使②不再是「读代码推出来的应该能红」，而是**被自证的**判据。 */
    const farLayers = lightLayers.filter((l) => l.blur >= 6);
    check('G5', '③[light] 正向上确实存在远距层（blur >= 6px）（否则下面的同层判据是空过）',
      farLayers.length >= 1,
      `各层：${lightLayers.map((l) => `blur=${l.blur}px alpha=${round(l.alpha, 4)}`).join(' | ')}`);
    const visible = visibleShadowLayers(lightLayers);
    check('G5', '③[light] 阴影可见：存在某一层**同时**满足 blur >= 6px 且 alpha >= 0.08（同层，非跨层取最大值）',
      visible.length >= 1,
      `maxBlur=${maxBlur}px, maxAlpha=${round(maxAlpha, 4)}, 同层达标层数=${visible.length}`);

    /* ③ 负向对照 A（M8 形状）：删掉远距层，只剩近距 `0 1px 2px #0f172a1f`。
       ★ 注意它的 alpha = 0.1216 **单独就满足**旧判据的 alpha 臂 —— 这正是 M8 能溜过去的原因。 */
    const m8Shape = parseShadowLayers('0 1px 2px #0f172a1f');
    check('G5', '★ 负向对照（M8 形状）：删掉远距层后同层判据判**不可见**（旧判据的 alpha 臂会放行它）',
      visibleShadowLayers(m8Shape).length === 0
      && m8Shape.some((l) => l.alpha >= 0.08),
      `层：${JSON.stringify(m8Shape.map((l) => ({ blur: l.blur, alpha: round(l.alpha, 4) })))}`);
    /* ③ 负向对照 B（N8 形状）：远距层还在（blur=20），但 alpha 被压到 0.0039。
       ★ 这一条同时证明「跨层取最大值」写法是错的：maxBlur=20、maxAlpha=0.1216 两个都达标。 */
    const n8Shape = parseShadowLayers('0 1px 2px #0f172a1f, 0 8px 20px #0f172a01');
    check('G5', '★ 负向对照（N8 形状）：远距层 alpha 压到 0.0039 后同层判据判**不可见**（跨层 max 写法会放行它）',
      visibleShadowLayers(n8Shape).length === 0
      && Math.max(...n8Shape.map((l) => l.blur)) >= 6
      && Math.max(...n8Shape.map((l) => l.alpha)) >= 0.08,
      `层：${JSON.stringify(n8Shape.map((l) => ({ blur: l.blur, alpha: round(l.alpha, 4) })))}`);

    /* 深色阴影不得倒退：展开后必须 **包含** 基线的近距层 */
    const darkResolved = resolveVars(cardShadowDecl, dark);
    const darkLayers = parseShadowLayers(darkResolved);
    let baseCardShadow = null;
    const baseRules = parseRules(stripComments(backup.css));
    for (const rule of baseRules) {
      if (rule.kind !== 'style') continue;
      if (rule.selector.replace(/\s+/g, ' ').trim() !== '.card') continue;
      for (const d of declarations(rule)) {
        if (d.prop === 'box-shadow') baseCardShadow = d.value;
      }
    }
    const baseResolved = baseCardShadow ? resolveVars(baseCardShadow, baseTokens.base) : null;
    info('G5', '③[dark] .card box-shadow 展开', darkResolved);
    info('G5', '③[dark] 基线近距层', String(baseResolved));
    check('G5', '③[dark] 深色卡片阴影未倒退（仍包含基线的那一层）',
      baseResolved !== null
      && darkLayers.some((l) => baseResolved.includes(l.raw) || l.raw === baseResolved),
      `基线 ${baseResolved}；当前层 ${JSON.stringify(darkLayers.map((l) => l.raw))}`);
  }

  /* --- 新增护栏（本脚本自设，依据同样是 WCAG 口径）：首屏光晕合成后文字仍达标 --- */
  let heroGradient = null;
  for (const rule of cssRules) {
    if (rule.kind !== 'style') continue;
    if (rule.selector.replace(/\s+/g, ' ').trim() !== '.hero') continue;
    for (const d of declarations(rule)) {
      if (d.prop === 'background-image') heroGradient = d.value;
    }
  }
  check('G5', '找到 .hero 的 background-image 声明（首屏光晕）', heroGradient !== null);
  if (heroGradient) {
    for (const { name, t } of themes) {
      const resolved = resolveVars(heroGradient, t);
      const bg = parseColor(t['--color-bg']);
      const text = parseColor(t['--color-text']);
      const muted = parseColor(t['--color-text-muted']);
      const stops = parseGradientStops(resolved);
      if (!bg || !text || !muted || stops.length === 0) {
        check('G5', `③+[${name}] 光晕色阶可解析`, false, resolved);
        continue;
      }
      /* ★ 逐色阶合成后各算一次对比度，取**最低**者。旧写法只取第一个十六进制颜色
         却把它叫做「最亮处」—— 那是一个未言明的巧合，不是判据（ISSUE-4）。 */
      const perStop = stops.map((s) => {
        const comp = composite(s.color, bg);
        return {
          raw: s.raw,
          alpha: s.color.a,
          hex: `#${[comp.r, comp.g, comp.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`,
          cText: contrast(text, comp),
          cMuted: contrast(muted, comp)
        };
      });
      const worstText = perStop.reduce((a, b) => (b.cText < a.cText ? b : a));
      const worstMuted = perStop.reduce((a, b) => (b.cMuted < a.cMuted ? b : a));
      info('G5', `③+[${name}] 光晕色阶（合成后对比度）`,
        perStop.map((s) => `${s.raw}→${s.hex} text=${round(s.cText)}:1 muted=${round(s.cMuted)}:1`).join(' | '));
      check('G5', `③+[${name}] 光晕色阶解析：取到 >= 2 个色阶（否则「取最低者」等价于「取唯一者」，改动是空过）`,
        stops.length >= 2, `实际 ${stops.length} 个：${JSON.stringify(stops.map((s) => s.raw))}`);
      check('G5', `③+[${name}] 光晕**全部色阶**中 --color-text 对比度最低者仍 >= 7:1`,
        worstText.cText >= 7, `最低者 ${worstText.raw}（${worstText.hex}）=${round(worstText.cText)}:1`);
      check('G5', `③+[${name}] 光晕**全部色阶**中 --color-text-muted 对比度最低者仍 >= 4.5:1`,
        worstMuted.cMuted >= 4.5, `最低者 ${worstMuted.raw}（${worstMuted.hex}）=${round(worstMuted.cMuted)}:1`);
    }

    /* ISSUE-4 的判别力自证：「取最低者」相对「取首个色阶」必须真的能分出高下。
       合成用例：首个色阶是最亮的白（对深色文字对比度极高），第二个色阶恰等于文字色。
       → 取首个色阶 = 21:1（放行）；取最低者 = 1:1（判红）。 */
    const firstStopOnly = parseGradientStops('radial-gradient(#f8fafc, #0f172a)')[0];
    const syntheticStops = parseGradientStops('radial-gradient(#f8fafc, #0f172a)');
    const synthBg = parseColor('#f8fafc');
    const synthText = parseColor('#0f172a');
    const synthWorst = Math.min(...syntheticStops.map((s) => contrast(synthText, composite(s.color, synthBg))));
    check('G5', '★ 负向对照（ISSUE-4）：多色阶渐变的「最低者」判据能判红，而「首个色阶」写法会放行',
      contrast(synthText, composite(firstStopOnly.color, synthBg)) >= 7 && synthWorst < 7,
      `首个色阶=${round(contrast(synthText, composite(firstStopOnly.color, synthBg)))}:1，最低者=${round(synthWorst)}:1`);
  }

  /* --- 下面两组护栏不依赖首屏光晕是否存在，故**不**放在 heroGradient 分支里
         （放进去会变成「hero 规则缺失就整段跳过」的静默跳过） --- */

  /* 本任务新增的第二个「文字所在底色会变」的状态：.contact-item hover / focus-within */
  let contactHoverBg = null;
  for (const rule of cssRules) {
    if (rule.kind !== 'style') continue;
    const sel = rule.selector.replace(/\s+/g, ' ');
    if (!sel.includes('.contact-item:hover')) continue;
    for (const d of declarations(rule)) {
      if (d.prop === 'background-color') contactHoverBg = d.value;
    }
  }
  check('G5', '找到 .contact-item:hover 的 background-color（新增的可交互反馈态）',
    contactHoverBg !== null);
  if (contactHoverBg) {
    for (const { name, t } of themes) {
      const soft = parseColor(resolveVars(contactHoverBg, t));
      const surface = parseColor(t['--color-surface']);
      const text = parseColor(t['--color-text']);
      const muted = parseColor(t['--color-text-muted']);
      if (!soft || !surface) {
        check('G5', `③+[${name}] hover 底色可解析`, false, String(contactHoverBg));
        continue;
      }
      const hoverBg = composite(soft, surface);
      info('G5', `③+[${name}] 联系方式条目 hover 底色（合成到 --color-surface 上）`,
        `#${[hoverBg.r, hoverBg.g, hoverBg.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`);
      check('G5', `③+[${name}] hover 态下 --color-text 仍 >= 4.5:1 (AA)`,
        contrast(text, hoverBg) >= 4.5, `${round(contrast(text, hoverBg))}:1`);
      check('G5', `③+[${name}] hover 态下 --color-text-muted 仍 >= 4.5:1 (AA)`,
        contrast(muted, hoverBg) >= 4.5, `${round(contrast(muted, hoverBg))}:1`);
    }
  }

  /* 半透明顶栏底色 vs 背景：0.85 alpha 是为了把下层内容的影响压到最小 */
  check('G5', '存在 --color-topbar-bg 令牌（顶栏毛玻璃的半透明底色）',
    '--color-topbar-bg' in tokens.base);
  if ('--color-topbar-bg' in tokens.base) {
    for (const { name, t } of themes) {
      const top = parseColor(t['--color-topbar-bg']);
      const bg = parseColor(t['--color-bg']);
      const text = parseColor(t['--color-text']);
      check('G5', `③+[${name}] 顶栏半透明底色 vs --color-bg 的合成差可忽略（< 1.02:1）`,
        contrast(top, bg) < 1.02, `${round(contrast(top, bg), 4)}:1`);
      check('G5', `③+[${name}] 顶栏底色上 --color-text >= 7:1`,
        contrast(text, composite(top, bg)) >= 7, `${round(contrast(text, composite(top, bg)))}:1`);
    }
  }

  /* ================================================================ *
   * G6 越界哨兵
   * ================================================================ */
  section('G6 越界哨兵（本任务 allowedPaths 之外的文件）');

  for (const [rel, expected] of Object.entries(SENTINELS)) {
    const actual = sha256(P(rel));
    check('G6', `${rel} sha256 未变`, actual === expected, actual === expected ? '' : `实际 ${actual}`);
  }
  const dictSha = sha256(FILES.dict);
  check('G6', 'js/i18n-dict.js 不在哨兵集合内，且**确实已变更**（证明 page.title 改动落盘）',
    dictSha !== sha256(FILES.backupDict), `当前 ${dictSha}`);
  check('G6', 'index.html 确实已变更（证明本任务的改动落盘）',
    sha256(FILES.html) !== sha256(FILES.backupHtml));
  check('G6', 'styles/main.css 确实已变更（证明视觉改动落盘）',
    sha256(FILES.css) !== sha256(FILES.backupCss));
  info('G6', '交付文件 sha256',
    `index.html=${sha256(FILES.html)} | main.css=${sha256(FILES.css)} | i18n-dict.js=${dictSha}`);

  /* ================================================================ *
   * 汇总
   * ================================================================ */
  section('汇总');
  let pass = 0;
  let fail = 0;
  for (const [group, s] of [...stats.entries()].sort()) {
    console.log(`  ${group}: ${s.pass} 通过 / ${s.fail} 失败`);
    pass += s.pass;
    fail += s.fail;
  }
  console.log(`\n合计 ${pass} 通过 / ${fail} 失败`);

  if (failures.length > 0) {
    console.error('\n失败明细：');
    for (const f of failures) console.error(`  [${f.group}] ${f.title}`);
    console.error('\n结果：FAIL');
    process.exitCode = 1;
  } else {
    console.log('\n结果：PASS');
    console.log('注意：本脚本不验证视觉美观度 / 动效手感 / 窄屏重排 / 真实浅色观感 / backdrop-filter 渲染，');
    console.log('      也不产出截图。上述各项属 tasks.json 的 userVerification。');
    process.exitCode = 0;
  }
}

/* 逐位比较两个字符串数组，返回第一个差异的可读描述；相同返回 null */
function diffFirst(a, b) {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    if (a[i] !== b[i]) {
      return `第 ${i + 1} 项：当前 ${JSON.stringify(a[i])} vs 基线 ${JSON.stringify(b[i])}`;
    }
  }
  return null;
}

try {
  main();
} catch (err) {
  console.error('\n脚本未能完成（失败关闭）：');
  console.error(err && err.stack ? err.stack : String(err));
  process.exitCode = 1;
}
