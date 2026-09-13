/*
 * curate.mjs — 快照策展纯函数（ESM，零依赖、零网络、零 I/O）
 *
 * 职责边界（很重要，不要越界）：
 *   本模块**只做纯计算**：过滤 → override 合并 → 排序 → 固定字段形状 → 确定性序列化。
 *   它不发网络请求、不读文件、不写文件、不看环境变量、不看当前时间
 *   （当前时间由调用方以 nowIso 传入）。这样 task-005 可以直接 import 它并传入构造输入，
 *   无需 mock 任何东西。
 *
 * 产出形状必须与 task-004-dev-assignment-r1.json 的 snapshotSchemaContract 一字不差：
 *   { generatedAt, owner, repos: [{ name, url, description, descZh, descEn, language, pushedAt, stars, fork }] }
 *   字段名拼错就是跨任务接口不匹配（本项目已因此出过一次真实缺陷），改动前请先看契约。
 */

/* ------------------------------------------------------------------ *
 * 字段清单：既是序列化顺序的唯一定义，也是 task-005 断言形状的依据
 * ------------------------------------------------------------------ */

export const SNAPSHOT_FIELDS = ['generatedAt', 'owner', 'repos'];

export const REPO_FIELDS = [
  'name',
  'url',
  'description',
  'descZh',
  'descEn',
  'language',
  'pushedAt',
  'stars',
  'fork'
];

const DEFAULT_REPO_BASE_URL = 'https://github.com';
const DEFAULT_API_BASE_URL = 'https://api.github.com';

/** 输入结构不符预期时抛出，调用方据此以非零码退出且不写盘 */
export class SnapshotInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SnapshotInputError';
  }
}

/* ------------------------------------------------------------------ *
 * 配置
 * ------------------------------------------------------------------ */

function typeName(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/**
 * 校验并补全 site-config.json。
 * 未知键一律忽略（允许在配置文件里写 _comment 之类的说明字段）。
 */
export function normalizeConfig(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SnapshotInputError('site-config.json 必须是 JSON 对象，实际为 ' + typeName(raw));
  }

  const owner = raw.owner;
  if (typeof owner !== 'string' || owner.trim() === '') {
    throw new SnapshotInputError('site-config.json 缺少非空字符串字段 owner');
  }

  const exclude = raw.exclude === undefined ? [] : raw.exclude;
  if (!Array.isArray(exclude) || exclude.some((n) => typeof n !== 'string')) {
    throw new SnapshotInputError('site-config.json 的 exclude 必须是字符串数组（仓库名清单）');
  }

  const pinned = raw.pinned === undefined ? [] : raw.pinned;
  if (!Array.isArray(pinned) || pinned.some((n) => typeof n !== 'string')) {
    throw new SnapshotInputError('site-config.json 的 pinned 必须是字符串数组（仓库名清单）');
  }

  const excludeForks = raw.excludeForks === undefined ? true : raw.excludeForks;
  if (typeof excludeForks !== 'boolean') {
    throw new SnapshotInputError('site-config.json 的 excludeForks 必须是布尔值');
  }

  const showMeta = raw.showMeta === undefined ? true : raw.showMeta;
  if (typeof showMeta !== 'boolean') {
    throw new SnapshotInputError('site-config.json 的 showMeta 必须是布尔值');
  }

  const repoBaseUrl = raw.repoBaseUrl === undefined ? DEFAULT_REPO_BASE_URL : raw.repoBaseUrl;
  if (typeof repoBaseUrl !== 'string' || repoBaseUrl.trim() === '') {
    throw new SnapshotInputError('site-config.json 的 repoBaseUrl 必须是非空字符串');
  }

  const apiBaseUrl = raw.apiBaseUrl === undefined ? DEFAULT_API_BASE_URL : raw.apiBaseUrl;
  if (typeof apiBaseUrl !== 'string' || apiBaseUrl.trim() === '') {
    throw new SnapshotInputError('site-config.json 的 apiBaseUrl 必须是非空字符串');
  }

  return {
    owner: owner.trim(),
    exclude: exclude.slice(),
    excludeForks,
    pinned: pinned.slice(),
    showMeta,
    repoBaseUrl: repoBaseUrl.replace(/\/+$/, ''),
    apiBaseUrl: apiBaseUrl.replace(/\/+$/, '')
  };
}

