#!/usr/bin/env node
/*
 * task-003-render.mjs — task-003 的渲染验收脚本（自带断言、显式退出码、零第三方依赖）
 *
 * 运行：node tests/task-003-render.mjs
 * 退出码：0 = G0–G6 全部分组通过；1 = 任一断言失败（失败分组与原因打印到 stderr）
 *
 * ★ 为什么不用 `node --test`（L-004）：
 *   裸 `node --test` 在测试文件缺失或命名不匹配默认 pattern 时 exit=0 且 0 测试，属**空过**；
 *   而 `node <file>` 失败关闭（文件缺失 exit=1）。故本脚本是普通脚本 + 显式 process.exit()。
 *   文件名也刻意不匹配 *.test.mjs，避免被 task-005 的测试运行误收集。
 *
 * ★ 为什么要有这个脚本：
 *   本机无浏览器自动化工具，产不出截图。为了让渲染逻辑可被**机械**验收，脚本内实现一个
 *   **记录型最小 DOM 桩**：它真实记录 main.js 调用 document.createElement 产出的节点、
 *   节点文本与 attributes、以及节点挂到了哪个父节点下；断言只读取这些由 main.js 产出的
 *   真实对象。桩本身不预设任何「main.js 应该做什么」，它只如实记账。
 *
 * ★ 如何避免空过（vacuous pass，L-004 的统一规则）：
 *   1. G0 有**负向对照**：把同一套卡片断言跑在一个空脚本（什么都不做）上，必须报出问题。
 *      若空脚本也能过，说明断言恒真 —— 那本身就是 FAIL。第二个负向对照用「卡片数量对、
 *      但 href 与描述是编造的」的脚本，证明 href/描述断言同样是活的。
 *   2. 所有否定式断言（「网格保持为空」「无未捕获异常」「不静默」）都配了肯定式前置断言：
 *      先确认「被测分支确实执行过」（例如先断言网格确实渲染了 5 张卡，再断言异常列表为空）。
 *   3. 桩的骨架（id / class / 联系人号码）从真实 index.html 提取，并在 G0 断言提取成功，
 *      避免桩与真实页面脱节导致「在假世界里验真」。
 *   4. 数据来自真实 data/repos.js 与真实 js/i18n-dict.js（在 vm 里执行原文件），
 *      不用构造数据冒充真实快照。仅 G2 的第 ① 层 / G4 的 descEn 层用人造快照，
 *      因为真实数据里该两层全空（脚本会先断言这一点）。
 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = {
  html: path.join(ROOT, 'index.html'),
  dict: path.join(ROOT, 'js', 'i18n-dict.js'),
  snapshot: path.join(ROOT, 'data', 'repos.js'),
  main: path.join(ROOT, 'js', 'main.js')
};

const readFile = (p) => fs.readFileSync(p, 'utf8');

/* ------------------------------------------------------------------ *
 * 断言记账
 * ------------------------------------------------------------------ */

const stats = new Map(); // group -> {pass, fail}
const failures = [];

function check(group, title, condition, detail) {
  const entry = stats.get(group) || { pass: 0, fail: 0 };
  if (condition) {
    entry.pass += 1;
    stats.set(group, entry);
    console.log(`  PASS [${group}] ${title}`);
    return true;
  }
  entry.fail += 1;
  stats.set(group, entry);
  const message = `${title}${detail ? ' → ' + detail : ''}`;
  failures.push({ group, title: message });
  console.log(`  FAIL [${group}] ${title}${detail ? ' → ' + detail : ''}`);
  return false;
}

/* ------------------------------------------------------------------ *
 * 最小 DOM 桩（记录型）
 * ------------------------------------------------------------------ */

const hasClass = (node, cls) =>
  typeof node.className === 'string' && node.className.split(/\s+/).indexOf(cls) !== -1;

function matches(node, selector) {
  const sel = selector.trim();
  if (sel === '*') return true;
  if (sel.startsWith('.')) return hasClass(node, sel.slice(1));
  if (sel.startsWith('#')) return node.getAttribute('id') === sel.slice(1);
  const attrEq = /^\[([\w-]+)="([^"]*)"\]$/.exec(sel);
  if (attrEq) return node.getAttribute(attrEq[1]) === attrEq[2];
  const attr = /^\[([\w-]+)\]$/.exec(sel);
  if (attr) return node.hasAttribute(attr[1]);
  return node.tagName === sel.toUpperCase();
}

/** 深度优先遍历子树（不含自身）。 */
function walk(node, visit) {
  for (const child of node.childNodes) {
    visit(child);
    walk(child, visit);
  }
}

class FakeNode {
  constructor(doc, tagName) {
    this.ownerDocument = doc;
    this.tagName = String(tagName).toUpperCase();
    this.childNodes = [];
    this.attributes = Object.create(null);
    this.className = '';
    this.parentNode = null;
    this._ownText = '';
    this._listeners = Object.create(null);
    this.nodeId = doc.createdNodes.length + 1;
    doc.createdNodes.push(this);
  }

  get children() {
    return this.childNodes;
  }

  get firstChild() {
    return this.childNodes.length > 0 ? this.childNodes[0] : null;
  }

  get textContent() {
    if (this.childNodes.length === 0) return this._ownText;
    let out = this._ownText;
    for (const child of this.childNodes) out += child.textContent;
    return out;
  }

  /* 与真实 DOM 一致：给 textContent 赋值会清空既有子节点。 */
  set textContent(value) {
    for (const child of this.childNodes.slice()) this.removeChild(child);
    this._ownText = value === null || value === undefined ? '' : String(value);
  }

