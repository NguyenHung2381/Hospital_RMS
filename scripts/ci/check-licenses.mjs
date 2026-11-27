#!/usr/bin/env node
// Giấy phép thư viện: chặn gói chạy production mang giấy phép cấm (AGPL, GPL, SSPL...),
// cảnh báo giấy phép cần xem xét (LGPL, MPL...). Không cần cài gì — đọc package-lock.json.
//
//   node scripts/ci/check-licenses.mjs [--report license-report.json]
//
// Chính sách + ngoại lệ (có hạn, kèm lý do): .github/license-policy.json.
//  - Chỉ xét gói KHÔNG phải dev (đi vào image backend / bundle frontend).
//  - Biểu thức SPDX: "A OR B" đạt khi một vế đạt; "A AND B" đạt khi mọi vế đạt.
//  - Gói không khai báo giấy phép trong lockfile: đọc node_modules/<gói>/package.json
//    nếu có (máy dev), rồi tới mục "verified" của chính sách (đã đọc tay file LICENSE,
//    ghim tên + phiên bản); không có thì cảnh báo.
//  - Ngoại lệ quá hạn "expires" → lỗi (buộc xem xét lại); còn ≤ 14 ngày → cảnh báo.
// --report ghi danh mục giấy phép (bằng chứng cho kiểm toán) ra file JSON.

import { readFileSync, existsSync, writeFileSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const POLICY_FILE = '.github/license-policy.json';
const NPM_DIRS = ['.', 'backend', 'frontend'];

const errors = [];
const warnings = [];
const policy = JSON.parse(readFileSync(join(ROOT, POLICY_FILE), 'utf8'));
const today = new Date().toISOString().slice(0, 10);

const toRegex = (pattern) =>
  new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*')}$`, 'i');
const deny = (policy.deny ?? []).map((r) => ({ ...r, re: toRegex(r.pattern) }));
const review = (policy.review ?? []).map((r) => ({ ...r, re: toRegex(r.pattern) }));
const exceptions = (policy.exceptions ?? []).map((e) => ({ ...e, used: false }));
// Gói không khai giấy phép trong package.json nhưng đã đọc tay file LICENSE — ghim theo
// tên + phiên bản: lên bản mới thì phải đọc lại.
const verified = (policy.verified ?? []).map((v) => ({ ...v, used: false }));
for (const v of verified)
  if (!v.name || !v.version || !v.license || !v.evidence)
    errors.push(`${POLICY_FILE}: mục verified ${JSON.stringify(v.name)} thiếu name/version/license/evidence`);

for (const e of exceptions) {
  if (!e.name || !e.license || !e.reason || !e.expires)
    errors.push(`${POLICY_FILE}: ngoại lệ ${JSON.stringify(e.name)} thiếu name/license/reason/expires`);
  else if (e.expires < today)
    errors.push(`${POLICY_FILE}: ngoại lệ ${e.name} (${e.license}) đã hết hạn ${e.expires} — xem xét lại, gia hạn có lý do hoặc gỡ gói`);
  else if ((new Date(e.expires) - new Date(today)) / 86400000 <= 14)
    warnings.push(`${POLICY_FILE}: ngoại lệ ${e.name} (${e.license}) hết hạn ${e.expires}`);
}

/** Chuẩn hoá trường license của package.json (chuỗi, {type}, mảng licenses cũ). */
function normalize(meta) {
  const l = meta.license ?? meta.licenses;
  if (!l) return '';
  if (typeof l === 'string') return l.trim();
  if (Array.isArray(l)) return l.map((x) => (typeof x === 'string' ? x : x.type)).filter(Boolean).join(' OR ');
  return l.type ?? '';
}

/** Kết quả của 1 giấy phép đơn: 'deny' | 'review' | 'ok' (+ quy tắc khớp). */
function classifySingle(id) {
  const s = id.replace(/^\(+|\)+$/g, '').trim();
  const d = deny.find((r) => r.re.test(s));
  if (d) return { level: 'deny', rule: d };
  const r = review.find((x) => x.re.test(s));
  if (r) return { level: 'review', rule: r };
  return { level: 'ok' };
}

const RANK = { ok: 0, review: 1, deny: 2 };
/** Biểu thức SPDX đơn giản (không lồng ngoặc phức tạp): OR lấy vế tốt nhất, AND lấy vế xấu nhất. */
function classify(expr) {
  const s = expr.replace(/^\((.*)\)$/, '$1');
  if (/\s+OR\s+/i.test(s)) {
    return s
      .split(/\s+OR\s+/i)
      .map(classify)
      .reduce((a, b) => (RANK[b.level] < RANK[a.level] ? b : a));
  }
  if (/\s+AND\s+/i.test(s)) {
    return s
      .split(/\s+AND\s+/i)
      .map(classify)
      .reduce((a, b) => (RANK[b.level] > RANK[a.level] ? b : a));
  }
  return classifySingle(s);
}

const inventory = {};
for (const dir of NPM_DIRS) {
  const lockPath = join(ROOT, dir, 'package-lock.json');
  if (!existsSync(lockPath)) continue;
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  const where = dir === '.' ? 'root' : dir;
  const counts = {};
  let devSkipped = 0;
  for (const [key, meta] of Object.entries(lock.packages ?? {})) {
    if (key === '' || meta.link || !key.includes('node_modules/')) continue;
    if (meta.dev) {
      devSkipped++;
      continue;
    }
    const name = meta.name ?? key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length);
    const id = `${name}@${meta.version}`;
    let license = normalize(meta);
    // Xét "verified" trước node_modules: CI không cài node_modules, máy dev thì có —
    // cùng thứ tự để kết quả 2 nơi như nhau.
    if (!license) {
      const v = verified.find((x) => x.name === name && x.version === meta.version);
      if (v) {
        v.used = true;
        license = v.license;
      }
    }
    if (!license) {
      const installed = join(ROOT, dir, key, 'package.json');
      if (existsSync(installed)) license = normalize(JSON.parse(readFileSync(installed, 'utf8')));
    }
    counts[license || '(không khai báo)'] = (counts[license || '(không khai báo)'] ?? 0) + 1;
    if (!license) {
      warnings.push(`${where}: ${id} không khai báo giấy phép trong lockfile — kiểm tra tay file LICENSE của gói`);
      continue;
    }
    const { level, rule } = classify(license);
    if (level === 'ok') continue;
    const exc = exceptions.find((e) => e.name === name && e.license === license);
    if (exc) {
      exc.used = true;
      warnings.push(`${where}: ${id} (${license}) — ngoại lệ đến ${exc.expires}: ${exc.reason}`);
      continue;
    }
    if (level === 'deny')
      errors.push(
        `${where}: ${id} dùng giấy phép ${license} (cấm: ${rule.reason}). Thay thư viện khác, ` +
          `hoặc nếu bất khả kháng thì thêm ngoại lệ có hạn + lý do vào ${POLICY_FILE}`,
      );
    else warnings.push(`${where}: ${id} dùng giấy phép ${license} — cần xem xét: ${rule.reason}`);
  }
  inventory[where] = { counts, devSkipped };
}

