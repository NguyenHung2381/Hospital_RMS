const path = require('path');
const app = require('./app');
const jobs = require('./jobs');

// ─── Global process error guards (prevent crash on unhandled rejections) ─────
process.on('unhandledRejection', (reason) => {
	console.error('❌ Unhandled Promise Rejection:', reason);
});
process.on('uncaughtException', (err) => {
	console.error('❌ Uncaught Exception:', err.message, err.stack);
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
			// Chỉ áp dụng khi chạy native cùng máy với client — bỏ qua nếu
			// thư mục client không tồn tại cạnh server (vd: chạy trong Docker container riêng)
			try {
				const fs = require('fs');
				const clientEnvPath = path.resolve(__dirname, '../../client/.env');
				if (fs.existsSync(path.dirname(clientEnvPath))) {
					let envContent = '';
					if (fs.existsSync(clientEnvPath)) {
						envContent = fs.readFileSync(clientEnvPath, 'utf8');
					}
					let newContent = envContent;
					if (newContent.match(/^VITE_API_PORT=.*$/m)) {
						newContent = newContent.replace(
							/^VITE_API_PORT=.*$/m,
							`VITE_API_PORT=${PORT}`,
						);
					} else {
						newContent = newContent.trim()
							? newContent.trim() + `\nVITE_API_PORT=${PORT}\n`
							: `VITE_API_PORT=${PORT}\n`;
					}
					if (envContent !== newContent) {
						fs.writeFileSync(clientEnvPath, newContent);
						console.log(
							`✅ Đã tự động đồng bộ Port ${PORT} sang thư mục client`,
						);
					}
				}
			} catch (err) {
				console.warn(`⚠️  Không thể đồng bộ port sang client/.env: ${err.message}`);
			}

			const networkIp = getNetworkIp() || '192.168.x.x';
			console.log(`🚀 RMS Hospital API running at:`);
			console.log(`   > Local:   http://localhost:${PORT}`);
			console.log(`   > Network: http://${networkIp}:${PORT}`);
			console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
			console.log(`📚 Swagger UI:  http://localhost:${PORT}/api-docs`);

			jobs.start();
		});
	} catch (err) {
		console.error(`❌ Không thể khởi động server: ${err.message}`);
		process.exit(1);
	}
})();
