#!/usr/bin/env node
// Đồng bộ đường dẫn file trong DB theo thư mục uploads thực tế — dùng sau khi
// chuyển/đổi tên thư mục upload (đổi máy chủ, đổi mã bản ghi...). Bản ghi nào trỏ
// tới file không còn tồn tại sẽ được dò lại theo TÊN FILE (tên có đuôi 32 hex ngẫu
// nhiên — xem uniqueFilename — nên gần như duy nhất) rồi cập nhật đường dẫn mới.
// Đồng thời liệt kê file trên đĩa không bản ghi nào trỏ tới.
// Bản ghi mà file đã mất hẳn (dò theo tên cũng không thấy) chỉ được dọn khi có
// --delete-missing: bảng chỉ chứa file (files, training_files) thì XÓA DÒNG; cột
// ảnh nằm trên bản ghi khác (học viên, giảng viên, câu hỏi) thì đặt về NULL.
// Mặc định CHỈ LIỆT KÊ.
//   npm run sync:upload-paths                          # xem trước
//   npm run sync:upload-paths -- --apply               # sửa đường dẫn dò lại được
//   npm run sync:upload-paths -- --delete-missing      # dọn bản ghi mất file
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });

const { getPool, sql, withActorTransaction } = require('../src/config/db');
const { UPLOADS_ROOT } = require('../src/utils/uploadPaths');

// Các cột lưu đường dẫn "/uploads/...". Ảnh bài test hội thảo nằm trong JSON câu
// hỏi (seminarService) — không quét, sẽ hiện ở danh sách "file không ai trỏ tới".
// onMissing: các câu chạy (theo @id) khi file mất và có --delete-missing; không
// khai thì đặt cột về NULL. training_files có 5 bảng trỏ khóa ngoại tới: dòng tài
// liệu (khóa học, bài học, hồ sơ học viên) xóa theo; chứng chỉ / hồ sơ CME giữ
// lại, chỉ bỏ liên kết file.
const COLUMNS = [
	{
		table: 'files',
		column: 'file_url',
		where: "is_deleted = 'false'",
		onMissing: ['DELETE FROM files WHERE id = @id'],
	},
	{
		table: 'training_files',
		column: 'file_url',
		where: "is_deleted = 'false'",
		onMissing: [
			'DELETE FROM course_documents WHERE file_id = @id',
			'DELETE FROM lesson_documents WHERE file_id = @id',
			'DELETE FROM trainee_documents WHERE file_id = @id',
			'UPDATE certificates SET file_id = NULL WHERE file_id = @id',
			'UPDATE cme_records SET evidence_file_id = NULL WHERE evidence_file_id = @id',
			'DELETE FROM training_files WHERE id = @id',
		],
	},
	{ table: 'question_bank', column: 'image_url' },
	{ table: 'trainees', column: 'avatar_url' },
	{ table: 'lecturers', column: 'avatar_url' },
];
const missingStatements = (c) =>
	c.onMissing ?? [`UPDATE ${c.table} SET ${c.column} = NULL WHERE id = @id`];

const apply = process.argv.includes('--apply');
const deleteMissing = process.argv.includes('--delete-missing');

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

	for (const col of COLUMNS) {
		const { table, column, where } = col;
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
			} else
				missing.push({
					ref,
					url: r.url,
					id: r.id,
					statements: missingStatements(col),
					action: col.onMissing ? 'xóa dòng' : 'đặt NULL',
				});
		}
	}

	// Thư mục rỗng/không tồn tại gần như chắc là chạy nhầm chỗ (ngoài container,
	// volume chưa gắn) — dọn lúc này sẽ xóa sạch mọi bản ghi file.
	if (deleteMissing && onDisk.size === 0) {
		console.error(`❌ ${UPLOADS_ROOT} không có file nào — dừng, không xóa gì.`);
		process.exit(1);
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
		// Cả lô trong 1 transaction: lỗi giữa chừng thì không xóa dòng nào.
		if (deleteMissing)
			await withActorTransaction(null, async (tx) => {
				for (const m of missing)
					for (const stmt of m.statements)
						await tx.request().input('id', sql.VarChar(50), m.id).query(stmt);
			});
		console.log(
			`\n❌ ${missing.length} bản ghi không tìm thấy file trên đĩa${deleteMissing ? ' — ĐÃ DỌN' : ''}:`,
		);
		for (const m of missing) console.log(`  ${m.ref}  ${m.url}  → ${m.action}`);
		if (!deleteMissing) console.log('Chạy lại với --delete-missing để dọn các bản ghi này.');
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
