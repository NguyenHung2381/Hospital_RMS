const expressRateLimit = require('express-rate-limit');
const redis = require('../config/redis');

// express-rate-limit mặc định đếm trong bộ nhớ của TIẾN TRÌNH: chạy nhiều
// instance backend thì mỗi instance đếm riêng (giới hạn thực tế nhân lên theo
// số instance), và mỗi lần tiến trình khởi động lại (deploy, crash → Docker tự
// bật lại) là bộ đếm về 0 — kẻ dò mật khẩu được "làm lại từ đầu".
//
// Store này đếm trên Redis (dùng chung, sống qua lần khởi động lại). Redis không
// sẵn sàng thì tự rơi về bộ nhớ tiến trình như trước — không bao giờ bỏ giới hạn
// (fail-open) chỉ vì mất cache.
class RedisWithMemoryFallbackStore {
	constructor(name) {
		this.prefix = `rl:${name}:`;
		this.memory = new expressRateLimit.MemoryStore();
		// Bộ đếm dùng chung giữa các instance
		this.localKeys = false;
	}

	init(options) {
		this.windowMs = options.windowMs;
		this.memory.init(options);
	}

	async increment(key) {
		const k = this.prefix + key;
		try {
			// exec() trả [[err, kết quả], ...] theo thứ tự lệnh: incr → số lượt, pttl → ms còn lại
			const [[incrErr, hits], [ttlErr, ttl]] =
				/** @type {[[Error|null, number], [Error|null, number]]} */ (
					await redis.multi().incr(k).pttl(k).exec()
				);
			if (incrErr || ttlErr) throw incrErr || ttlErr;
			let msLeft = ttl;
			// Key mới (chưa có hạn) → đặt hạn = cửa sổ thời gian
			if (msLeft < 0) {
				await redis.pexpire(k, this.windowMs);
				msLeft = this.windowMs;
			}
			return { totalHits: hits, resetTime: new Date(Date.now() + msLeft) };
		} catch {
			return this.memory.increment(key);
		}
	}

	async decrement(key) {
		try {
			await redis.decr(this.prefix + key);
		} catch {
			await this.memory.decrement(key);
		}
	}

	async resetKey(key) {
		try {
			await redis.del(this.prefix + key);
		} catch {
			// bỏ qua — vẫn xoá bộ đếm dự phòng bên dưới
		}
		await this.memory.resetKey(key);
	}
}

// Dùng thay cho require('express-rate-limit'): cùng tuỳ chọn, thêm `name`
// (bắt buộc, duy nhất) làm tiền tố key trên Redis.
const rateLimit = ({ name, ...options }) => {
	if (!name) throw new Error('[rateLimit] thiếu name');
	return expressRateLimit.rateLimit({
		...options,
		store: /** @type {any} */ (new RedisWithMemoryFallbackStore(name)),
	});
};

module.exports = rateLimit;
module.exports.RedisWithMemoryFallbackStore = RedisWithMemoryFallbackStore;