  appendChild(child) {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  removeChild(child) {
    const index = this.childNodes.indexOf(child);
    if (index !== -1) {
      this.childNodes.splice(index, 1);
      child.parentNode = null;
    }
    return child;
  }

  setAttribute(name, value) {
    this.attributes[String(name)] = String(value);
  }

  getAttribute(name) {
    const key = String(name);
    return Object.prototype.hasOwnProperty.call(this.attributes, key) ? this.attributes[key] : null;
  }

  hasAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, String(name));
  }

  addEventListener(type, handler) {
    this._listeners[type] = this._listeners[type] || [];
    this._listeners[type].push(handler);
  }

  dispatchEvent(event) {
    const handlers = (this._listeners[event.type] || []).slice();
    for (const handler of handlers) handler(event);
    return true;
  }

  querySelectorAll(selector) {
    const out = [];
    walk(this, (node) => {
      if (matches(node, selector)) out.push(node);
    });
    return out;
  }

  querySelector(selector) {
    const all = this.querySelectorAll(selector);
    return all.length > 0 ? all[0] : null;
  }
}

class FakeDocument {
  constructor() {
    this.createdNodes = [];
    this.readyState = 'interactive';
    this._domReady = [];
    this.documentElement = new FakeNode(this, 'html');
    this.documentElement.lang = 'zh-CN';
    this.body = new FakeNode(this, 'body');
    this.body.parentNode = this.documentElement;
    this.documentElement.childNodes.push(this.body);
  }

  createElement(tagName) {
    return new FakeNode(this, tagName);
  }

  getElementById(id) {
    const all = this.documentElement.querySelectorAll('#' + id);
    if (this.documentElement.getAttribute('id') === id) return this.documentElement;
    return all.length > 0 ? all[0] : null;
  }

  querySelectorAll(selector) {
    const out = [];
    if (matches(this.documentElement, selector)) out.push(this.documentElement);
    walk(this.documentElement, (node) => {
      if (matches(node, selector)) out.push(node);
    });
    return out;
  }

  querySelector(selector) {
    const all = this.querySelectorAll(selector);
    return all.length > 0 ? all[0] : null;
  }

  addEventListener(type, handler) {
    this._domReady.push({ type, handler });
  }

  /* 真实 index.html 的骨架里没有 [data-i18n] 之外的动态内容，无需这些 API 的完整实现。 */
  fireDOMContentLoaded() {
    for (const entry of this._domReady.slice()) {
      if (entry.type === 'DOMContentLoaded') entry.handler({ type: 'DOMContentLoaded', target: this });
    }
  }
}

/* ------------------------------------------------------------------ *
 * 从真实 index.html 提取联系人骨架（避免桩与真实页面脱节）
 * ------------------------------------------------------------------ */

function extractContacts(html) {
  const items = [];
  const liRe = /<li class="contact-item">([\s\S]*?)<\/li>/g;
  const labelRe = /<span class="contact-item__label"[^>]*data-i18n="([^"]+)"[^>]*>([^<]*)<\/span>/;
  const valueRe = /<(span|a) class="contact-item__value"[^>]*>([^<]*)<\/\1>/;
  let m;
  while ((m = liRe.exec(html)) !== null) {
    const labelMatch = labelRe.exec(m[1]);
    const valueMatch = valueRe.exec(m[1]);
    if (!labelMatch || !valueMatch) continue;
    items.push({ labelKey: labelMatch[1], label: labelMatch[2].trim(), value: valueMatch[2].trim() });
  }
  return items;
}

/* ------------------------------------------------------------------ *
 * 运行环境（每个场景一个全新实例）
 * ------------------------------------------------------------------ */

