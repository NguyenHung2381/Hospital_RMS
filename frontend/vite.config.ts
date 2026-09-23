import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
import fs from 'fs';
import path from 'path';
import JavaScriptObfuscator from 'javascript-obfuscator';

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

// Làm rối bundle JS trước khi ghi ra dist/ — chỉ áp dụng cho `vite build`
// (production), không chạy ở dev server (transform mỗi request sẽ rất chậm
// và vô nghĩa vì dev không deploy). Mức "trung bình": đổi tên biến + mã hoá
// chuỗi (base64) — đủ để cản người tò mò mở DevTools đọc thẳng logic, KHÔNG
// bật control-flow-flattening / dead-code injection vì làm bundle phình to
// và chậm đi rõ rệt trên 1 app nghiệp vụ nhiều màn hình như thế này.
// `ignoreImports: true` BẮT BUỘC: không đụng chuỗi đường dẫn trong import()
// động (React Router lazy-load từng trang) — thiếu cờ này sẽ vỡ code-splitting.
const obfuscatorPlugin = (): Plugin => ({
	name: 'obfuscator',
	apply: 'build',
	renderChunk(code, chunk) {
		if (!chunk.fileName.endsWith('.js')) return null;
		const result = JavaScriptObfuscator.obfuscate(code, {
			compact: true,
			ignoreImports: true,
			identifierNamesGenerator: 'hexadecimal',
			renameGlobals: false,
			stringArray: true,
			stringArrayEncoding: ['base64'],
			stringArrayThreshold: 0.75,
			splitStrings: false,
			controlFlowFlattening: false,
			deadCodeInjection: false,
			disableConsoleOutput: false,
			numbersToExpressions: false,
			simplify: true,
			selfDefending: false,
		});
		return { code: result.getObfuscatedCode(), map: null };
	},
});

const apiPort = getApiPort();
// Host của backend — mặc định 'localhost' (chạy native cùng máy).
// Trong Docker Compose, client và server là 2 container khác nhau nên cần
// override bằng tên service (vd: VITE_API_HOST=server).
const apiHost = process.env.VITE_API_HOST || 'localhost';

export default defineConfig({
	plugins: [
		react(),
		// `icon: true` buộc mọi icon `*.svg?react` có kích thước nội tại 1em
		// (thay vì mặc định 300×150 của trình duyệt khi SVG chỉ có viewBox).
		// Các rule CSS `.parent svg { width/height }` sẵn có vẫn override bình thường.
		svgr({ svgrOptions: { icon: true } }),
		obfuscatorPlugin(),
	],
	resolve: {
		alias: {
			'@': path.resolve(__dirname, './src'),
		},
	},
	server: {
		host: true,
		allowedHosts: true,
		port: process.env.PORT ? Number(process.env.PORT) : 5173,
		// Biên dịch sẵn các trang nặng khi dev server khởi động, tránh transform
		// waterfall làm Suspense (thanh 92%) treo ở lần điều hướng đầu.
		warmup: {
			clientFiles: [
				'./src/features/topics/pages/Topic.tsx',
				'./src/features/council/pages/Council.tsx',
				'./src/features/dashboard/pages/OverviewDashboard.tsx',
				'./src/features/portal/pages/UserHome.tsx',
			],
		},
		// Bind mount qua Docker Desktop (WSL2) không phát native fs-events —
		// cần polling để HMR nhận ra thay đổi file. Chỉ bật khi chạy trong Docker.
		// Chu kỳ mặc định của chokidar là 100ms: ~700 lệnh stat() qua bind mount
		// mỗi 100ms chiếm hết threadpool libuv, khiến MỌI request tới dev server
		// (đọc file, DNS lookup của proxy /api) phải xếp hàng 200–900ms. Nới ra
		// 1s và bỏ qua thư mục build — HMR trễ tối đa ~1s, không đáng kể.
		watch:
			process.env.CHOKIDAR_USEPOLLING === 'true'
				? {
						usePolling: true,
						interval: 1000,
						binaryInterval: 3000,
						ignored: ['**/dist/**', '**/.git/**'],
					}
				: undefined,
		proxy: {
			// All API and static-upload requests are proxied to the Express backend.
			'/api': {
				target: `http://${apiHost}:${apiPort}`,
				changeOrigin: true,
				secure: false,
				// Gửi X-Forwarded-For để backend (TRUST_PROXY) lấy đúng IP máy khách.
				xfwd: true,
			},
			'/uploads': {
				target: `http://${apiHost}:${apiPort}`,
				changeOrigin: true,
				secure: false,
				xfwd: true,
			},
		},
	},
});
