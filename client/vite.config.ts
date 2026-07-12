import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
import fs from 'fs';
import path from 'path';

// Đọc PORT từ .env của server, cho phép override qua biến môi trường VITE_API_PORT
function getApiPort(): string {
	if (process.env.VITE_API_PORT) return process.env.VITE_API_PORT;

	// 1. Try reading VITE_API_PORT from client's .env first
	const clientEnvPath = path.resolve(process.cwd(), '.env');
	if (fs.existsSync(clientEnvPath)) {
		const content = fs.readFileSync(clientEnvPath, 'utf8');
		const match = content.match(/^VITE_API_PORT=(\d+)/m);
		if (match) return match[1];
	}

	// 2. Fallback to server's .env
	const serverEnvPath = path.resolve(process.cwd(), '../server/src/.env');
	if (fs.existsSync(serverEnvPath)) {
		const content = fs.readFileSync(serverEnvPath, 'utf8');
		const match = content.match(/^PORT=(\d+)/m);
		if (match) return match[1];
	}
	return '3000';
}

const apiPort = getApiPort();
// Host của backend — mặc định 'localhost' (chạy native cùng máy).
// Trong Docker Compose, client và server là 2 container khác nhau nên cần
// override bằng tên service (vd: VITE_API_HOST=server).
const apiHost = process.env.VITE_API_HOST || 'localhost';

export default defineConfig({
	plugins: [react(), svgr()],
	resolve: {
		alias: {
			'@': path.resolve(__dirname, './src'),
		},
	},
	server: {
		host: true,
		allowedHosts: true,
		port: process.env.PORT ? Number(process.env.PORT) : 5173,
		// Bind mount qua Docker Desktop (WSL2) không phát native fs-events —
		// cần polling để HMR nhận ra thay đổi file. Chỉ bật khi chạy trong Docker.
		watch:
			process.env.CHOKIDAR_USEPOLLING === 'true'
				? { usePolling: true }
				: undefined,
		proxy: {
			// All API and static-upload requests are proxied to the Express backend.
			'/api': {
				target: `http://${apiHost}:${apiPort}`,
				changeOrigin: true,
				secure: false,
			},
			'/uploads': {
				target: `http://${apiHost}:${apiPort}`,
				changeOrigin: true,
				secure: false,
			},
		},
	},
});
