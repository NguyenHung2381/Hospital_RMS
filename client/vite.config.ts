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
	},
	server: {
		host: true,
		allowedHosts: true,
		proxy: {
			'/api': {
				target: `http://${localIP}:3000`,
				changeOrigin: true,
				secure: false,
			},
		},
	},
});
