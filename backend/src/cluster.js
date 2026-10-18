// Chạy API trên nhiều CPU core bằng Node cluster (entrypoint production —
// Dockerfile target prod). Dev vẫn chạy thẳng src/server.js (nodemon).
//
// 1 tiến trình Node chỉ dùng được 1 core: bcrypt, xuất Excel, JSON lớn... chiếm
// luồng chính là mọi request khác phải chờ. Primary ở đây KHÔNG nhận request,
// chỉ:
//   1. nạp env + chạy initDatabase() ĐÚNG 1 LẦN (migration + kiểm tra phân
//      quyền — tránh N worker cùng làm một lúc),
//   2. fork WEB_CONCURRENCY worker — các worker dùng chung 1 port, cluster chia
//      kết nối vòng tròn (round-robin),
//   3. chỉ giao cron job (jobs/index.js) cho worker đầu tiên,
//   4. worker chết thì tạo lại (có chặn vòng lặp crash liên tục).
//
// Trạng thái dùng chung giữa các worker đã nằm trên Redis: rate-limit
// (utils/rateLimit.js), xoá cache phân quyền (utils/cacheBus.js), vé 1 lần
// (utils/oneTimeToken.js), sự kiện realtime SSE (modules/events/eventService.js).
require('./config/loadEnv');
// Kiểu khai báo của node:cluster là ESM (export default) nhưng require() trả về thẳng đối tượng cluster
const cluster = /** @type {import('node:cluster').Cluster} */ (
	/** @type {unknown} */ (require('node:cluster'))
);
const os = require('node:os');
const logger = require('./config/logger');

const WORKERS = Math.max(
	1,
	Number(process.env.WEB_CONCURRENCY) || Math.min(os.availableParallelism(), 4),
);

// Worker chết trong vòng FAST_EXIT_MS kể từ lúc tạo = lỗi khởi động (thiếu env,
// DB sai...) — tạo lại mãi chỉ ngốn CPU và spam log. Quá MAX_FAST_EXITS lần
// liên tiếp thì primary thoát để Docker (restart: unless-stopped) xử lý.
const FAST_EXIT_MS = 10_000;
const MAX_FAST_EXITS = 5;

process.on('unhandledRejection', (reason) => {
	logger.error('❌ [cluster] Unhandled Promise Rejection:', reason);
});

const main = async () => {
	try {
		await require('./database').initDatabase();
	} catch (err) {
		logger.error(`❌ [db] ${err.message}`);
		process.exit(1);
	}

	const PORT = parseInt(process.env.PORT) || 3000;
	const jobsDisabled = process.env.JOBS_ENABLED === 'false';
	let fastExits = 0;
	let shuttingDown = false;
	// slot → worker: slot 0 là worker chạy cron job; tạo lại đúng slot khi chết
	const slots = new Map();

	const fork = (slot) => {
		// rmsSlot / rmsStartedAt: thuộc tính tự gắn để theo dõi worker
		const worker = /** @type {any} */ (
			cluster.fork({
				CLUSTER_WORKER: '1',
				PORT: String(PORT),
				JOBS_ENABLED: slot === 0 && !jobsDisabled ? 'true' : 'false',
			})
		);
		worker.rmsSlot = slot;
		worker.rmsStartedAt = Date.now();
		slots.set(slot, worker);
	};

	cluster.on('exit', (/** @type {any} */ worker, code, signal) => {
		const slot = worker.rmsSlot;
		slots.delete(slot);
		if (shuttingDown) {
			if (slots.size === 0) process.exit(0);
			return;
		}
		logger.error(
			`⚠️  [cluster] worker ${worker.process.pid} (slot ${slot}) dừng (code ${code}, signal ${signal}) — tạo lại.`,
		);
		if (Date.now() - worker.rmsStartedAt < FAST_EXIT_MS) {
			if (++fastExits >= MAX_FAST_EXITS) {
				logger.error(`❌ [cluster] worker lỗi khi khởi động ${fastExits} lần liên tiếp — dừng.`);
				process.exit(1);
			}
		} else {
			fastExits = 0;
		}
		fork(slot);
	});

	for (let slot = 0; slot < WORKERS; slot++) fork(slot);

	logger.info(`🚀 RMS Hospital API (cluster: ${WORKERS} worker) running at port ${PORT}`);
	logger.info(`   Environment: ${process.env.NODE_ENV || 'development'}`);

	// docker stop gửi SIGTERM cho primary (PID 1): chuyển tiếp cho từng worker,
	// chờ tối đa 10s rồi thoát hẳn.
	const shutdown = (signal) => {
		if (shuttingDown) return;
		shuttingDown = true;
		logger.info(`[cluster] nhận ${signal} — dừng ${slots.size} worker...`);
		for (const worker of slots.values()) worker.process.kill('SIGTERM');
		setTimeout(() => process.exit(0), 10_000).unref();
	};
	process.on('SIGTERM', () => shutdown('SIGTERM'));
	process.on('SIGINT', () => shutdown('SIGINT'));
};

if (cluster.isPrimary) {
	main();
} else {
	require('./server');
}
