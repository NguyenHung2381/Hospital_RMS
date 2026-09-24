// Sinh JWT_SECRET + JWT_REFRESH_SECRET ngẫu nhiên và điền vào file .env.
//
// (chạy trong thư mục backend; ở thư mục gốc dùng `npm run gen:jwt -- <cờ>`)
//   node scripts/gen-jwt-secrets.js                 → backend/.env
//   node scripts/gen-jwt-secrets.js --env path/.env → file .env khác
//   node scripts/gen-jwt-secrets.js --force         → ghi đè secret đang dùng (có backup)
//   node scripts/gen-jwt-secrets.js --dry-run       → chỉ xem trước, không ghi file
//
// Docker: docker-entrypoint.sh gọi script này mỗi lần container khởi động.
//
// Mặc định chỉ điền khi giá trị đang trống hoặc còn là placeholder "change-me…",
// vì đổi secret = mọi phiên đăng nhập bị đăng xuất, và link upload cũ mất hiệu
// lực nếu UPLOAD_URL_SECRET không set (khi đó nó dùng JWT_SECRET).
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const KEYS = ['JWT_SECRET', 'JWT_REFRESH_SECRET'];
const BYTES = 64; // 512 bit → 128 ký tự hex

const args = process.argv.slice(2);
const force = args.includes('--force');
const dryRun = args.includes('--dry-run');
const envIdx = args.indexOf('--env');
const envPath = path.resolve(
	envIdx >= 0 && args[envIdx + 1]
		? args[envIdx + 1]
		: path.join(__dirname, '..', '.env'),
);
const examplePath = path.join(path.dirname(envPath), '.env.example');

const isPlaceholder = (v) => !v || /^change-me/i.test(v);
const mask = (v) => `${v.slice(0, 6)}…${v.slice(-4)} (${v.length} ký tự)`;
const genSecret = () => crypto.randomBytes(BYTES).toString('hex');

// ── Đọc .env (chưa có → tạo từ .env.example nếu có) ─────────────────────
let content = '';
let source = envPath;
if (fs.existsSync(envPath)) {
	content = fs.readFileSync(envPath, 'utf8');
} else if (fs.existsSync(examplePath)) {
	content = fs.readFileSync(examplePath, 'utf8');
	source = examplePath;
}
const eol = content.includes('\r\n') ? '\r\n' : '\n';
const lines = content ? content.split(/\r?\n/) : [];

// ── Điền / thay từng key, giữ nguyên các dòng khác ──────────────────────
const secrets = new Set();
const changes = [];
for (const key of KEYS) {
	const re = new RegExp(`^\\s*${key}\\s*=(.*)$`);
	const idx = lines.findIndex((l) => re.test(l));
	const current = idx >= 0 ? lines[idx].match(re)[1].trim().replace(/^["']|["']$/g, '') : '';

	if (!isPlaceholder(current) && !force) {
		changes.push(`  = ${key}: giữ nguyên (đã có giá trị, dùng --force để thay)`);
		secrets.add(current);
		continue;
	}

	let secret = genSecret();
	while (secrets.has(secret)) secret = genSecret(); // 2 secret phải khác nhau
	secrets.add(secret);

	if (idx >= 0) lines[idx] = `${key}=${secret}`;
	else {
		if (lines.length && lines[lines.length - 1] === '') lines.pop();
		lines.push(`${key}=${secret}`, '');
	}
	changes.push(`  ${idx >= 0 && !isPlaceholder(current) ? '↻' : '+'} ${key}: ${mask(secret)}`);
}

const changed = changes.some((c) => !c.startsWith('  ='));
console.log(`[gen-jwt] File: ${envPath}${source !== envPath ? ` (tạo từ ${path.basename(source)})` : ''}`);
console.log(changes.join('\n'));

if (!changed) {
	console.log('[gen-jwt] Không có gì thay đổi.');
	process.exit(0);
}
if (dryRun) {
	console.log('[gen-jwt] --dry-run: không ghi file.');
	process.exit(0);
}

// ── Ghi file (backup nếu đang thay secret thật) ────────────────────────
if (force && fs.existsSync(envPath)) {
	const backup = `${envPath}.bak`;
	fs.copyFileSync(envPath, backup);
	console.log(`[gen-jwt] Đã backup file cũ → ${backup}`);
}
fs.writeFileSync(envPath, lines.join(eol), 'utf8');
console.log('[gen-jwt] Đã ghi. Khởi động lại backend để áp dụng.');
if (force) console.log('[gen-jwt] Lưu ý: mọi phiên đăng nhập hiện tại sẽ bị đăng xuất.');