function createHarness(options) {
  const opts = Object.assign(
    { lang: null, snapshot: 'real', withDict: true, clipboard: 'resolve', execCommand: 'absent', readyState: 'interactive' },
    options || {}
  );

  const document = new FakeDocument();

  // 骨架：id / class 与真实 index.html 一致；若不一致，G0 的保真断言会先失败。
  const grid = document.createElement('div');
  grid.className = 'project-grid';
  grid.setAttribute('id', 'project-grid');

  const emptyState = document.createElement('p');
  emptyState.className = 'empty-state';
  emptyState.setAttribute('id', 'projects-empty');
  emptyState.textContent = '项目列表暂时不可用。';

  const toggle = document.createElement('button');
  toggle.className = 'lang-toggle';
  toggle.setAttribute('id', 'lang-toggle');

  const contactList = document.createElement('ul');
  contactList.className = 'contact-list';
  const contacts = extractContacts(readFile(FILES.html));
  const contactNodes = contacts.map((contact) => {
    const li = document.createElement('li');
    li.className = 'contact-item';
    const label = document.createElement('span');
    label.className = 'contact-item__label';
    label.setAttribute('data-i18n', contact.labelKey);
    label.textContent = contact.label;
    const value = document.createElement('span');
    value.className = 'contact-item__value';
    value.textContent = contact.value;
    li.appendChild(label);
    li.appendChild(value);
    contactList.appendChild(li);
    return { li, label, value, labelKey: contact.labelKey };
  });

  const main = document.createElement('main');
  main.appendChild(grid);
  main.appendChild(emptyState);
  document.body.appendChild(toggle);
  document.body.appendChild(main);
  document.body.appendChild(contactList);

  const timers = { queue: [], seq: 0 };
  const errors = [];
  const clipboardCalls = [];
  const execCalls = [];
  const selections = [];

  function safely(fn) {
    try {
      fn();
    } catch (err) {
      errors.push(err);
    }
  }

  function setTimeoutStub(fn, delay) {
    timers.seq += 1;
    timers.queue.push({ id: timers.seq, fn, delay: Number(delay) || 0 });
    return timers.seq;
  }

  function clearTimeoutStub(id) {
    timers.queue = timers.queue.filter((t) => t.id !== id);
  }

  /** 只执行 delay <= maxDelay 的回调；默认只跑 main.js 的 defer(0)。 */
  function flushTimers(maxDelay) {
    const limit = maxDelay === undefined ? 0 : maxDelay;
    const due = timers.queue
      .filter((t) => t.delay <= limit)
      .sort((a, b) => a.delay - b.delay || a.id - b.id);
    for (const timer of due) {
      timers.queue = timers.queue.filter((t) => t.id !== timer.id);
      safely(timer.fn);
    }
    return due.length;
  }

  const selection = {
    ranges: [],
    removeAllRanges() { this.ranges = []; },
    addRange(range) { this.ranges.push(range); selections.push(range); }
  };

  document.createRange = function createRange() {
    return {
      selected: null,
      selectNodeContents(node) { this.selected = node; }
    };
  };

  if (opts.execCommand !== 'absent') {
    document.execCommand = function execCommand(command) {
      execCalls.push(command);
      if (opts.execCommand === 'throw') throw new Error('execCommand 不可用（演练）');
      return opts.execCommand === 'true';
    };
  }

  const navigator = {
    clipboard: opts.clipboard === 'absent' ? undefined : {
      writeText(text) {
        clipboardCalls.push(text);
        if (opts.clipboard === 'throw') throw new Error('writeText 同步抛错（演练）');
        if (opts.clipboard === 'reject') return Promise.reject(new Error('剪贴板被拒绝（演练）'));
        return Promise.resolve();
      }
    }
  };

  const localStorage = {
    _data: Object.create(null),
    getItem(key) { return Object.prototype.hasOwnProperty.call(this._data, key) ? this._data[key] : null; },
    setItem(key, value) { this._data[key] = String(value); },
    removeItem(key) { delete this._data[key]; }
  };
  if (opts.lang) localStorage.setItem('appery-lang', opts.lang);
  if (opts.lang) document.documentElement.lang = opts.lang === 'en' ? 'en' : 'zh-CN';

  const window = {
    document,
    localStorage,
    navigator,
    setTimeout: setTimeoutStub,
    clearTimeout: clearTimeoutStub,
    getSelection() { return selection; },
    __I18N_DICT__: undefined,
    __REPO_SNAPSHOT__: undefined
  };

  document.readyState = opts.readyState;

  const sandbox = { window, document, console };
  vm.createContext(sandbox);

  const harness = {
    options: opts,
    document,
    window,
    grid,
    emptyState,
    toggle,
    contacts: contactNodes,
    errors,
    clipboardCalls,
    execCalls,
    selections,
    flushTimers,
    runScript(source, filename) {
      safely(() => vm.runInContext(source, sandbox, { filename }));
    },
    dispatch(node, type, extra) {
      safely(() => node.dispatchEvent(Object.assign(
        { type, target: node, preventDefault() {} },
        extra || {}
      )));
    },
    /* 复刻 js/i18n.js 的 toggle 监听（storeLang → applyLang），先于 main.js 注册，
       以还原 index.html:120-123 的真实 defer 顺序。 */
    registerI18nToggleStub() {
      let current = opts.lang === 'en' ? 'en' : 'zh';
      toggle.addEventListener('click', () => {
        current = current === 'zh' ? 'en' : 'zh';
        localStorage.setItem('appery-lang', current);
        document.documentElement.lang = current === 'en' ? 'en' : 'zh-CN';
      });
    },
    createdDuringRun(fromIndex) {
      return document.createdNodes.slice(fromIndex);
    },
    nodeCount() {
      return document.createdNodes.length;
    }
  };

  if (opts.withDict) harness.runScript(readFile(FILES.dict), 'js/i18n-dict.js');

  if (opts.snapshot === 'real') {
    harness.runScript(readFile(FILES.snapshot), 'data/repos.js');
  } else if (opts.snapshot && typeof opts.snapshot === 'object') {
    window.__REPO_SNAPSHOT__ = opts.snapshot;
  } // 'missing' → 保持 undefined

  return harness;
}

/* ------------------------------------------------------------------ *
 * 卡片审计（既用于正向场景，也用于 G0 的负向对照）
 * ------------------------------------------------------------------ */

function expectedDescription(repo, lang, dict) {
  const localized = lang === 'en' ? repo.descEn : repo.descZh;
  if (typeof localized === 'string' && localized.trim() !== '') return localized;
  if (typeof repo.description === 'string' && repo.description.trim() !== '') return repo.description;
  const target = dict && dict[lang] && dict[lang]['projects.noDescription'];
  if (typeof target === 'string' && target !== '') return target;
  const fallback = dict && dict.zh && dict.zh['projects.noDescription'];
  return typeof fallback === 'string' ? fallback : '';
}

function cardsOf(harness) {
  return harness.grid.childNodes.filter((node) => hasClass(node, 'card'));
}

/** 返回问题字符串数组；空数组 = 全部通过。断言只读 main.js 真实产出的节点。 */
function auditCards(harness, repos, lang, dict) {
  const problems = [];
  const cards = cardsOf(harness);

  if (cards.length !== repos.length) {
    problems.push(`.card 数量 ${cards.length} ≠ 期望 ${repos.length}`);
  }

  repos.forEach((repo, index) => {
    const card = cards[index];
    if (!card) {
      problems.push(`缺少第 ${index + 1} 张卡片（${repo.name}）`);
      return;
    }
    if (card.tagName !== 'ARTICLE') problems.push(`${repo.name}: 卡片根节点不是 <article>`);
    if (card.getAttribute('data-repo') !== repo.name) {
      problems.push(`${repo.name}: data-repo 属性缺失或不符`);
    }
    if (card.parentNode !== harness.grid) problems.push(`${repo.name}: 卡片未挂在 #project-grid 下`);

    const title = card.childNodes.find((n) => hasClass(n, 'card__title'));
    if (!title) {
      problems.push(`${repo.name}: 缺 .card__title`);
    } else {
      const link = title.childNodes.find((n) => hasClass(n, 'card__link'));
      if (!link) {
        problems.push(`${repo.name}: 标题内缺 .card__link`);
      } else {
        if (link.tagName !== 'A') problems.push(`${repo.name}: .card__link 不是 <a>`);
        if (link.textContent !== repo.name) {
          problems.push(`${repo.name}: 链接文本 "${link.textContent}" ≠ "${repo.name}"`);
        }
        if (link.getAttribute('href') !== repo.url) {
          problems.push(`${repo.name}: href "${link.getAttribute('href')}" ≠ "${repo.url}"`);
        }
        if (link.getAttribute('target') !== '_blank') problems.push(`${repo.name}: 缺 target="_blank"`);
        if (!String(link.getAttribute('rel') || '').includes('noopener')) {
          problems.push(`${repo.name}: rel 未含 noopener`);
        }
      }
    }

    const desc = card.childNodes.find((n) => hasClass(n, 'card__desc'));
    if (!desc) {
      problems.push(`${repo.name}: 缺 .card__desc`);
    } else if (desc.textContent !== expectedDescription(repo, lang, dict)) {
      problems.push(`${repo.name}: 描述 "${desc.textContent}" ≠ 期望 "${expectedDescription(repo, lang, dict)}"`);
    }

    const meta = card.childNodes.find((n) => hasClass(n, 'card__meta'));
    if (!meta) {
      problems.push(`${repo.name}: 缺 .card__meta`);
    } else {
      const date = String(repo.pushedAt || '').slice(0, 10);
      const time = meta.childNodes.find((n) => n.tagName === 'TIME');
      if (!time) problems.push(`${repo.name}: .card__meta 缺 <time> 更新日期`);
      else if (time.textContent !== date) problems.push(`${repo.name}: 日期 "${time.textContent}" ≠ "${date}"`);
      if (typeof repo.language === 'string' && repo.language !== '') {
        const badge = meta.childNodes.some((n) => n.textContent === repo.language);
        if (!badge) problems.push(`${repo.name}: .card__meta 缺语言徽章 "${repo.language}"`);
      }
    }
  });

  return problems;
}

