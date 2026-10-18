const path = require('path');
const app = require('./app');
const jobs = require('./jobs');
const logger = require('./config/logger');

// ─── Global process error guards (prevent crash on unhandled rejections) ─────
process.on('unhandledRejection', (reason) => {
	logger.error('❌ Unhandled Promise Rejection:', reason);
});
// Exception không ai bắt = tiến trình đang ở trạng thái không xác định (kết nối,
// khoá, dữ liệu ghi dở...) — chạy tiếp có thể phục vụ sai hoặc lộ dữ liệu. Ghi
// log rồi thoát; Docker (restart: unless-stopped) / nodemon tự khởi động lại.
process.on('uncaughtException', (err) => {
	logger.error('❌ Uncaught Exception — dừng tiến trình:', err.message, err.stack);
	process.exit(1);
});

// ─── Start server (tự động chuyển port nếu bị chiếm) ────────────────────────
const net = require('net');
const os = require('os');

const isPortInUse = (port) =>
	new Promise((resolve) => {
		// Dùng connect thay vì bind: tránh SO_REUSEADDR trên Windows
		// cho phép bind trùng port khiến cách cũ luôn báo "rảnh"
		const client = net.createConnection({ port, host: '127.0.0.1' });
		client.once('connect', () => {
			client.destroy();
			resolve(true);
		});
		client.once('error', (err) => resolve(err.code !== 'ECONNREFUSED'));
	});

const findAvailablePort = async (startPort, maxRetries = 10) => {
	for (let i = 0; i < maxRetries; i++) {
		const port = startPort + i;
		const inUse = await isPortInUse(port);
		if (!inUse) return port;
		logger.warn(`⚠️  Port ${port} đang được sử dụng, thử port ${port + 1}...`);
	}
	throw new Error(`Không tìm được port khả dụng sau ${maxRetries} lần thử.`);
};

function getNetworkIp() {
	const interfaces = os.networkInterfaces();
	for (const name of Object.keys(interfaces)) {
		for (const iface of interfaces[name]) {
			const { address, family, internal } = iface;
			if (family === 'IPv4' && !internal) {
				return address;
			}
		}
	}
	return null;
}

// Worker do src/cluster.js tạo: primary đã chạy initDatabase và chọn port —
// worker chỉ nghe đúng PORT được giao (các worker dùng chung 1 port qua cluster).
const isClusterWorker = process.env.CLUSTER_WORKER === '1';

const startWorker = () => {
	const PORT = parseInt(process.env.PORT);
	app.listen(PORT, '0.0.0.0', () => {
		jobs.start();
	});
};

const startStandalone = async () => {
	try {
		// Migration + kiểm tra CSDL phân quyền + đồng bộ danh mục quyền trước khi
		// nhận request (xem database/index.js). CSDL chưa ở mô hình mới thì DỪNG:
		// code không còn nhánh chạy theo mô hình cũ.
		try {
			await require('./database').initDatabase();
		} catch (err) {
			if (err.code !== 'DB_SCHEMA_OUTDATED') throw err;
			logger.error(`❌ [db] ${err.message}`);
			process.exit(1);
		}

		const PREFERRED_PORT = parseInt(process.env.PORT) || 3000;
		const PORT = await findAvailablePort(PREFERRED_PORT);

		app.listen(PORT, '0.0.0.0', () => {
			if (PORT !== PREFERRED_PORT) {
				logger.warn(`⚠️  Port ${PREFERRED_PORT} bị chiếm, chuyển sang port ${PORT}`);
			}

			// Tự động đồng bộ Port sang file .env của Frontend (Client)
			// Chỉ áp dụng khi chạy native cùng máy với client (dev) — bỏ qua ở
			// production và khi thư mục frontend không tồn tại cạnh backend (vd:
			// chạy trong Docker container riêng): server không được tự ghi file
			// cấu hình ngoài thư mục của mình trên máy chủ thật.
			if (process.env.NODE_ENV !== 'production')
				try {
					const fs = require('fs');
					const clientEnvPath = path.resolve(__dirname, '../../frontend/.env');
					if (fs.existsSync(path.dirname(clientEnvPath))) {
						let envContent = '';
						if (fs.existsSync(clientEnvPath)) {
							envContent = fs.readFileSync(clientEnvPath, 'utf8');
						}
						let newContent = envContent;
						if (newContent.match(/^VITE_API_PORT=.*$/m)) {
							newContent = newContent.replace(/^VITE_API_PORT=.*$/m, `VITE_API_PORT=${PORT}`);
						} else {
							newContent = newContent.trim()
								? newContent.trim() + `\nVITE_API_PORT=${PORT}\n`
								: `VITE_API_PORT=${PORT}\n`;
						}
						if (envContent !== newContent) {
							fs.writeFileSync(clientEnvPath, newContent);
							logger.info(`✅ Đã tự động đồng bộ Port ${PORT} sang thư mục client`);
						}
					}
				} catch (err) {
					logger.warn(`⚠️  Không thể đồng bộ port sang client/.env: ${err.message}`);
				}

			const networkIp = getNetworkIp() || '192.168.x.x';
			logger.info(`🚀 RMS Hospital API running at:`);
			logger.info(`   > Local:   http://localhost:${PORT}`);
			logger.info(`   > Network: http://${networkIp}:${PORT}`);
			logger.info(`   Environment: ${process.env.NODE_ENV || 'development'}`);
			if (process.env.NODE_ENV !== 'production' || process.env.SWAGGER_ENABLED === 'true')
				logger.info(`📚 Swagger UI:  http://localhost:${PORT}/api-docs`);

			jobs.start();
		});
	} catch (err) {
		logger.error(`❌ Không thể khởi động server: ${err.message}`);
		process.exit(1);
	}
};

if (isClusterWorker) startWorker();
else startStandalone();
