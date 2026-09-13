/*
 * main.js — 页面行为层（零依赖、零网络请求、非 ES module）
 *
 * 加载方式：index.html:123 以普通 <script defer src="/js/main.js"> 加载。
 * defer 保证按文档顺序执行，因此本文件运行时以下全局已就绪：
 *   window.__I18N_DICT__      ← /js/i18n-dict.js
 *   window.__REPO_SNAPSHOT__  ← /data/repos.js（构建期落盘，页面零运行时外呼）
 *
 * 本文件的三项职责：
 *   1. 把 window.__REPO_SNAPSHOT__.repos 渲染成 #project-grid 里的 .card 节点；
 *   2. 快照缺失或为空时**不往网格里塞任何节点**，让网格保持空 —— 显示/隐藏空状态
 *      交给 styles/main.css 的 `.project-grid:not(:empty) + .empty-state` 规则，
 *      本文件不碰 #projects-empty 的内联样式（那会与既有 CSS 机制打架）；
 *   3. 让「QQ / 微信」条目可点击复制，并有明确的成功/失败反馈（失败不静默）。
 *
 * ★ 语言切换的耦合方式（本任务最大的设计风险，详见 dev-r1 报告）
 *   卡片是本文件动态生成的，而 js/i18n.js 的 applyLang 只改写**DOM 里已存在**的
 *   [data-i18n] 元素，它不会、也无法重渲染我们的卡片；且 js/i18n.js 已被冻结、不得修改。
 *   本文件采用「在 #lang-toggle 上追加自己的 click 监听 + 延迟到宏任务里重渲染」：
 *     · index.html:120-123 的 defer 顺序固定 → i18n.js 的监听器先注册、本文件的监听器后注册；
 *     · 同一元素同一事件类型的监听器按注册顺序触发 → 本文件必然在语言已切换后才读到状态；
 *     · 再推迟到宏任务（setTimeout 0），使本逻辑对监听器注册顺序**不敏感**（双保险）。
 *   语言状态从 localStorage['appery-lang']（i18n.js 的持久化键）读，缺失时回退到
 *   document.documentElement.lang（applyLang 每次切换都会写它），再回退到默认中文。
 */