/* ------------------------------------------------------------------ *
 * 场景
 * ------------------------------------------------------------------ */

const MAIN_SOURCE = readFile(FILES.main);
const HTML = readFile(FILES.html);
const REAL_DICT = (() => {
  const sandbox = { window: {}, module: { exports: {} } };
  vm.createContext(sandbox);
  vm.runInContext(readFile(FILES.dict), sandbox, { filename: 'js/i18n-dict.js' });
  return sandbox.window.__I18N_DICT__ || sandbox.module.exports;
})();
const REAL_SNAPSHOT = (() => {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(readFile(FILES.snapshot), sandbox, { filename: 'data/repos.js' });
  return sandbox.window.__REPO_SNAPSHOT__;
})();
const REAL_REPOS = REAL_SNAPSHOT.repos;
const CONTACTS = extractContacts(HTML);

function section(title) {
  console.log('\n== ' + title + ' ==');
}

/* ------------------------------------------------------------------ */

function g0HarnessAndControls() {
  section('G0 桩保真 与 防空过负向对照');

  check('G0', 'index.html 含 id="project-grid"', HTML.includes('id="project-grid"'));
  check('G0', 'index.html 含 id="projects-empty"', HTML.includes('id="projects-empty"'));
  check('G0', 'index.html 含 id="lang-toggle"', HTML.includes('id="lang-toggle"'));
  check('G0', 'index.html 含 .project-grid 与 .empty-state 类名',
    HTML.includes('class="project-grid"') && HTML.includes('class="empty-state"'));
  check('G0', 'index.html 的 .project-grid 与 .empty-state 相邻（CSS 空状态机制的前提）',
    /<div class="project-grid" id="project-grid"><\/div>\s*<p class="empty-state" id="projects-empty"/.test(HTML));
  check('G0', 'index.html 以 defer 依次加载 i18n-dict.js → i18n.js → repos.js → main.js',
    /<script defer src="\/js\/i18n-dict\.js"><\/script>\s*<script defer src="\/js\/i18n\.js"><\/script>\s*<script defer src="\/data\/repos\.js"><\/script>\s*<script defer src="\/js\/main\.js"><\/script>/.test(HTML));
  check('G0', '从真实 index.html 提取到 4 个 .contact-item（标签键与值均非空）',
    CONTACTS.length === 4 && CONTACTS.every((c) => c.labelKey && c.value),
    `实际提取 ${CONTACTS.length} 个`);
  const qq = CONTACTS.find((c) => c.labelKey === 'contact.qqLabel');
  const wechat = CONTACTS.find((c) => c.labelKey === 'contact.wechatLabel');
  check('G0', '真实 index.html 的 QQ / 微信 号码非空',
    Boolean(qq && qq.value) && Boolean(wechat && wechat.value),
    `QQ=${qq && qq.value} 微信=${wechat && wechat.value}`);

  /* --- 负向对照 1：什么都做的空脚本 --- */
  const controlA = createHarness({});
  controlA.runScript('(function () { "use strict"; })();', 'fixture/noop.js');
  const problemsA = auditCards(controlA, REAL_REPOS, 'zh', REAL_DICT);
  check('G0', '负向对照 A：空脚本上 auditCards 必须报出问题（否则断言空过）',
    problemsA.length > 0);
  check('G0', '负向对照 A：至少报出「.card 数量 0 ≠ 期望 5」',
    problemsA.some((p) => p.includes('数量')), problemsA.join(' | '));
  check('G0', '负向对照 A：空脚本确实没往网格里挂任何节点',
    controlA.grid.childNodes.length === 0);

  /* --- 负向对照 2：卡片数量正确，但 href / 描述是编造的 --- */
  const fixtures = REAL_REPOS
    .map((r) => `  mk(${JSON.stringify(r.name)}, "https://example.invalid/${r.name}", "WRONG");`)
    .join('\n');
  const controlB = createHarness({});
  controlB.runScript(`(function () {
  "use strict";
  var grid = document.getElementById('project-grid');
  function mk(name, href, desc) {
    var card = document.createElement('article');
    card.className = 'card';
    card.setAttribute('data-repo', name);
    var title = document.createElement('h3');
    title.className = 'card__title';
    var link = document.createElement('a');
    link.className = 'card__link';
    link.setAttribute('href', href);
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener noreferrer');
    link.textContent = name;
    title.appendChild(link);
    card.appendChild(title);
    var p = document.createElement('p');
    p.className = 'card__desc';
    p.textContent = desc;
    card.appendChild(p);
    var meta = document.createElement('div');
    meta.className = 'card__meta';
    card.appendChild(meta);
    grid.appendChild(card);
  }
${fixtures}
})();`, 'fixture/wrong-cards.js');
  const problemsB = auditCards(controlB, REAL_REPOS, 'zh', REAL_DICT);
  check('G0', '负向对照 B：编造 href 必须被 auditCards 抓到',
    problemsB.some((p) => p.includes('href')), problemsB.slice(0, 2).join(' | '));
  check('G0', '负向对照 B：编造描述必须被 auditCards 抓到',
    problemsB.some((p) => p.includes('描述')));
  check('G0', '负向对照 B：卡片计数断言在这一对照下不应误报',
    !problemsB.some((p) => p.includes('数量')), problemsB.join(' | '));
}

