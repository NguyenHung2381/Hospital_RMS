#!/usr/bin/env node
// Chặn phiên bản không chính thức (alpha/beta/rc/canary/next...) và nguồn cài
// đặt không tin cậy. Không cần cài gì — chỉ đọc file trong repo.
//
//   node scripts/ci/check-stable-versions.mjs
//
// Kiểm tra:
//  1. package.json (gốc, backend, frontend): mọi khai báo phụ thuộc phải là
//     khoảng semver của bản chính thức. Cấm: bản tiền phát hành (1.0.0-beta.1),
//     dist-tag (latest, next, beta...), "*", git/github/http/file.
//  2. package-lock.json: mọi gói đã khoá (kể cả gián tiếp) phải là bản chính
//     thức, tải từ registry.npmjs.org, có integrity sha512. Gói gián tiếp bắt
//     buộc là bản tiền phát hành (thư viện cha khoá cứng) thì ghi vào
//     .github/prerelease-allowlist.json kèm lý do.
//  3. Dockerfile + docker-compose*.yml: image phải có tag cụ thể, không
//     latest/beta/rc/nightly/edge... Tag trôi không có số (alpine, stable) → cảnh báo.
//  4. .github/workflows/*.yml: action bên ngoài phải ghim theo commit SHA (40 ký
//     tự) kèm chú thích phiên bản chính thức, vd `@<sha> # v5.1.0`.
//
// Thoát mã 1 nếu có lỗi. Cảnh báo in dạng ::warning:: (hiện trên GitHub).

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const NPM_DIRS = ['.', 'backend', 'frontend'];
const DEP_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
const REGISTRY = 'https://registry.npmjs.org/';
const ALLOWLIST_FILE = '.github/prerelease-allowlist.json';

// Từ khoá đánh dấu bản không chính thức (trong tag image, chú thích action...)
const UNSTABLE_WORD = /(^|[^a-z])(alpha|beta|rc|pre|preview|canary|next|nightly|edge|dev|snapshot|unstable|experimental|insiders)([^a-z]|$)/i;

const errors = [];
const warnings = [];
const rel = (p) => relative(ROOT, p).replaceAll('\\', '/');
const error = (file, msg) => errors.push(`${file}: ${msg}`);
const warn = (file, msg) => warnings.push(`${file}: ${msg}`);
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

// ---------- semver ----------

