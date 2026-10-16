const redis = require('../config/redis');
const cacheBus = require('./cacheBus');

// Cache-aside 2 tầng cho dữ liệu đọc nặng (bảng lookup, dashboard, trang công
// khai). MSSQL vẫn là nguồn dữ liệu chính, cache chỉ là tối ưu:
//
//   L1 — Map trong RAM từng process: trúng là trả ngay, không tốn round-trip
//        mạng tới Redis. TTL ngắn (≤ L1_MAX_MS) và không vượt TTL còn lại của
//        key trên Redis, để giới hạn độ trễ khi Redis down (cacheBus không phát
//        được lệnh xoá sang worker khác).
//   L2 — Redis, dùng chung giữa các worker / instance (utils/cacheBus.js phát
//        lệnh xoá L1 sang worker khác sau mỗi lần ghi).
//
// Mọi lỗi Redis đều bị nuốt — Redis chết thì L1 vẫn chạy, miss thì đọc DB.
//
// L1 giữ CHUỖI JSON chứ không giữ object: mỗi lần trả về là 1 bản JSON.parse
// riêng, caller có sửa kết quả cũng không làm bẩn cache. Lần miss cũng trả bản
// đã parse để kết quả luôn cùng dạng dù trúng hay trượt cache (vd cột ngày là
// chuỗi ISO, không lúc Date lúc chuỗi).
const L1_MAX_MS = 30_000;
const L1_MAX_ENTRIES = 1000;

const l1 = new Map(); // key → { raw, exp }
// key → Promise<raw>: nhiều request cùng trượt 1 key (vd dashboard vừa hết
// hạn lúc đông người) chỉ chạy fn() MỘT lần trong process, các request còn lại
// chờ chung kết quả — tránh dồn N query nặng vào MSSQL cùng lúc (cache stampede).
const inflight = new Map();
// Tăng mỗi lần invalidate: lượt đọc DB bắt đầu TRƯỚC khi có ghi thì kết quả có
// thể đã cũ — không được ghi đè lại vào cache sau khi vừa xoá.
let epoch = 0;

const l1Get = (key) => {
	const entry = l1.get(key);
	if (!entry) return null;
	if (entry.exp <= Date.now()) {
		l1.delete(key);
		return null;
	}
	return entry.raw;
};

const l1Set = (key, raw, ttlMs) => {
	l1.delete(key); // đưa về cuối thứ tự chèn — key cũ nhất nằm đầu Map
	if (l1.size >= L1_MAX_ENTRIES) l1.delete(l1.keys().next().value);
	l1.set(key, { raw, exp: Date.now() + Math.min(ttlMs, L1_MAX_MS) });
};

const load = async (key, ttlSeconds, fn) => {
	const startEpoch = epoch;
	try {
		// enableAutoPipelining (config/redis.js) gộp 2 lệnh vào 1 round-trip.
		const [raw, pttl] = await Promise.all([redis.get(key), redis.pttl(key)]);
		if (raw !== null) {
			if (epoch === startEpoch) l1Set(key, raw, pttl > 0 ? pttl : ttlSeconds * 1000);
			return raw;
		}
	} catch {
		/* Redis lỗi/chưa kết nối — bỏ qua, đọc thẳng DB bên dưới */
	}

	const raw = JSON.stringify(await fn());
	if (raw === undefined) return undefined; // fn() trả undefined — không cache
	if (epoch === startEpoch) {
		l1Set(key, raw, ttlSeconds * 1000);
		redis.set(key, raw, 'EX', ttlSeconds).catch(() => {});
	}
	return raw;
};

const remember = async (key, ttlSeconds, fn) => {
	let raw = l1Get(key);
	if (raw === null) {
		let pending = inflight.get(key);
		if (!pending) {
			pending = load(key, ttlSeconds, fn).finally(() => {
				if (inflight.get(key) === pending) inflight.delete(key);
			});
			inflight.set(key, pending);
		}
		raw = await pending;
	}
	return raw === undefined ? undefined : JSON.parse(raw);
};

// Xoá L1 + lượt đọc đang chạy của prefix (null = tất cả) trong process này.
const clearLocal = (prefix) => {
	epoch++;
	for (const k of l1.keys()) if (!prefix || k.startsWith(prefix)) l1.delete(k);
	for (const k of inflight.keys()) if (!prefix || k.startsWith(prefix)) inflight.delete(k);
};
cacheBus.register('redisCache', clearLocal);

// Xoá mọi key khớp prefix (vd sau khi ghi dữ liệu lookup) ở cả 2 tầng. Redis
// dùng SCAN thay vì KEYS để không block; UNLINK giải phóng bộ nhớ ở luồng nền.
// Thứ tự quan trọng: xoá Redis XONG mới báo worker khác xoá L1 — báo trước thì
// worker kia có thể kịp đọc lại bản cũ từ Redis vào L1 (giữ thêm tới 30s).
const invalidate = async (prefix) => {
	clearLocal(prefix);
	try {
		const pattern = `${prefix}*`;
		let cursor = '0';
		do {
			const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 1000);
			cursor = next;
			if (keys.length) await redis.unlink(...keys);
		} while (cursor !== '0');
	} catch {
		/* Redis lỗi — cache tự hết hạn theo TTL, không cần chặn request ghi */
	}
	clearLocal(prefix); // request khác có thể vừa nạp lại bản cũ trong lúc SCAN
	cacheBus.publish('redisCache', prefix);
};

module.exports = { remember, invalidate };
