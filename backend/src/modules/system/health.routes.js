const express = require('express');
const router = express.Router();
const { getPool } = require('../../config/db');
const logger = require('../../config/logger');

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
// Kiểm tra kết nối tới SQL Server (deploy.ps1 smoke test, giám sát). Route công
// khai ⇒ KHÔNG trả chi tiết: tên/địa chỉ server, tên DB, thông báo lỗi kết nối
// (lộ tên login, lý do đăng nhập hỏng...) chỉ ghi vào log server. Chỉ dùng pool
// của ứng dụng (config/db.js) — không tự mở kết nối dự phòng bằng cấu hình khác.
router.get('/db', async (req, res) => {
	const start = Date.now();
	try {
		const pool = await getPool();
		await pool.request().query('SELECT 1 AS ok');
		return res.json({
			success: true,
			status: 'connected',
			latencyMs: Date.now() - start,
			timestamp: new Date(),
		});
	} catch (err) {
		logger.error(
			`[health] Không kết nối được SQL Server: ${err.message} (${err.code || 'UNKNOWN'})`,
		);
		return res.status(503).json({ success: false, status: 'disconnected', timestamp: new Date() });
	}
});

module.exports = router;
