#!/usr/bin/env node
// Quy tắc migration (backend/README.md, mục Cơ sở dữ liệu) — kiểm trên phần thay đổi
// giữa 2 commit:
//
//   node scripts/ci/check-migrations.mjs <base-commit> [head-commit=HEAD]
//   node scripts/ci/check-migrations.mjs origin/main      # trước khi push
//
//  1. Không sửa file migration đã có (production đã chạy, ghi checksum vào
//     schema_migrations). Chỉ khác khoảng trắng cuối dòng / xuống dòng thì được.
//  2. Không xoá / đổi tên file đã có — trừ khi gộp: một file mới có dòng
//     "-- @migration <tên file cũ>.sql" (backend/src/database/migrator.js).
//  3. File mới: tên YYYY-MM-DD_<mo_ta>.sql (chữ thường, số, _) và xếp SAU mọi file
//     đã có — production chạy theo thứ tự tên, file chen vào giữa bị coi là lệch thứ tự.
//  4. File mới có lệnh phá huỷ dữ liệu / phá tương thích ngược (DROP TABLE, DROP
//     COLUMN, TRUNCATE, RENAME, đổi kiểu cột, DELETE không WHERE) → lỗi, trừ khi file
//     ghi rõ lý do:  -- ci:cho-phep-pha-huy: <lý do, code nào đã thôi dùng>
//     (rollback ứng dụng không hoàn tác schema — xem .github/CICD.md, mục Migration).
//  5. File mới có lệnh chạy được trên DB trống của CI nhưng hỏng trên DB có dữ liệu:
//     thêm cột NOT NULL không DEFAULT → lỗi (trừ khi ghi "-- ci:da-kiem-du-lieu: <cách
//     đã kiểm>"); SET NOT NULL, thêm UNIQUE/PK, CHECK/FK không NOT VALID, UNIQUE INDEX
//     → cảnh báo cho người review. Bảng tạo mới trong cùng file thì bỏ qua.
// Dò bằng biểu thức chính quy (không phân tích SQL đầy đủ): đủ để buộc người viết
// và người review dừng lại xem; không thay cho review.

import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const DIR = 'backend/database/migrations';
const NAME = /^\d{4}-\d{2}-\d{2}_[a-z0-9_]+\.sql$/;
const MARKER = /--\s*ci:cho-phep-pha-huy:\s*(\S.{9,})/i;
const DATA_MARKER = /--\s*ci:da-kiem-du-lieu:\s*(\S.{9,})/i;

