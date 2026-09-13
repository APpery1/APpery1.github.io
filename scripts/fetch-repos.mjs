#!/usr/bin/env node
/*
 * fetch-repos.mjs — 构建期快照抓取 CLI（Node 内置 fetch，零第三方依赖）
 *
 * 用法：
 *   node scripts/fetch-repos.mjs
 *   FETCH_REPOS_API_BASE=http://127.0.0.1:9 node scripts/fetch-repos.mjs   # 失败演练
 *
 * 环境变量：
 *   FETCH_REPOS_API_BASE  覆盖 GitHub API 基地址（默认取 data/site-config.json 的 apiBaseUrl）。
 *                         存在的唯一目的是让失败路径可以在本地无网络依赖地演练，
 *                         以及让上层（测试/隔离环境）指向代理。
 *   GITHUB_TOKEN          可选。设置了就带上认证头（Actions 里用，能把 60 次/小时的匿名限额提上去）。
 *   FETCH_REPOS_ALLOW_EMPTY=1
 *                         允许"**策展后**仓库数为 0"仍然写盘（仅护栏 B）。默认禁止。
 *                         ★ 本开关**对护栏 A 无效**：上游直接返回空列表时无论是否设置它都判失败，
 *                         护栏 A 没有任何放行开关，见下文两处空结果护栏的注释。
 *
 * 【生命线约束：失败绝不写盘】
 * 网络失败 / HTTP 非 2xx / JSON 解析失败 / 响应结构不符预期 / 策展后为空 —— 一律非零退出，
 * 并且**不触碰已存在的 data/repos.json**。写盘只发生在全部校验通过之后的最后一步。
 * 若失败时把快照覆盖成空的，线上项目列表会被清空——这是定时任务最危险的失败模式。
 *
 * 仓库名一律不硬编码：全部来自 data/site-config.json 与 data/repo-overrides.json。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SnapshotInputError,
  normalizeConfig,
  normalizeOverrides,
  normalizeFetchedRepos,
  filterRepos,
  resolveSnapshot
} from './curate.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');
const CONFIG_PATH = path.join(PROJECT_ROOT, 'data', 'site-config.json');
const OVERRIDES_PATH = path.join(PROJECT_ROOT, 'data', 'repo-overrides.json');
const SNAPSHOT_JSON_PATH = path.join(PROJECT_ROOT, 'data', 'repos.json');
const SNAPSHOT_JS_PATH = path.join(PROJECT_ROOT, 'data', 'repos.js');

/** 退出码分档，便于定时任务与排查者一眼看出失败类型 */
const EXIT = {
  OK: 0,
  UNEXPECTED: 1,
  NETWORK: 2,
  HTTP: 3,
  PARSE: 4,
  SCHEMA: 5,
  CONFIG: 6,
  EMPTY: 7,
  WRITE: 8
};

const REQUEST_TIMEOUT_MS = 20000;
const MAX_PAGES = 10; // 每页 100 条 → 上限 1000 个仓库，对个人账号远远够用，同时防止分页写错时无限循环

function log(message) {
  process.stdout.write(message + '\n');
}

function warn(message) {
  process.stderr.write('警告：' + message + '\n');
}

function abort(code, message, detail) {
  process.stderr.write('\n抓取失败（退出码 ' + code + '）：' + message + '\n');
  if (detail) process.stderr.write('  详情：' + detail + '\n');
  process.stderr.write('  → 已中止，未写入任何文件；data/repos.json 保持原样。\n');
  process.exit(code);
}

function readJsonFile(filePath, label, exitCode) {
  let text;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    abort(exitCode, '无法读取 ' + label + '（' + filePath + '）', error.message);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    abort(exitCode, label + ' 不是合法 JSON（' + filePath + '）', error.message);
  }
}

function readOptionalText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
}

/** 只写这两行也值得单列：GitHub 要求带 User-Agent，缺了会被 403 */
function buildHeaders() {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'appery-homepage-snapshot/1.0 (+https://appery1.github.io)'
  };
  const token = process.env.GITHUB_TOKEN;
  if (token && token.trim() !== '') headers.Authorization = 'Bearer ' + token.trim();
  return headers;
}

function describeRateLimit(response) {
  const remaining = response.headers.get('x-ratelimit-remaining');
  const reset = response.headers.get('x-ratelimit-reset');
  if (remaining === null && reset === null) return '';
  const parts = [];
  if (remaining !== null) parts.push('剩余额度 ' + remaining);
  if (reset !== null) {
    const resetMs = Number(reset) * 1000;
    if (Number.isFinite(resetMs)) {
      parts.push('重置时间 ' + new Date(resetMs).toISOString());
    }
  }
  return parts.join('，');
}

