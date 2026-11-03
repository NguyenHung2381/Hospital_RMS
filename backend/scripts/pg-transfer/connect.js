// Kết nối 2 phía của pg:transfer.
//   Nguồn SQL Server: biến DB_* như ứng dụng (.env), luôn dùng adapter mssql
//     dù DB_CLIENT là gì; không giới hạn thời gian câu lệnh (bảng lớn).
//   Đích PostgreSQL: PG_TARGET_HOST (127.0.0.1), PG_TARGET_PORT (5432),
//     PG_TARGET_DATABASE (rms_hospital), PG_TARGET_USER (rms_migrate — chủ DB,
//     cần quyền tạo bảng), PG_TARGET_PASSWORD (trống = đọc pgpass / PGPASSWORD).
const fs = require('fs');
require('../../src/config/loadEnv');
const { sql, dbConfig } = require('../../src/config/db.mssql');
const { pgpassFile, pgpassLookup } = require('../../src/config/pgParams');

const openSource = () =>
	new sql.ConnectionPool({ ...dbConfig, requestTimeout: 0, pool: { max: 6, min: 0 } }).connect();

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

module.exports = { sql, openSource, openTarget, targetConfig, describeTarget };
