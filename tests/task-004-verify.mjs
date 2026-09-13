#!/usr/bin/env node
/*
 * task-004-verify.mjs — task-004 产出的验证脚本（两个阶段：离线结构验证 + 失败演练）
 *
 * 运行：node tests/task-004-verify.mjs            # 两个阶段都跑
 *      node tests/task-004-verify.mjs --structural-only   # 只跑阶段一（不绑定端口，适合受限环境）
 * 退出码：0 = 全部通过；1 = 有检查未通过（逐条打印 PASS/FAIL）
 *
 * 为什么要有这个文件（全局约束，来源 tester-001 E-1）：
 *   上一轮开发报告里写了「已执行测试、exitCode: 0」，但脚本没落盘、命令栏写的是描述而不是
 *   真实命令，导致结论**无法复跑**，证据等级等同于转述。凡是报告里声称跑过的验证，
 *   都必须能在磁盘上找到脚本并用报告中给出的命令原文重跑一遍。
 *
 * r2 变更（对应缺陷 D-1，裁决方案 B「只改文案、不改行为」）：
 *   阶段二新增护栏 A / 护栏 B 各自的**两个方向**覆盖（原仅覆盖护栏 A 默认态，
 *   漏掉了「设了 FETCH_REPOS_ALLOW_EMPTY=1 会怎样」，这正是缺陷 D-1 的藏身处）：
 *     · 护栏 A：场景 F（不设变量）与场景 H（设变量）→ **两者必须都是 exit=7 且不写盘**。
 *       这一对是方案 B 的判别性证据：若有人日后给护栏 A 接上该变量，H 会立刻变红。
 *     · 护栏 B：场景 G（不设变量 → exit=7）与写盘组第二组（设变量 → 放行且写盘）。
 *   另新增文案断言（口径按**意图**而非字面，见场景 F 的注释）：护栏 A 的报错正文
 *   不得出现赋值形式 `FETCH_REPOS_ALLOW_EMPTY=1`。
 *
 * 阶段一（结构）：纯离线、只读，断言 snapshotSchemaContract 的形状与策展逻辑。
 * 阶段二（演练）：本机回环假 GitHub + 真实子进程，验证「失败绝不写盘」。
 *   刻意用同一份文件承载两个阶段，是因为本任务的允许路径只给了 tests/task-004-verify.mjs
 *   一个文件（tests/ 的其余文件归 task-005）。阶段二需要绑端口，故提供 --structural-only
 *   让人在受限环境下仍能跑到阶段一。
 *
 * 与真实 GitHub 相关的验收（幂等 diff、连不上时的退出码）不在此脚本内：
 * 它们需要命中真实 API，由报告中的 shell 命令原文复跑。
 *
 * 注意：本文件位于 tests/。文件名刻意不匹配 Node test runner 的用例规则
 * （*.test.mjs / test-*.mjs），且下面有 NODE_TEST_CONTEXT 守卫，
 * 因此不会被 task-005 的测试运行误收集或打断。
 */

import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  REPO_FIELDS,
  SNAPSHOT_FIELDS,
  SnapshotInputError,
  normalizeConfig,
  normalizeOverrides,
  normalizeFetchedRepos,
  filterRepos,
  sortRepos,
  serializeReposJs,
  resolveSnapshot,
  buildSnapshot
} from '../scripts/curate.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');

const SNAPSHOT_JSON = path.join(ROOT, 'data', 'repos.json');
const SNAPSHOT_JS = path.join(ROOT, 'data', 'repos.js');
const SITE_CONFIG = path.join(ROOT, 'data', 'site-config.json');
const OVERRIDES = path.join(ROOT, 'data', 'repo-overrides.json');
const SCRIPTS_DIR = path.join(ROOT, 'scripts');
const WATCHED_FILES = [SNAPSHOT_JSON, SNAPSHOT_JS];

/** 期望的仓库名集合：来自 assignment 的 acceptance（仅本文件内出现，scripts/ 内不得出现任何仓库名） */
const EXPECTED_REPO_NAMES = ['APpery1', 'QQscript', 'RamdamSysytem', 'MyApplication', 'test'];

/** 与验收那条 grep 完全同构：对这三个特征鲜明的名字做全文字面量扫描（含注释） */
const STRICT_SCAN_NAMES = ['QQscript', 'RamdamSysytem', 'MyApplication'];

/* ------------------------------------------------------------------ *
 * 断言与计数
 * ------------------------------------------------------------------ */

let passed = 0;
const failures = [];

