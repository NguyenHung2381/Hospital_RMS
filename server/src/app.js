const path = require('path');
const dotenv = require('dotenv');

// Nạp biến môi trường dựa trên NODE_ENV
const envFile =
	process.env.NODE_ENV === 'production' ? '.env.production' : '.env';
dotenv.config({ path: path.resolve(__dirname, envFile) });
// Fallback nạp thêm file .env mặc định nếu có những biến dùng chung chưa được định nghĩa trong file môi trường cụ thể
if (process.env.NODE_ENV === 'production') {
	dotenv.config({ path: path.resolve(__dirname, '.env') });
}
const express = require('express');
const cors = require('cors');
const { errorHandler } = require('./middlewares/errorHandler');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
const swaggerAuth = require('./middlewares/swaggerAuth');

const app = express();

// ─── Middlewares ─────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Static uploads ───────────────────────────────────────────────────────────
const UPLOADS_ROOT = path.resolve(process.env.UPLOADS_DIR || 'uploads');
app.use('/uploads', express.static(UPLOADS_ROOT));

// ─── Health check ─────────────────────────────────────────────────────────────
app.use('/health', require('./routes/health'));

// ─── Swagger UI (chỉ admin mới truy cập được) ────────────────────────────────
app.use(
	'/api-docs',
	swaggerAuth,
	swaggerUi.serve,
	swaggerUi.setup(swaggerSpec, {
		customSiteTitle: 'RMS Hospital API Docs',
		swaggerOptions: {
			persistAuthorization: true, // giữ token sau khi reload
			docExpansion: 'none', // đóng gọn tất cả endpoint mặc định
			filter: true, // ô tìm kiếm endpoint
		},
	}),
);

// ─── Routes ───────────────────────────────────────────────────────────────────
const API = '/api/v1';
app.use(`${API}/auth`, require('./routes/auth'));
app.use(`${API}/users`, require('./routes/users'));
app.use(`${API}/topics`, require('./routes/topics'));
app.use(`${API}/files`, require('./routes/files'));
app.use(`${API}/dashboard`, require('./routes/dashboard'));
app.use(`${API}/notifications`, require('./routes/notifications'));
app.use(`${API}/events`, require('./routes/events'));
app.use(API, require('./routes/lookups'));

// ─── 404 handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
	res.status(404).json({
		success: false,
		message: `Route ${req.method} ${req.path} không tồn tại`,
	});
});

// ─── Global error handler ─────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start server (tự động chuyển port nếu bị chiếm) ────────────────────────
const net = require('net');
const os = require('os');

const isPortInUse = (port) =>
	new Promise((resolve) => {
		const tester = net
			.createServer()
			.once('error', () => resolve(true))
			.once('listening', () => tester.close(() => resolve(false)))
			.listen(port);
	});

const findAvailablePort = async (startPort, maxRetries = 10) => {
	for (let i = 0; i < maxRetries; i++) {
		const port = startPort + i;
		const inUse = await isPortInUse(port);
		if (!inUse) return port;
		console.warn(`⚠️  Port ${port} đang được sử dụng, thử port ${port + 1}...`);
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

(async () => {
	try {
		const PREFERRED_PORT = parseInt(process.env.PORT) || 3000;
		const PORT = await findAvailablePort(PREFERRED_PORT);

		app.listen(PORT, '0.0.0.0', () => {
			if (PORT !== PREFERRED_PORT) {
				console.warn(
					`⚠️  Port ${PREFERRED_PORT} bị chiếm, chuyển sang port ${PORT}`,
				);
			}

			// Tự động đồng bộ Port sang file .env của Frontend (Client)
			const fs = require('fs');
			const clientEnvPath = path.resolve(__dirname, '../../client/.env');
			if (fs.existsSync(clientEnvPath)) {
				let envContent = fs.readFileSync(clientEnvPath, 'utf8');
				if (envContent.match(/^VITE_API_PORT=.*$/m)) {
					envContent = envContent.replace(
						/^VITE_API_PORT=.*$/m,
						`VITE_API_PORT=${PORT}`,
					);
				} else {
					envContent += `\nVITE_API_PORT=${PORT}\n`;
				}
				fs.writeFileSync(clientEnvPath, envContent);
				console.log(`✅ Đã tự động đồng bộ Port ${PORT} sang thư mục client`);
			}

			const networkIp = getNetworkIp() || '192.168.x.x';
			console.log(`🚀 RMS Hospital API running at:`);
			console.log(`   > Local:   http://localhost:${PORT}`);
			console.log(`   > Network: http://${networkIp}:${PORT}`);
			console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
			console.log(`📚 Swagger UI:  http://localhost:${PORT}/api-docs`);
		});
	} catch (err) {
		console.error(`❌ Không thể khởi động server: ${err.message}`);
		process.exit(1);
	}
})();

module.exports = app;
