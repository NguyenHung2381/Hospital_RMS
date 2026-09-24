const crypto = require('crypto');
const redis = require('../config/redis');

// Kênh báo xoá cache trong bộ nhớ giữa các instance backend (Redis pub/sub).
// permissionCache / userStatusCache nằm trong RAM từng process: chạy nhiều
// instance (scale ngang, PM2 cluster) thì đổi quyền / khoá tài khoản ở instance
// A chỉ xoá cache của A — B vẫn dùng dữ liệu cũ tới hết TTL (60s–5 phút).
// Mỗi lệnh clear() cục bộ được phát lên kênh này; instance khác nhận thì xoá
// theo. Redis không sẵn sàng → fail-open: vẫn xoá cục bộ, instance khác tự hết
// hạn theo TTL như trước (không chặn request, không ném lỗi).
const CHANNEL = 'rms:cache-invalidate';
const INSTANCE_ID = crypto.randomUUID();

const handlers = new Map(); // tên cache → (key | null) => void
let subscriber = null;

const ensureSubscriber = () => {
	if (subscriber) return;
	// Kết nối ở chế độ subscribe không chạy được lệnh thường → cần kết nối riêng.
	subscriber = redis.duplicate();
	subscriber.on('error', () => {}); // redis.js đã log trạng thái kết nối
	subscriber.on('ready', () => {
		subscriber.subscribe(CHANNEL).catch(() => {});
	});
	subscriber.on('message', (channel, raw) => {
		if (channel !== CHANNEL) return;
		let msg;
		try {
			msg = JSON.parse(raw);
		} catch {
			return;
		}
		if (msg.from === INSTANCE_ID) return;
		handlers.get(msg.cache)?.(msg.key ?? null);
	});
	subscriber.connect().catch(() => {});
};

// Đăng ký cache `name`: `clearLocal(key)` được gọi khi instance khác báo xoá.
const register = (name, clearLocal) => {
	handlers.set(name, clearLocal);
	ensureSubscriber();
};

// Báo các instance khác xoá `key` của cache `name` (key null = xoá hết).
const publish = (name, key = null) => {
	if (redis.status !== 'ready') return;
	redis
		.publish(CHANNEL, JSON.stringify({ from: INSTANCE_ID, cache: name, key }))
		.catch(() => {});
};

module.exports = { register, publish };
