/*
 * i18n-dict.js — 双语词条表（纯数据，零依赖、零网络请求）
 *
 * 加载方式（两种都要能工作）：
 *   1) 浏览器：index.html 用 <script defer src="/js/i18n-dict.js"> 直接加载，
 *      词典挂到 window.__I18N_DICT__，供随后执行的 /js/i18n.js 读取。
 *      defer 脚本按文档顺序执行，因此本文件必须先于 /js/i18n.js 出现。
 *   2) Node：require('./js/i18n-dict.js') 返回同一个对象，
 *      供单元测试断言 zh 与 en 的键集合完全一致。
 *
 * 不使用 ES module 语法：index.html 用的是普通 <script defer>，不是 type="module"。
 *
 * 文案约定：zh 侧的值必须与 index.html 元素内已写死的中文一字不差，
 * 这样“切换语言”只改变显示语言，不会顺带改动中文措辞。
 */
(function () {
  'use strict';

  var DICT = {
    zh: {
      // —— 页面级 ——
      'page.title': 'APpery1',

      // —— 无障碍 ——
      'a11y.skipToContent': '跳到主要内容',

      // —— 顶部导航 ——
      'nav.about': '关于我',
      'nav.projects': '项目',
      'nav.contact': '联系',
      // 按钮显示的是“切换到哪种语言”，因此中文界面下显示 English，
      // 英文界面下显示“中文”。
      'nav.langToggle': 'English',

      // —— 首屏 / 关于我 ——
      'hero.greeting': '你好，我是',
      'about.nickname': 'APpery',
      'about.realName': '姜博溪',
      'hero.tagline': '正在学习成长的 coder',
      'about.bio': '我是姜博溪，长江大学在读学生，网名 APpery。目前主要用 Python 和 TypeScript 写东西，靠一个个小项目把基础打牢——从桌面小工具到全栈小应用，边做边学。这个站点本身也是其中一次练习。',
      'about.schoolLabel': '就读院校',
      'about.school': '长江大学',
      'about.roleLabel': '自我定位',
      'about.role': '正在学习成长的 coder',

      // —— 项目 ——
      'projects.title': '项目',
      'projects.lead': '下面这些项目与我的 GitHub 公开仓库保持同步，由构建流程定期更新。',
      'projects.empty': '项目列表暂时不可用。可以稍后再来，或直接访问我的 GitHub 主页查看全部仓库。',
      // 卡片描述回退链的最后一层：descZh/descEn 与 GitHub 原始 description 都为空时使用。
      'projects.noDescription': '暂无描述',

      // —— 联系方式 ——
      'contact.title': '联系我',
      'contact.lead': '欢迎通过以下任意一种方式找到我。',
      'contact.emailLabel': '邮箱',
      'contact.qqLabel': 'QQ',
      'contact.wechatLabel': '微信',
      'contact.githubLabel': 'GitHub',
      // 点击 QQ / 微信 条目后的复制反馈（成功 / 需手动复制）。
      'contact.copied': '已复制',
      'contact.copyManual': '请手动复制',

      // —— 页脚 ——
      'footer.copyright': '© 2026 APpery · 姜博溪',
      'footer.note': '纯静态站点，托管于 GitHub Pages。'
    },

    en: {
      // —— 页面级 ——
      'page.title': 'APpery1',

      // —— 无障碍 ——
      'a11y.skipToContent': 'Skip to main content',

      // —— 顶部导航 ——
      'nav.about': 'About',
      'nav.projects': 'Projects',
      'nav.contact': 'Contact',
      'nav.langToggle': '中文',

      // —— 首屏 / 关于我 ——
      'hero.greeting': "Hi, I'm",
      'about.nickname': 'APpery',
      'about.realName': 'Jiang Boxi',
      'hero.tagline': 'A coder learning and growing',
      'about.bio': "I'm Jiang Boxi, an undergraduate at Yangtze University, known online as APpery. These days I mainly write Python and TypeScript, building up my fundamentals one small project at a time — from desktop utilities to small full-stack apps, learning as I go. This site is one of those exercises.",
      'about.schoolLabel': 'School',
      'about.school': 'Yangtze University',
      'about.roleLabel': 'Role',
      'about.role': 'A coder learning and growing',

      // —— 项目 ——
      'projects.title': 'Projects',
      'projects.lead': 'These projects stay in sync with my public GitHub repositories and are refreshed periodically by a build process.',
      'projects.empty': 'The project list is temporarily unavailable. Please check back later, or visit my GitHub profile to browse all repositories.',
      // 卡片描述回退链的最后一层：descZh/descEn 与 GitHub 原始 description 都为空时使用。
      'projects.noDescription': 'No description yet',

      // —— 联系方式 ——
      'contact.title': 'Contact Me',
      'contact.lead': 'Feel free to reach me through any of the following.',
      'contact.emailLabel': 'Email',
      'contact.qqLabel': 'QQ',
      'contact.wechatLabel': 'WeChat',
      'contact.githubLabel': 'GitHub',
      // 点击 QQ / 微信 条目后的复制反馈（成功 / 需手动复制）。
      'contact.copied': 'Copied',
      'contact.copyManual': 'Please copy manually',

      // —— 页脚 ——
      'footer.copyright': '© 2026 APpery · Jiang Boxi',
      'footer.note': 'A purely static site, hosted on GitHub Pages.'
    }
  };

  // 浏览器：挂到 window，供 /js/i18n.js 读取
  if (typeof window !== 'undefined') {
    window.__I18N_DICT__ = DICT;
  }

  // Node：供 require() 使用（task-005 单测断言 zh/en 键集合一致）
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = DICT;
  }
})();
