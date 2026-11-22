// Worker thread chạy docCheckAnalyzer.analyze — mupdf (WASM) + jsQR chạy đồng bộ, tách khỏi
// luồng chính để không chặn API. docCheckRunner.js tạo / gửi việc / dừng luồng này.
const { parentPort } = require('worker_threads');
const { analyze } = require('./docCheckAnalyzer');

parentPort?.on('message', async ({ id, input }) => {
	try {
		parentPort?.postMessage({ id, result: await analyze(input) });
	} catch (err) {
		parentPort?.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
	}
});
