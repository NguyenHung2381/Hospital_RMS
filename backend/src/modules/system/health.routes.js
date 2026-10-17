const express = require('express');
const router = express.Router();
const sql = require('mssql');

// ─── Helper: format bytes ─────────────────────────────────────────────────────
const formatBytes = (bytes) => {
	if (bytes === 0) return '0 B';
	const k = 1024;
	const sizes = ['B', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

// ─── Helper: format uptime ────────────────────────────────────────────────────
const formatUptime = (seconds) => {
	const d = Math.floor(seconds / 86400);
	const h = Math.floor((seconds % 86400) / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = Math.floor(seconds % 60);
	return `${d}d ${h}h ${m}m ${s}s`;
};

// ─── GET /health ──────────────────────────────────────────────────────────────
// Trả về thông tin tổng quan về server (uptime, memory, env)
router.get('/', (req, res) => {
	const mem = process.memoryUsage();

	res.json({
		success: true,
		status: 'ok',
		service: 'RMS Hospital API',
		timestamp: new Date(),
		environment: process.env.NODE_ENV || 'development',
		uptime: {
			seconds: Math.floor(process.uptime()),
			formatted: formatUptime(process.uptime()),
		},
		memory: {
			rss: formatBytes(mem.rss),
			heapTotal: formatBytes(mem.heapTotal),
			heapUsed: formatBytes(mem.heapUsed),
			external: formatBytes(mem.external),
		},
		node: process.version,
		// Commit SHA của image (build-arg GIT_SHA) — pipeline deploy so khớp để chắc bản mới đã chạy
		version: process.env.GIT_SHA || null,
	});
});

// ─── GET /health/db ───────────────────────────────────────────────────────────
// Kiểm tra kết nối tới SQL Server
router.get('/db', async (req, res) => {
	const start = Date.now();

	try {
		// Dùng pool hiện có nếu đã kết nối, hoặc tạo kết nối tạm để ping
		let pool;

		try {
			// Lấy pool đang dùng trong app
			const dbConfig = require('../../config/db');
			if (dbConfig.getPool) {
				pool = await dbConfig.getPool();
			} else {
				throw new Error('No getPool function');
			}
		} catch {
			// Fallback: tạo connection tạm từ biến môi trường
			pool = await sql.connect({
				server: process.env.DB_SERVER || 'localhost',
				database: process.env.DB_DATABASE || 'RMS_HOSPITAL',
				user: process.env.DB_USER || 'sa',
				password: process.env.DB_PASSWORD || '',
				port: parseInt(process.env.DB_PORT) || 1433,
				connectionTimeout: 10000,
				requestTimeout: 10000,
				options: {
					encrypt: process.env.DB_ENCRYPT === 'true',
					trustServerCertificate: process.env.DB_TRUST_SERVER_CERT !== 'false',
				},
			});
		}

		// Ping nhẹ: lấy thời gian hiện tại từ SQL Server
		const result = await pool.request().query('SELECT GETDATE() AS serverTime');
		const latency = Date.now() - start;

		return res.json({
			success: true,
			status: 'connected',
			database: {
				server: process.env.DB_SERVER || 'N/A',
				name: process.env.DB_DATABASE || 'N/A', // fix: DB_NAME → DB_DATABASE
				serverTime: result.recordset[0]?.serverTime,
				latencyMs: latency,
			},
			timestamp: new Date(),
		});
	} catch (err) {
		const latency = Date.now() - start;

		return res.status(503).json({
			success: false,
			status: 'disconnected',
			error: {
				message: err.message,
				code: err.code || 'UNKNOWN',
				latencyMs: latency,
			},
			timestamp: new Date(),
		});
	}
});

module.exports = router;