const [base, head = 'HEAD'] = process.argv.slice(2);
if (!base) {
  console.error('Cách dùng: node scripts/ci/check-migrations.mjs <base-commit> [head-commit]');
  process.exit(2);
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const show = (rev, file) => git('show', `${rev}:${file}`).replace(/\r\n?/g, '\n');
// Giống checksum() trong migrator.js: bỏ khoảng trắng cuối dòng, trim
const norm = (text) => text.replace(/[ \t]+$/gm, '').trim();
const base_name = (p) => p.slice(p.lastIndexOf('/') + 1);

const errors = [];
const warnings = [];
const notes = [];

const listAt = (rev) =>
  git('ls-tree', '--name-only', `${rev}:${DIR}`)
    .split('\n')
    .filter((f) => f.endsWith('.sql'));
let baseFiles;
try {
  baseFiles = listAt(base);
} catch {
  baseFiles = []; // thư mục chưa có ở base
}
const headFiles = listAt(head);
const lastBase = [...baseFiles].sort().pop() ?? '';

// --no-renames: đổi tên = xoá + thêm, xử lý chung bằng quy tắc 2 + 3
const changes = git('diff', '--name-status', '--no-renames', base, head, '--', DIR)
  .split('\n')
  .filter(Boolean)
  .map((line) => {
    const [status, path] = line.split('\t');
    return { status: status[0], file: base_name(path) };
  })
  .filter((c) => c.file.endsWith('.sql'));

const added = changes.filter((c) => c.status === 'A').map((c) => c.file);
const headTexts = new Map(headFiles.map((f) => [f, show(head, `${DIR}/${f}`)]));
const squashedNames = new Set(
  [...headTexts.values()].flatMap((t) => [...t.matchAll(/^--\s*@migration\s+(\S+\.sql)\s*$/gm)].map((m) => m[1])),
);

// ---------- 1 + 2 ----------
for (const { status, file } of changes) {
  if (status === 'M') {
    if (norm(show(base, `${DIR}/${file}`)) !== norm(headTexts.get(file)))
      errors.push(
        `${file}: sửa file migration đã có — production đã chạy file này (checksum lệch sẽ báo ở deploy). ` +
          `Tạo file mới: npm run migrate -- new <mô tả> (trong backend/)`,
      );
  } else if (status === 'D') {
    if (squashedNames.has(file)) notes.push(`${file}: đã gộp vào file khác (-- @migration)`);
    else errors.push(`${file}: xoá file migration đã có — chỉ được xoá khi gộp (file gộp có dòng "-- @migration ${file}")`);
  }
}

// ---------- 3 + 4 ----------
// Bỏ chú thích để không bắt nhầm chữ trong chú thích
const stripComments = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');

// DROP TABLE bảng tạm (pg_temp.*, hoặc CREATE TEMP TABLE trong cùng file) không phá dữ liệu
function dropsRealTable(sql) {
  const temp = new Set(
    [...sql.matchAll(/\bCREATE\s+(?:TEMP|TEMPORARY)\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w."]+)/gi)].map((m) =>
      m[1].replaceAll('"', '').toLowerCase(),
    ),
  );
  for (const m of sql.matchAll(/\bDROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?([\w."]+(?:\s*,\s*[\w."]+)*)/gi)) {
    const names = m[1].split(',').map((n) => n.trim().replaceAll('"', '').toLowerCase());
    if (names.some((n) => !n.startsWith('pg_temp.') && !temp.has(n))) return true;
  }
  return false;
}

const RULES = [
  { test: dropsRealTable, what: 'DROP TABLE' },
  { re: /\bDROP\s+(SCHEMA|DATABASE)\b/i, what: 'DROP SCHEMA/DATABASE' },
  { re: /\bTRUNCATE\b/i, what: 'TRUNCATE' },
  { re: /\bALTER\s+TABLE\b[^;]*?\bDROP\s+COLUMN\b/i, what: 'DROP COLUMN' },
  // ALTER TABLE t DROP [IF EXISTS] cot  (bỏ chữ COLUMN) — trừ DROP CONSTRAINT
  {
    re: /\bALTER\s+TABLE\s+(IF\s+EXISTS\s+)?(ONLY\s+)?[\w."]+\s+DROP\s+(?!COLUMN\b|CONSTRAINT\b)(IF\s+EXISTS\s+)?[\w"]+/i,
    what: 'DROP COLUMN',
  },
  { re: /\bALTER\s+TABLE\b[^;]*?\bRENAME\s+(COLUMN\s+)?(?!CONSTRAINT\b)[\w"]+\s+TO\b/i, what: 'RENAME COLUMN' },
  { re: /\bALTER\s+TABLE\b[^;]*?\bRENAME\s+TO\b/i, what: 'RENAME TABLE' },
  { re: /\bALTER\s+TABLE\b[^;]*?\bALTER\s+(COLUMN\s+)?[\w"]+\s+(SET\s+DATA\s+)?TYPE\b/i, what: 'đổi kiểu cột' },
];

for (const file of added) {
  const text = headTexts.get(file);
  const isSquash = /^--\s*@migration\s+/m.test(text);
  if (!NAME.test(file)) errors.push(`${file}: tên phải dạng YYYY-MM-DD_mo_ta.sql (chữ thường, số, _)`);
  if (!isSquash && file <= lastBase)
    errors.push(
      `${file}: xếp trước file đã có ${lastBase} — production chạy theo thứ tự tên, ` +
        `đổi ngày trong tên file sang sau ${lastBase.slice(0, 10)}`,
    );

  const sql = stripComments(text);
  const found = new Set();
  for (const { re, test, what } of RULES) if (test ? test(sql) : re.test(sql)) found.add(what);
  // DELETE FROM không có WHERE trong cùng câu lệnh
  for (const stmt of sql.split(';')) if (/\bDELETE\s+FROM\b/i.test(stmt) && !/\bWHERE\b/i.test(stmt)) found.add('DELETE không WHERE');
  // Lệnh chạy được trên DB trống của CI nhưng HỎNG trên DB production có dữ liệu
  const created = new Set(
    [...sql.matchAll(/\bCREATE\s+(?:UNLOGGED\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w."]+)/gi)].map((m) =>
      m[1].replaceAll('"', '').toLowerCase().replace(/^public\./, ''),
    ),
  );
  const risky = [];
  for (const stmt of sql.split(';')) {
    const t = stmt.replace(/\s+/g, ' ').trim();
    const table = t.match(/^ALTER TABLE (?:IF EXISTS )?(?:ONLY )?([\w."]+)/i)?.[1]?.replaceAll('"', '').toLowerCase().replace(/^public\./, '');
    if (!table || created.has(table)) continue; // bảng mới tạo trong file: chưa có dữ liệu
    for (const clause of t.split(/,(?![^(]*\))/)) {
      if (/\bADD\s+(COLUMN\s+)?(?!CONSTRAINT\b)/i.test(clause) && /\bNOT\s+NULL\b/i.test(clause) && !/\b(DEFAULT|GENERATED)\b/i.test(clause))
        risky.push({ hard: true, what: `${table}: thêm cột NOT NULL không có DEFAULT — hỏng ngay nếu bảng đã có dòng` });
    }
    if (/\bALTER\s+(COLUMN\s+)?[\w"]+\s+SET\s+NOT\s+NULL\b/i.test(t))
      risky.push({ what: `${table}: SET NOT NULL — hỏng nếu còn dòng NULL (cập nhật dữ liệu trước trong cùng file)` });
    if (/\bADD\s+(CONSTRAINT\s+[\w"]+\s+)?(UNIQUE|PRIMARY\s+KEY)\b/i.test(t))
      risky.push({ what: `${table}: thêm UNIQUE/PRIMARY KEY — hỏng nếu dữ liệu đang trùng` });
    if (/\bADD\s+(CONSTRAINT\s+[\w"]+\s+)?(CHECK|FOREIGN\s+KEY)\b/i.test(t) && !/\bNOT\s+VALID\b/i.test(t))
      risky.push({ what: `${table}: thêm CHECK/FOREIGN KEY không NOT VALID — hỏng nếu có dòng vi phạm, khoá bảng lúc kiểm` });
  }
  for (const m of sql.matchAll(/\bCREATE\s+UNIQUE\s+INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?[\w"]*\s*ON\s+(?:ONLY\s+)?([\w."]+)/gi)) {
    const table = m[1].replaceAll('"', '').toLowerCase().replace(/^public\./, '');
    if (!created.has(table)) risky.push({ what: `${table}: tạo UNIQUE INDEX — hỏng nếu dữ liệu đang trùng` });
  }
  const dataOk = text.match(DATA_MARKER);
  for (const r of [...new Map(risky.map((x) => [x.what, x])).values()]) {
    if (r.hard && !dataOk)
      errors.push(`${file}: ${r.what}. Thêm DEFAULT, hoặc thêm cột NULL → cập nhật dữ liệu → SET NOT NULL; đã chắc bảng trống thì ghi "-- ci:da-kiem-du-lieu: <cách đã kiểm>"`);
    else
      warnings.push(`${file}: ${r.what}${dataOk ? ` — đã ghi: ${dataOk[1].trim()}` : '. Chạy thử trên bản sao DB production trước khi deploy'}`);
  }

  if (!found.size) continue;
  const marker = text.match(MARKER);
  const list = [...found].join(', ');
  if (marker) warnings.push(`${file}: lệnh phá huỷ (${list}) — đã ghi lý do: ${marker[1].trim()}`);
  else
    errors.push(
      `${file}: có lệnh phá huỷ / phá tương thích ngược (${list}). Rollback ứng dụng không hoàn tác schema. ` +
        `Tách sang bản phát hành sau khi code cũ thôi dùng; nếu đúng chủ ý thì thêm dòng ` +
        `"-- ci:cho-phep-pha-huy: <lý do>" vào file để người review thấy`,
    );
}

const gh = process.env.GITHUB_ACTIONS === 'true';
if (process.env.GITHUB_STEP_SUMMARY) {
  const lines = [`### Migration (${base.slice(0, 7)}..${head.slice(0, 7)})`, ''];
  if (!changes.length) lines.push('Không đổi migration.');
  for (const c of changes) lines.push(`- \`${c.status}\` ${c.file}`);
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n\n`);
}
for (const n of notes) console.log(n);
for (const w of warnings) console.log(gh ? `::warning::${w}` : `CẢNH BÁO  ${w}`);
for (const e of errors) console.log(gh ? `::error::${e}` : `LỖI       ${e}`);
if (errors.length) {
  console.log(`\n${errors.length} lỗi migration.`);
  process.exit(1);
}
console.log(`OK — ${changes.length} thay đổi migration (${added.length} file mới), ${warnings.length} cảnh báo.`);
