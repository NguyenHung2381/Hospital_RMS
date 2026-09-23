const Redis = require('ioredis');

// Redis ở đây chỉ đóng vai trò cache phụ (cache-aside) cho dữ liệu đọc nặng —
// KHÔNG phải nguồn dữ liệu chính. Vì vậy client phải "fail-open": Redis chết
// hoặc chưa kết nối kịp không được làm chậm/crash request, mọi lỗi rơi xuống
// fallback đọc thẳng MSSQL ở utils/cache.js.
const redis = new Redis({
	host: process.env.REDIS_HOST || 'localhost',
	port: parseInt(process.env.REDIS_PORT) || 6379,
	// Đừng để 1 request chờ retry Redis lâu — thử 1 lần, lỗi thì fallback DB ngay.
	maxRetriesPerRequest: 1,
	// Mất kết nối thì reject ngay thay vì xếp hàng chờ (mặc định ioredis sẽ
	// queue lệnh vô thời hạn cho tới khi reconnect — không phù hợp cho cache).
	enableOfflineQueue: false,
	retryStrategy: (times) => Math.min(times * 1000, 10000),
	lazyConnect: true,
});

// Chỉ log 1 lần khi mất kết nối, tránh spam log khi Redis down kéo dài
// (retryStrategy vẫn tiếp tục thử ngầm ở background).
let warned = false;
redis.on('error', (err) => {
	if (!warned) {
		console.warn('[Cache] Redis không sẵn sàng — tạm thời đọc thẳng DB:', err.message);
		warned = true;
	}
});
redis.on('ready', () => {
	if (warned) console.log('[Cache] Redis đã kết nối lại.');
	warned = false;
});

// Kết nối nền — không chặn server khởi động nếu Redis chưa sẵn sàng.
redis.connect().catch(() => {});

module.exports = redis;
