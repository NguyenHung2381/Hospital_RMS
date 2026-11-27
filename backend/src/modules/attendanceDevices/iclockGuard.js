/**
 * iclockGuard.js — chốt chặn cho /iclock (rà bảo mật 2026-11-26, S-01).
 *
 * Giao thức ADMS của máy (firmware Ver 6.60) không có xác thực: máy chỉ gửi số serial,
 * in trên tem máy. Máy di chuyển giữa các khoa nên IP đổi liên tục, nhưng luôn ở trong
 * mạng nội bộ của viện. Vì vậy:
 *   Lớp 1  ipGate — chỉ nhận /iclock từ ICLOCK_ALLOWED_CIDRS (mặc định 192.168.0.0/16;
 *          KHÔNG gồm dải máy chủ 172.16.0.0/12, Docker, 127.0.0.1). Request mang IP của
 *          chính proxy (ICLOCK_PROXY_IPS) ⇒ backend chưa nhận được IP thật của máy
 *          (TRUSTED_PROXIES ở nginx chưa khai proxy) ⇒ chặn luôn, không cho qua.
 *   Lớp 2  ipChange — cùng số serial gọi xen kẽ từ 2 IP (IP cũ quay lại trong
 *          ICLOCK_IP_FLIP_MIN phút sau khi đổi) ⇒ có máy thứ hai dùng cùng serial.
 *          Máy chuyển chỗ chỉ đổi IP 1 lần rồi ở yên ⇒ không bị coi là giả.
 *   Lớp 3  ICLOCK_IP_HOLD_MIN phút sau khi đổi IP chưa giao lệnh (mẫu vân tay, thông tin
 *          học viên): nếu đó là máy giả, máy thật gọi lại trong lúc giữ ⇒ lớp 2 khoá trước.
 * Biến đọc lúc chạy (như ICLOCK_DEBUG_RAW) — xem backend/.env.example, infra/may-cham-cong.md.
 */
const logger = require('../../config/logger');
const securityEvents = require('../audit/securityEventService');
const oneTimeToken = require('../../utils/oneTimeToken');
const { normalizeIp } = require('../../utils/activityDescribe');
const { ipAllowed, parseCidr, splitList } = require('../../utils/attendancePolicy');

const DEFAULT_ALLOWED = '192.168.0.0/16';
const BLOCK_LOG_SEC = 600; // mỗi IP bị chặn ghi security_events tối đa 1 lần / 10 phút

const minutes = (name, fallback) => {
	const n = Number(process.env[name]);
	return Number.isFinite(n) && n > 0 ? n : fallback;
};
const flipMinutes = () => minutes('ICLOCK_IP_FLIP_MIN', 10);
const holdMinutes = () => minutes('ICLOCK_IP_HOLD_MIN', 5);

// Parse lại khi chuỗi cấu hình đổi (test / đổi .env rồi khởi động lại)
let cache = { raw: null, ranges: [], proxies: new Set() };
const policy = () => {
	const allowedRaw = process.env.ICLOCK_ALLOWED_CIDRS?.trim() || DEFAULT_ALLOWED;
	const proxyRaw = process.env.ICLOCK_PROXY_IPS || '';
	const raw = `${allowedRaw}|${proxyRaw}`;
	if (cache.raw !== raw) {
		const entries = splitList(allowedRaw);
		const ranges = entries.map(parseCidr).filter(Boolean);
		if (ranges.length !== entries.length)
			logger.warn(`[iclock] ICLOCK_ALLOWED_CIDRS có mục không hợp lệ — bỏ qua: ${allowedRaw}`);
		// Không còn dải nào hợp lệ ⇒ ranges rỗng ⇒ chặn hết (fail-closed)
		cache = { raw, ranges, proxies: new Set(splitList(proxyRaw).map(normalizeIp)) };
	}
	return cache;
};

const logBlocked = async (ip, sn, reason) => {
	if (!(await oneTimeToken.consumeOnce('iclock-ip-blocked', ip || 'unknown', BLOCK_LOG_SEC)))
		return;
	const proxy = reason === 'proxy';
	const msg = proxy
		? `Request /iclock mang IP của proxy (${ip}) — backend chưa nhận được IP thật của máy chấm công. Khai IP proxy vào TRUSTED_PROXIES (nginx)`
		: `Chặn /iclock từ IP ngoài dải cho phép (${ip || 'không rõ'})${sn ? `, SN ${sn}` : ''}`;
	(proxy ? logger.error : logger.warn)(`[iclock] ${msg}`);
	await securityEvents.log({
		eventType: 'iclock_ip_blocked',
		targetType: 'attendance_device',
		targetId: sn ? String(sn).slice(0, 50) : null,
		ip,
		detail: msg.slice(0, 1000),
	});
};

/** Lớp 1 — middleware đặt trước mọi xử lý số serial (và trước khi đọc body) */
const ipGate = (req, res, next) => {
	const ip = normalizeIp(req.ip);
	const { ranges, proxies } = policy();
	const reason = !ip || proxies.has(ip) ? 'proxy' : !ipAllowed(ip, ranges) ? 'outside' : null;
	if (!reason) return next();
	const sn = String(req.query.SN || req.query.sn || '') || null;
	logBlocked(ip, sn, reason).catch(() => {});
	res.status(403).type('text/plain').send('ERROR: forbidden');
};

/**
 * Lớp 2 — so IP lần này với IP đang lưu của máy. `device` đọc kèm cờ
 * ip_change_recent (đổi IP trong ICLOCK_IP_FLIP_MIN phút) — xem iclockService.findDevice.
 * @param {{ last_ip: string|null, prev_ip: string|null, ip_change_recent?: boolean }} device
 * @param {string|null} ip
 */
const ipChange = (device, ip) => {
	const addr = normalizeIp(ip);
	if (!addr || !device.last_ip || addr === device.last_ip)
		return { changed: false, conflict: false };
	return { changed: true, conflict: !!device.ip_change_recent && addr === device.prev_ip };
};

module.exports = { ipGate, ipChange, flipMinutes, holdMinutes };