function check(title, fn) {
  try {
    fn();
    passed += 1;
    console.log('  PASS  ' + title);
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    failures.push({ title, message });
    console.log('  FAIL  ' + title + '\n        → ' + message);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message + '（期望 ' + JSON.stringify(expected) + '，实际 ' + JSON.stringify(actual) + '）');
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

/** 两个快照文件的摘要串，用于「失败时磁盘是否被动过」的判定 */
function snapshotWatched() {
  return WATCHED_FILES.map((f) => path.basename(f) + '=' + sha256(f)).join(' | ');
}

/** 剥掉注释后再扫描代码，避免把注释里的普通英文词当成硬编码仓库名 */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/* ------------------------------------------------------------------ *
 * 阶段一：离线结构验证
 * ------------------------------------------------------------------ */

function structuralPhase() {
  console.log('[阶段一] 离线结构验证（零网络、零写入）\n');

  const snapshot = readJson(SNAPSHOT_JSON);
  const reposJsText = fs.readFileSync(SNAPSHOT_JS, 'utf8');
  const siteConfig = readJson(SITE_CONFIG);
  const overrides = readJson(OVERRIDES);
  const config = normalizeConfig(siteConfig);
  const overrideTable = normalizeOverrides(overrides);

  console.log('1. snapshotSchemaContract 形状（task-003 消费的接口）');

  check('顶层键集合与顺序恰为 generatedAt / owner / repos', () => {
    assertEqual(JSON.stringify(Object.keys(snapshot)), JSON.stringify(SNAPSHOT_FIELDS), '顶层键不符');
  });

  check('owner 与 site-config.json 的 owner 一致', () => {
    assertEqual(snapshot.owner, config.owner, 'owner 不符');
  });

  check('generatedAt 是合法 ISO8601 字符串', () => {
    assert(typeof snapshot.generatedAt === 'string' && snapshot.generatedAt !== '', 'generatedAt 不是非空字符串');
    assert(!Number.isNaN(Date.parse(snapshot.generatedAt)), 'generatedAt 无法解析为时间');
    assert(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(snapshot.generatedAt), 'generatedAt 不是 ISO8601 形式');
  });

  check('repos 是非空数组', () => {
    assert(Array.isArray(snapshot.repos), 'repos 不是数组');
    assert(snapshot.repos.length > 0, 'repos 为空数组（快照不得为空）');
  });

  check('每个仓库的键集合与顺序恰为契约字段（含 descZh / descEn）', () => {
    snapshot.repos.forEach((repo, index) => {
      assertEqual(JSON.stringify(Object.keys(repo)), JSON.stringify(REPO_FIELDS), '第 ' + index + ' 项字段不符');
    });
  });

  check('每个仓库的字段类型符合契约', () => {
    snapshot.repos.forEach((repo) => {
      assert(typeof repo.name === 'string' && repo.name !== '', repo.name + ': name 应为非空字符串');
      assertEqual(repo.url, config.repoBaseUrl + '/' + config.owner + '/' + repo.name, repo.name + ': url 不符');
      assert(typeof repo.description === 'string', repo.name + ': description 应为字符串');
      assert(typeof repo.descZh === 'string', repo.name + ': descZh 应为字符串');
      assert(typeof repo.descEn === 'string', repo.name + ': descEn 应为字符串');
      assert(repo.language === null || typeof repo.language === 'string', repo.name + ': language 应为字符串或 null');
      assert(typeof repo.pushedAt === 'string' && !Number.isNaN(Date.parse(repo.pushedAt)), repo.name + ': pushedAt 不是合法时间');
      assert(Number.isInteger(repo.stars) && repo.stars >= 0, repo.name + ': stars 应为非负整数');
      assert(typeof repo.fork === 'boolean', repo.name + ': fork 应为布尔值');
    });
  });

  check('仓库名集合恰为验收要求的 5 个', () => {
    const actual = snapshot.repos.map((r) => r.name).slice().sort();
    const expected = EXPECTED_REPO_NAMES.slice().sort();
    assertEqual(JSON.stringify(actual), JSON.stringify(expected), '仓库名集合不符');
  });

  check('排序为 pushedAt 降序（pinned 为空时）', () => {
    assertEqual(config.pinned.length, 0, '本断言假设 pinned 为空');
    for (let i = 1; i < snapshot.repos.length; i += 1) {
      const prev = Date.parse(snapshot.repos[i - 1].pushedAt);
      const curr = Date.parse(snapshot.repos[i].pushedAt);
      assert(prev >= curr, '第 ' + i + ' 项未按 pushedAt 降序');
    }
  });

  console.log('\n2. data/repos.js 运行时壳');

  check('首行恰为 window.__REPO_SNAPSHOT__ = <数据>; 且只占一个逻辑行', () => {
    const lines = reposJsText.split('\n');
    assertEqual(lines[lines.length - 1], '', '文件末尾应为换行');
    assertEqual(lines.length, 2, 'repos.js 应只有一行内容 + 结尾换行，实际 ' + (lines.length - 1) + ' 行');
    assert(/^window\.__REPO_SNAPSHOT__ = \{.*\};\s*$/.test(lines[0]), '首行不是 window.__REPO_SNAPSHOT__ 赋值语句');
  });

  check('repos.js 的数据与 repos.json 完全一致（含键顺序）', () => {
    const payload = reposJsText.slice(0, reposJsText.lastIndexOf('\n'));
    const prefix = 'window.__REPO_SNAPSHOT__ = ';
    assert(payload.startsWith(prefix), '缺少赋值前缀');
    assert(payload.endsWith(';'), '缺少语句结尾分号');
    const embedded = JSON.parse(payload.slice(prefix.length, -1));
    assertEqual(JSON.stringify(embedded), JSON.stringify(snapshot), '两份快照数据不一致');
    assertEqual(serializeReposJs(embedded), reposJsText, 'repos.js 字节与序列化函数输出不一致');
  });

  console.log('\n3. 策展配置');

  check('site-config.json 含 owner / exclude / excludeForks / pinned / showMeta 五项', () => {
    for (const key of ['owner', 'exclude', 'excludeForks', 'pinned', 'showMeta']) {
      assert(Object.prototype.hasOwnProperty.call(siteConfig, key), '缺少字段 ' + key);
    }
    assertEqual(config.exclude.length, 0, 'exclude 应为空数组（用户要求全部展示）');
  });

  check('筛选机制存在且可配置（FR-04）：排除清单真的会过滤掉仓库', () => {
    const fake = [
      { name: 'Alpha', description: '', language: null, pushedAt: '2026-01-01T00:00:00Z', stars: 0, fork: false },
      { name: 'Hidden', description: '', language: null, pushedAt: '2026-01-02T00:00:00Z', stars: 0, fork: false }
    ];
    const result = filterRepos(fake, { ...config, exclude: ['Hidden'] });
    assertEqual(result.kept.map((r) => r.name).join(','), 'Alpha', 'exclude 未生效');
    assertEqual(result.excluded.length, 1, 'excluded 统计不正确');
  });

  check('fork 过滤真的会过滤掉 fork（FR-04）', () => {
    const fake = [
      { name: 'Origin', description: '', language: null, pushedAt: '2026-01-01T00:00:00Z', stars: 0, fork: false },
      { name: 'Forked', description: '', language: null, pushedAt: '2026-01-02T00:00:00Z', stars: 0, fork: true }
    ];
    const result = filterRepos(fake, { ...config, excludeForks: true });
    assertEqual(result.kept.map((r) => r.name).join(','), 'Origin', 'excludeForks 未生效');
  });

  check('repo-overrides.json 映射为空：不预置占位、不编造用户描述', () => {
    assert(fs.existsSync(OVERRIDES), 'data/repo-overrides.json 不存在（必须存在且可被读取）');
    assert(typeof overrides._note === 'string' && overrides._note !== '', '缺少 _note 说明字段');
    assertEqual(Object.keys(overrideTable).length, 0, 'overrides 映射应为空，实际含条目：' + Object.keys(overrideTable).join(', '));
  });

  check('真实快照中 descZh / descEn 全为空字符串（overrides 为空时的契约行为）', () => {
    snapshot.repos.forEach((repo) => {
      assertEqual(repo.descZh, '', repo.name + ': descZh 应为空字符串');
      assertEqual(repo.descEn, '', repo.name + ': descEn 应为空字符串');
    });
  });

  check('降级路径在真实数据上可触发：存在 description 也为空的仓库', () => {
    const emptyOnes = snapshot.repos.filter((r) => r.description === '').map((r) => r.name);
    assert(emptyOnes.length > 0, '没有任何仓库的 description 为空，task-003 的降级验收将无法用真实数据演示');
  });

  check('override 优先于 GitHub 原始描述（契约：override 优先）', () => {
    const built = buildSnapshot(
      [{ name: 'X', description: 'from github', language: 'Go', pushed_at: '2026-01-01T00:00:00Z', stargazers_count: 3, fork: false }],
      { config: { ...config, pinned: [] }, overrides: { X: { descZh: '中文覆盖', descEn: 'English override' } }, generatedAt: 'T' }
    );
    assertEqual(built.repos[0].descZh, '中文覆盖', 'descZh 未取 override');
    assertEqual(built.repos[0].descEn, 'English override', 'descEn 未取 override');
    assertEqual(built.repos[0].description, 'from github', 'description 不应被 override 改写');
  });

  check('无 override 时 descZh / descEn 为空字符串（契约要求）', () => {
    const built = buildSnapshot(
      [{ name: 'Y', description: 'raw', language: null, pushed_at: '2026-01-01T00:00:00Z', stargazers_count: 0, fork: false }],
      { config: { ...config, pinned: [] }, overrides: {}, generatedAt: 'T' }
    );
    assertEqual(built.repos[0].descZh, '', 'descZh 应为空字符串');
    assertEqual(built.repos[0].descEn, '', 'descEn 应为空字符串');
  });

  console.log('\n4. 排序与确定性');

  check('pinned 置顶且按 pinned 数组顺序', () => {
    const fake = [
      { name: 'A', pushedAt: '2026-01-01T00:00:00Z' },
      { name: 'B', pushedAt: '2026-02-01T00:00:00Z' },
      { name: 'C', pushedAt: '2026-03-01T00:00:00Z' }
    ];
    const sorted = sortRepos(fake, ['C', 'A']);
    assertEqual(sorted.map((r) => r.name).join(','), 'C,A,B', 'pinned 排序不符');
  });

  check('pushedAt 相同时按名称升序决胜（全序，不依赖输入顺序）', () => {
    const same = '2026-01-01T00:00:00Z';
    const a = sortRepos([{ name: 'Beta', pushedAt: same }, { name: 'Alpha', pushedAt: same }], []);
    const b = sortRepos([{ name: 'Alpha', pushedAt: same }, { name: 'Beta', pushedAt: same }], []);
    assertEqual(a.map((r) => r.name).join(','), 'Alpha,Beta', '名称升序决胜未生效');
    assertEqual(b.map((r) => r.name).join(','), 'Alpha,Beta', '排序依赖了输入顺序');
  });

  check('resolveSnapshot 幂等：同一输入 + 旧快照 → 沿用旧 generatedAt、字节完全一致', () => {
    const fetched = [
      { name: 'Z', description: 'z', language: 'Rust', pushed_at: '2026-05-05T00:00:00Z', stargazers_count: 1, fork: false }
    ];
    const first = resolveSnapshot(fetched, { config, overrides: {}, nowIso: '2026-09-13T00:00:00.000Z', previousJsonText: null });
    const second = resolveSnapshot(fetched, {
      config,
      overrides: {},
      nowIso: '2026-09-13T01:00:00.000Z',
      previousJsonText: first.json
    });
    assertEqual(second.json, first.json, '第二次运行产出的字节与第一次不同（幂等性失败）');
    assertEqual(second.snapshot.generatedAt, '2026-09-13T00:00:00.000Z', '内容未变时未沿用旧 generatedAt');
    assertEqual(second.contentChanged, false, 'contentChanged 应为 false');
  });

  check('内容变化时 generatedAt 使用本次运行时间', () => {
    const before = resolveSnapshot(
      [{ name: 'Z', description: 'z', language: null, pushed_at: '2026-05-05T00:00:00Z', stargazers_count: 0, fork: false }],
      { config, overrides: {}, nowIso: '2026-09-13T00:00:00.000Z', previousJsonText: null }
    );
    const after = resolveSnapshot(
      [{ name: 'Z', description: 'changed', language: null, pushed_at: '2026-05-05T00:00:00Z', stargazers_count: 0, fork: false }],
      { config, overrides: {}, nowIso: '2026-09-13T02:00:00.000Z', previousJsonText: before.json }
    );
    assertEqual(after.contentChanged, true, 'contentChanged 应为 true');
    assertEqual(after.snapshot.generatedAt, '2026-09-13T02:00:00.000Z', '内容变化时未使用新时间戳');
  });

  check('快照序列化确定性：同一输入两次序列化逐字节相同', () => {
    const args = [
      [{ name: 'Z', description: 'z', language: null, pushed_at: '2026-05-05T00:00:00Z', stargazers_count: 0, fork: false }],
      { config, overrides: {}, generatedAt: '2026-01-01T00:00:00.000Z' }
    ];
    assertEqual(JSON.stringify(buildSnapshot(...args)), JSON.stringify(buildSnapshot(...args)), '同一输入两次构建结果不同');
  });

  console.log('\n5. 输入校验（失败前置条件：调用方据此非零退出且不写盘）');

  check('非数组响应被拒绝', () => {
    let threw = false;
    try {
      normalizeFetchedRepos({ message: 'Not Found' });
    } catch (error) {
      threw = error instanceof SnapshotInputError;
    }
    assert(threw, '非数组响应未被拒绝');
  });

  check('缺少 name / pushed_at 的条目被拒绝', () => {
    for (const bad of [[{ pushed_at: '2026-01-01T00:00:00Z' }], [{ name: 'A' }], [{ name: 'A', pushed_at: 'not-a-date' }]]) {
      let threw = false;
      try {
        normalizeFetchedRepos(bad);
      } catch (error) {
        threw = error instanceof SnapshotInputError;
      }
      assert(threw, '结构非法的条目未被拒绝：' + JSON.stringify(bad));
    }
  });

  check('site-config 缺少 owner 被拒绝', () => {
    let threw = false;
    try {
      normalizeConfig({ exclude: [] });
    } catch (error) {
      threw = error instanceof SnapshotInputError;
    }
    assert(threw, '缺少 owner 的配置未被拒绝');
  });

  console.log('\n6. 脚本自身约束');

  check('scripts/ 下零硬编码仓库名（等价于验收 grep QQscript|RamdamSysytem|MyApplication）', () => {
    const files = fs.readdirSync(SCRIPTS_DIR).filter((f) => f.endsWith('.mjs'));
    assert(files.length > 0, 'scripts/ 下没有 .mjs 文件');
    const offenders = [];
    for (const file of files) {
      const text = fs.readFileSync(path.join(SCRIPTS_DIR, file), 'utf8');
      for (const name of STRICT_SCAN_NAMES) {
        if (text.includes(name)) offenders.push(file + ' 含 "' + name + '"');
      }
    }
    assertEqual(offenders.join('；'), '', '存在硬编码仓库名');
  });

  check('scripts/ 代码（去注释后）零字面量仓库名，含 test / APpery1', () => {
    // 单独一条的原因：仓库名 "test" 同时是常见英文单词，注释里出现它无法避免
    // （curate.mjs 有一条注释解释小写化比较）。所以先剥掉注释，再按单词边界扫代码，
    // 这样"代码里真的写死了仓库名"仍会被抓到，而注释里的普通用词不会误报。
    const files = fs.readdirSync(SCRIPTS_DIR).filter((f) => f.endsWith('.mjs'));
    const offenders = [];
    for (const file of files) {
      const code = stripComments(fs.readFileSync(path.join(SCRIPTS_DIR, file), 'utf8'));
      for (const name of EXPECTED_REPO_NAMES) {
        if (new RegExp('\\b' + name + '\\b').test(code)) offenders.push(file + ' 代码含 "' + name + '"');
      }
    }
    assertEqual(offenders.join('；'), '', '代码中存在硬编码仓库名');
  });

  check('scripts/curate.mjs 是纯函数模块（无网络、无 I/O、无环境变量、无时钟）', () => {
    const code = stripComments(fs.readFileSync(path.join(SCRIPTS_DIR, 'curate.mjs'), 'utf8'));
    for (const forbidden of ['fetch(', 'readFile', 'writeFile', 'process.env', 'Date.now', 'new Date(']) {
      assert(!code.includes(forbidden), 'curate.mjs 出现非纯函数调用：' + forbidden);
    }
  });

  check('scripts/ 下零第三方依赖（只 import node: 内置与相对路径）', () => {
    const files = fs.readdirSync(SCRIPTS_DIR).filter((f) => f.endsWith('.mjs'));
    for (const file of files) {
      const text = fs.readFileSync(path.join(SCRIPTS_DIR, file), 'utf8');
      const specs = [...text.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const spec of specs) {
        assert(spec.startsWith('node:') || spec.startsWith('./') || spec.startsWith('../'),
          file + ' 引入了非内置依赖：' + spec);
      }
    }
  });

  check('data/ 下无 JSON 语法错误，且未留下临时文件', () => {
    const dataDir = path.join(ROOT, 'data');
    for (const file of fs.readdirSync(dataDir)) {
      if (file.endsWith('.json')) JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
      assert(!file.includes('.tmp'), '残留临时文件：' + file);
    }
  });
}

/* ------------------------------------------------------------------ *
 * 阶段二：失败演练（本机回环假 GitHub + 真实子进程）
 *
 * `FETCH_REPOS_API_BASE=http://127.0.0.1:9` 只能演练"连不上"这一种失败。
 * 真正的生命线风险还有三种：HTTP 非 2xx（限流）、响应不是 JSON、响应是 JSON 但结构不对。
 * 这几种用本机 http 服务器当假 GitHub 即可离线复现，无需任何桩库。
 * 每个场景断言两件事：退出码符合预期；data/repos.json 与 data/repos.js 逐字节不变。
 * ------------------------------------------------------------------ */

/** 当前场景的假响应；每个场景前替换 */
let responder = () => {
  throw new Error('responder 未设置');
};

const server = http.createServer((req, res) => responder(req, res));

/*
 * 必须用异步 spawn，不能用 spawnSync。
 * spawnSync 会阻塞本进程的事件循环，而本进程同时还在扮演假 GitHub 服务器——
 * 结果就是子进程发来的请求永远得不到响应，全部超时（这不是假想，本脚本第一版就踩了这个坑：
 * 6 个场景 + 对照组全部以「网络请求失败 / operation was aborted due to timeout」告终）。
 */
function runCli(port, options = {}, timeoutMs = 30000) {
  const env = { ...process.env, FETCH_REPOS_API_BASE: 'http://127.0.0.1:' + port, GITHUB_TOKEN: '' };
  // 逃生阀默认**不设**：失败路径的断言必须在"未设变量"这个默认态下成立。
  // 只有明确要求放行的场景才注入，避免测试自己把护栏关掉。
  if (options.allowEmpty) env.FETCH_REPOS_ALLOW_EMPTY = '1';
  else delete env.FETCH_REPOS_ALLOW_EMPTY;

  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['scripts/fetch-repos.mjs'], {
      cwd: ROOT,
      env
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill();
        resolve({ status: null, stdout, stderr: stderr + '\n[drill] 子进程超时未退出，已强制结束' });
      }
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (status) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    });
  });
}

