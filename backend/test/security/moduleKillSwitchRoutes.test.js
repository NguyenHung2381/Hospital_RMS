// Hồi quy L-04 (run-4): công tắc MODULE_<KEY> trước đây chỉ gắn ở một số mount trong app.js,
// nên đăng ký công khai (/public/*) và tự phục vụ (/me/*) của module đã tắt vẫn ghi dữ liệu.
// Test này gắn router thật vào Express, CSDL giả trả về rỗng, và kiểm tra:
//   - tắt module ⇒ mọi route thuộc module trả 403 MODULE_DISABLED (trước captcha/upload);
//   - bật module ⇒ route qua được công tắc (không còn MODULE_DISABLED);
//   - tắt module này không chặn module khác.
process.env.JWT_SECRET = 'test-secret';
process.env.CAPTCHA_MIN_FILL_SEC = '0';
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { install } = require('../auth/fakeDb');

// CSDL giả: mọi truy vấn trả rỗng (đủ để route chạy tới bước kiểm tra tiếp theo).
install(async () => []);

// Công tắc module đọc từ cấu hình hệ thống: cho test điều khiển trực tiếp.
const settings = require('../../src/modules/settings/systemSettingService');
let flags = {};
settings.getValue = async (key) => flags[key];
const setModules = (off = []) => {
	flags = Object.fromEntries(off.map((k) => [`MODULE_${k}`, 'false']));
};

// Người dùng không có vai trò (chỉ đăng nhập): route /me chỉ cần đăng nhập.
const auth = require('../../src/middlewares/auth');
auth.authenticate = (req, _res, next) => {
	req.user = { id: 'U_NOROLE', permissions: new Set() };
	next();
};

const portalService = require('../../src/modules/portal/portalService');
portalService.registerCourse = async (courseId) => ({ id: 'E1', course_id: courseId });

const app = express();
app.use(express.json());
app.use('/api/v1/public', require('../../src/modules/public/public.routes'));
app.use('/api/v1/me', require('../../src/modules/portal/me.routes'));
app.use((err, _req, res, _next) => res.status(500).json({ message: err.message }));

const HEX = 'a'.repeat(32);
// Các route thuộc từng module (công khai + tự phục vụ /me). Đường dẫn đủ hợp lệ để
// khi module bật, request đi tới validator/controller chứ không dừng ở lỗi định dạng.
const ROUTES = {
	TRAINING: [
		['GET', '/api/v1/public/courses'],
		['GET', '/api/v1/public/lookup?national_id=040200001234&dob=2000-05-15&full_name=A'],
		['POST', '/api/v1/public/course-registration', {}],
		['GET', '/api/v1/me/training'],
		['POST', '/api/v1/me/courses/KH1/register', {}],
		['GET', '/api/v1/me/courses/KH1'],
		['PATCH', '/api/v1/me/documents/D1/download'],
	],
	RESEARCH: [
		['GET', '/api/v1/public/topic-rounds'],
		['GET', '/api/v1/public/topic-rounds/by-token/abcdefgh'],
		['POST', '/api/v1/public/topic-registration', {}],
		['GET', '/api/v1/public/topics/T1/status?contact=0900000000'],
		['GET', '/api/v1/public/featured-topics'],
		['GET', '/api/v1/public/categories'],
		['GET', '/api/v1/public/levels'],
	],
	SEMINAR: [
		['GET', `/api/v1/public/seminars/${HEX}`],
		['POST', `/api/v1/public/seminars/${HEX}/staff-lookup`, {}],
		['POST', `/api/v1/public/seminars/${HEX}/register`, {}],
		['GET', `/api/v1/public/seminar-tickets/${HEX}`],
		['POST', `/api/v1/public/seminar-tickets/${HEX}/test/start`, {}],
		['POST', `/api/v1/public/seminar-tickets/${HEX}/test`, { answers: [] }],
		['GET', '/api/v1/me/cme-categories'],
		['GET', '/api/v1/me/cme?year=2026'],
		['POST', '/api/v1/me/cme-records', { title: 'Dummy CME', year: 2026 }],
		['POST', '/api/v1/me/cme/export-excel', { year: 2026 }],
	],
};