/**
 * 校验 repo-overrides.json。
 * 形状：{ "<仓库名>": { "descZh": "...", "descEn": "..." }, ... }
 * 键不以 "_" 开头即视为仓库名条目；"_" 开头的键（如 _meta/_placeholders）是说明字段，忽略。
 */
export function normalizeOverrides(raw) {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SnapshotInputError('repo-overrides.json 必须是 JSON 对象，实际为 ' + typeName(raw));
  }

  const result = {};
  for (const key of Object.keys(raw)) {
    if (key.startsWith('_')) continue;
    const entry = raw[key];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new SnapshotInputError(
        'repo-overrides.json 的 "' + key + '" 必须是对象（形如 {"descZh":"…","descEn":"…"}），实际为 ' + typeName(entry)
      );
    }
    for (const field of ['descZh', 'descEn']) {
      const value = entry[field];
      if (value !== undefined && typeof value !== 'string') {
        throw new SnapshotInputError(
          'repo-overrides.json 的 "' + key + '.' + field + '" 必须是字符串，实际为 ' + typeName(value)
        );
      }
    }
    result[key] = {
      descZh: entry.descZh === undefined ? '' : entry.descZh,
      descEn: entry.descEn === undefined ? '' : entry.descEn
    };
  }
  return result;
}

/* ------------------------------------------------------------------ *
 * 1) 输入校验与归一化
 * ------------------------------------------------------------------ */

function assertOptionalString(value, label, index) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new SnapshotInputError(
      'GitHub API 响应的第 ' + index + ' 项字段 ' + label + ' 应为字符串或 null，实际为 ' + typeName(value)
    );
  }
  return value;
}

/**
 * 把 GitHub /user/repos 的原始响应归一化成"上游事实"列表。
 * 结构不符预期 → 抛错（由调用方转成非零退出），绝不猜测或补默认值后静默写盘。
 * 注意：这里不做任何策展，策展是后面几步的事。
 */
export function normalizeFetchedRepos(raw) {
  if (!Array.isArray(raw)) {
    throw new SnapshotInputError('GitHub API 响应应为仓库数组，实际为 ' + typeName(raw));
  }

  return raw.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new SnapshotInputError('GitHub API 响应的第 ' + index + ' 项应为对象，实际为 ' + typeName(item));
    }
    if (typeof item.name !== 'string' || item.name.trim() === '') {
      throw new SnapshotInputError('GitHub API 响应的第 ' + index + ' 项缺少非空字符串字段 name');
    }

    const pushedAt = item.pushed_at;
    if (typeof pushedAt !== 'string' || Number.isNaN(Date.parse(pushedAt))) {
      throw new SnapshotInputError(
        'GitHub API 响应的仓库 "' + item.name + '" 缺少可解析的 pushed_at（ISO8601 字符串），实际为 ' + typeName(pushedAt)
      );
    }

    const stars = item.stargazers_count === undefined || item.stargazers_count === null ? 0 : item.stargazers_count;
    if (typeof stars !== 'number' || !Number.isFinite(stars)) {
      throw new SnapshotInputError(
        'GitHub API 响应的仓库 "' + item.name + '" 的 stargazers_count 应为数字，实际为 ' + typeName(item.stargazers_count)
      );
    }

    const fork = item.fork === undefined || item.fork === null ? false : item.fork;
    if (typeof fork !== 'boolean') {
      throw new SnapshotInputError(
        'GitHub API 响应的仓库 "' + item.name + '" 的 fork 应为布尔值，实际为 ' + typeName(item.fork)
      );
    }

    return {
      name: item.name,
      description: assertOptionalString(item.description, 'description', index),
      language: assertOptionalString(item.language, 'language', index),
      pushedAt,
      stars,
      fork
    };
  });
}

/* ------------------------------------------------------------------ *
 * 2) 过滤（FR-04 的机制本体：排除清单 + fork 过滤）
 * ------------------------------------------------------------------ */

/** 仓库名比较统一小写化：配置里写 test 也能排掉 Test */
function normalizeName(name) {
  return String(name).toLowerCase();
}