(function () {
  'use strict';

  var LANG_STORAGE_KEY = 'appery-lang';
  var DEFAULT_LANG = 'zh';
  var SUPPORTED_LANGS = ['zh', 'en'];

  var NO_DESC_KEY = 'projects.noDescription';
  var COPIED_KEY = 'contact.copied';
  var MANUAL_KEY = 'contact.copyManual';

  /* 可复制的联系人：按词条键定位，号码从 index.html 的 DOM 里读，不在本文件重复一份。 */
  var COPYABLE_LABEL_KEYS = ['contact.qqLabel', 'contact.wechatLabel'];

  var FEEDBACK_CLEAR_MS = 2000;

  /* ------------------------------------------------------------ 小工具 */

  function createElement(tag, className, text) {
    var node = document.createElement(tag);
    if (className) {
      node.className = className;
    }
    if (text !== undefined && text !== null) {
      node.textContent = text;
    }
    return node;
  }

  function isBlank(value) {
    return typeof value !== 'string' || value.trim() === '';
  }

  function clearChildren(node) {
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
  }

  function defer(fn) {
    if (typeof window.setTimeout === 'function') {
      window.setTimeout(fn, 0);
      return;
    }
    fn();
  }

  /* ------------------------------------------------------------ i18n 取词 */

  function getDict() {
    if (typeof window !== 'undefined' && window.__I18N_DICT__) {
      return window.__I18N_DICT__;
    }
    return null;
  }

  /* 与 js/i18n.js 的 lookup 同构：目标语言缺失时回退中文，仍缺失则返回 null。 */
  function translate(dict, lang, key) {
    var target;
    var fallback;
    if (!dict) {
      return null;
    }
    target = dict[lang];
    if (target && typeof target[key] === 'string' && target[key] !== '') {
      return target[key];
    }
    fallback = dict[DEFAULT_LANG];
    if (fallback && typeof fallback[key] === 'string' && fallback[key] !== '') {
      return fallback[key];
    }
    return null;
  }

  function normalizeLang(value) {
    return SUPPORTED_LANGS.indexOf(value) === -1 ? null : value;
  }

  /* 语言判定：持久化键优先（i18n.js 在 applyLang 之前写入），
     document.documentElement.lang 兜底（applyLang 每次都会同步它）。 */
  function readLang() {
    var stored = null;
    var htmlLang = '';
    var lower = '';
    try {
      stored = window.localStorage ? window.localStorage.getItem(LANG_STORAGE_KEY) : null;
    } catch (err) {
      stored = null; /* 隐私模式下 localStorage 会抛异常 */
    }
    if (normalizeLang(stored)) {
      return normalizeLang(stored);
    }
    htmlLang = document.documentElement ? document.documentElement.lang : '';
    if (typeof htmlLang === 'string') {
      lower = htmlLang.toLowerCase();
      if (lower.indexOf('en') === 0) {
        return 'en';
      }
      if (lower.indexOf('zh') === 0) {
        return 'zh';
      }
    }
    return DEFAULT_LANG;
  }

  /* ------------------------------------------------------------ 卡片渲染 */

  /* 描述回退链（严格按序）：
     ① 按当前语言取 descZh / descEn → ② GitHub 原始 description → ③ i18n 降级文案。
     不做跨语言回退：英文界面下 descEn 为空时直接下沉到 ②，而不是拿 descZh 顶上。 */
  function pickDescription(repo, lang, dict) {
    var localized = lang === 'en' ? repo.descEn : repo.descZh;
    var fallback;
    if (!isBlank(localized)) {
      return localized;
    }
    if (!isBlank(repo.description)) {
      return repo.description;
    }
    fallback = translate(dict, lang, NO_DESC_KEY);
    return fallback === null ? '' : fallback;
  }

  /* pushedAt 是 ISO 8601（如 2026-09-13T08:30:43Z），直接截日期部分，
     不走 new Date() —— 免得本机时区把日期算偏一天。 */
  function formatDate(value) {
    var date;
    if (typeof value !== 'string' || value.length < 10) {
      return '';
    }
    date = value.slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '';
  }

  function buildCard(repo, lang, dict) {
    var card = createElement('article', 'card');
    var title = createElement('h3', 'card__title');
    var link = createElement('a', 'card__link', typeof repo.name === 'string' ? repo.name : '');
    var meta = createElement('div', 'card__meta');
    var language = repo.language;
    var date = formatDate(repo.pushedAt);
    var time;

    if (typeof repo.name === 'string') {
      card.setAttribute('data-repo', repo.name);
    }

    link.setAttribute('href', typeof repo.url === 'string' ? repo.url : '');
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener noreferrer');
    title.appendChild(link);
    card.appendChild(title);

    card.appendChild(createElement('p', 'card__desc', pickDescription(repo, lang, dict)));

    if (!isBlank(language)) {
      /* 语言徽章：只能用冻结类名，故用无类名的 span，靠 .card__meta 的 flex/gap 排版。 */
      meta.appendChild(createElement('span', null, language));
    }
    if (date !== '') {
      time = createElement('time', null, date);
      time.setAttribute('datetime', repo.pushedAt);
      meta.appendChild(time);
    }
    card.appendChild(meta);

    return card;
  }

  function readRepos() {
    var snapshot = typeof window !== 'undefined' ? window.__REPO_SNAPSHOT__ : null;
    if (!snapshot || !Array.isArray(snapshot.repos)) {
      return [];
    }
    return snapshot.repos;
  }

  function renderRepos(lang) {
    var grid = document.getElementById('project-grid');
    var dict = getDict();
    var repos;
    var i;
    var repo;

    if (!grid) {
      return;
    }

    clearChildren(grid);
    repos = readRepos();

    for (i = 0; i < repos.length; i += 1) {
      repo = repos[i];
      if (!repo || typeof repo !== 'object') {
        continue;
      }
      grid.appendChild(buildCard(repo, lang, dict));
    }

    /* 快照缺失或为空时循环体不执行 → 网格保持空 → CSS 让 #projects-empty 可见。
       刻意不写任何针对空状态元素的内联样式。 */
  }

  /* ------------------------------------------------------------ 语言切换 */

  function bindLangToggle() {
    var button = document.getElementById('lang-toggle');
    if (!button) {
      return;
    }
    button.addEventListener('click', function () {
      /* i18n.js 的监听器先注册、先执行；此处再推迟到宏任务，
         即使将来监听器注册顺序反转，读到的也一定是切换后的语言。 */
      defer(function () {
        renderRepos(readLang());
      });
    });
  }

  /* ------------------------------------------------------------ 复制到剪贴板 */

  function selectNodeText(node) {
    var selection;
    var range;
    if (!node || typeof window.getSelection !== 'function' || typeof document.createRange !== 'function') {
      return false;
    }
    selection = window.getSelection();
    if (!selection) {
      return false;
    }
    try {
      range = document.createRange();
      range.selectNodeContents(node);
      selection.removeAllRanges();
      selection.addRange(range);
      return true;
    } catch (err) {
      return false;
    }
  }

  function execCommandCopy() {
    if (typeof document.execCommand !== 'function') {
      return false;
    }
    try {
      return document.execCommand('copy') === true;
    } catch (err) {
      return false;
    }
  }

  function copyText(text, node, onSuccess, onFailure) {
    var nav = typeof window !== 'undefined' ? window.navigator : null;
    var result;

    if (nav && nav.clipboard && typeof nav.clipboard.writeText === 'function') {
      try {
        result = nav.clipboard.writeText(text);
      } catch (err) {
        onFailure();
        return;
      }
      if (result && typeof result.then === 'function') {
        result.then(onSuccess, onFailure);
      } else {
        onSuccess();
      }
      return;
    }

    /* 无 Clipboard API（非 HTTPS / 无权限 / 旧浏览器）：退回 execCommand。
       注意 execCommand('copy') 复制的是**当前选区**，必须先选中号码文本再执行，
       否则它只会返回 true 却什么也没复制 —— 那等于静默失败。 */
    if (selectNodeText(node) && execCommandCopy()) {
      onSuccess();
    } else {
      onFailure();
    }
  }

  function findContactItem(labelKey) {
    var items = document.querySelectorAll('.contact-item');
    var i;
    var label;
    for (i = 0; i < items.length; i += 1) {
      label = items[i].querySelector('[data-i18n]');
      if (label && label.getAttribute('data-i18n') === labelKey) {
        return items[i];
      }
    }
    return null;
  }

  function bindCopyItem(item) {
    var valueNode = item.querySelector('.contact-item__value');
    var feedback;
    var clearTimer = null;

    if (!valueNode) {
      return;
    }

    feedback = document.createElement('span');
    feedback.setAttribute('role', 'status');
    feedback.setAttribute('aria-live', 'polite');
    item.appendChild(feedback);

    function show(dictKey) {
      var text = translate(getDict(), readLang(), dictKey);
      if (text === null) {
        return;
      }
      feedback.textContent = text;
      if (clearTimer !== null && typeof window.clearTimeout === 'function') {
        window.clearTimeout(clearTimer);
      }
      clearTimer = typeof window.setTimeout === 'function'
        ? window.setTimeout(function () {
          feedback.textContent = '';
          clearTimer = null;
        }, FEEDBACK_CLEAR_MS)
        : null;
    }

    function handle() {
      copyText(
        valueNode.textContent,
        valueNode,
        function () { show(COPIED_KEY); },
        function () {
          /* 降级：把号码选中，让用户可 Ctrl+C；同时给出可读提示，绝不静默。 */
          selectNodeText(valueNode);
          show(MANUAL_KEY);
        }
      );
    }

    item.setAttribute('tabindex', '0');
    item.addEventListener('click', handle);
    item.addEventListener('keydown', function (event) {
      var key = event ? event.key : null;
      if (key === 'Enter' || key === ' ' || key === 'Spacebar') {
        event.preventDefault();
        handle();
      }
    });
  }

  function bindCopyTargets() {
    var i;
    var item;
    for (i = 0; i < COPYABLE_LABEL_KEYS.length; i += 1) {
      item = findContactItem(COPYABLE_LABEL_KEYS[i]);
      if (item) {
        bindCopyItem(item);
      }
    }
  }

  /* ------------------------------------------------------------ 启动 */

  function boot() {
    /* 词典缺失（404 / 被拦截）时不做任何改写，与 js/i18n.js 的降级策略一致：
       页面保留 index.html 里写死的中文，复制反馈这类需要双语的增强则整体不启用。 */
    if (!getDict()) {
      return;
    }
    bindLangToggle();
    bindCopyTargets();
    renderRepos(readLang());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