async function fetchPage(url, pageNumber) {
  let response;
  try {
    response = await fetch(url, {
      headers: buildHeaders(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });
  } catch (error) {
    // 拒连 / DNS 失败 / 超时 / TLS 失败都落在这里（含失败演练的 127.0.0.1:9）
    abort(
      EXIT.NETWORK,
      '网络请求失败（' + url + '）',
      (error && error.cause && error.cause.message ? error.cause.message + ' / ' : '') + (error ? error.message : error)
    );
  }

  if (!response.ok) {
    const rate = describeRateLimit(response);
    if (response.status === 403 || response.status === 429) {
      abort(
        EXIT.HTTP,
        'HTTP ' + response.status + '：疑似触发 GitHub API 限流' +
          (rate ? '（' + rate + '）' : '') +
          '。未认证请求限额 60 次/小时/IP；可在环境变量 GITHUB_TOKEN 中提供令牌后重试。',
        '第 ' + pageNumber + ' 页请求被拒：' + url
      );
    }
    if (response.status === 404) {
      abort(
        EXIT.HTTP,
        'HTTP 404：抓取目标不存在（' + url + '）。请检查 data/site-config.json 的 owner 与 apiBaseUrl 是否正确。',
        '第 ' + pageNumber + ' 页请求失败'
      );
    }
    abort(EXIT.HTTP, 'HTTP ' + response.status + ' ' + response.statusText + '（' + url + '）', rate ? rate : null);
  }

  const text = await response.text();
  try {
    return { json: JSON.parse(text), rate: describeRateLimit(response) };
  } catch (error) {
    // 典型情形：被网关/代理拦截后返回 HTML 错误页
    abort(
      EXIT.PARSE,
      '响应不是合法 JSON（' + url + '）',
      error.message + '；响应开头：' + JSON.stringify(text.slice(0, 120))
    );
  }
}

async function fetchAllRepos(apiBaseUrl, owner) {
  const collected = [];
  let lastRate = '';

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url =
      apiBaseUrl + '/users/' + encodeURIComponent(owner) + '/repos' +
      '?type=owner&per_page=100&page=' + page + '&sort=pushed&direction=desc';

    const { json, rate } = await fetchPage(url, page);
    if (rate) lastRate = rate;

    if (!Array.isArray(json)) {
      abort(
        EXIT.SCHEMA,
        '响应结构不符预期：期望仓库数组（' + url + '）',
        '实际为 ' + (json === null ? 'null' : Array.isArray(json) ? 'array' : typeof json)
      );
    }

    collected.push(...json);
    if (json.length < 100) break;
  }

  return { repos: collected, rate: lastRate };
}

/**
 * 原子的单文件落盘：先写同目录临时文件再 rename。
 * 好处是"写到一半断电/被杀"不会留下半个 JSON 文件——那会让下次运行的 previousJsonText 也解析失败。
 */
function writeFileAtomically(filePath, contents) {
  const tempPath = filePath + '.tmp-' + process.pid;
  try {
    fs.writeFileSync(tempPath, contents, 'utf8');
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch {
      /* 清理失败不掩盖主错误 */
    }
    abort(EXIT.WRITE, '写入失败（' + filePath + '）', error.message);
  }
}

