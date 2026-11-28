// Rà bảo mật 2026-11-26 (phiên security) — S-01: máy chấm công /iclock chỉ nhận diện bằng
// số serial (in trên tem máy, giao thức ADMS không có xác thực). Máy di chuyển, đổi IP liên
// tục nhưng luôn ở trong mạng nội bộ của viện. Ba lớp:
//   Lớp 1  chỉ nhận /iclock từ ICLOCK_ALLOWED_CIDRS (mặc định 192.168.0.0/16 — không gồm dải
//          máy chủ 172.16.0.0/12); request mang IP của chính proxy (ICLOCK_PROXY_IPS) bị chặn
//          (chưa nhận được IP thật ⇒ không cho qua). /iclock/ping vẫn mở (chỉ trả "OK").
//   Lớp 2  cùng số serial gọi xen kẽ từ 2 IP (IP cũ quay lại ngay sau khi đổi) ⇒ có máy giả
//          ⇒ tạm khoá máy + security_events. Máy chuyển chỗ (đổi IP 1 lần) không bị khoá.
//   Lớp 3  vừa đổi IP ⇒ tạm giữ lệnh (mẫu vân tay) vài phút; giới hạn lượt gọi theo serial.
process.env.LOG_LEVEL = 'silent';
process.env.JWT_SECRET = 'test-secret';
process.env.ICLOCK_PROXY_IPS = '192.168.34.20';
process.env.ICLOCK_SN_RATE_LIMIT = '5';
delete process.env.ICLOCK_ALLOWED_CIDRS; // dùng mặc định

const test = require('node:test');
const assert = require('node:assert/strict');
// Redis không chạy khi test: rateLimit / consumeOnce tự rơi về bộ nhớ tiến trình.
const { install } = require('../auth/fakeDb');

const OLD_IP = '192.168.103.10';
const NEW_IP = '192.168.105.22';
const freshDevice = () => ({
	id: 1,
	serial_no: 'CQZ7224460123',
	status: 'active',
	last_ip: OLD_IP,
	prev_ip: null,
	ip_changed_at: null,
	ip_change_recent: false,
	ip_hold_active: false,
	fp_algorithm: '10',
});
let device = freshDevice();
let taken = 0;

const log = install(async (text, inputs) => {
	if (/FROM attendance_devices WHERE serial_no = @sn/.test(text)) return [{ ...device }];
	if (/UPDATE attendance_devices SET\s+last_seen_at/.test(text)) {
		if (inputs.ip_changed) {
			device.prev_ip = device.last_ip;
			device.ip_changed_at = new Date();
			device.ip_change_recent = true;
			device.ip_hold_active = true;
		}
		device.last_ip = inputs.ip ?? device.last_ip;
		return [{ ...device }];
	}
	if (/SET status = 'suspended'/.test(text)) {
		if (device.status === 'active') device.status = 'suspended';
		return [{ id: device.id }];
	}
	if (/UPDATE attendance_device_commands c/.test(text)) {
		taken += 1;
		return [{ id: 5, command: 'DATA UPDATE FINGERTMP PIN=20270001\tFID=0\tTMP=AAAA' }];
	}
	if (/SELECT id, status, purpose FROM attendance_devices WHERE id = @id/.test(text))
		return [{ id: device.id, status: device.status, purpose: 'training' }];
	return [];
});

const events = [];
require('../../src/modules/audit/securityEventService').log = async (e) => {
	events.push(e);
};
require('../../src/modules/attendanceDevices/deviceSyncService').requestSync = () => {};
require('../../src/middlewares/moduleGuard').requireModule = () => (_req, _res, next) => next();

const service = require('../../src/modules/attendanceDevices/iclockService');
const deviceAdmin = require('../../src/modules/attendanceDevices/deviceAdminService');

const reset = () => {
	device = freshDevice();
	taken = 0;
	events.length = 0;
	log.length = 0;
};

// ─── Lớp 1: chặn theo dải IP (qua router thật, service giả) ───────────────────
const express = require('express');
const realHandshake = service.handshake;
let handshakes = 0;

const withServer = async (fn) => {
	const app = express();
	app.set('trust proxy', 1); // X-Forwarded-For = IP máy (như nginx + TRUST_PROXY=1)
	app.use('/iclock', require('../../src/modules/attendanceDevices/iclock.routes'));
	const server = app.listen(0);
	await new Promise((r) => server.once('listening', r));
	const { port } = /** @type {import('net').AddressInfo} */ (server.address());
	const call = (path, ip) =>
		fetch(`http://127.0.0.1:${port}/iclock${path}`, { headers: { 'X-Forwarded-For': ip } });
	try {
		await fn(call);
	} finally {
		server.close();
	}
};

