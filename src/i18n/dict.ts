const zh = {
  'page.title': 'APpery1',
  'page.description': 'APpery（姜博溪）的个人网站：正在学习成长的 coder，长江大学在读。',

  'a11y.skipToContent': '跳到主要内容',
  'a11y.navLabel': '主要导航',
  'a11y.pager': '页面',

  'nav.about': '介绍',
  'nav.work': '工作',
  'nav.projects': '项目',
  'nav.research': '研究',
  'nav.docs': '文档',
  'nav.album': '相册',
  'nav.contact': '联系',
  'nav.langToggle': 'English',

  'hero.greeting': '你好，我是',
  'about.nickname': 'APpery',
  'about.realName': '姜博溪',
  'hero.tagline': '正在学习成长的 coder',
  'about.bio':
    '我是姜博溪，长江大学在读学生，网名 APpery。目前主要用 Python 和 TypeScript 写东西，靠一个个小项目把基础打牢——从桌面小工具到全栈小应用，边做边学。这个站点本身也是其中一次练习。',
  'about.school': '长江大学',
  'hero.schoolLine': '目前就读于长江大学',
  'hero.scroll': '向下翻页',

  'page.marker': '页',

  'work.kicker': '02',
  'work.title': '工作',
  'work.lead': '项目、研究、文档和相册。点进卡片看详情。',
  'card.open': '打开',
  'panel.back': '返回卡片',
  'panel.close': '关闭',
  'page.backToWork': '返回工作',

  'projects.kicker': '01',
  'projects.title': '项目',
  'projects.lead': '与 GitHub 公开仓库同步。',
  'projects.empty': '项目列表暂时不可用。可以稍后再来，或直接访问我的 GitHub 主页。',
  'projects.noDescription': '暂无描述',
  'projects.open': '在 GitHub 上打开',
  'projects.count': '个仓库',

  'skills.kicker': '02',
  'skills.title': '研究方向',
  'skills.lead': '同一时间只深挖一件事。',
  'skills.body':
    '目前正在研究 agent 协作体系：多个 AI agent 之间怎么分工、怎么交换中间结果、出现分歧时又怎么收敛。我用一系列小实验把这件事做实——从「谁负责哪一块」这种最基础的问题开始，再一步步加上更复杂的协作结构。',

  'docs.kicker': '03',
  'docs.title': '文档',
  'docs.lead': '笔记与写过的长文。按分类查看。',
  'docs.empty': '还没有放上来。整理好之后会出现在这里。',
  'docs.open': '打开文档',
  'docs.count': '篇',
  'docs.back': '返回文档列表',
  'docs.backToCategories': '返回分类',
  'docs.missing': '找不到这篇文档。',
  'docs.missingCategory': '找不到这个分类。',
  'docs.categoriesEmpty': '还没有分类。在 document/ 下新建文件夹即可。',
  'docs.categoryEmpty': '这个分类还没有文档。',
  'docs.categoryCount': '类',
  'docs.openCategory': '打开分类',
  'docs.prev': '上一篇',
  'docs.next': '下一篇',
  'docs.pager': '相邻文档',

  'album.kicker': '04',
  'album.title': '相册',
  'album.lead': '一些自己拍的风景。',
  'album.empty': '还没有放上来。照片整理好之后会陆续出现在这里。',
  'album.count': '张',
  'album.lightbox': '查看原图',
  'album.prev': '上一张',
  'album.next': '下一张',

  'contact.kicker': '03',
  'contact.title': '联系',
  'contact.lead': '任意一种方式都可以。',
  'contact.emailLabel': '邮箱',
  'contact.qqLabel': 'QQ',
  'contact.wechatLabel': '微信',
  'contact.githubLabel': 'GitHub',
  'contact.copied': '已复制',
  'contact.copyManual': '请手动复制',
  'contact.copyAction': '复制',

  'footer.copyright': '© 2026 APpery · 姜博溪',
  'footer.note': '托管于 GitHub Pages。',
} as const

type MessageKey = keyof typeof zh