/* ------------------------------------------------------------------ */

function g1RealSnapshot() {
  section('G1 真实快照渲染');

  check('G1', '真实 data/repos.js 的仓库数为 5', REAL_REPOS.length === 5, `实际 ${REAL_REPOS.length}`);

  const harness = createHarness({});
  const before = harness.nodeCount();
  harness.runScript(MAIN_SOURCE, 'js/main.js');

  const problems = auditCards(harness, REAL_REPOS, 'zh', REAL_DICT);
  check('G1', 'auditCards 在真实 main.js 上零问题', problems.length === 0, problems.join(' | '));

  const cards = cardsOf(harness);
  check('G1', '#project-grid 下恰有 5 个 .card', cards.length === 5, `实际 ${cards.length}`);
  check('G1', '每张卡片都是 document.createElement 真实产出的节点（非桩自造）',
    cards.length === 5 && cards.every((c) => harness.createdDuringRun(before).indexOf(c) !== -1));
  check('G1', '每张卡片的 href 等于对应仓库 url',
    cards.length === 5 && REAL_REPOS.every((repo, i) => {
      const link = cards[i] && cards[i].querySelector('.card__link');
      return link && link.getAttribute('href') === repo.url;
    }));
  check('G1', '每张卡片的 .card__meta 都含语言徽章或更新日期（5 个仓库至少各有一项）',
    cards.length === 5 && cards.every((c) => c.querySelector('.card__meta').childNodes.length > 0));
  check('G1', 'JS 未触碰空状态元素的内联样式（保持 CSS 机制）',
    harness.emptyState.getAttribute('style') === null && harness.emptyState.className === 'empty-state');
  check('G1', '渲染过程中零未捕获异常（前置事实：上面已确认确实渲染了 5 张卡）',
    harness.errors.length === 0, harness.errors.map((e) => e && e.message).join(' | '));
}

/* ------------------------------------------------------------------ */

function g2FallbackChain() {
  section('G2 描述回退链');

  const harness = createHarness({});
  harness.runScript(MAIN_SOURCE, 'js/main.js');
  const cards = cardsOf(harness);
  const descOf = (name) => {
    const card = cards.find((c) => c.getAttribute('data-repo') === name);
    const desc = card && card.childNodes.find((n) => hasClass(n, 'card__desc'));
    return desc ? desc.textContent : null;
  };

  const noDescZh = REAL_DICT.zh['projects.noDescription'];
  check('G2', '词典存在降级文案键 projects.noDescription（zh 非空）',
    typeof noDescZh === 'string' && noDescZh !== '', `zh="${noDescZh}"`);

  check('G2', 'MyApplication 走第 ③ 层（i18n 降级文案 zh）', descOf('MyApplication') === noDescZh,
    `实际 "${descOf('MyApplication')}"`);
  check('G2', 'test 走第 ③ 层（i18n 降级文案 zh）', descOf('test') === noDescZh,
    `实际 "${descOf('test')}"`);
  check('G2', 'MyApplication / test 的 description 确实为空（确认它们必然下沉到第 ③ 层）',
    REAL_REPOS.filter((r) => r.name === 'MyApplication' || r.name === 'test')
      .every((r) => r.description === ''));

  REAL_REPOS.filter((r) => r.description !== '').forEach((repo) => {
    check('G2', `${repo.name} 走第 ② 层（GitHub 原文）`,
      descOf(repo.name) === repo.description, `实际 "${descOf(repo.name)}"`);
  });
  check('G2', '真实数据中「走第 ② 层」的是 APpery1 / QQscript / RamdamSysytem',
    REAL_REPOS.filter((r) => r.description !== '').map((r) => r.name).join(',') === 'APpery1,QQscript,RamdamSysytem');

  /* 第 ① 层在真实数据里测不到：必须先证明它确实全空，再用人造快照补测。 */
  check('G2', '真实快照所有仓库的 descZh 与 descEn 均为空串',
    REAL_REPOS.every((r) => r.descZh === '' && r.descEn === ''));

  const synthetic = {
    generatedAt: '2026-01-01T00:00:00.000Z',
    owner: 'APpery1',
    repos: [
      { name: 'OnlyZh', url: 'https://example.invalid/OnlyZh', description: 'GH 原文', descZh: '中文覆盖', descEn: '', language: 'Python', pushedAt: '2026-01-02T03:04:05Z', stars: 0, fork: false },
      { name: 'BothLangs', url: 'https://example.invalid/BothLangs', description: 'GH 原文', descZh: '中文覆盖', descEn: 'English override', language: null, pushedAt: '2026-01-03T03:04:05Z', stars: 0, fork: false }
    ]
  };
  const hZh = createHarness({ snapshot: synthetic });
  hZh.runScript(MAIN_SOURCE, 'js/main.js');
  const zhCards = cardsOf(hZh);
  const zhDesc = (name) => {
    const card = zhCards.find((c) => c.getAttribute('data-repo') === name);
    return card ? card.querySelector('.card__desc').textContent : null;
  };
  check('G2', '人造快照：descZh 非空时优先取 descZh（压过 description）',
    zhDesc('OnlyZh') === '中文覆盖', `实际 "${zhDesc('OnlyZh')}"`);
  check('G2', '人造快照：descEn 非空但当前为 zh 时仍取 descZh（不做跨语言回退）',
    zhDesc('BothLangs') === '中文覆盖', `实际 "${zhDesc('BothLangs')}"`);

  const hEn = createHarness({ snapshot: synthetic, lang: 'en' });
  hEn.runScript(MAIN_SOURCE, 'js/main.js');
  const enCards = cardsOf(hEn);
  const enDesc = (name) => {
    const card = enCards.find((c) => c.getAttribute('data-repo') === name);
    return card ? card.querySelector('.card__desc').textContent : null;
  };
  check('G2', '人造快照：en 下 descEn 非空时取 descEn',
    enDesc('BothLangs') === 'English override', `实际 "${enDesc('BothLangs')}"`);
  check('G2', '人造快照：en 下 descEn 为空时退回 description 原文（不下沉到 descZh）',
    enDesc('OnlyZh') === 'GH 原文', `实际 "${enDesc('OnlyZh')}"`);
}

