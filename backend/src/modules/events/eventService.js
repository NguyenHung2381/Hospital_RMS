const redis = require('../../config/redis');

// Kết nối SSE đang mở của TIẾN TRÌNH này. Chạy nhiều worker (src/cluster.js)
// thì mỗi worker chỉ giữ client kết nối vào nó — sự kiện được phát qua Redis
// pub/sub (kênh CHANNEL) để worker nào cũng nhận và đẩy tới client của mình.
const clients = new Set();
const perUser = new Map(); // userId → số kết nối đang mở

// Mỗi tab đang mở giữ 1 kết nối. Giới hạn để 1 tài khoản (hoặc token bị lộ)
// không mở hàng nghìn kết nối giữ socket / bộ nhớ của server.
const MAX_PER_USER = Number(process.env.SSE_MAX_PER_USER) || 10;

// Thêm client; trả false nếu user đã đủ MAX_PER_USER kết nối (không thêm).
const addClient = (res, userId) => {
	const n = perUser.get(userId) || 0;
	if (n >= MAX_PER_USER) return false;
	perUser.set(userId, n + 1);
	res.rmsUserId = userId;
	clients.add(res);
	return true;
};

const removeClient = (res) => {
	if (!clients.delete(res)) return; // gọi 2 lần (lỗi ghi + 'close') chỉ trừ 1 lần
	const n = (perUser.get(res.rmsUserId) || 1) - 1;
	if (n > 0) perUser.set(res.rmsUserId, n);
	else perUser.delete(res.rmsUserId);
};

// ─── Phát qua Redis giữa các worker ──────────────────────────────────────────
// Không lọc tin do chính mình gửi: worker phát cũng nhận lại qua subscriber và
// đẩy cho client của nó, nên mỗi tin chỉ được gửi đúng 1 lần ở mỗi worker.
// Redis / subscriber chưa sẵn sàng → gửi thẳng cho client cục bộ (fail-open
// như utils/cacheBus.js: realtime chỉ còn trong phạm vi worker hiện tại).
const CHANNEL = 'rms:events';
let subscriber = null;
let subscriberReady = false;

const ensureSubscriber = () => {
	if (subscriber) return;
	// Kết nối ở chế độ subscribe không chạy được lệnh thường → cần kết nối riêng.
	subscriber = redis.duplicate();
	subscriber.on('error', () => {}); // redis.js đã log trạng thái kết nối
	subscriber.on('ready', () => {
		subscriber
			.subscribe(CHANNEL)
			.then(() => {
				subscriberReady = true;
			})
			.catch(() => {});
	});
	subscriber.on('close', () => {
		subscriberReady = false;
	});
	subscriber.on('message', (channel, payload) => {
		if (channel === CHANNEL) send(payload);
	});
	subscriber.connect().catch(() => {});
};
ensureSubscriber();

const publish = (payload) => {
	if (!subscriberReady || redis.status !== 'ready') return send(payload);
	redis.publish(CHANNEL, payload).catch(() => send(payload));
};

// Gộp sự kiện trùng phát ra liên tiếp: import Excel N dòng hay xoá hàng loạt N
// bản ghi gọi broadcast N lần cho cùng 1 entity → mọi tab đang mở tải lại
// danh sách N lần. Trong cửa sổ COALESCE_MS chỉ gửi 1 lần (ở cuối cửa sổ, sau
// khi dữ liệu đã ghi xong), đổi lại độ trễ realtime ~200ms không đáng kể.
const COALESCE_MS = 200;
const pending = new Set();

const broadcast = (event, data) => {
	const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
	if (pending.has(payload)) return;
	pending.add(payload);
	setTimeout(() => {
		pending.delete(payload);
		publish(payload);
	}, COALESCE_MS);
};

const send = (payload) => {
	for (const client of clients) {
		try {
			client.write(payload);
		} catch {
			// Client đã ngắt kết nối nhưng chưa kịp fire 'close' event
			removeClient(client);
		}
	}
};

module.exports = { addClient, removeClient, broadcast, MAX_PER_USER };