// Một phiên bản trong khoảng: ^1.2.3, ~6.0, >=1.0.0, 1.x, 2.0.0-beta.1 ...
const VERSION_TOKEN = /^(\^|~|>=|<=|>|<|=)?v?(\d+|x|X|\*)(\.(\d+|x|X|\*))?(\.(\d+|x|X|\*))?(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;
const isPrerelease = (version) => /^\d+\.\d+\.\d+-/.test(version);

/** Trả về lý do không hợp lệ, hoặc null nếu là khoảng semver của bản chính thức. */
function checkRange(spec) {
  const s = spec.trim();
  if (s === '' || s === '*' || /^[xX]$/.test(s)) return 'không giới hạn phiên bản ("*")';
  if (/^(git\+|git:|github:|gitlab:|bitbucket:|https?:|file:|link:|workspace:)/.test(s) || /^[\w.-]+\/[\w.-]+(#.*)?$/.test(s))
    return 'cài từ git/URL/thư mục — chỉ dùng bản phát hành trên registry npm';
  if (s.startsWith('npm:')) {
    const at = s.lastIndexOf('@');
    if (at <= 4) return 'alias npm: thiếu phiên bản';
    return checkRange(s.slice(at + 1));
  }
  const tokens = s
    .split('||')
    .flatMap((part) => part.trim().split(/\s+-\s+|\s+/))
    .filter(Boolean);
  for (const t of tokens) {
    if (!VERSION_TOKEN.test(t)) return `"${t}" không phải phiên bản semver (dist-tag như latest/next/beta bị cấm)`;
    if (/-[0-9A-Za-z.-]+$/.test(t.replace(/\+.*$/, ''))) return `"${t}" là bản tiền phát hành (alpha/beta/rc...)`;
  }
  return null;
}

// ---------- 1 + 2: npm ----------

function loadAllowlist() {
  const p = join(ROOT, ALLOWLIST_FILE);
  if (!existsSync(p)) return new Map();
  const list = readJson(p);
  const map = new Map();
  for (const item of list.packages ?? []) {
    if (!item.name || !item.version || !item.reason) {
      error(ALLOWLIST_FILE, `mục ${JSON.stringify(item)} thiếu name/version/reason`);
      continue;
    }
    map.set(`${item.name}@${item.version}`, { ...item, used: false });
  }
  return map;
}

function checkOverrides(file, obj, path = 'overrides') {
  for (const [name, value] of Object.entries(obj ?? {})) {
    if (typeof value === 'object' && value !== null) {
      checkOverrides(file, value, `${path}.${name}`);
      continue;
    }
    if (typeof value !== 'string') continue;
    if (value.startsWith('$')) continue; // tham chiếu tới phiên bản trong dependencies — đã kiểm tra ở đó
    const why = checkRange(value);
    if (why) error(file, `${path}.${name} = "${value}": ${why}`);
  }
}

function checkPackageJson(dir) {
  const file = join(ROOT, dir, 'package.json');
  if (!existsSync(file)) return;
  const pkg = readJson(file);
  for (const field of DEP_FIELDS) {
    for (const [name, spec] of Object.entries(pkg[field] ?? {})) {
      const why = checkRange(spec);
      if (why) error(rel(file), `${field}.${name} = "${spec}": ${why}`);
    }
  }
  checkOverrides(rel(file), pkg.overrides);
}

function checkLockfile(dir, allowlist) {
  const file = join(ROOT, dir, 'package-lock.json');
  const name = rel(file);
  if (!existsSync(file)) {
    error(name, 'thiếu package-lock.json — CI cài bằng npm ci, bắt buộc có lockfile');
    return;
  }
  const lock = readJson(file);
  if (!(lock.lockfileVersion >= 2)) error(name, `lockfileVersion ${lock.lockfileVersion} quá cũ — tạo lại bằng npm ≥ 7`);

  const directDeps = new Set();
  const root = lock.packages?.[''] ?? {};
  for (const field of DEP_FIELDS) for (const n of Object.keys(root[field] ?? {})) directDeps.add(n);

  for (const [key, meta] of Object.entries(lock.packages ?? {})) {
    if (key === '' || meta.link || !key.includes('node_modules/')) continue;
    const pkgName = meta.name ?? key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length);
    const id = `${pkgName}@${meta.version}`;
    const isDirect = key === `node_modules/${pkgName}` && directDeps.has(pkgName);

    if (meta.version && isPrerelease(meta.version)) {
      const allowed = allowlist.get(id);
      if (isDirect) error(name, `${id} là phụ thuộc TRỰC TIẾP nhưng là bản tiền phát hành — đổi sang bản chính thức`);
      else if (allowed) allowed.used = true;
      else
        error(
          name,
          `${id} (gián tiếp, ${key}) là bản tiền phát hành. Nâng/đổi thư viện cha, ` +
            `ép phiên bản qua "overrides", hoặc nếu bất khả kháng thì thêm vào ${ALLOWLIST_FILE} kèm lý do`,
        );
    }
    if (meta.inBundle) continue; // gói đóng sẵn trong gói cha, không tải riêng
    if (meta.resolved && !meta.resolved.startsWith(REGISTRY))
      error(name, `${id} tải từ "${meta.resolved}" — chỉ chấp nhận ${REGISTRY}`);
    if (!meta.resolved) error(name, `${id} không có "resolved" — tạo lại lockfile bằng npm install`);
    if (!meta.integrity?.startsWith('sha512-')) error(name, `${id} thiếu integrity sha512 — không xác minh được gói tải về`);
  }
}

// ---------- 3: Docker image ----------

function checkImageRef(file, ref, stages) {
  if (ref.includes('$') || ref === 'scratch' || stages.has(ref)) return;
  const [nameTag] = ref.split('@'); // @sha256:... vẫn kiểm tra phần tag phía trước
  const lastSlash = nameTag.lastIndexOf('/');
  const colon = nameTag.indexOf(':', lastSlash + 1);
  const tag = colon === -1 ? '' : nameTag.slice(colon + 1);
  if (!tag && !ref.includes('@')) return error(file, `image "${ref}" không có tag (= latest) — ghi rõ phiên bản`);
  if (tag === 'latest') return error(file, `image "${ref}" dùng tag latest — ghi rõ phiên bản`);
  if (UNSTABLE_WORD.test(tag)) return error(file, `image "${ref}" là bản không chính thức (tag "${tag}")`);
  if (tag && !/\d/.test(tag)) warn(file, `image "${ref}" dùng tag trôi "${tag}" — nên ghi phiên bản cụ thể`);
}

function checkDockerfile(path) {
  const file = rel(path);
  const stages = new Set();
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*FROM\s+(?:--\S+\s+)*(\S+)(?:\s+AS\s+(\S+))?/i);
    if (!m) continue;
    checkImageRef(file, m[1], stages);
    if (m[2]) stages.add(m[2]);
  }
}

