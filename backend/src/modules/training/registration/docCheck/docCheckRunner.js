// Chạy phân tích file hồ sơ trong 1 worker thread dùng lại giữa các lần (nạp mupdf WASM 1 lần).
// Mỗi lần 1 việc (docCheckWorker gọi tuần tự). Quá hạn ⇒ dừng hẳn luồng, lần sau tạo luồng mới.
const path = require('path');
const { Worker } = require('worker_threads');

const TIMEOUT_MS = 3 * 60_000;
const THREAD_FILE = path.join(__dirname, 'docCheckThread.js');

/** @type {Worker | null} */
let worker = null;
let seq = 0;

const getWorker = () => {
	if (worker) return worker;
	// Giới hạn heap JS của luồng (bộ nhớ WASM của mupdf tính riêng) — container dev chỉ 640MB
	const w = new Worker(THREAD_FILE, { resourceLimits: { maxOldGenerationSizeMb: 160 } });
	w.unref(); // không giữ tiến trình sống chỉ vì luồng này
	const drop = () => {
		if (worker === w) worker = null;
	};
	w.on('exit', drop);
	w.on('error', drop);
	worker = w;
	return w;
};

/**
 * @param {Parameters<typeof import('./docCheckAnalyzer').analyze>[0]} input
 * @returns {ReturnType<typeof import('./docCheckAnalyzer').analyze>}
 */
const run = (input) =>
	new Promise((resolve, reject) => {
		const w = getWorker();
		const id = ++seq;
		const cleanup = () => {
			clearTimeout(timer);
			w.off('message', onMessage);
			w.off('error', onError);
			w.off('exit', onExit);
		};
		const onMessage = (msg) => {
			if (msg?.id !== id) return;
			cleanup();
			if (msg.error) reject(new Error(msg.error));
			else resolve(msg.result);
		};
		const onError = (err) => {
			cleanup();
			reject(err);
		};
		const onExit = (code) => {
			cleanup();
			reject(new Error(`Luồng kiểm tra hồ sơ dừng bất thường (mã ${code}).`));
		};
		const timer = setTimeout(() => {
			cleanup();
			if (worker === w) worker = null;
			w.terminate().catch(() => {});
			reject(new Error('Kiểm tra hồ sơ quá thời gian.'));
		}, TIMEOUT_MS);
		w.on('message', onMessage);
		w.once('error', onError);
		w.once('exit', onExit);
		w.postMessage({ id, input });
	});

/** Dừng luồng (tắt server / test). */
const stop = async () => {
	const w = worker;
	worker = null;
	if (w) await w.terminate();
};

module.exports = { run, stop };