/**
 * @returns {{ kept: object[], excluded: {name: string, reason: string}[] }}
 * 返回被排除项是为了让 CLI 能打印出"为什么少了几个"，而不是让人对着数量发呆。
 */
export function filterRepos(repos, config) {
  const excludeSet = new Set((config.exclude || []).map(normalizeName));
  const excludeForks = config.excludeForks !== false;
  const kept = [];
  const excluded = [];

  for (const repo of repos) {
    if (excludeForks && repo.fork === true) {
      excluded.push({ name: repo.name, reason: 'fork（excludeForks=true）' });
      continue;
    }
    if (excludeSet.has(normalizeName(repo.name))) {
      excluded.push({ name: repo.name, reason: '命中 exclude 清单' });
      continue;
    }
    kept.push(repo);
  }

  return { kept, excluded };
}

/* ------------------------------------------------------------------ *
 * 3) 描述 override 合并（双语）
 * ------------------------------------------------------------------ */

/**
 * descZh / descEn 来自 repo-overrides.json，**不是**自动翻译。
 * 契约规定：无 override 时为空字符串（"无则空字符串"），此时页面渲染层负责回退到 description。
 * override 里没提到的仓库保持空串，不做任何推断。
 */
export function applyOverrides(repos, overrides) {
  const table = overrides || {};
  return repos.map((repo) => {
    const entry = table[repo.name];
    return {
      name: repo.name,
      description: repo.description === null || repo.description === undefined ? '' : repo.description,
      descZh: entry ? entry.descZh : '',
      descEn: entry ? entry.descEn : '',
      language: repo.language === undefined ? null : repo.language,
      pushedAt: repo.pushedAt,
      stars: repo.stars,
      fork: repo.fork
    };
  });
}

/* ------------------------------------------------------------------ *
 * 4) 排序：pinned 置顶 → pushedAt 降序 → 名称升序决胜
 * ------------------------------------------------------------------ */

/**
 * pinned 里的仓库按 pinned 数组给出的顺序排在最前，其余按 pushedAt 降序；
 * pushedAt 完全相同（同一秒推送）时用名称升序决胜，保证排序是**全序**——
 * 否则 Array.prototype.sort 的稳定性会把顺序交给输入顺序，两次运行的 diff 就会漂移。
 *
 * 名称比较故意不用 localeCompare：它依赖 ICU/locale 环境，同一份输入在不同机器上
 * 可能排序不同，那就不是确定性输出了。这里用码点比较。
 */
export function sortRepos(repos, pinned) {
  const pinnedOrder = new Map();
  (pinned || []).forEach((name, index) => {
    const key = normalizeName(name);
    if (!pinnedOrder.has(key)) pinnedOrder.set(key, index);
  });

  return repos.slice().sort((a, b) => {
    const rankA = pinnedOrder.has(normalizeName(a.name)) ? pinnedOrder.get(normalizeName(a.name)) : Number.MAX_SAFE_INTEGER;
    const rankB = pinnedOrder.has(normalizeName(b.name)) ? pinnedOrder.get(normalizeName(b.name)) : Number.MAX_SAFE_INTEGER;
    if (rankA !== rankB) return rankA - rankB;

    const timeA = Date.parse(a.pushedAt);
    const timeB = Date.parse(b.pushedAt);
    if (timeA !== timeB) return timeB - timeA;

    if (a.name < b.name) return -1;
    if (a.name > b.name) return 1;
    return 0;
  });
}

/* ------------------------------------------------------------------ *
 * 5) 固定字段形状 + 确定性序列化
 * ------------------------------------------------------------------ */

/**
 * 形状固定靠"显式逐字段重建对象"，不靠删除多余键——
 * 这样上游 API 新增字段永远不会漏进快照，diff 才不会因为 GitHub 改 API 而抖。
 */
export function toSnapshotRepos(repos, config, overrides) {
  const withOverrides = applyOverrides(repos, overrides);
  return withOverrides.map((repo) => ({
    name: repo.name,
    // url 由 owner + name 拼装而不是取 html_url：
    // 同一份输入在任何 FETCH_REPOS_API_BASE（含测试假服务器）下都产出同一个 URL。
    url: config.repoBaseUrl + '/' + config.owner + '/' + repo.name,
    description: repo.description,
    descZh: repo.descZh,
    descEn: repo.descEn,
    // showMeta=false 时不上报语言与 star 数（置为契约允许的 null / 0）；
    // pushedAt 是必需字段且承担排序语义，故始终保留真实值。
    language: config.showMeta ? repo.language : null,
    pushedAt: repo.pushedAt,
    stars: config.showMeta ? repo.stars : 0,
    fork: repo.fork
  }));
}