const scenarios = [
  {
    name: 'A. HTTP 403 限流',
    expectExit: 3,
    expectOutput: /限流/,
    respond(req, res) {
      res.writeHead(403, {
        'content-type': 'application/json',
        'x-ratelimit-remaining': '0',
        'x-ratelimit-reset': '1799999999'
      });
      res.end(JSON.stringify({ message: 'API rate limit exceeded' }));
    }
  },
  {
    name: 'B. HTTP 500',
    expectExit: 3,
    expectOutput: /HTTP 500/,
    respond(req, res) {
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end('Internal Server Error');
    }
  },
  {
    name: 'C. 200 但响应体不是 JSON（网关 HTML 错误页）',
    expectExit: 4,
    expectOutput: /不是合法 JSON/,
    respond(req, res) {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html><body>502 Bad Gateway</body></html>');
    }
  },
  {
    name: 'D. 200 且是 JSON，但结构不符预期（对象而非数组）',
    expectExit: 5,
    expectOutput: /结构不符预期/,
    respond(req, res) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ message: 'Not Found' }));
    }
  },
  {
    name: 'E. 200 数组元素缺 pushed_at（结构不符预期）',
    expectExit: 5,
    expectOutput: /pushed_at/,
    respond(req, res) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify([{ name: 'Alpha', description: null, language: null, stargazers_count: 0, fork: false }]));
    }
  },
  {
    // D-1 / r2 方案 B 的 G1：护栏 A **无条件失败**，且报错文案**不得**再指引人去设置逃生阀。
    // 文案口径按意图判定（tester-001 指出字面口径会给正确实现出假 FAIL）：
    // 禁止的是**赋值形式** `FETCH_REPOS_ALLOW_EMPTY=1`（那是在叫操作者去打开它），
    // 允许出现裸变量名用于澄清"该开关对本护栏不适用"。
    name: 'F. 200 空数组（护栏 A 默认态：拒绝清空线上列表）',
    expectExit: 7,
    expectOutput: /上游返回的公开仓库数为 0/,
    forbidOutput: /FETCH_REPOS_ALLOW_EMPTY\s*=\s*1/,
    respond(req, res) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('[]');
    }
  },
  {
    // 护栏 B 的默认态：上游有仓库（结构合法、非空），但全被策展滤掉（fork + excludeForks=true）。
    // 这样不必改 data/site-config.json 就能从真实配置路径触发。属 r2 新增的护栏 B 回归覆盖。
    name: 'G. 上游仅返回 fork（护栏 B 默认态：策展后为空，拒绝写盘）',
    expectExit: 7,
    expectOutput: /策展后可用仓库为 0/,
    respond(req, res) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(FORK_ONLY_BODY);
    }
  },
  {
    // D-1 / r2 方案 B 的 G2：**这是方案 B 的判别性场景**。
    // 方案 A 下这一条会 exit=0；方案 B 下必须仍为 exit=7。
    // 与 F 合起来看，两条构成完整的"护栏 A 两个分支"覆盖 —— 无论设不设该变量，结果都一样。
    // 注意本场景运行时磁盘上仍是真实快照（5 个仓库），所以"字节不变"是有判别力的断言：
    // 若护栏 A 被放行，真实快照会被清空。
    name: 'H. 200 空数组 + FETCH_REPOS_ALLOW_EMPTY=1（护栏 A 无逃生阀：仍须拒绝）',
    expectExit: 7,
    expectOutput: /上游返回的公开仓库数为 0/,
    options: { allowEmpty: true },
    respond(req, res) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('[]');
    }
  }
];