const en: Record<MessageKey, string> = {
  'page.title': 'APpery1',
  'page.description':
    'APpery (Jiang Boxi) — a coder learning and growing, undergraduate at Yangtze University.',

  'a11y.skipToContent': 'Skip to main content',
  'a11y.navLabel': 'Main navigation',
  'a11y.pager': 'Pages',

  'nav.about': 'Intro',
  'nav.work': 'Work',
  'nav.projects': 'Projects',
  'nav.research': 'Research',
  'nav.docs': 'Docs',
  'nav.album': 'Album',
  'nav.contact': 'Contact',
  'nav.langToggle': '中文',

  'hero.greeting': "Hi, I'm",
  'about.nickname': 'APpery',
  'about.realName': 'Jiang Boxi',
  'hero.tagline': 'A coder learning and growing',
  'about.bio':
    "I'm Jiang Boxi, an undergraduate at Yangtze University, known online as APpery. These days I mainly write Python and TypeScript, building my fundamentals one small project at a time — from desktop utilities to small full-stack apps, learning as I go. This site is one of those exercises.",
  'about.school': 'Yangtze University',
  'hero.schoolLine': 'Currently studying at Yangtze University',
  'hero.scroll': 'Scroll down',

  'page.marker': '',

  'work.kicker': '02',
  'work.title': 'Work',
  'work.lead': 'Projects, research, docs, and photos. Open a card for details.',
  'card.open': 'Open',
  'panel.back': 'Back to cards',
  'panel.close': 'Close',
  'page.backToWork': 'Back to work',

  'projects.kicker': '01',
  'projects.title': 'Projects',
  'projects.lead': 'Kept in sync with my public GitHub repositories.',
  'projects.empty':
    'The project list is temporarily unavailable. Please check back later, or visit my GitHub profile.',
  'projects.noDescription': 'No description yet',
  'projects.open': 'Open on GitHub',
  'projects.count': 'repos',

  'skills.kicker': '02',
  'skills.title': 'Research',
  'skills.lead': 'One focus at a time.',
  'skills.body':
    'I am currently researching how agents collaborate: how multiple AI agents divide the work, exchange intermediate results, and converge when they disagree. I am working through it with a series of small experiments — starting from the most basic question of who owns which part, then adding more involved collaboration patterns.',

  'docs.kicker': '03',
  'docs.title': 'Docs',
  'docs.lead': 'Notes and longer writing, grouped by topic.',
  'docs.empty': 'Nothing here yet. Pieces will appear once they are ready.',
  'docs.open': 'Open document',
  'docs.count': 'pieces',
  'docs.back': 'Back to docs',
  'docs.backToCategories': 'Back to topics',
  'docs.missing': 'This document was not found.',
  'docs.missingCategory': 'This topic was not found.',
  'docs.categoriesEmpty': 'No topics yet. Add a folder under document/ to create one.',
  'docs.categoryEmpty': 'Nothing in this topic yet.',
  'docs.categoryCount': 'topics',
  'docs.openCategory': 'Open topic',
  'docs.prev': 'Previous',
  'docs.next': 'Next',
  'docs.pager': 'Adjacent documents',

  'album.kicker': '04',
  'album.title': 'Album',
  'album.lead': 'A few landscapes of my own.',
  'album.empty': 'Nothing here yet. Photos will appear once they are sorted.',
  'album.count': 'photos',
  'album.lightbox': 'View original',
  'album.prev': 'Previous photo',
  'album.next': 'Next photo',

  'contact.kicker': '03',
  'contact.title': 'Contact',
  'contact.lead': 'Any of these will reach me.',
  'contact.emailLabel': 'Email',
  'contact.qqLabel': 'QQ',
  'contact.wechatLabel': 'WeChat',
  'contact.githubLabel': 'GitHub',
  'contact.copied': 'Copied',
  'contact.copyManual': 'Please copy manually',
  'contact.copyAction': 'Copy',

  'footer.copyright': '© 2026 APpery · Jiang Boxi',
  'footer.note': 'Hosted on GitHub Pages.',
}

export const dict = { zh, en } as const
export type { MessageKey }
export type Lang = keyof typeof dict
