#!/usr/bin/env node
// Lỗi "lặt vặt" hay lọt qua review nhưng làm hỏng build/deploy hoặc lộ dữ liệu.
// Không cần cài gì — đọc git.
//
//   node scripts/ci/check-hygiene.mjs [base-commit]      # base: so phần thay đổi (PR / push)
//
// Toàn repo:
//   1. Dấu xung đột merge còn sót (<<<<<<< / >>>>>>>).
//   2. Hai file chỉ khác hoa/thường — Windows/macOS checkout hỏng, Linux (CI, Docker) thì không.
//   3. File > 5 MB; thư mục build/phụ thuộc bị commit (node_modules, dist, coverage...).
//   4. File dữ liệu (xlsx, csv, dump, sqlite, zip...) ngoài thư mục được phép — dễ là
//      danh sách nhân sự / học viên có dữ liệu cá nhân.
//   5. .sh phải lưu LF; .sh được workflow / package.json gọi thẳng phải có quyền chạy (100755)
//      — commit từ Windows hay mất bit này → "Permission denied" lúc deploy.
//   6. JSON hỏng cú pháp (seed, cấu hình) — trừ tsconfig (cho phép chú thích).
//   7. test.only / describe.only / it.only — chỉ chạy 1 test, bỏ qua phần còn lại.
// Phần thay đổi (khi có base):
//   8. Biến môi trường MỚI đọc trong backend/src (process.env.X) phải có trong
//      backend/.env.example — thiếu thì server production thiếu biến mà không ai biết.

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
const base = process.argv[2];
const errors = [];
const warnings = [];
const error = (m) => errors.push(m);