/** 一步到位：原始 API 响应 → 契约形状的快照对象。generatedAt 由调用方给定。 */
export function buildSnapshot(fetchedRepos, options) {
  const { config, overrides, generatedAt } = options;
  const normalized = normalizeFetchedRepos(fetchedRepos);
  const { kept } = filterRepos(normalized, config);
  const ordered = sortRepos(kept, config.pinned);
  return {
    generatedAt,
    owner: config.owner,
    repos: toSnapshotRepos(ordered, config, overrides)
  };
}

/** repos.json 的字节表示：2 空格缩进便于人读与 git diff，末尾一个换行。 */
export function serializeSnapshot(snapshot) {
  return JSON.stringify(snapshot, null, 2) + '\n';
}

/**
 * repos.js 的字节表示：**首行即整条赋值语句**（契约与验收都按"首行"检查），
 * 因此用紧凑 JSON 单行输出，不做美化，也不加任何额外逻辑或注释。
 */
export function serializeReposJs(snapshot) {
  return 'window.__REPO_SNAPSHOT__ = ' + JSON.stringify(snapshot) + ';\n';
}

/**
 * 内容指纹：把 generatedAt 抽掉后的稳定 JSON。
 * 幂等方案的支点——见 resolveSnapshot 的说明。
 */
export function snapshotFingerprint(snapshot) {
  return JSON.stringify({
    owner: snapshot.owner,
    repos: snapshot.repos
  });
}

function tryParseSnapshot(text) {
  if (typeof text !== 'string' || text.trim() === '') return null;
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.repos)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * 6) 幂等决策
 * ------------------------------------------------------------------ */

/**
 * 【幂等方案：内容驱动的 generatedAt + 字节级写盘门】
 *
 * 问题：generatedAt 每次运行都不同 → 每次 diff 都非空 → 定时任务每次产生一个无意义提交，
 *       幂等性名存实亡（FR-03 要求"脚本重复执行结果稳定"）。
 * 方案（两层，缺一不可）：
 *   第 1 层 · 内容未变则沿用旧时间戳：拿掉 generatedAt 后的内容指纹与已有 repos.json 比对，
 *             相同就继续用文件里的旧 generatedAt。时间戳于是变成"内容最后一次变化的时间"，
 *             这个语义比"上次运行时间"更有信息量，而且不产生 diff。
 *   第 2 层 · 字节级写盘门：调用方只在最终字节串与磁盘现有内容不同时才写盘。
 *             即使第 1 层失效（例如旧文件损坏、手工改过），也不会产生"改了又改回来"的抖动。
 * 结果：同一份输入反复运行 → 磁盘字节逐字节不变（验收"连续两次运行 diff 为空"成立）。
 * 代价：generatedAt 不再等于"运行时刻"。这是刻意的取舍，已在报告中说明。
 */
export function resolveSnapshot(fetchedRepos, options) {
  const { config, overrides, nowIso, previousJsonText = null } = options;

  const previous = tryParseSnapshot(previousJsonText);
  const draft = buildSnapshot(fetchedRepos, { config, overrides, generatedAt: '' });
  const fingerprint = snapshotFingerprint(draft);
  const previousFingerprint = previous ? snapshotFingerprint(previous) : null;
  const contentChanged = fingerprint !== previousFingerprint;

  let generatedAt = nowIso;
  if (!contentChanged && previous && typeof previous.generatedAt === 'string' && previous.generatedAt !== '') {
    generatedAt = previous.generatedAt;
  }

  const snapshot = buildSnapshot(fetchedRepos, { config, overrides, generatedAt });
  return {
    snapshot,
    json: serializeSnapshot(snapshot),
    js: serializeReposJs(snapshot),
    contentChanged,
    reusedGeneratedAt: generatedAt !== nowIso
  };
}