test('S-01 lớp 1: IP ngoài mạng viện (Internet) bị chặn trước khi tới service', async () => {
	service.handshake = async () => {
		handshakes += 1;
		return 'OK';
	};
	handshakes = 0;
	events.length = 0;
	try {
		await withServer(async (call) => {
			const r = await call('/cdata?SN=SNX1', '203.0.113.7');
			assert.equal(r.status, 403);
			assert.equal(handshakes, 0);
			// Dải máy chủ 172.16.0.0/12 cũng không được gọi
			assert.equal((await call('/cdata?SN=SNX1', '172.16.25.21')).status, 403);
			assert.equal(handshakes, 0);
		});
		assert.ok(events.some((e) => e.eventType === 'iclock_ip_blocked' && e.ip === '203.0.113.7'));
	} finally {
		service.handshake = realHandshake;
	}
});

test('S-01 lớp 1: request mang IP của proxy viện (chưa có IP thật) bị chặn', async () => {
	service.handshake = async () => {
		handshakes += 1;
		return 'OK';
	};
	handshakes = 0;
	try {
		await withServer(async (call) => {
			assert.equal((await call('/cdata?SN=SNX2', '192.168.34.20')).status, 403);
			assert.equal(handshakes, 0);
		});
	} finally {
		service.handshake = realHandshake;
	}
});

test('S-01 lớp 1 (đối chứng): máy trong mạng 192.168.x vẫn gửi được; /ping luôn mở', async () => {
	service.handshake = async () => {
		handshakes += 1;
		return 'OK';
	};
	handshakes = 0;
	try {
		await withServer(async (call) => {
			const r = await call('/cdata?SN=SNX3', '192.168.103.15');
			assert.equal(r.status, 200);
			assert.equal(handshakes, 1);
			const ping = await call('/ping', '203.0.113.7');
			assert.equal(ping.status, 200);
			assert.equal(await ping.text(), 'OK');
		});
	} finally {
		service.handshake = realHandshake;
	}
});

test('S-01 lớp 3: giới hạn số lượt gọi theo số serial (dù đổi IP)', async () => {
	service.handshake = async () => 'OK';
	try {
		await withServer(async (call) => {
			const codes = [];
			for (let i = 0; i < 7; i += 1)
				codes.push((await call('/cdata?SN=SNRATE', `192.168.110.${i + 1}`)).status);
			assert.deepEqual(codes.slice(0, 5), [200, 200, 200, 200, 200]);
			assert.equal(codes[6], 429);
		});
	} finally {
		service.handshake = realHandshake;
	}
});

// ─── Lớp 2 + 3: phát hiện số serial bị dùng ở 2 nơi, giữ lệnh khi vừa đổi IP ────
test('S-01 lớp 2: IP cũ quay lại ngay sau khi đổi IP ⇒ tạm khoá máy + ghi security_events', async () => {
	reset();
	await service.getRequest('CQZ7224460123', {}, NEW_IP); // máy giả (hoặc máy thật) ở IP mới
	await assert.rejects(
		() => service.getRequest('CQZ7224460123', {}, OLD_IP), // IP cũ vẫn đang gọi ⇒ 2 máy cùng serial
		(e) => e instanceof service.DeviceRejected,
	);
	assert.equal(device.status, 'suspended');
	const ev = events.find((e) => e.eventType === 'iclock_serial_conflict');
	assert.ok(ev, 'phải ghi security_events iclock_serial_conflict');
	assert.equal(ev.ip, OLD_IP);
	assert.match(ev.detail, new RegExp(NEW_IP.replace(/\./g, '\\.')));
});

test('S-01 lớp 2 (đối chứng): máy chuyển chỗ (đổi IP 1 lần, gọi tiếp từ IP mới) không bị khoá', async () => {
	reset();
	await service.getRequest('CQZ7224460123', {}, NEW_IP);
	await service.getRequest('CQZ7224460123', {}, NEW_IP);
	assert.equal(device.status, 'active');
	assert.ok(!events.some((e) => e.eventType === 'iclock_serial_conflict'));
});

test('S-01 lớp 3: vừa đổi IP ⇒ chưa giao lệnh (mẫu vân tay) cho tới hết thời gian giữ', async () => {
	reset();
	const out = await service.getRequest('CQZ7224460123', {}, NEW_IP);
	assert.equal(taken, 0, 'không được lấy lệnh khỏi hàng đợi');
	assert.doesNotMatch(String(out), /FINGERTMP/);
});

test('S-01 lớp 3 (đối chứng): IP không đổi ⇒ giao lệnh bình thường', async () => {
	reset();
	const out = await service.getRequest('CQZ7224460123', {}, OLD_IP);
	assert.equal(taken, 1);
	assert.match(String(out), /FINGERTMP/);
});

test('S-01: quản trị mở lại máy bị tạm khoá ⇒ xoá dấu vết đổi IP để theo dõi lại từ đầu', async () => {
	reset();
	device.status = 'suspended';
	await deviceAdmin.updateDevice(1, { status: 'active' }, 'U_ADMIN');
	const upd = log.find((q) => /UPDATE attendance_devices SET/.test(q.text));
	assert.ok(upd);
	assert.match(upd.text, /prev_ip = NULL/);
	assert.match(upd.text, /ip_changed_at = NULL/);
	assert.match(upd.text, /suspended_at = NULL/);
});