const withServer = async (fn) => {
	const srv = app.listen(0, '127.0.0.1');
	await new Promise((r) => srv.once('listening', r));
	const base = `http://127.0.0.1:${srv.address().port}`;
	try {
		return await fn(base);
	} finally {
		await new Promise((r) => srv.close(r));
	}
};

const send = async (base, [method, path, body]) => {
	const init = { method, headers: {} };
	if (body !== undefined) {
		init.headers['content-type'] = 'application/json';
		init.body = JSON.stringify(body);
	}
	const res = await fetch(base + path, init);
	const json = await res.json().catch(() => ({}));
	return { status: res.status, code: json.code };
};

test('tắt TRAINING: mọi route đăng ký khóa học công khai và /me của module trả 403 MODULE_DISABLED', async () => {
	setModules(['TRAINING']);
	await withServer(async (base) => {
		for (const route of ROUTES.TRAINING) {
			const r = await send(base, route);
			assert.equal(r.status, 403, `${route[0]} ${route[1]}`);
			assert.equal(r.code, 'MODULE_DISABLED', `${route[0]} ${route[1]}`);
		}
	});
});

test('tắt RESEARCH: đăng ký đề tài công khai và tra cứu đợt/đề tài bị chặn', async () => {
	setModules(['RESEARCH']);
	await withServer(async (base) => {
		for (const route of ROUTES.RESEARCH) {
			const r = await send(base, route);
			assert.equal(r.status, 403, `${route[0]} ${route[1]}`);
			assert.equal(r.code, 'MODULE_DISABLED', `${route[0]} ${route[1]}`);
		}
	});
});

test('tắt SEMINAR: đăng ký hội nghị công khai, vé, bài test và khai CME tự phục vụ bị chặn', async () => {
	setModules(['SEMINAR']);
	await withServer(async (base) => {
		for (const route of ROUTES.SEMINAR) {
			const r = await send(base, route);
			assert.equal(r.status, 403, `${route[0]} ${route[1]}`);
			assert.equal(r.code, 'MODULE_DISABLED', `${route[0]} ${route[1]}`);
		}
	});
});

test('bật cả ba module: các route đi qua công tắc (không còn MODULE_DISABLED)', async () => {
	setModules([]);
	await withServer(async (base) => {
		for (const route of [...ROUTES.TRAINING, ...ROUTES.RESEARCH, ...ROUTES.SEMINAR]) {
			const r = await send(base, route);
			assert.notEqual(r.code, 'MODULE_DISABLED', `${route[0]} ${route[1]}`);
		}
		// Đường đi thật: /me đăng ký khóa học được tạo khi module bật
		const ok = await send(base, ['POST', '/api/v1/me/courses/KH1/register', {}]);
		assert.equal(ok.status, 201);
	});
});

test('tắt module này không chặn module khác (cách ly theo module)', async () => {
	setModules(['TRAINING']);
	await withServer(async (base) => {
		// Đăng ký hội nghị / khai CME vẫn qua công tắc (chỉ lỗi validation, không phải 403)
		const cme = await send(base, ['POST', '/api/v1/me/cme-records', { title: 'x', year: 2026 }]);
		assert.notEqual(cme.status, 403);
		const topic = await send(base, ['POST', '/api/v1/public/topic-registration', {}]);
		assert.notEqual(topic.code, 'MODULE_DISABLED');
	});
	setModules(['SEMINAR']);
	await withServer(async (base) => {
		const course = await send(base, ['POST', '/api/v1/public/course-registration', {}]);
		assert.notEqual(course.code, 'MODULE_DISABLED');
		const me = await send(base, ['POST', '/api/v1/me/courses/KH1/register', {}]);
		assert.equal(me.status, 201);
	});
});

test('tắt TRAINING: không còn ghi hồ sơ đính kèm / đăng ký ẩn danh được nữa', async () => {
	setModules(['TRAINING']);
	await withServer(async (base) => {
		// Chặn trước captcha: không có token vẫn ra 403 (không phải 400 validation)
		const r = await send(base, ['POST', '/api/v1/public/course-registration', { full_name: 'A' }]);
		assert.equal(r.status, 403);
		assert.equal(r.code, 'MODULE_DISABLED');
	});
});