/** 上游仅返回 fork 的响应体，供护栏 B 的两个方向复用 */
const FORK_ONLY_BODY = JSON.stringify([
  { name: 'ForkOnly', description: null, language: null, pushed_at: '2026-01-01T00:00:00Z', stargazers_count: 0, fork: true }
]);

const LEGIT_BODY = JSON.stringify([
  { name: 'Alpha', description: 'a', language: 'Go', pushed_at: '2026-01-01T00:00:00Z', stargazers_count: 2, fork: false }
]);

async function drillPhase() {
  console.log('\n[阶段二] 失败演练（假 GitHub 走本机回环，零外部网络）\n');

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  console.log('  假 GitHub: http://127.0.0.1:' + port + '（被演练的是真实 scripts/fetch-repos.mjs 子进程）\n');

  const scenarioResults = [];

  for (const scenario of scenarios) {
    responder = scenario.respond;
    const before = snapshotWatched();
    const result = await runCli(port, scenario.options || {});
    const after = snapshotWatched();
    const output = (result.stdout || '') + (result.stderr || '');
    scenarioResults.push({ label: scenario.name, result });

    const problems = [];
    if (result.status !== scenario.expectExit) {
      problems.push('退出码期望 ' + scenario.expectExit + '，实际 ' + result.status);
    }
    if (!scenario.expectOutput.test(output)) {
      problems.push('输出未包含 ' + scenario.expectOutput);
    }
    // 文案禁止项：命中即说明报错正文又在指引操作者去打开一个对本护栏无效的开关
    if (scenario.forbidOutput && scenario.forbidOutput.test(output)) {
      problems.push('输出出现了禁止的文案 ' + scenario.forbidOutput + '（报错正文不得指引设置该开关）');
    }
    if (before !== after) {
      problems.push('磁盘被改动了！before=[' + before + '] after=[' + after + ']');
    }

    if (problems.length === 0) {
      passed += 1;
      console.log('  PASS  ' + scenario.name + ' → 退出码 ' + result.status + '，两个快照文件字节不变');
    } else {
      failures.push({ title: scenario.name, message: problems.join('；') });
      console.log('  FAIL  ' + scenario.name + '\n        → ' + problems.join('；'));
      console.log('        原始输出：' + output.trim().split('\n').join('\n        '));
    }
  }

  // ------------------------------------------------------------------
  // 会写盘的两组：对照组 + 护栏 B 的逃生阀。
  // 它们在同一个备份窗口内执行，finally 中统一还原，保证本脚本不改动最终产物。
  //
  // 顺序是有讲究的 —— 必须让每组都真正改变内容，断言才有意义：
  //   1) 对照组   ：真实快照（5 个仓库）→ Alpha（1 个）   → 内容变化，写盘
  //   2) 护栏 B 阀：Alpha → 策展后为空（0 个）            → 内容变化，写盘
  //
  // 对照组的作用是反证：脚本并非"从不写盘"，而是"只在成功分支写盘"。
  // 护栏 A 的逃生阀**不在这里** —— 方案 B 下它根本不存在，由场景 F/H 覆盖（两者都断言不写盘）。
  // ------------------------------------------------------------------
  const backups = WATCHED_FILES.map((f) => ({
    file: f,
    had: fs.existsSync(f),
    text: fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null
  }));
  const beforeWriteRuns = snapshotWatched();

  const writeRuns = [
    {
      label: '对照组：合法响应（未设逃生阀）',
      body: LEGIT_BODY,
      allowEmpty: false,
      expectNames: ['Alpha'],
      expectWritten: true
    },
    {
      label: '护栏 B 逃生阀：策展后为空 + FETCH_REPOS_ALLOW_EMPTY=1',
      body: FORK_ONLY_BODY,
      allowEmpty: true,
      expectNames: [],
      expectWritten: true
    }
  ];

  const results = [];
  try {
    for (const run of writeRuns) {
      const diffBefore = snapshotWatched();
      responder = (req, res) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(run.body);
      };
      const result = await runCli(port, { allowEmpty: run.allowEmpty });
      results.push({
        run,
        result,
        didWrite: diffBefore !== snapshotWatched(),
        snapshot: JSON.parse(fs.readFileSync(SNAPSHOT_JSON, 'utf8'))
      });
    }
  } finally {
    // finally 而不是顺序执行：即使上面抛异常，也必须把 data/ 还原回去
    for (const backup of backups) {
      if (backup.had) fs.writeFileSync(backup.file, backup.text);
      else if (fs.existsSync(backup.file)) fs.unlinkSync(backup.file);
    }
  }

  if (snapshotWatched() !== beforeWriteRuns) {
    failures.push({ title: '写盘组还原', message: '还原 data/ 失败，产物可能已被假数据污染' });
    console.log('  FAIL  写盘组还原：产物未还原成功，请手动重跑 node scripts/fetch-repos.mjs');
  }

  for (const { run, result, didWrite, snapshot } of results) {
    const output = (result.stdout || '') + (result.stderr || '');
    const names = snapshot.repos.map((r) => r.name).join(',');

    const problems = [];
    if (result.status !== 0) {
      problems.push('退出码期望 0，实际 ' + result.status);
    }
    if (names !== run.expectNames.join(',')) {
      problems.push('快照仓库期望 [' + run.expectNames.join(',') + ']，实际 [' + names + ']');
    }
    // 两组都显式设置了逃生阀，因此绝不应再被空结果护栏拦下
    if (/拒绝用空列表覆盖/.test(output)) {
      problems.push('被空结果护栏拦下（已显式设置 FETCH_REPOS_ALLOW_EMPTY=1，不应被拦）');
    }
    if (run.expectWritten === true && !didWrite) {
      problems.push('期望写盘但磁盘未变');
    }

    if (problems.length === 0) {
      passed += 1;
      console.log('  PASS  ' + run.label + ' → 退出码 0，快照仓库 [' + names + ']，已写盘');
    } else {
      failures.push({ title: run.label, message: problems.join('；') });
      console.log('  FAIL  ' + run.label + '\n        → ' + problems.join('；'));
      console.log('        原始输出：' + output.trim().split('\n').join('\n        '));
    }
  }

  await new Promise((resolve) => server.close(resolve));

  // ------------------------------------------------------------------
  // 逃生阀的边界：它只能放行"上游确实没有仓库"，不得被扩大成"放行一切失败"。
  // 设了 FETCH_REPOS_ALLOW_EMPTY=1 时，网络失败仍必须非零退出且不写盘。
  // 端口 9 是 fetch 规范的禁用端口，必然立刻失败（等价于 127.0.0.1:9）。
  // ------------------------------------------------------------------
  {
    const before = snapshotWatched();
    const result = await runCli(9, { allowEmpty: true });
    const output = (result.stdout || '') + (result.stderr || '');
    const after = snapshotWatched();
    const label = '逃生阀边界：设了 FETCH_REPOS_ALLOW_EMPTY=1 但网络失败 → 仍须非零退出且不写盘';

    const problems = [];
    if (result.status === 0 || result.status === null) {
      problems.push('退出码期望非 0，实际 ' + result.status);
    }
    if (!/网络请求失败/.test(output)) {
      problems.push('输出未包含「网络请求失败」');
    }
    if (before !== after) {
      problems.push('磁盘被改动了！before=[' + before + '] after=[' + after + ']');
    }

    if (problems.length === 0) {
      passed += 1;
      console.log('  PASS  ' + label + ' → 退出码 ' + result.status + '，两个快照文件字节不变');
    } else {
      failures.push({ title: label, message: problems.join('；') });
      console.log('  FAIL  ' + label + '\n        → ' + problems.join('；'));
      console.log('        原始输出：' + output.trim().split('\n').join('\n        '));
    }
  }

  // 关键证据摘录：把 D-1 判别性场景的原始输出直接打出来，便于报告与复测直接引用，
  // 不必从上面的 PASS 行反推脚本内部到底跑了什么。
  // F 与 H 是**同一输入、只差一个环境变量**的一对 —— 两条输出必须一致，这就是方案 B 的直接证据。
  console.log('\n  —— 关键证据摘录（原始输出，未改写）——');
  const excerpts = [
    scenarioResults.find((s) => s.label.startsWith('F.')),
    scenarioResults.find((s) => s.label.startsWith('H.')),
    results[1] ? { label: results[1].run.label, result: results[1].result } : null
  ].filter(Boolean);

  for (const excerpt of excerpts) {
    console.log('\n  $ FETCH_REPOS_API_BASE=http://127.0.0.1:<port>' +
      (excerpt.label.includes('ALLOW_EMPTY') ? ' FETCH_REPOS_ALLOW_EMPTY=1' : '') +
      ' node scripts/fetch-repos.mjs');
    console.log('  # ' + excerpt.label + '  →  exit=' + excerpt.result.status);
    for (const line of ((excerpt.result.stdout || '') + (excerpt.result.stderr || '')).trim().split('\n')) {
      console.log('    ' + line);
    }
  }
}

/* ------------------------------------------------------------------ *
 * 入口
 * ------------------------------------------------------------------ */

async function main() {
  console.log('== task-004 验证：结构 + 失败演练 ==\n');

  structuralPhase();

  if (process.argv.includes('--structural-only')) {
    console.log('\n[阶段二] 已按 --structural-only 跳过');
  } else {
    await drillPhase();
  }

  console.log('\n== 结果 ==');
  console.log('通过 ' + passed + ' 项，失败 ' + failures.length + ' 项');
  if (failures.length > 0) {
    for (const f of failures) console.log('  FAIL ' + f.title + ' → ' + f.message);
    return 1;
  }
  console.log('全部通过');
  if (!process.argv.includes('--structural-only')) {
    console.log('对照组写入的假数据已还原，data/ 内容与运行前逐字节一致。');
  }
  return 0;
}

// 守卫：万一被 Node test runner 当作测试文件加载（本文件命名已规避），不要打断它的流程。
if (!process.env.NODE_TEST_CONTEXT) {
  main().then((code) => process.exit(code));
}

export { main };
