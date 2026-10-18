const Redis = require('ioredis');
const { config } = require('./env');
const logger = require('./logger');

// Redis ở đây chỉ đóng vai trò cache phụ (cache-aside) cho dữ liệu đọc nặng —
// KHÔNG phải nguồn dữ liệu chính. Vì vậy client phải "fail-open": Redis chết
// hoặc chưa kết nối kịp không được làm chậm/crash request, mọi lỗi rơi xuống
// fallback đọc thẳng MSSQL ở utils/cache.js.
const redis = new Redis({
	host: config.REDIS_HOST,
	port: config.REDIS_PORT,
	// Khớp --requirepass của container redis (docker-compose.prod.yml). Không đặt
	// = không xác thực (dev). duplicate() ở utils/cacheBus.js kế thừa luôn.
	password: config.REDIS_PASSWORD,
	// Đừng để 1 request chờ retry Redis lâu — thử 1 lần, lỗi thì fallback DB ngay.
	maxRetriesPerRequest: 1,
	// Mất kết nối thì reject ngay thay vì xếp hàng chờ (mặc định ioredis sẽ
	// queue lệnh vô thời hạn cho tới khi reconnect — không phù hợp cho cache).
	enableOfflineQueue: false,
	// Thử lại nhanh lúc đầu (200ms, 400ms, 800ms…) để vừa khởi động là có cache
	// ngay khi Redis lên, sau đó giãn dần tới 10s khi Redis down lâu.
	retryStrategy: (times) => Math.min(200 * 2 ** (times - 1), 10000),
	// Redis còn kết nối nhưng treo/quá tải: không lệnh nào được giữ request quá
	// 500ms (bình thường < 1ms) — hết giờ thì reject, caller fallback như lỗi.
	commandTimeout: 500,
	connectTimeout: 5000,
	// Gộp các lệnh phát ra trong cùng 1 vòng event loop thành 1 round-trip
	// (vd GET + PTTL ở utils/cache.js, nhiều request đồng thời).
	enableAutoPipelining: true,
	lazyConnect: true,
});

// Lúc khởi động (docker compose up, Redis restart cùng lúc với backend) Node
// thường chạy trước khi Redis nhận kết nối — vài lần ECONNREFUSED / ENOTFOUND
// đầu tiên là bình thường, retryStrategy sẽ tự nối lại sau vài trăm ms. Trước
// đây lỗi đầu tiên đó được in ngay thành cảnh báo ở MỌI tiến trình (primary +
// từng worker) dù chỉ chốc lát sau đã kết nối được. Giờ chỉ cảnh báo khi:
//   - hết STARTUP_GRACE_MS mà vẫn chưa kết nối được, hoặc
//   - lỗi xác thực (sai/thiếu mật khẩu — chờ thêm cũng không tự hết), hoặc
//   - mất kết nối SAU khi đã từng kết nối thành công.
// Chỉ log 1 lần mỗi đợt mất kết nối, tránh spam khi Redis down kéo dài.
const STARTUP_GRACE_MS = 15_000;
const isAuthError = (err) => /NOAUTH|WRONGPASS|ERR AUTH|invalid password/i.test(err?.message || '');
// Windows/Node mới: ECONNREFUSED tới localhost là AggregateError (IPv4 + IPv6)
// với message rỗng — lấy code để log còn đọc được.
const describe = (err) => err?.message || err?.code || err?.errors?.[0]?.message || String(err);

let everReady = false;
let warned = false;
let lastError = null;

const warn = (err) => {
	if (warned) return;
	warned = true;
	logger.warn('[Cache] Redis không sẵn sàng — tạm thời đọc thẳng DB:', describe(err));
};

redis.on('error', (err) => {
	lastError = err;
	if (everReady || isAuthError(err)) warn(err);
});
redis.on('ready', () => {
	if (warned) logger.info('[Cache] Redis đã kết nối lại.');
	// Log 1 dòng xác nhận cache đang chạy — chỉ ở tiến trình chính, worker của
	// src/cluster.js im lặng để log không lặp lại N lần.
	else if (!everReady && !process.env.CLUSTER_WORKER) logger.info('[Cache] Đã kết nối Redis.');
	warned = false;
	everReady = true;
});

setTimeout(() => {
	if (redis.status !== 'ready') warn(lastError ?? new Error(`trạng thái kết nối: ${redis.status}`));
}, STARTUP_GRACE_MS).unref();

// Kết nối nền — không chặn server khởi động nếu Redis chưa sẵn sàng.
redis.connect().catch(() => {});

module.exports = redis;
