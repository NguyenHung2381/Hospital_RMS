const redis = require('../config/redis');

// Cache-aside đơn giản: đọc Redis trước, miss thì gọi fn() (thường là query
// MSSQL), rồi ghi lại vào Redis với TTL. Mọi lỗi Redis đều bị nuốt — cache là
// tối ưu, không phải yêu cầu bắt buộc để request thành công.
const remember = async (key, ttlSeconds, fn) => {
	try {
		const cached = await redis.get(key);
		if (cached !== null) return JSON.parse(cached);
	} catch {
		/* Redis lỗi/chưa kết nối — bỏ qua, đọc thẳng DB bên dưới */
	}

	const fresh = await fn();

	redis.set(key, JSON.stringify(fresh), 'EX', ttlSeconds).catch(() => {});
	return fresh;
};

// Xoá mọi key khớp prefix (vd sau khi ghi dữ liệu lookup) bằng SCAN thay vì
// KEYS để không block Redis. Tập key thuộc 1 bảng lookup luôn nhỏ nên chi phí
// SCAN không đáng kể.
const invalidate = async (prefix) => {
	try {
		const pattern = `${prefix}*`;
		let cursor = '0';
		do {
			const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
			cursor = next;
			if (keys.length) await redis.del(...keys);
		} while (cursor !== '0');
	} catch {
		/* Redis lỗi — cache tự hết hạn theo TTL, không cần chặn request ghi */
	}
};

module.exports = { remember, invalidate };
