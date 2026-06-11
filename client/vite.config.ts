import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
import os from 'os';
import fs from 'fs';
import path from 'path';

function getLocalIP(): string {
	const interfaces = os.networkInterfaces();
	for (const ifaces of Object.values(interfaces)) {
		for (const iface of ifaces || []) {
			if (iface.family === 'IPv4' && !iface.internal) {
				return iface.address;
			}
		}
	}
	return 'localhost';
}

const localIP = getLocalIP();

// Đọc PORT từ .env của server, cho phép override qua biến môi trường VITE_API_PORT
function getApiPort(): string {
	if (process.env.VITE_API_PORT) return process.env.VITE_API_PORT;
	const serverEnvPath = path.resolve(process.cwd(), '../server/src/.env');
	if (fs.existsSync(serverEnvPath)) {
		const content = fs.readFileSync(serverEnvPath, 'utf8');
		const match = content.match(/^PORT=(\d+)/m);
		if (match) return match[1];
	}
	return '3000';
}

const apiPort = getApiPort();

const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
	let content = fs.readFileSync(envPath, 'utf8');
	content = content.replace(/^VITE_API_HOST=.*/m, `VITE_API_HOST=${localIP}`);
	fs.writeFileSync(envPath, content);
}

export default defineConfig({
	plugins: [react(), svgr()],
	define: {
		'import.meta.env.VITE_API_HOST': JSON.stringify(localIP),
		'import.meta.env.VITE_API_PORT': JSON.stringify(apiPort),
	},
	server: {
		host: true,
		allowedHosts: true,
		proxy: {
			'/api': {
				target: `http://${localIP}:${apiPort}`,
				changeOrigin: true,
				secure: false,
			},
		},
	},
});
