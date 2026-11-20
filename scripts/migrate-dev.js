#!/usr/bin/env node
// `npm run migrate [lệnh]` ở thư mục gốc: chạy backend/scripts/migrate.js trong container
// backend dev (docker-compose.yml), bằng role migration (mặc định rms_migrate) — như
// scripts/deploy.sh làm ở production.
//
// backend/.env dùng role khác (vd rms_app: không có quyền CREATE trên schema public →
// migration tạo bảng hỏng ở "permission denied for schema public") thì script truyền
// DB_USER / DB_PASSWORD của role migration vào container cho riêng lệnh này; mật khẩu
// không ghi vào file nào. Mật khẩu lấy theo thứ tự:
//   1. MIGRATION_DB_PASSWORD
//   2. file pgpass trên máy này (PGPASSFILE, %APPDATA%\postgresql\pgpass.conf hoặc
//      ~/.pgpass): dòng <host>:<cổng>:*:rms_migrate:<mật khẩu>
// Không có mật khẩu, hoặc backend/.env đã dùng sẵn role migration → chạy bằng role
// trong backend/.env.
//
// Tuỳ chọn: MIGRATION_DB_USER (mặc định rms_migrate), MIGRATION_DB_HOST (host ghi trong
// pgpass; mặc định thử DEV_DB_SERVER, 127.0.0.1, localhost, host.docker.internal).
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { pgpassFile, pgpassLookup } = require('../backend/src/config/pgParams');

const ROOT = path.resolve(__dirname, '..');
const BACKEND_ENV = path.join(ROOT, 'backend', '.env');
const COMPOSE_ENV = path.join(ROOT, '.env');

// Giá trị 1 biến trong file .env (bỏ nháy bọc và chú thích cuối dòng); không có → ''
const envValue = (file, key) => {
	let content;
	try {
		content = fs.readFileSync(file, 'utf8');
	} catch {
		return '';
	}
	const m = content.match(new RegExp(`^[ \\t]*${key}[ \\t]*=(.*)$`, 'm'));
	if (!m) return '';
	const v = m[1].trim();
	return /^'.*'$|^".*"$/.test(v) ? v.slice(1, -1) : v.replace(/\s+#.*$/, '');
};

const appUser = envValue(BACKEND_ENV, 'DB_USER');
const migrationUser = process.env.MIGRATION_DB_USER || 'rms_migrate';

const migrationPassword = () => {
	if (process.env.MIGRATION_DB_PASSWORD) return process.env.MIGRATION_DB_PASSWORD;
	let content;
	try {
		content = fs.readFileSync(pgpassFile(), 'utf8');
	} catch {
		return '';
	}
	const port = envValue(BACKEND_ENV, 'DB_PORT') || '5432';
	const database = envValue(BACKEND_ENV, 'DB_DATABASE') || 'rms_hospital';
	// pgpass ghi host theo cách máy này gọi PostgreSQL; container gọi cùng máy chủ đó là
	// host.docker.internal
	const hosts = process.env.MIGRATION_DB_HOST
		? [process.env.MIGRATION_DB_HOST]
		: [
				process.env.DEV_DB_SERVER || envValue(COMPOSE_ENV, 'DEV_DB_SERVER'),
				'127.0.0.1',
				'localhost',
				'host.docker.internal',
			].filter(Boolean);
	for (const host of hosts) {
		const password = pgpassLookup(content, { host, port, database, user: migrationUser });
		if (password) return password;
	}
	return '';
};

const password = appUser === migrationUser ? '' : migrationPassword();
const override = password ? { DB_USER: migrationUser, DB_PASSWORD: password } : null;

// `-e TÊN` không kèm giá trị: Compose lấy giá trị từ môi trường của tiến trình này →
// mật khẩu không nằm trên dòng lệnh. dotenv trong container không ghi đè biến đã có.
const result = spawnSync(
	'docker',
	[
		'compose',
		'exec',
		'-T',
		...(override ? ['-e', 'DB_USER', '-e', 'DB_PASSWORD'] : []),
		'backend',
		'node',
		'scripts/migrate.js',
		...process.argv.slice(2),
	],
	{ cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...override } },
);

if (result.error) {
	console.error(`Không chạy được docker compose: ${result.error.message}`);
	process.exit(1);
}
if (result.status !== 0 && !override && appUser !== migrationUser)
	console.error(
		`\nLệnh vừa chạy bằng role "${appUser}" trong backend/.env vì không tìm thấy mật khẩu của ${migrationUser}.\n` +
			`Lỗi do thiếu quyền (permission denied) thì đặt MIGRATION_DB_PASSWORD, hoặc thêm dòng\n` +
			`  127.0.0.1:5432:*:${migrationUser}:<mật khẩu>\nvào ${pgpassFile()}`,
	);
process.exit(result.status ?? 1);
