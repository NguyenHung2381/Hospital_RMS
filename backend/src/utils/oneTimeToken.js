const redis = require('../config/redis');

// Đánh dấu 1 token (theo jti) đã được dùng — lần đầu trả true, các lần sau
// false. Dùng cho token chỉ được tiêu thụ đúng 1 lần (vé mở SSE...), để token
// lỡ lộ (log proxy, lịch sử trình duyệt) không dùng lại được.
//
// Redis (SET NX EX) để mọi instance cùng thấy; Redis không sẵn sàng thì rơi về
// bộ nhớ của tiến trình — vẫn chặn dùng lại trên cùng instance.
const memory = new Map(); // key → hết hạn (ms)
const MAX_MEMORY_KEYS = 50_000;

const consumeInMemory = (key, ttlSec) => {
	const now = Date.now();
	if (memory.size >= MAX_MEMORY_KEYS) {
		for (const [k, exp] of memory) if (exp <= now) memory.delete(k);
		if (memory.size >= MAX_MEMORY_KEYS) memory.clear();
	}
	const exp = memory.get(key);
	if (exp && exp > now) return false;
	memory.set(key, now + ttlSec * 1000);
	return true;
};

const consumeOnce = async (namespace, jti, ttlSec) => {
	if (!jti) return false;
	const key = `once:${namespace}:${jti}`;
	try {
		return (await redis.set(key, '1', 'EX', ttlSec, 'NX')) === 'OK';
	} catch {
		return consumeInMemory(key, ttlSec);
	}
};

module.exports = { consumeOnce };