function checkCompose(path) {
  const file = rel(path);
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*image:\s*['"]?([^'"\s#]+)/);
    if (m) checkImageRef(file, m[1], new Set());
  }
}

// ---------- 4: GitHub Actions ----------

function checkWorkflow(path) {
  const file = rel(path);
  readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .forEach((line, i) => {
      const m = line.match(/^\s*(?:-\s*)?uses:\s*['"]?([^'"\s#]+)['"]?\s*(?:#\s*(.*))?$/);
      if (!m || m[1].startsWith('./')) return;
      const [action, ref = ''] = m[1].split('@');
      const where = `${file}:${i + 1}`;
      if (m[1].startsWith('docker://')) return checkImageRef(where, m[1].slice('docker://'.length), new Set());
      if (!/^[0-9a-f]{40}$/.test(ref))
        return error(where, `${action}@${ref} chưa ghim theo commit SHA — tag có thể bị dời sang mã khác`);
      const version = (m[2] ?? '').trim();
      if (!/^v?\d+(\.\d+){0,2}$/.test(version))
        return error(where, `${action}: thiếu chú thích phiên bản chính thức sau SHA (vd "# v5.1.0"), đang là "${version}"`);
    });
}

// ---------- chạy ----------

const allowlist = loadAllowlist();
for (const dir of NPM_DIRS) {
  checkPackageJson(dir);
  checkLockfile(dir, allowlist);
}
for (const [id, item] of allowlist)
  if (!item.used) warn(ALLOWLIST_FILE, `${id} không còn trong lockfile nào — xoá khỏi danh sách`);

for (const dir of ['backend', 'frontend']) {
  const p = join(ROOT, dir, 'Dockerfile');
  if (existsSync(p)) checkDockerfile(p);
}
for (const f of readdirSync(ROOT).filter((f) => /^docker-compose.*\.ya?ml$/.test(f))) checkCompose(join(ROOT, f));

const wfDir = join(ROOT, '.github', 'workflows');
if (existsSync(wfDir)) for (const f of readdirSync(wfDir).filter((f) => /\.ya?ml$/.test(f))) checkWorkflow(join(wfDir, f));

const gh = process.env.GITHUB_ACTIONS === 'true';
for (const w of warnings) console.log(gh ? `::warning::${w}` : `CẢNH BÁO  ${w}`);
for (const e of errors) console.log(gh ? `::error::${e}` : `LỖI       ${e}`);
if (allowlist.size) {
  console.log(`\nGói tiền phát hành được chấp nhận tạm (${ALLOWLIST_FILE}):`);
  for (const [id, item] of allowlist) console.log(`  - ${id}: ${item.reason}`);
}
if (errors.length) {
  console.log(`\n${errors.length} lỗi — chỉ dùng phiên bản chính thức từ nguồn tin cậy.`);
  process.exit(1);
}
console.log(`\nOK — mọi phụ thuộc là bản chính thức (${warnings.length} cảnh báo).`);
