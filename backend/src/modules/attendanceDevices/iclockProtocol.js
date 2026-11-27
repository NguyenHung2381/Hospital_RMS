// Giao thức ADMS / "iclock" (PUSH SDK) của máy chấm công ZKTeco và các máy dùng chung
// firmware (Ronald Jack, Wise Eye...). Chỉ gồm hàm thuần (không DB) để test kỹ và chỉnh
// nhanh khi firmware thực tế khác dự kiến.
//
// Máy luôn là bên mở kết nối:
//   GET  /iclock/cdata?SN=..&options=all&pushver=..   chào hỏi → server trả cấu hình
//   POST /iclock/cdata?SN=..&table=ATTLOG&Stamp=..     lượt chấm, mỗi dòng 1 lượt
//   POST /iclock/cdata?SN=..&table=OPERLOG             USER / FP / OPLOG
//   POST /iclock/cdata?SN=..&table=BIODATA             mẫu sinh trắc (firmware mới)
//   GET  /iclock/getrequest?SN=..&INFO=..              hỏi lệnh → "OK" hoặc "C:<id>:<lệnh>"
//   POST /iclock/devicecmd?SN=..                       kết quả lệnh "ID=..&Return=..&CMD=.."
const { stripDiacritics } = require('../../utils/vietnameseText');

const SN_RE = /^[A-Za-z0-9_-]{4,40}$/;
const isValidSerial = (sn) => typeof sn === 'string' && SN_RE.test(sn);