for (const e of exceptions)
  if (!e.used && e.expires >= today) warnings.push(`${POLICY_FILE}: ngoại lệ ${e.name} (${e.license}) không còn dùng — xoá khỏi danh sách`);
for (const v of verified)
  if (!v.used) warnings.push(`${POLICY_FILE}: mục verified ${v.name}@${v.version} không còn dùng (đã đổi phiên bản / gỡ gói) — xoá hoặc đọc lại LICENSE của bản mới`);

const reportIdx = process.argv.indexOf('--report');
if (reportIdx > 0 && process.argv[reportIdx + 1])
  writeFileSync(
    process.argv[reportIdx + 1],
    JSON.stringify({ generatedAt: new Date().toISOString(), commit: process.env.GITHUB_SHA ?? null, inventory, errors, warnings }, null, 2),
  );

if (process.env.GITHUB_STEP_SUMMARY) {
  const lines = ['### Giấy phép thư viện (production)', '', '| Thư mục | Giấy phép | Số gói |', '|---|---|---|'];
  for (const [where, { counts }] of Object.entries(inventory))
    for (const [lic, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) lines.push(`| ${where} | ${lic} | ${n} |`);
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n\n`);
}

const gh = process.env.GITHUB_ACTIONS === 'true';
for (const w of warnings) console.log(gh ? `::warning::${w}` : `CẢNH BÁO  ${w}`);
for (const e of errors) console.log(gh ? `::error::${e}` : `LỖI       ${e}`);
if (errors.length) {
  console.log(`\n${errors.length} lỗi giấy phép.`);
  process.exit(1);
}
console.log(`\nOK — không có gói production mang giấy phép cấm (${warnings.length} cảnh báo).`);
