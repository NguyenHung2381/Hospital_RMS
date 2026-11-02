#!/usr/bin/env node
// Che lại dữ liệu nhạy cảm trong các file nhật ký hoạt động ĐÃ GHI (logs/audit*.log)
// trước khi bản vá utils/logRedact.js có hiệu lực: mã OTP / mã 2FA / mã khôi phục
// (trường "code"), số CCCD, ngày sinh, SĐT ở body và query string, mã vé / token QR
// trên đường dẫn... Dùng đúng hàm che của activityLogger (redactActivityRecord).
//
// - Mặc định CHỈ XEM (đếm số dòng sẽ đổi); --apply để ghi đè file.
// - Giữ nguyên mtime của file: trang /activity-logs sắp xếp và lọc ngày theo mtime.
// - Bỏ qua file đang ghi (mtime mới nhất) vì backend còn đang nối thêm dòng vào đó;
//   dừng backend rồi chạy với --all để xử lý cả file này.
// - Bản sao log đã đẩy sang hệ thống khác (Loki/promtail — infra/) KHÔNG được
//   script này xử lý; phải xóa / che riêng ở đó.
//
//   npm run redact:activity-logs                 # xem trước
//   npm run redact:activity-logs -- --apply      # thực hiện (trừ file đang ghi)
//   npm run redact:activity-logs -- --apply --all
// Image production không có npm — chạy thẳng bằng node trong container:
//   docker compose -f docker-compose.prod.yml exec backend node scripts/redact-activity-logs.js --apply
// Thư mục log: LOG_DIR (như config/auditLogger.js), mặc định backend/logs.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });

const fs = require('fs/promises');
const { redactActivityRecord } = require('../src/utils/logRedact');

const LOG_DIR = process.env.LOG_DIR
	? path.resolve(process.env.LOG_DIR)
	: path.join(__dirname, '..', 'logs');
const isAuditName = (name) => /^audit([.-].*)?\.log$/i.test(name);

const apply = process.argv.includes('--apply');
const includeCurrent = process.argv.includes('--all');

const redactLine = (line) => {
	if (!line.trim()) return line;
	let o;
	try {
		o = JSON.parse(line);
	} catch {
		return line; // dòng hỏng / ghi dở — giữ nguyên
	}
	if (!o || o.stream !== 'audit') return line;
	const redacted = JSON.stringify(redactActivityRecord(o));
	// Không có gì để che ⇒ giữ nguyên dòng gốc (định dạng của pino)
	return redacted === JSON.stringify(o) ? line : redacted;
};

(async () => {
	let names;
	try {
		names = (await fs.readdir(LOG_DIR)).filter(isAuditName);
	} catch (err) {
		if (err.code === 'ENOENT') {
			console.log(`Không có thư mục log ${LOG_DIR}`);
			process.exit(0);
		}
		throw err;
	}
	const files = (
		await Promise.all(
			names.map(async (name) => {
				const full = path.join(LOG_DIR, name);
				const st = await fs.stat(full);
				return st.isFile() ? { full, name, st } : null;
			}),
		)
	)
		.filter(Boolean)
		.sort((a, b) => b.st.mtimeMs - a.st.mtimeMs);

	const current = includeCurrent ? null : files[0]?.name;
	let totalChanged = 0;
	for (const { full, name, st } of files) {
		if (name === current) {
			console.log(`  bỏ qua ${name} (đang ghi — dừng backend rồi chạy với --all)`);
			continue;
		}
		const content = await fs.readFile(full, 'utf8');
		const lines = content.split('\n');
		let changed = 0;
		const out = lines.map((line) => {
			const next = redactLine(line);
			if (next !== line) changed++;
			return next;
		});
		if (!changed) continue;
		totalChanged += changed;
		console.log(`  ${name}: ${changed} dòng`);
		if (apply) {
			const tmp = `${full}.redact-tmp`;
			await fs.writeFile(tmp, out.join('\n'), { mode: st.mode });
			// Chạy bằng root (docker compose exec) vẫn trả file về chủ cũ (user node)
			await fs.chown(tmp, st.uid, st.gid).catch(() => {});
			await fs.rename(tmp, full);
			await fs.utimes(full, st.atime, st.mtime);
		}
	}
	console.log(
		`${apply ? 'Đã che' : '[xem trước] Sẽ che'} ${totalChanged} dòng trong ${LOG_DIR}` +
			(!apply && totalChanged ? ' — chạy lại với --apply để ghi.' : ''),
	);
	process.exit(0);
})().catch((err) => {
	console.error(`❌ ${err.message}`);
	process.exit(1);
});
