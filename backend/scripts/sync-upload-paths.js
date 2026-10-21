#!/usr/bin/env node
// Đồng bộ đường dẫn file trong DB theo thư mục uploads thực tế — dùng sau khi
// chuyển/đổi tên thư mục upload (đổi máy chủ, đổi mã bản ghi...). Bản ghi nào trỏ
// tới file không còn tồn tại sẽ được dò lại theo TÊN FILE (tên có đuôi 32 hex ngẫu
// nhiên — xem uniqueFilename — nên gần như duy nhất) rồi cập nhật đường dẫn mới.
// Đồng thời liệt kê file trên đĩa không bản ghi nào trỏ tới.
// Mặc định CHỈ LIỆT KÊ; thêm --apply để cập nhật thật.
//   npm run sync:upload-paths                 # xem trước
//   npm run sync:upload-paths -- --apply      # thực hiện
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });

const { getPool, sql } = require('../src/config/db');
const { UPLOADS_ROOT } = require('../src/utils/uploadPaths');

// Các cột lưu đường dẫn "/uploads/...". Ảnh bài test hội thảo nằm trong JSON câu
// hỏi (seminarService) — không quét, sẽ hiện ở danh sách "file không ai trỏ tới".
const COLUMNS = [
	{ table: 'files', column: 'file_url', where: 'is_deleted = 0' },
	{ table: 'training_files', column: 'file_url', where: 'is_deleted = 0' },
	{ table: 'question_bank', column: 'image_url' },
	{ table: 'trainees', column: 'avatar_url' },
	{ table: 'lecturers', column: 'avatar_url' },
];

const apply = process.argv.includes('--apply');

// Mọi file dưới uploads → "/uploads/a/b/c.pdf"
const listUploads = (dir) =>
	fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
		const full = path.join(dir, e.name);
		if (e.isDirectory()) return listUploads(full);
		return e.isFile()
			? ['/uploads/' + path.relative(UPLOADS_ROOT, full).split(path.sep).join('/')]
			: [];
	});

(async () => {
	const onDisk = new Set(fs.existsSync(UPLOADS_ROOT) ? listUploads(UPLOADS_ROOT) : []);
	const byName = new Map();
	for (const url of onDisk) {
		const name = path.posix.basename(url);
		byName.set(name, [...(byName.get(name) || []), url]);
	}
	console.log(`Thư mục: ${UPLOADS_ROOT} — ${onDisk.size} file.`);

	const pool = await getPool();
	const referenced = new Set();
	const changes = [];
	const missing = [];
	const ambiguous = [];

	for (const { table, column, where } of COLUMNS) {
		const rows = (
			await pool
				.request()
				.query(
					`SELECT id, ${column} AS url FROM ${table} WHERE ${column} LIKE '/uploads/%'${where ? ` AND ${where}` : ''}`,
				)
		).recordset;
		for (const r of rows) {
			const ref = `${table}.${column} #${r.id}`;
			if (onDisk.has(r.url)) {
				referenced.add(r.url);
				continue;
			}
			const found = byName.get(path.posix.basename(r.url)) || [];
			if (found.length === 1) {
				referenced.add(found[0]);
				changes.push({ table, column, id: r.id, ref, from: r.url, to: found[0] });
			} else if (found.length > 1) {
				found.forEach((u) => referenced.add(u));
				ambiguous.push({ ref, url: r.url, found });
			} else missing.push({ ref, url: r.url });
		}
	}

	if (apply) {
		for (const c of changes)
			await pool
				.request()
				.input('id', sql.VarChar(50), c.id)
				.input('url', sql.NVarChar(500), c.to)
				.query(`UPDATE ${c.table} SET ${c.column} = @url WHERE id = @id`);
	}

	console.log(
		`\n${apply ? 'Đã cập nhật' : '[xem trước] Sẽ cập nhật'} ${changes.length} đường dẫn:`,
	);
	for (const c of changes) console.log(`  ${c.ref}\n    ${c.from}\n  → ${c.to}`);

	if (ambiguous.length) {
		console.log(`\n⚠️  ${ambiguous.length} bản ghi trùng tên file ở nhiều nơi — KHÔNG tự sửa:`);
		for (const a of ambiguous) console.log(`  ${a.ref}  ${a.url}\n    ${a.found.join('\n    ')}`);
	}
	if (missing.length) {
		console.log(`\n❌ ${missing.length} bản ghi không tìm thấy file trên đĩa:`);
		for (const m of missing) console.log(`  ${m.ref}  ${m.url}`);
	}
	const orphans = [...onDisk].filter((u) => !referenced.has(u));
	if (orphans.length) {
		console.log(`\nℹ️  ${orphans.length} file trên đĩa không bản ghi nào trỏ tới:`);
		for (const u of orphans) console.log(`  ${u}`);
	}
	if (!apply && changes.length) console.log('\nChạy lại với --apply để thực hiện.');
	process.exit(0);
})().catch((err) => {
	console.error(`❌ ${err.message}`);
	process.exit(1);
});
