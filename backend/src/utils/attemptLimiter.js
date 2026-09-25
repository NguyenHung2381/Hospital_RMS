const crypto = require('crypto');
const redis = require('../config/redis');

// Đếm số lần thử theo 1 khoá bất kỳ (không theo IP) trong cửa sổ thời gian —
// bổ sung cho express-rate-limit (theo IP): kẻ dò quét đổi IP liên tục vẫn bị
// chặn khi cứ nhắm vào cùng 1 đối tượng (vd cùng 1 số CCCD).
// Khoá được băm trước khi lưu — Redis/log không chứa dữ liệu cá nhân gốc.
// Redis không sẵn sàng thì đếm trong bộ nhớ tiến trình.
const memory = new Map(); // key → { count, resetAt }
const MAX_MEMORY_KEYS = 50_000;

const hashKey = (namespace, key) =>
	`limit:${namespace}:${crypto.createHash('sha256').update(String(key)).digest('hex').slice(0, 32)}`;

const hitInMemory = (k, windowSec) => {
	const now = Date.now();
	let entry = memory.get(k);
	if (!entry || entry.resetAt <= now) {
		if (memory.size >= MAX_MEMORY_KEYS) memory.clear();
		entry = { count: 0, resetAt: now + windowSec * 1000 };
		memory.set(k, entry);
	}
	entry.count += 1;
	return entry.count;
};

// Ghi nhận 1 lần thử; trả true nếu VẪN trong giới hạn (≤ max lần / windowSec).
const hit = async (namespace, key, max, windowSec) => {
	const k = hashKey(namespace, key);
	let count;
	try {
		count = await redis.incr(k);
		if (count === 1) await redis.expire(k, windowSec);
	} catch {
		count = hitInMemory(k, windowSec);
	}
	return count <= max;
};

module.exports = { hit };