async function main() {
  log('== 抓取 GitHub 公开仓库快照 ==');

  const config = (() => {
    try {
      return normalizeConfig(readJsonFile(CONFIG_PATH, 'data/site-config.json', EXIT.CONFIG));
    } catch (error) {
      abort(EXIT.CONFIG, error.message, '配置文件：' + CONFIG_PATH);
    }
  })();

  const overrides = (() => {
    try {
      return normalizeOverrides(readJsonFile(OVERRIDES_PATH, 'data/repo-overrides.json', EXIT.CONFIG));
    } catch (error) {
      abort(EXIT.CONFIG, error.message, '配置文件：' + OVERRIDES_PATH);
    }
  })();

  const apiBaseUrl = (process.env.FETCH_REPOS_API_BASE || config.apiBaseUrl).replace(/\/+$/, '');
  const usingEnvBase = Boolean(process.env.FETCH_REPOS_API_BASE);

  log('账号 owner       : ' + config.owner);
  log('API 基地址       : ' + apiBaseUrl + (usingEnvBase ? '  [来自 FETCH_REPOS_API_BASE]' : ''));
  log('排除清单 exclude : ' + (config.exclude.length ? config.exclude.join(', ') : '（空）'));
  log('过滤 fork        : ' + (config.excludeForks ? '是' : '否'));
  log('置顶 pinned      : ' + (config.pinned.length ? config.pinned.join(', ') : '（空）'));
  log('展示元信息       : ' + (config.showMeta ? '是' : '否'));

  const { repos: fetched, rate } = await fetchAllRepos(apiBaseUrl, config.owner);
  log('抓取到仓库       : ' + fetched.length + ' 个' + (rate ? '（API 额度：' + rate + '）' : ''));

  let normalized;
  try {
    normalized = normalizeFetchedRepos(fetched);
  } catch (error) {
    if (error instanceof SnapshotInputError) {
      abort(EXIT.SCHEMA, '响应结构不符预期：' + error.message, '未写入任何文件');
    }
    throw error;
  }

  // 护栏 A：上游返回空列表。几乎一定是权限/限流/改名之类的问题，不是"用户真的没有仓库"。
  // 本护栏**无条件失败，没有任何逃生阀** —— 与护栏 B 不同，这里刻意不读任何环境变量。
  //
  // 为什么和护栏 B 不对称：两者的触发条件性质不同。
  //   护栏 B 是"策展后为空"，可能是使用者自己把 exclude 配满了 —— 意图可能为真，给逃生口合理。
  //   护栏 A 是"上游返回 0 个仓库"，对本站点（账号确有公开仓库）而言几乎必然是 API 故障。
  // 后果不对称是决定性的：真无仓库时拒绝写入只是让定时任务响亮地红一次，人工介入即可；
  // 而 API 故障返回空数组时若放行，站点会**静默丢掉全部项目**。宁可响亮失败，不要安静失败。
  // 因此这里连"显式设置即可放行"的口子都不开：报错文案也不得指引任何可绕过的变量。
  if (normalized.length === 0) {
    abort(
      EXIT.EMPTY,
      '上游返回的公开仓库数为 0，拒绝用空列表覆盖现有快照',
      '本护栏无放行开关：请先排查 owner 拼写、仓库可见性与 API 限流；确认是上游故障而非账号被清空后再重跑'
    );
  }

  const { kept, excluded } = filterRepos(normalized, config);
  for (const item of excluded) {
    log('  - 已排除 ' + item.name + '：' + item.reason);
  }

  // 护栏 B：策展后为空。默认 exclude 为空时不可能触发；
  // 但若有人把 exclude 配成全部命中（或误配通配），宁可让定时任务红一次，也不要静默清空线上列表。
  if (kept.length === 0 && process.env.FETCH_REPOS_ALLOW_EMPTY !== '1') {
    abort(
      EXIT.EMPTY,
      '策展后可用仓库为 0，拒绝用空列表覆盖现有快照',
      '请检查 data/site-config.json 的 exclude / excludeForks；确认要写空快照请设置 FETCH_REPOS_ALLOW_EMPTY=1'
    );
  }

  const previousJsonText = readOptionalText(SNAPSHOT_JSON_PATH);
  const nowIso = new Date().toISOString();

  let resolved;
  try {
    resolved = resolveSnapshot(fetched, { config, overrides, nowIso, previousJsonText });
  } catch (error) {
    if (error instanceof SnapshotInputError) {
      abort(EXIT.SCHEMA, error.message, '未写入任何文件');
    }
    throw error;
  }

  log('快照仓库         : ' + resolved.snapshot.repos.length + ' 个 → ' +
    resolved.snapshot.repos.map((r) => r.name).join(', '));

  // 字节级写盘门：内容没变就一个字节都不写。定时任务因此不会产生无意义提交。
  if (previousJsonText === resolved.json) {
    log('内容未变化       : ' + (resolved.reusedGeneratedAt
      ? '沿用原 generatedAt（' + resolved.snapshot.generatedAt + '），不写盘'
      : '不写盘'));
    log('结果             : 无变化（退出码 0）');
    return EXIT.OK;
  }

  log('generatedAt      : ' + resolved.snapshot.generatedAt +
    (resolved.reusedGeneratedAt ? '（内容未变，沿用旧值）' : '（内容变化，使用本次运行时间）'));

  writeFileAtomically(SNAPSHOT_JSON_PATH, resolved.json);
  log('已写入           : ' + path.relative(PROJECT_ROOT, SNAPSHOT_JSON_PATH).replace(/\\/g, '/'));

  writeFileAtomically(SNAPSHOT_JS_PATH, resolved.js);
  log('已写入           : ' + path.relative(PROJECT_ROOT, SNAPSHOT_JS_PATH).replace(/\\/g, '/'));

  log('结果             : 快照已更新（退出码 0）');
  return EXIT.OK;
}

main().then(
  (code) => {
    process.exit(code);
  },
  (error) => {
    // 兜底：任何未预料的异常也必须是非零退出且不写盘（此时尚未走到写盘步骤）
    process.stderr.write('\n抓取失败（未预料的异常，退出码 ' + EXIT.UNEXPECTED + '）：' + (error && error.stack ? error.stack : error) + '\n');
    process.stderr.write('  → 已中止，未写入任何文件。\n');
    process.exit(EXIT.UNEXPECTED);
  }
);
