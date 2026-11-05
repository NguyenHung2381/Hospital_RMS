#!/usr/bin/env node
// Rà soát tài khoản còn dùng mật khẩu mặc định — chạy tay (bcrypt ~0,2s/tài
// khoản nên không chạy lúc khởi động):
//
//   1. Tài khoản đã gỡ cờ bắt đổi (must_change_password = false) mà mật khẩu vẫn là
//      mật khẩu mặc định kiểu cũ: '123456' hoặc = tên đăng nhập (trước khi mật
//      khẩu tạm được sinh ngẫu nhiên). Ai biết username là đăng nhập được
//      ⇒ đánh dấu bắt đổi mật khẩu + bắt đầu tính hạn dùng mật khẩu tạm
//      (temp_password_issued_at, permissions/tempPasswordPolicy.js).
//   2. Báo cáo tài khoản đang chờ đổi mật khẩu tạm (must_change_password = true):
//      bao nhiêu đã quá hạn (không đăng nhập được nữa), bao nhiêu sắp hết hạn.
//      Tài khoản thiếu mốc cấp (vd đánh dấu bằng script cũ) được ghi mốc = bây giờ.
//
// Mặc định CHỈ XEM, không ghi DB; thêm --apply để ghi.
//   npm run flag:default-passwords                # xem trước
//   npm run flag:default-passwords -- --apply     # thực hiện
//   npm run flag:default-passwords -- --list      # in cả danh sách tài khoản chờ đổi
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });

const bcrypt = require('bcrypt');
const { getPool, sql, utcNowSql } = require('../src/config/db');
const tempPasswordPolicy = require('../src/permissions/tempPasswordPolicy');

const LEGACY_DEFAULTS = ['123456'];
const apply = process.argv.includes('--apply');
const listAll = process.argv.includes('--list');
// bcrypt.compare chạy trên threadpool của libuv (mặc định 4 luồng)
const CONCURRENCY = 4;

const usesDefaultPassword = async (u) => {
	if (!u.password) return false;
	for (const pw of [String(u.username), ...LEGACY_DEFAULTS]) {
		if (await bcrypt.compare(pw, u.password)) return true;
	}
	return false;
};

const mapLimit = async (items, limit, fn) => {
	const out = new Array(items.length);
	let next = 0;
	let done = 0;
	const worker = async () => {
		while (next < items.length) {
			const i = next++;
			out[i] = await fn(items[i]);
			if (++done % 100 === 0) console.log(`  ...${done}/${items.length}`);
		}
	};
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
	return out;
};

const fmt = (d) => (d ? new Date(d).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '—');

(async () => {
	const pool = await getPool();
	const ttl = await tempPasswordPolicy.ttlDays();
	const users = (
		await pool.request().query(`
			SELECT id, username, password, must_change_password, temp_password_issued_at, created_at
			FROM users WHERE is_active = 'true' ORDER BY username
		`)
	).recordset;

	// ─── 1. Đã gỡ cờ mà vẫn dùng mật khẩu mặc định ──────────────────────────
	const cleared = users.filter((u) => !u.must_change_password);
	console.log(`Kiểm tra mật khẩu của ${cleared.length} tài khoản đã gỡ cờ bắt đổi mật khẩu...`);
	const hits = await mapLimit(cleared, CONCURRENCY, usesDefaultPassword);
	const flagged = cleared.filter((_, i) => hits[i]);

	// ─── 2. Tài khoản đang chờ đổi mật khẩu tạm ──────────────────────────────
	const pending = users.filter((u) => u.must_change_password);
	const missingIssued = pending.filter((u) => !u.temp_password_issued_at);
	const now = Date.now();
	const withDeadline = pending
		.filter((u) => u.temp_password_issued_at)
		.map((u) => ({
			...u,
			deadline: tempPasswordPolicy.deadlineOf(u.temp_password_issued_at, ttl),
		}));
	const expired = withDeadline.filter((u) => u.deadline && u.deadline.getTime() <= now);
	const soon = withDeadline.filter(
		(u) => u.deadline && u.deadline.getTime() > now && u.deadline.getTime() - now < 2 * 86400000,
	);

	if (apply) {
		for (const u of [...flagged, ...missingIssued]) {
			await pool.request().input('id', sql.VarChar(20), u.id).query(`
				UPDATE users SET must_change_password = 'true', temp_password_issued_at = ${utcNowSql}
				WHERE id = @id AND (must_change_password = 'false' OR temp_password_issued_at IS NULL)
			`);
		}
	}

	const verb = apply ? 'Đã' : '[xem trước] Sẽ';
	console.log(
		`\n${verb} đánh dấu bắt đổi mật khẩu ${flagged.length} tài khoản còn mật khẩu mặc định (123456 hoặc = tên đăng nhập)` +
			(flagged.length ? `:\n  ${flagged.map((u) => u.username).join(', ')}` : '.'),
	);
	if (missingIssued.length)
		console.log(
			`${verb} ghi mốc cấp mật khẩu tạm = bây giờ cho ${missingIssued.length} tài khoản chờ đổi chưa có mốc.`,
		);

	console.log(
		`\nTài khoản đang chờ đổi mật khẩu tạm: ${pending.length}` +
			` (hạn dùng hiện tại: ${ttl ? `${ttl} ngày` : 'không giới hạn'})`,
	);
	console.log(`  - Đã quá hạn, không đăng nhập được nữa: ${expired.length}`);
	console.log(`  - Hết hạn trong 2 ngày tới: ${soon.length}`);
	if (listAll) {
		for (const u of withDeadline)
			console.log(
				`    ${u.username.padEnd(24)} cấp ${fmt(u.temp_password_issued_at)} → hạn ${fmt(u.deadline)}`,
			);
	}
	if (!apply && (flagged.length || missingIssued.length))
		console.log('\nChạy lại với --apply để ghi vào DB.');
	process.exit(0);
})().catch((err) => {
	console.error(`❌ ${err.message}`);
	process.exit(1);
});