const MAX_BYTES = 5 * 1024 * 1024;
// File nhị phân / dữ liệu được phép (mẫu văn bản, ảnh, font...)
const DATA_EXT = /\.(xlsx|xls|xlsm|csv|tsv|dump|bak|sql\.gz|sqlite3?|db|mdb|accdb|zip|7z|rar|tar|tgz|gz|parquet)$/i;
const DATA_ALLOWED = [/^backend\/templates\//, /^backend\/test(-integration(-pg)?)?\/fixtures\//, /^frontend\/public\//];
const BUILD_DIRS = /(^|\/)(node_modules|dist|build|coverage|\.nyc_output|\.vite|\.turbo)\//;
// Biến môi trường do runtime / hạ tầng đặt, không cần trong .env.example
const ENV_INTERNAL = new Set([
  'NODE_ENV', 'GIT_SHA', 'MIGRATIONS_DIR', 'CLUSTER_WORKER', 'UV_THREADPOOL_SIZE', 'HOSTNAME', 'HOME', 'TZ',
  'CI', 'npm_package_version', 'NODE_TEST_CONTEXT', 'JEST_WORKER_ID',
]);

// ls-tree -l: mode type object size\tpath
const tree = git('ls-tree', '-r', '-l', 'HEAD')
  .split('\n')
  .filter(Boolean)
  .map((line) => {
    const [meta, path] = line.split('\t');
    const [mode, , , size] = meta.trim().split(/\s+/);
    return { mode, size: Number(size) || 0, path };
  });
// File đang staged/working tree chưa commit (chạy local trước khi commit) vẫn kiểm theo HEAD là đủ cho CI.

// ---------- 1 ----------
// git grep thoát 1 khi không có gì → execFileSync ném lỗi; bọc lại
function grep(...args) {
  try {
    return git('grep', ...args).trim();
  } catch (e) {
    if (e.status === 1) return '';
    throw e;
  }
}
const markers = grep('-nIE', '^(<<<<<<<|>>>>>>>)( |$)', '--', '.', ':!*.md');
if (markers) error(`Còn dấu xung đột merge:\n${markers.split('\n').slice(0, 10).map((l) => `    ${l}`).join('\n')}`);

// ---------- 2 ----------
const seen = new Map();
for (const { path } of tree) {
  const key = path.toLowerCase();
  if (seen.has(key)) error(`Hai file chỉ khác hoa/thường: ${seen.get(key)} ↔ ${path}`);
  else seen.set(key, path);
}

// ---------- 3 + 4 ----------
for (const { path, size } of tree) {
  if (size > MAX_BYTES) error(`${path}: ${(size / 1048576).toFixed(1)} MB > 5 MB — file lớn không để trong git (dùng Release / lưu trữ riêng)`);
  if (BUILD_DIRS.test(path)) error(`${path}: thư mục build/phụ thuộc bị commit`);
  if (DATA_EXT.test(path) && !DATA_ALLOWED.some((re) => re.test(path)))
    error(`${path}: file dữ liệu bị commit — có thể chứa dữ liệu cá nhân. Không để trong git; nếu là mẫu/fixture thì đặt trong thư mục được phép (scripts/ci/check-hygiene.mjs)`);
}

// ---------- 5 ----------
const eol = git('ls-files', '--eol', '--', '*.sh')
  .split('\n')
  .filter(Boolean)
  .map((l) => ({ index: l.split(/\s+/)[0], path: l.split('\t').pop() }));
for (const { index, path } of eol) if (index !== 'i/lf' && index !== 'i/none') error(`${path}: lưu ${index} — script shell phải LF (.gitattributes)`);

const invokers = [
  ...git('ls-files', '.github/workflows').split('\n').filter((f) => /\.ya?ml$/.test(f)),
  ...['package.json', 'backend/package.json', 'frontend/package.json'].filter(existsSync),
];
const modeOf = new Map(tree.map((t) => [t.path, t.mode]));
const reported = new Set();
for (const file of invokers) {
  // Bỏ dòng chú thích YAML (chỉ nhắc tên script, không gọi)
  const text = readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter((l) => !/^\s*#/.test(l))
    .join('\n');
  // Gọi thẳng "scripts/x.sh" / "./x.sh" — không tính "bash x.sh" / "sh x.sh"
  for (const m of text.matchAll(/(?<![\w./-])(?<!bash )(?<!sh )\.?\/?((?:[\w.-]+\/)*[\w.-]+\.sh)\b/g)) {
    const path = m[1].replace(/^\.\//, '');
    if (modeOf.has(path) && modeOf.get(path) !== '100755' && !reported.has(path) && reported.add(path))
      error(`${path}: được gọi thẳng trong ${file} nhưng không có quyền chạy — git update-index --chmod=+x ${path}`);
  }
}

// ---------- 6 ----------
for (const { path } of tree) {
  if (!path.endsWith('.json') || /(^|\/)(tsconfig[^/]*|jsconfig)\.json$/.test(path) || path.startsWith('.vscode/')) continue;
  try {
    JSON.parse(git('show', `HEAD:${path}`).replace(/^﻿/, ''));
  } catch (e) {
    error(`${path}: JSON hỏng — ${e.message}`);
  }
}

// ---------- 7 ----------
const only = grep('-nE', '\\b(test|it|describe|suite)\\.only\\s*\\(|\\{\\s*only:\\s*true', '--', '*.test.js', '*.test.ts', '*.test.tsx', '*.spec.*');
if (only) error(`Có test .only (chỉ chạy 1 test, bỏ qua phần còn lại):\n${only.split('\n').map((l) => `    ${l}`).join('\n')}`);

// ---------- 8 ----------
if (base) {
  let diff = '';
  try {
    diff = git('diff', '--unified=0', base, 'HEAD', '--', 'backend/src');
  } catch {
    warnings.push(`không so được với ${base} — bỏ qua kiểm tra biến môi trường mới`);
  }
  const example = existsSync('backend/.env.example') ? readFileSync('backend/.env.example', 'utf8') : '';
  const documented = (v) => new RegExp(`(^|[^A-Z0-9_])${v}([^A-Z0-9_]|$)`, 'm').test(example);
  const added = new Set();
  let file = '';
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) file = line.slice(6);
    if (!line.startsWith('+') || line.startsWith('+++')) continue;
    for (const m of line.matchAll(/process\.env(?:\.([A-Z][A-Z0-9_]+)|\[['"]([A-Z][A-Z0-9_]+)['"]\])/g)) {
      const v = m[1] ?? m[2];
      if (!ENV_INTERNAL.has(v) && !documented(v)) added.add(`${v} (${file})`);
    }
  }
  for (const v of added)
    error(`Biến môi trường mới ${v} chưa có trong backend/.env.example — thêm kèm giải thích + giá trị mặc định, và báo người vận hành đặt trên server`);
}

const gh = process.env.GITHUB_ACTIONS === 'true';
for (const w of warnings) console.log(gh ? `::warning::${w}` : `CẢNH BÁO  ${w}`);
for (const e of errors) console.log(gh ? `::error::${e.replaceAll('\n', '%0A')}` : `LỖI       ${e}`);
if (errors.length) {
  console.log(`\n${errors.length} lỗi.`);
  process.exit(1);
}
console.log(`OK — repo sạch (${tree.length} file).`);