/* ------------------------------------------------------------------ */

function g3EmptyAndMissing() {
  section('G3 无快照 / 空快照 → 网格保持为空');

  const missing = createHarness({ snapshot: 'missing' });
  const beforeMissing = missing.nodeCount();
  missing.runScript(MAIN_SOURCE, 'js/main.js');
  check('G3', '[快照缺失] window.__REPO_SNAPSHOT__ 确实为 undefined（前置事实）',
    missing.window.__REPO_SNAPSHOT__ === undefined);
  check('G3', '[快照缺失] #project-grid 保持为空（CSS 据此显示 #projects-empty）',
    missing.grid.childNodes.length === 0, `实际挂了 ${missing.grid.childNodes.length} 个节点`);
  check('G3', '[快照缺失] main.js 未创建任何 .card 节点',
    missing.createdDuringRun(beforeMissing).filter((n) => hasClass(n, 'card')).length === 0);
  check('G3', '[快照缺失] 零未捕获异常（前置事实：已确认网格为空，说明该分支确实执行过）',
    missing.errors.length === 0, missing.errors.map((e) => e && e.message).join(' | '));

  const empty = createHarness({
    snapshot: { generatedAt: '2026-01-01T00:00:00.000Z', owner: 'APpery1', repos: [] }
  });
  const beforeEmpty = empty.nodeCount();
  empty.runScript(MAIN_SOURCE, 'js/main.js');
  check('G3', '[repos: []] 快照对象存在且 repos 为空数组（前置事实）',
    Array.isArray(empty.window.__REPO_SNAPSHOT__.repos) && empty.window.__REPO_SNAPSHOT__.repos.length === 0);
  check('G3', '[repos: []] #project-grid 保持为空',
    empty.grid.childNodes.length === 0, `实际挂了 ${empty.grid.childNodes.length} 个节点`);
  check('G3', '[repos: []] main.js 未创建任何 .card 节点',
    empty.createdDuringRun(beforeEmpty).filter((n) => hasClass(n, 'card')).length === 0);
  check('G3', '[repos: []] 零未捕获异常',
    empty.errors.length === 0, empty.errors.map((e) => e && e.message).join(' | '));

  /* 反向确认：G3 的两个场景并非「因为 main.js 根本没跑」才为空。 */
  const sanity = createHarness({});
  sanity.runScript(MAIN_SOURCE, 'js/main.js');
  check('G3', '同一 main.js 在真实快照下确实会产出节点（排除「脚本没跑」这一解释）',
    sanity.grid.childNodes.length === REAL_REPOS.length);
}

/* ------------------------------------------------------------------ */

function g4English() {
  section('G4 英文渲染');

  const harness = createHarness({ lang: 'en' });
  check('G4', '前置事实：语言信号已就位（localStorage + documentElement.lang 均为 en）',
    harness.window.localStorage.getItem('appery-lang') === 'en' &&
    harness.document.documentElement.lang === 'en');

  harness.runScript(MAIN_SOURCE, 'js/main.js');
  const problems = auditCards(harness, REAL_REPOS, 'en', REAL_DICT);
  check('G4', 'auditCards 在 en 下零问题（描述按 en 期望值逐条比对）', problems.length === 0,
    problems.join(' | '));

  const cards = cardsOf(harness);
  const descOf = (name) => {
    const card = cards.find((c) => c.getAttribute('data-repo') === name);
    return card ? card.querySelector('.card__desc').textContent : null;
  };
  const noDescEn = REAL_DICT.en['projects.noDescription'];
  check('G4', 'en 侧降级文案键存在且非空', typeof noDescEn === 'string' && noDescEn !== '',
    `en="${noDescEn}"`);
  check('G4', 'MyApplication 在 en 下取 en 降级文案', descOf('MyApplication') === noDescEn,
    `实际 "${descOf('MyApplication')}"`);
  check('G4', 'test 在 en 下取 en 降级文案', descOf('test') === noDescEn,
    `实际 "${descOf('test')}"`);
  check('G4', 'QQscript 在 en 下仍取 GitHub 原文（原文不随语言变化）',
    descOf('QQscript') === 'QQ auto-reply GUI with OCR region overlay');
  check('G4', 'en 下卡片数仍为 5、且无未捕获异常',
    cards.length === 5 && harness.errors.length === 0);
}

/* ------------------------------------------------------------------ */

