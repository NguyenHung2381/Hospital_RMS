const http = require('http');

const PORTS = [3000, 3001, 3002, 3003];
const TIMEOUT_MS = 30000;
const POLL_MS = 500;

function check(port) {
	return new Promise((resolve) => {
		const req = http.get(
			{ hostname: 'localhost', port, path: '/health', timeout: 1000 },
			() => resolve(true),
		);
		req.on('error', () => resolve(false));
		req.on('timeout', () => { req.destroy(); resolve(false); });
	});
}

(async () => {
	const deadline = Date.now() + TIMEOUT_MS;
	while (Date.now() < deadline) {
		for (const port of PORTS) {
			if (await check(port)) {
				console.log(`[wait-server] Server sẵn sàng trên port ${port}`);
				process.exit(0);
			}
		}
		await new Promise((r) => setTimeout(r, POLL_MS));
	}
	console.error('[wait-server] Timeout: server không khởi động sau 30 giây');
	process.exit(1);
})();