// Máy để giờ Việt Nam (không có múi giờ trong chuỗi) → Date UTC
const DEVICE_TIME_RE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/;
const parseDeviceTime = (s) => {
	const m = DEVICE_TIME_RE.exec(String(s || '').trim());
	if (!m) return null;
	const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] || '00'}+07:00`);
	return Number.isNaN(d.getTime()) ? null : d;
};

// Date (UTC) → chuỗi giờ Việt Nam máy hiểu: "YYYY-MM-DD HH:MM:SS"
const formatDeviceTime = (date) =>
	new Date(date.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');

const lines = (body) =>
	String(body || '')
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter(Boolean);

const toInt = (v) => {
	if (v === undefined || v === null || v === '') return null;
	const n = Number(v);
	return Number.isInteger(n) ? n : null;
};

// Dòng ATTLOG: PIN \t YYYY-MM-DD HH:MM:SS \t trạng thái (vào/ra) \t kiểu xác thực \t workcode ...
// Một số firmware dùng dấu cách thay tab → rơi về regex.
const ATT_FALLBACK_RE = /^(\S+)\s+(\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?)\s*(\d+)?\s*(\d+)?/;
const parseAttlog = (body) => {
	const out = [];
	let invalid = 0;
	for (const line of lines(body)) {
		let pin;
		let time;
		let status;
		let verify;
		const parts = line.split('\t');
		if (parts.length >= 2) [pin, time, status, verify] = parts;
		else {
			const m = ATT_FALLBACK_RE.exec(line);
			if (m) [, pin, time, status, verify] = m;
		}
		const punchedAt = parseDeviceTime(time);
		pin = String(pin || '').trim();
		if (!pin || pin.length > 24 || !punchedAt) {
			invalid += 1;
			continue;
		}
		out.push({ pin, punchedAt, inOut: toInt(status), verifyMode: toInt(verify) });
	}
	return { records: out, invalid };
};

// "KEY=value\tKEY2=value2" → { KEY: value, ... } (khóa giữ nguyên hoa/thường)
const parseKv = (s) => {
	const o = {};
	for (const part of String(s || '').split('\t')) {
		const i = part.indexOf('=');
		if (i > 0) o[part.slice(0, i).trim()] = part.slice(i + 1);
	}
	return o;
};
// Lấy khóa không phân biệt hoa thường (firmware lúc PIN, lúc Pin); nhiều khóa thì ưu tiên
// theo thứ tự truyền vào (BIODATA có cả No lẫn Index — ngón tay ở Index)
const pick = (o, ...keys) => {
	const lower = new Map(Object.keys(o).map((k) => [k.toLowerCase(), o[k]]));
	for (const k of keys) if (lower.has(k)) return lower.get(k);
	return undefined;
};

// Mẫu vân tay: chỉ nhận base64 hợp lệ, độ dài hợp lý
const TMP_RE = /^[A-Za-z0-9+/=]{16,20000}$/;

/**
 * OPERLOG / BIODATA / USERINFO / FINGERTMP → { users, fingers, other }
 *   users:   { pin, name }
 *   fingers: { pin, fingerIndex, size, valid, template, majorVer }
 */
const parseOperlog = (body) => {
	const users = [];
	const fingers = [];
	let other = 0;
	for (const line of lines(body)) {
		const sp = line.search(/\s/);
		const head = (sp > 0 ? line.slice(0, sp) : line).toUpperCase();
		const kv = parseKv(sp > 0 ? line.slice(sp + 1) : '');
		const pin = String(pick(kv, 'pin') || '').trim();
		if (head === 'USER' && pin) {
			users.push({ pin, name: pick(kv, 'name') ?? null });
		} else if ((head === 'FP' || head === 'FINGERTMP' || head === 'BIODATA') && pin) {
			// BIODATA: Type=1 là vân tay; chỉ số ngón ở Index (FP dùng FID)
			const type = toInt(pick(kv, 'type'));
			if (head === 'BIODATA' && type !== null && type !== 1) {
				other += 1;
				continue;
			}
			const fingerIndex = toInt(
				head === 'BIODATA' ? pick(kv, 'index', 'no') : pick(kv, 'fid', 'fingerid'),
			);
			const template = String(pick(kv, 'tmp') || '').trim();
			if (fingerIndex === null || fingerIndex < 0 || fingerIndex > 9 || !TMP_RE.test(template)) {
				other += 1;
				continue;
			}
			fingers.push({
				pin,
				fingerIndex,
				size: toInt(pick(kv, 'size')),
				valid: toInt(pick(kv, 'valid')) ?? 1,
				template,
				majorVer: pick(kv, 'majorver') ?? null,
				format: head,
			});
		} else other += 1;
	}
	return { users, fingers, other };
};

// Kết quả lệnh: mỗi dòng "ID=12&Return=0&CMD=DATA"
const parseDeviceCmdResult = (body) => {
	const out = [];
	for (const line of lines(body)) {
		const params = new URLSearchParams(line);
		const id = toInt(params.get('ID'));
		if (id === null) continue;
		out.push({ id, returnCode: toInt(params.get('Return')) ?? 0, cmd: params.get('CMD') || '' });
	}
	return out;
};

// INFO trên /getrequest: "Ver 6.60 Apr 10 2019,3,5,120,192.168.1.201,10,7,0,..."
//   firmware, số người dùng, số vân tay, số lượt chấm, IP, phiên bản thuật toán vân tay...
const parseInfo = (info) => {
	if (!info || typeof info !== 'string') return null;
	const p = info.split(',').map((s) => s.trim());
	return {
		firmware: p[0] ? p[0].slice(0, 100) : null,
		userCount: toInt(p[1]),
		fpCount: toInt(p[2]),
		attCount: toInt(p[3]),
		ip: p[4] || null,
		fpAlgorithm: p[5] ? p[5].slice(0, 20) : null,
	};
};

// Firmware PUSH 2.x trở lên dùng "DATA UPDATE USERINFO"; bản cũ (không gửi pushver
// hoặc 1.x) dùng "DATA USER" — chốt lại theo log thực tế của máy.
const isModernPush = (pushVersion) => /^[2-9]/.test(String(pushVersion || ''));

/** Cấu hình trả cho máy lúc chào hỏi */
const formatOptions = (device) => {
	const sn = device.serial_no;
	return [
		`GET OPTION FROM: ${sn}`,
		`ATTLOGStamp=${device.attlog_stamp || 'None'}`,
		`OPERLOGStamp=${device.operlog_stamp || 'None'}`,
		'ATTPHOTOStamp=None',
		'ErrorDelay=30',
		'Delay=10',
		'TransTimes=00:00;14:05',
		'TransInterval=1',
		'TransFlag=TransData AttLog OpLog EnrollUser ChgUser EnrollFP ChgFP',
		'TimeZone=7',
		'Realtime=1',
		'Encrypt=None',
		'ServerVer=2.4.1',
		'PushProtVer=2.4.1',
	].join('\n');
};

// Máy chỉ hiện ~24 ký tự; bỏ tab/xuống dòng (phá cú pháp lệnh)
const NAME_MAX = 24;
const deviceName = (name, ascii) => {
	let s = String(name || '')
		.replace(/[\t\r\n=]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	if (ascii) s = stripDiacritics(s);
	return [...s].slice(0, NAME_MAX).join('');
};

const assertPin = (pin) => {
	if (!/^[0-9A-Za-z]{1,24}$/.test(String(pin))) throw new Error(`PIN không hợp lệ: ${pin}`);
};

// Chỉ gửi mã + tên: người dùng đã có trên máy giữ nguyên mật khẩu, số thẻ từ, quyền (quản
// trị máy), nhóm, múi giờ; người dùng mới thì máy tự lấy mặc định (người dùng thường).
const formatUserUpsert = ({ pin, name, ascii = false, pushVersion }) => {
	assertPin(pin);
	const fields = `PIN=${pin}\tName=${deviceName(name, ascii)}`;
	return isModernPush(pushVersion) ? `DATA UPDATE USERINFO ${fields}` : `DATA USER ${fields}`;
};

// Máy hỏi lại cấu hình (stamp) rồi gửi lên dữ liệu mới hơn stamp. Gửi kèm OPERLOGStamp=None
// (iclockService) ⇒ máy gửi lại TOÀN BỘ người dùng + mẫu vân tay đang có — dùng để lấy vân
// tay học viên đã đăng ký trên máy từ trước khi nối với hệ thống.
const CHECK_COMMAND = 'CHECK';

const formatUserDelete = ({ pin, pushVersion }) => {
	assertPin(pin);
	return isModernPush(pushVersion) ? `DATA DELETE USERINFO PIN=${pin}` : `DATA DEL_USER PIN=${pin}`;
};

const formatFingerUpsert = ({ pin, fingerIndex, size, valid = 1, template, pushVersion }) => {
	assertPin(pin);
	if (!Number.isInteger(fingerIndex) || fingerIndex < 0 || fingerIndex > 9)
		throw new Error(`Ngón tay không hợp lệ: ${fingerIndex}`);
	if (!TMP_RE.test(template)) throw new Error('Mẫu vân tay không hợp lệ');
	const fields = `PIN=${pin}\tFID=${fingerIndex}\tSize=${size || template.length}\tValid=${valid}\tTMP=${template}`;
	return isModernPush(pushVersion) ? `DATA UPDATE FINGERTMP ${fields}` : `DATA FP ${fields}`;
};

const formatQueryAttlog = (from, to) =>
	`DATA QUERY ATTLOG StartTime=${formatDeviceTime(from)}\tEndTime=${formatDeviceTime(to)}`;

/** Gói các lệnh trả cho /getrequest */
const formatCommands = (cmds) =>
	cmds.length ? cmds.map((c) => `C:${c.id}:${c.command}`).join('\n') : 'OK';

/** PIN trên máy ↔ mã học viên: HV + 8 số (chk_trainees_id) ⇔ PIN 8 số */
const traineeIdFromPin = (pin) => (/^\d{8}$/.test(String(pin)) ? `HV${pin}` : null);
const pinFromTraineeId = (id) => {
	const m = /^HV(\d{8})$/.exec(String(id || ''));
	return m ? m[1] : null;
};

module.exports = {
	isValidSerial,
	parseDeviceTime,
	formatDeviceTime,
	parseAttlog,
	parseOperlog,
	parseDeviceCmdResult,
	parseInfo,
	formatOptions,
	deviceName,
	formatUserUpsert,
	formatUserDelete,
	formatFingerUpsert,
	formatQueryAttlog,
	formatCommands,
	CHECK_COMMAND,
	traineeIdFromPin,
	pinFromTraineeId,
};