async function g5Copy() {
  section('G5 联系方式复制');

  const qq = CONTACTS.find((c) => c.labelKey === 'contact.qqLabel');
  const wechat = CONTACTS.find((c) => c.labelKey === 'contact.wechatLabel');
  const nodeFor = (harness, key) => harness.contacts.find((c) => c.labelKey === key).li;
  const feedbackOf = (item) =>
    item.childNodes.find((n) => n.getAttribute('role') === 'status');

  /* --- 成功路径：Clipboard API 可用 --- */
  const ok = createHarness({ clipboard: 'resolve' });
  ok.runScript(MAIN_SOURCE, 'js/main.js');
  const okQq = nodeFor(ok, 'contact.qqLabel');
  const okWechat = nodeFor(ok, 'contact.wechatLabel');

  check('G5', '成功路径前置事实：QQ / 微信 条目确有 main.js 添加的 role=status 反馈元素',
    Boolean(feedbackOf(okQq)) && Boolean(feedbackOf(okWechat)));

  ok.dispatch(okQq, 'click');
  await new Promise((resolve) => setImmediate(resolve));
  ok.flushTimers(0);
  check('G5', '点击 QQ 后剪贴板被调用恰 1 次', ok.clipboardCalls.length === 1,
    `实际 ${ok.clipboardCalls.length} 次`);
  check('G5', `点击 QQ 写入的号码等于 index.html 中的 ${qq.value}`,
    ok.clipboardCalls[0] === qq.value, `实际 "${ok.clipboardCalls[0]}"`);
  check('G5', '点击 QQ 后反馈文案为「已复制」(zh)',
    feedbackOf(okQq).textContent === REAL_DICT.zh['contact.copied'],
    `实际 "${feedbackOf(okQq).textContent}"`);

  ok.dispatch(okWechat, 'click');
  await new Promise((resolve) => setImmediate(resolve));
  ok.flushTimers(0);
  check('G5', `点击微信写入的号码等于 index.html 中的 ${wechat.value}`,
    ok.clipboardCalls[1] === wechat.value, `实际 "${ok.clipboardCalls[1]}"`);
  check('G5', '点击微信后反馈文案为「已复制」(zh)',
    feedbackOf(okWechat).textContent === REAL_DICT.zh['contact.copied']);
  check('G5', '两次点击共调用剪贴板 2 次（无重复触发）', ok.clipboardCalls.length === 2);
  check('G5', '成功路径零未捕获异常（前置事实：上面已确认剪贴板确实被调用了 2 次）',
    ok.errors.length === 0, ok.errors.map((e) => e && e.message).join(' | '));

  const cleared = ok.flushTimers(2000);
  check('G5', '反馈在 2 秒后自动清除（确实存在该定时器）', cleared === 2, `实际触发 ${cleared} 个`);
  check('G5', '反馈文案已被清空', feedbackOf(okWechat).textContent === '');

  /* --- 失败路径 A：writeText 返回 rejected promise --- */
  const rejected = createHarness({ clipboard: 'reject' });
  rejected.runScript(MAIN_SOURCE, 'js/main.js');
  const rejectedQq = nodeFor(rejected, 'contact.qqLabel');
  rejected.dispatch(rejectedQq, 'click');
  await new Promise((resolve) => setImmediate(resolve));
  rejected.flushTimers(0);
  check('G5', '[reject] 剪贴板确实被尝试调用过（前置事实）',
    rejected.clipboardCalls.length === 1 && rejected.clipboardCalls[0] === qq.value);
  check('G5', '[reject] 反馈为「请手动复制」而非谎报成功',
    feedbackOf(rejectedQq).textContent === REAL_DICT.zh['contact.copyManual'],
    `实际 "${feedbackOf(rejectedQq).textContent}"`);
  check('G5', '[reject] 已选中号码文本作为降级路径（真实调用了 Selection API）',
    rejected.selections.length === 1);
  check('G5', '[reject] 零未捕获异常（前置事实：降级分支确已执行）',
    rejected.errors.length === 0, rejected.errors.map((e) => e && e.message).join(' | '));

  /* --- 失败路径 B：writeText 同步抛错 --- */
  const thrown = createHarness({ clipboard: 'throw' });
  thrown.runScript(MAIN_SOURCE, 'js/main.js');
  const thrownQq = nodeFor(thrown, 'contact.qqLabel');
  thrown.dispatch(thrownQq, 'click');
  await new Promise((resolve) => setImmediate(resolve));
  thrown.flushTimers(0);
  check('G5', '[throw] 同步抛错被捕获，反馈为「请手动复制」',
    feedbackOf(thrownQq).textContent === REAL_DICT.zh['contact.copyManual']);
  check('G5', '[throw] 零未捕获异常（前置事实：反馈已写出，说明失败分支确实执行）',
    thrown.errors.length === 0);

  /* --- 失败路径 C：完全没有 Clipboard API，退回 execCommand --- */
  const legacyOk = createHarness({ clipboard: 'absent', execCommand: 'true' });
  legacyOk.runScript(MAIN_SOURCE, 'js/main.js');
  const legacyOkQq = nodeFor(legacyOk, 'contact.qqLabel');
  legacyOk.dispatch(legacyOkQq, 'click');
  await new Promise((resolve) => setImmediate(resolve));
  legacyOk.flushTimers(0);
  check('G5', '[无 Clipboard API] 退回 execCommand("copy") 且返回 true 时报成功',
    legacyOk.execCalls[0] === 'copy' &&
    feedbackOf(legacyOkQq).textContent === REAL_DICT.zh['contact.copied'],
    `execCalls=${JSON.stringify(legacyOk.execCalls)}`);
  check('G5', '[无 Clipboard API] 上报成功前先选中了号码文本', legacyOk.selections.length === 1);
  check('G5', '[无 Clipboard API] 零未捕获异常', legacyOk.errors.length === 0);

  const legacyFail = createHarness({ clipboard: 'absent', execCommand: 'throw' });
  legacyFail.runScript(MAIN_SOURCE, 'js/main.js');
  const legacyFailQq = nodeFor(legacyFail, 'contact.qqLabel');
  legacyFail.dispatch(legacyFailQq, 'click');
  await new Promise((resolve) => setImmediate(resolve));
  legacyFail.flushTimers(0);
  check('G5', '[无 Clipboard API + execCommand 抛错] 降级为「请手动复制」，不静默、不抛错',
    legacyFail.execCalls.length === 1 &&
    feedbackOf(legacyFailQq).textContent === REAL_DICT.zh['contact.copyManual'] &&
    legacyFail.errors.length === 0,
    `errors=${legacyFail.errors.map((e) => e && e.message).join(' | ')}`);
}

