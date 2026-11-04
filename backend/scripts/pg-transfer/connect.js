// Kết nối 2 phía của pg:transfer.
//   Nguồn SQL Server (chỉ đọc; thường là SQL Server tạm dựng từ file .bak bằng
//   scripts/pg-transfer/transfer-from-bak.sh). Biến riêng, KHÔNG dùng DB_* của app
//   (DB_* giờ trỏ tới PostgreSQL):
//     MSSQL_SOURCE_HOST (127.0.0.1), MSSQL_SOURCE_PORT (1433),
//     MSSQL_SOURCE_DATABASE (RMS_HOSPITAL), MSSQL_SOURCE_USER (sa),
//     MSSQL_SOURCE_PASSWORD (bắt buộc),
//     MSSQL_SOURCE_ENCRYPT (true), MSSQL_SOURCE_TRUST_CERT (true — SQL Server tạm
//     dùng chứng chỉ tự ký, chỉ nối trong mạng Docker nội bộ).
//   Không giới hạn thời gian câu lệnh (bảng lớn, RESTORE).
//   Đích PostgreSQL: PG_TARGET_HOST (127.0.0.1), PG_TARGET_PORT (5432),
//     PG_TARGET_DATABASE (rms_hospital), PG_TARGET_USER (rms_migrate — chủ DB,
//     cần quyền tạo bảng), PG_TARGET_PASSWORD (trống = đọc pgpass / PGPASSWORD).
// Gói `mssql` chỉ còn dùng ở đây; xoá cùng thư mục này sau khi chuyển xong.
const fs = require('fs');
require('../../src/config/loadEnv');
const sql = require('mssql');
const { pgpassFile, pgpassLookup } = require('../../src/config/pgParams');

const flag = (v, fallback) => (v === undefined || v === '' ? fallback : v === 'true');

/** @param {Record<string, string | undefined>} [env] */
const sourceConfig = (env = process.env) => ({
	server: env.MSSQL_SOURCE_HOST || '127.0.0.1',
	port: Number(env.MSSQL_SOURCE_PORT || 1433),
	database: env.MSSQL_SOURCE_DATABASE || 'RMS_HOSPITAL',
	user: env.MSSQL_SOURCE_USER || 'sa',
	password: env.MSSQL_SOURCE_PASSWORD || '',
	connectionTimeout: 30000,
	requestTimeout: 0,
	options: {
		encrypt: flag(env.MSSQL_SOURCE_ENCRYPT, true),
		trustServerCertificate: flag(env.MSSQL_SOURCE_TRUST_CERT, true),
		enableArithAbort: true,
		appName: 'hospital-rms-transfer',
	},
	pool: { max: 6, min: 0 },
});

/**
 * Mở pool tới SQL Server nguồn. `database`: ghi đè tên DB (restore nối vào master).
 * @param {{ database?: string }} [opts]
 */
const openSource = async ({ database } = {}) => {
	const cfg = sourceConfig();
	if (!cfg.password) throw new Error('Thiếu MSSQL_SOURCE_PASSWORD (mật khẩu SQL Server nguồn)');
	return new sql.ConnectionPool({ ...cfg, ...(database ? { database } : {}) }).connect();
};

const describeSource = () => {
	const c = sourceConfig();
	return `${c.user}@${c.server}:${c.port}/${c.database}`;
};

const targetConfig = (env = process.env) => {
	const cfg = {
		host: env.PG_TARGET_HOST || '127.0.0.1',
		port: Number(env.PG_TARGET_PORT || 5432),
		database: env.PG_TARGET_DATABASE || 'rms_hospital',
		user: env.PG_TARGET_USER || 'rms_migrate',
		application_name: 'hospital-rms-transfer',
	};
	let password = env.PG_TARGET_PASSWORD || env.PGPASSWORD;
	if (!password) {
		try {
			password = pgpassLookup(fs.readFileSync(pgpassFile(env), 'utf8'), cfg);
		} catch {
			/* không có file pgpass */
		}
	}
	return { ...cfg, password: password ?? '' };
};

const openTarget = async () => {
	const { Client } = require('pg');
	const client = new Client(targetConfig());
	await client.connect();
	await client.query("SET client_min_messages = warning; SET DateStyle = 'ISO, YMD'");
	return client;
};

const describeTarget = () => {
	const c = targetConfig();
	return `${c.user}@${c.host}:${c.port}/${c.database}`;
};

module.exports = {
	sql,
	sourceConfig,
	openSource,
	describeSource,
	openTarget,
	targetConfig,
	describeTarget,
};
