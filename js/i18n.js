/*
 * i18n.js — 语言切换逻辑（零依赖、零网络请求）
 *
 * 依赖 /js/i18n-dict.js 先把词典挂到 window.__I18N_DICT__。
 * index.html 中本文件紧跟词典之后、同为普通 <script defer>，
 * defer 按文档顺序执行，因此词典必然已就绪。
 *
 * 降级策略：若词典缺失（文件 404、被拦截、加载失败），本文件不做任何改写，
 * 页面保留 index.html 里写死的中文文案 —— 静默失败也不影响可读性。
 *
 * 持久化：localStorage 键名恰为 `appery-lang`，取值 'zh' | 'en'，默认 'zh'。
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'appery-lang';
  var DEFAULT_LANG = 'zh';
  var SUPPORTED_LANGS = ['zh', 'en'];

  // 文档语言标记：中文沿用 index.html 冻结基线里的 zh-CN，不收敛为 zh。
  var HTML_LANG = { zh: 'zh-CN', en: 'en' };

  var currentLang = DEFAULT_LANG;

  function getDict() {
    if (typeof window !== 'undefined' && window.__I18N_DICT__) {
      return window.__I18N_DICT__;
    }
    return null;
  }

  function normalizeLang(lang) {
    return SUPPORTED_LANGS.indexOf(lang) === -1 ? DEFAULT_LANG : lang;
  }

  /* localStorage 在隐私模式或禁用 Cookie 时会抛异常，读写都要兜住。 */
  function readStoredLang() {
    try {
      var stored = window.localStorage.getItem(STORAGE_KEY);
      return stored === null ? DEFAULT_LANG : normalizeLang(stored);
    } catch (err) {
      return DEFAULT_LANG;
    }
  }

  function storeLang(lang) {
    try {
      window.localStorage.setItem(STORAGE_KEY, lang);
    } catch (err) {
      /* 存不了就只在本次会话生效，不影响切换行为 */
    }
  }

  /* 词条查找：目标语言缺失时回退到中文，保证界面上不出现空字符串。 */
  function lookup(dict, lang, key) {
    var target = dict[lang];
    if (target && typeof target[key] === 'string') {
      return target[key];
    }
    var fallback = dict[DEFAULT_LANG];
    if (fallback && typeof fallback[key] === 'string') {
      return fallback[key];
    }
    return null;
  }

  function applyLang(lang, dict) {
    var nodes = document.querySelectorAll('[data-i18n]');
    var i;
    var node;
    var key;
    var text;

    for (i = 0; i < nodes.length; i += 1) {
      node = nodes[i];
      key = node.getAttribute('data-i18n');
      if (!key) {
        continue;
      }
      text = lookup(dict, lang, key);
      if (text !== null) {
        node.textContent = text;
      }
    }

    // 文档语言 + 页面标题
    var htmlLang = HTML_LANG[lang] || HTML_LANG[DEFAULT_LANG];
    if (document.documentElement) {
      document.documentElement.lang = htmlLang;
    }
    var title = lookup(dict, lang, 'page.title');
    if (title !== null) {
      document.title = title;
    }

    currentLang = lang;
  }

  function bindToggle(dict) {
    var button = document.querySelector('.lang-toggle');
    if (!button) {
      return;
    }
    button.addEventListener('click', function () {
      var next = currentLang === 'zh' ? 'en' : 'zh';
      storeLang(next);
      applyLang(next, dict);
    });
  }

  function boot() {
    var dict = getDict();
    if (!dict) {
      // 词典未加载：保留 HTML 里写死的中文，不做任何改写。
      return;
    }
    var lang = readStoredLang();
    applyLang(lang, dict);
    bindToggle(dict);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
