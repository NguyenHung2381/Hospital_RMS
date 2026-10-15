const net = require('net');
const systemSettingService = require('../services/systemSettingService');
const { normalizeIp } = require('./activityDescribe');

// Chấm công nhân viên: phải ĐỒNG THỜI (1) gọi từ IP mạng bệnh viện và (2) có
// vị trí GPS trong bán kính quanh bệnh viện. Admin chỉnh ở Cấu hình hệ thống →
// tab "Chấm công". Thiếu cấu hình = không ai chấm được (an toàn hơn cho qua).
//   ATTENDANCE_ALLOWED_IPS     "113.161.1.2, 10.0.0.0/8" — IP/CIDR, IPv4 hoặc IPv6
//   ATTENDANCE_LOCATION        "10.7769, 106.7009" — dán từ Google Maps
//   ATTENDANCE_RADIUS_M        bán kính cho phép (m)
//   ATTENDANCE_MAX_ACCURACY_M  sai số GPS tối đa (m) — trong nhà GPS hay lệch 30–100m
const DEFAULT_RADIUS_M = 200;
const DEFAULT_MAX_ACCURACY_M = 100;

const splitList = (raw) => String(raw ?? '').split(/[\s,;]+/).filter(Boolean);

// '10.0.0.0/8' → { address, prefix, type } | null
const parseCidr = (entry) => {
	const [address, prefixRaw] = entry.split('/');
	const v = net.isIP(address);
	if (!v) return null;
	const max = v === 4 ? 32 : 128;
	const prefix = prefixRaw === undefined ? max : Number(prefixRaw);
	if (!Number.isInteger(prefix) || prefix < 0 || prefix > max) return null;
	return { address, prefix, type: v === 4 ? 'ipv4' : 'ipv6' };
};

const parseLocation = (raw) => {
	const parts = String(raw ?? '').split(',').map((s) => Number(s.trim()));
	if (parts.length !== 2 || parts.some((n) => !Number.isFinite(n))) return null;
	const [lat, lng] = parts;
	return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
};

const positiveInt = (raw, max) => {
	const n = Number(raw);
	return Number.isInteger(n) && n > 0 && n <= max ? n : null;
};

// null = hợp lệ; ngược lại là thông báo lỗi (dùng khi admin lưu cấu hình)
const validateSetting = (key, value) => {
	if (value === null || value === '') return null;
	if (key === 'ATTENDANCE_ALLOWED_IPS') {
		const bad = splitList(value).filter((e) => !parseCidr(e));
		return bad.length ? `IP/dải IP không hợp lệ: ${bad.join(', ')}` : null;
	}
	if (key === 'ATTENDANCE_LOCATION')
		return parseLocation(value) ? null : 'Toạ độ phải dạng "vĩ độ, kinh độ", vd 10.7769, 106.7009';
	if (key === 'ATTENDANCE_RADIUS_M') return positiveInt(value, 10000) ? null : 'Bán kính phải là số nguyên 1–10000 m';
	if (key === 'ATTENDANCE_MAX_ACCURACY_M') return positiveInt(value, 5000) ? null : 'Sai số phải là số nguyên 1–5000 m';
	return null;
};

const getPolicy = async () => {
	const [ips, loc, radius, acc] = await Promise.all(
		['ATTENDANCE_ALLOWED_IPS', 'ATTENDANCE_LOCATION', 'ATTENDANCE_RADIUS_M', 'ATTENDANCE_MAX_ACCURACY_M'].map((k) =>
			systemSettingService.getValue(k),
		),
	);
	return {
		ipRanges: splitList(ips).map(parseCidr).filter(Boolean),
		location: parseLocation(loc),
		radiusM: positiveInt(radius, 10000) ?? DEFAULT_RADIUS_M,
		maxAccuracyM: positiveInt(acc, 5000) ?? DEFAULT_MAX_ACCURACY_M,
	};
};

const ipAllowed = (ip, ipRanges) => {
	const addr = normalizeIp(ip);
	const v = net.isIP(addr ?? '');
	if (!v) return false;
	const list = new net.BlockList();
	for (const r of ipRanges) list.addSubnet(r.address, r.prefix, r.type);
	return list.check(addr, v === 4 ? 'ipv4' : 'ipv6');
};

// Khoảng cách mặt đất (m) — công thức haversine
const distanceM = (a, b) => {
	const rad = (d) => (d * Math.PI) / 180;
	const dLat = rad(b.lat - a.lat);
	const dLng = rad(b.lng - a.lng);
	const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
	return 2 * 6371000 * Math.asin(Math.sqrt(h));
};

// → { ok, reasons: string[], distance_m: number|null }
const evaluate = (policy, { ip, lat, lng, accuracy }) => {
	if (!policy.ipRanges.length || !policy.location)
		return { ok: false, reasons: ['Quản trị chưa cấu hình chấm công (IP mạng bệnh viện / vị trí bệnh viện)'], distance_m: null };
	const reasons = [];
	if (!ipAllowed(ip, policy.ipRanges))
		reasons.push(`Thiết bị không kết nối mạng của bệnh viện (IP ${normalizeIp(ip) ?? 'không rõ'})`);
	const distance = Math.round(distanceM(policy.location, { lat, lng }));
	if (accuracy > policy.maxAccuracyM)
		reasons.push(`Vị trí chưa đủ chính xác (sai số ±${Math.round(accuracy)}m, tối đa ${policy.maxAccuracyM}m) — bật GPS rồi thử lại`);
	else if (distance > policy.radiusM)
		reasons.push(`Bạn đang cách bệnh viện khoảng ${distance}m (cho phép ${policy.radiusM}m)`);
	return { ok: reasons.length === 0, reasons, distance_m: distance };
};

module.exports = { getPolicy, validateSetting, evaluate, ipAllowed, distanceM, parseLocation, DEFAULT_RADIUS_M };