/* ------------------------------------------------------------------ */

async function g6LangSwitch() {
  section('G6 语言切换后卡片跟随重渲染（本任务最大设计风险的机械验证）');

  const noDescZh = REAL_DICT.zh['projects.noDescription'];
  const noDescEn = REAL_DICT.en['projects.noDescription'];
  const descOf = (harness, name) => {
    const card = cardsOf(harness).find((c) => c.getAttribute('data-repo') === name);
    return card ? card.querySelector('.card__desc').textContent : null;
  };

  /* --- 正向：模拟真实 defer 顺序（i18n.js 的监听器先注册，main.js 的后注册） --- */
  const harness = createHarness({});
  harness.registerI18nToggleStub();
  harness.runScript(MAIN_SOURCE, 'js/main.js');
  check('G6', '前置事实：初始为中文，MyApplication 使用 zh 降级文案',
    harness.window.localStorage.getItem('appery-lang') === null &&
    descOf(harness, 'MyApplication') === noDescZh,
    `初始 "${descOf(harness, 'MyApplication')}"`);

  harness.dispatch(harness.toggle, 'click');
  await new Promise((resolve) => setImmediate(resolve));
  harness.flushTimers(0);

  check('G6', '切换后 localStorage 与 documentElement.lang 已变为 en（i18n.js 行为被复刻）',
    harness.window.localStorage.getItem('appery-lang') === 'en' &&
    harness.document.documentElement.lang === 'en');
  check('G6', '切换后卡片仍为 5 张（重渲染而非丢失）', cardsOf(harness).length === 5);
  check('G6', '切换后 MyApplication 描述变为 en 降级文案',
    descOf(harness, 'MyApplication') === noDescEn, `实际 "${descOf(harness, 'MyApplication')}"`);
  check('G6', '切换后 test 描述变为 en 降级文案', descOf(harness, 'test') === noDescEn);
  check('G6', '切换后 GitHub 原文类仓库的描述保持不变（原文不随语言变）',
    descOf(harness, 'QQscript') === 'QQ auto-reply GUI with OCR region overlay');
  check('G6', '切换过程零未捕获异常（前置事实：描述确已变成英文）',
    harness.errors.length === 0, harness.errors.map((e) => e && e.message).join(' | '));

  /* --- 负向对照：不触发语言切换时点同一按钮，文案不得改变 --- */
  const control = createHarness({});
  control.runScript(MAIN_SOURCE, 'js/main.js');
  const before = descOf(control, 'MyApplication');
  control.dispatch(control.toggle, 'click'); // 没有 i18n.js 的监听器 → 语言未变
  await new Promise((resolve) => setImmediate(resolve));
  control.flushTimers(0);
  check('G6', '负向对照：语言未变时点按钮，描述不得变（证明 G6 正向不是恒真）',
    before === noDescZh && descOf(control, 'MyApplication') === noDescZh,
    `before="${before}" after="${descOf(control, 'MyApplication')}"`);

  /* --- 附加：切回中文也能正确回退 --- */
  harness.dispatch(harness.toggle, 'click');
  await new Promise((resolve) => setImmediate(resolve));
  harness.flushTimers(0);
  check('G6', '再切一次回到中文，描述回到 zh 降级文案',
    descOf(harness, 'MyApplication') === noDescZh,
    `实际 "${descOf(harness, 'MyApplication')}"`);
  check('G6', '往返切换后卡片数仍为 5', cardsOf(harness).length === 5);

  /* --- 另一条启动路径：脚本执行时 readyState === 'loading'（浏览器若把 defer 视为
     loading，i18n.js / main.js 都会挂到 DOMContentLoaded 上）。两种时序都必须能渲染。 --- */
  const lateStart = createHarness({ readyState: 'loading' });
  lateStart.runScript(MAIN_SOURCE, 'js/main.js');
  check('G6', '[readyState=loading] 脚本执行时尚未渲染（真实等待 DOMContentLoaded）',
    cardsOf(lateStart).length === 0 && lateStart.errors.length === 0);
  lateStart.document.fireDOMContentLoaded();
  check('G6', '[readyState=loading] DOMContentLoaded 后渲染出 5 张卡片',
    cardsOf(lateStart).length === 5, `实际 ${cardsOf(lateStart).length}`);
  check('G6', '[readyState=loading] 该路径同样零未捕获异常（前置事实：卡片已渲染）',
    lateStart.errors.length === 0, lateStart.errors.map((e) => e && e.message).join(' | '));
}

/* ------------------------------------------------------------------ */

async function main() {
  console.log('== task-003 渲染验收（node tests/task-003-render.mjs） ==');
  console.log(`main.js  : ${FILES.main}`);
  console.log(`字符数   : ${MAIN_SOURCE.length}（不是字节数；UTF-8 字节数见报告 §1 的 ls -l）`);

  g0HarnessAndControls();
  g1RealSnapshot();
  g2FallbackChain();
  g3EmptyAndMissing();
  g4English();
  await g5Copy();
  await g6LangSwitch();

  console.log('\n== 分组结果 ==');
  for (const [group, entry] of stats) {
    console.log(`  ${group}: 通过 ${entry.pass} / 失败 ${entry.fail}`);
  }
  console.log(`\n总计：通过 ${[...stats.values()].reduce((a, e) => a + e.pass, 0)} 项，失败 ${failures.length} 项`);

  if (failures.length > 0) {
    console.error('\n失败明细：');
    for (const f of failures) console.error(`  [${f.group}] ${f.title}`);
    return 1;
  }
  console.log('全部通过');
  return 0;
}

/* 守卫：万一被 Node test runner 当作测试文件加载（本文件命名已规避），不要打断它的流程。 */
if (!process.env.NODE_TEST_CONTEXT) {
  main().then((code) => process.exit(code));
}
