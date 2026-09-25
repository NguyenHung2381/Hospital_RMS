const redis = require('../config/redis');

// Hạn mức dung lượng upload mỗi tài khoản mỗi ngày (UPLOAD_DAILY_QUOTA_MB, mặc
// định 2048MB; 0 = không giới hạn) — chặn 1 tài khoản (bị chiếm, hoặc script lỗi)
// upload liên tục làm đầy ổ đĩa máy chủ. Đếm trên Redis (dùng chung giữa các
// instance), Redis lỗi thì đếm trong bộ nhớ tiến trình.
const memory = new Map(); // key → bytes

const quotaBytes = () => {
	const mb = Number(process.env.UPLOAD_DAILY_QUOTA_MB ?? 2048);
	return Number.isFinite(mb) && mb > 0 ? mb * 1024 * 1024 : 0;
};

// Ngày theo giờ Việt Nam — hạn mức làm mới lúc 0h
const dayKey = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
const keyOf = (userId) => `upload-quota:${userId}:${dayKey()}`;

const used = async (userId) => {
	try {
		return Number(await redis.get(keyOf(userId))) || 0;
	} catch {
		return memory.get(keyOf(userId)) || 0;
	}
};

const add = async (userId, bytes) => {
	const k = keyOf(userId);
	try {
		await redis.multi().incrby(k, bytes).expire(k, 2 * 24 * 3600).exec();
	} catch {
		if (memory.size > 10_000) memory.clear();
		memory.set(k, (memory.get(k) || 0) + bytes);
	}
};

module.exports = { quotaBytes, used, add };
