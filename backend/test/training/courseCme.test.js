// CME tự động từ khóa ĐTLT / CTCV (courseCmeService) trên CSDL giả:
//   - A3: mỗi giấy chứng nhận 1 dòng — khóa upsert có enrollment_id, khớp đúng
//     uq_cme_records_source của migration; thu hồi / xóa 1 giấy chỉ chạm dòng của giấy đó;
//   - A2: chia số tiết của bài cho giảng viên theo số buổi đã dạy (lecturerHours, hàm thuần);
//   - ngày ghi nhận của học viên theo ngày kết thúc lớp của chương trình.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { install } = require('../auth/fakeDb');

const settings = {};
require('../../src/modules/settings/systemSettingService').getValue = async (key, def) =>
	settings[key] ?? def;
const events = [];
require('../../src/modules/events/eventService').broadcast = (_type, payload) =>
	events.push(payload.entity);

// Giấy CH2 thuộc lượt ghi danh E2 (chương trình thứ 2 của cùng học viên trong khóa KH1)
const log = install(async (text, inputs) => {
	if (
		/FROM certificates cert\s+JOIN course_enrollments e ON e.id = cert.enrollment_id\s+WHERE cert.id = @cert_id/.test(
			text,
		)
	)
		return inputs.cert_id === 'CH2' ? [{ course_id: 'KH1', enrollment_id: 'E2' }] : [];
	if (/^\s*(UPDATE|DELETE FROM) cme_records/.test(text)) return [{}];
	if (/INSERT INTO cme_records/.test(text)) return [{}, {}];
	return [];
});
const cme = require('../../src/modules/training/courses/courseCmeService');

const normalize = (t) => t.replace(/\s+/g, ' ');
const since = (n) => log.slice(n);
const MIGRATION = path.join(
	__dirname,
	'../../database/migrations/2026-12-28_cme_khoa_hoc_theo_giay_chung_nhan.sql',
);
const columns = (list) => list.split(',').map((c) => c.trim());

test('A3: upsert dòng học viên theo từng lượt ghi danh (giấy), khóa khớp uq_cme_records_source', async () => {
	const n = log.length;
	assert.equal(await cme.syncTrainees('KH1', 'NV1'), 2);
	const [up] = since(n);
	const t = normalize(up.text);
	// mỗi dòng nguồn mang lượt ghi danh của giấy ⇒ 2 giấy của 1 người trong 1 khóa là 2 khóa khác nhau
	assert.match(t, /SELECT t\.staff_user_id AS user_id, e\.id AS enrollment_id,/);
	assert.match(
		t,
		/FROM certificates cert JOIN course_enrollments e ON e\.id = cert\.enrollment_id/,
	);
	const key = t.match(/ON CONFLICT \(([^)]+)\) WHERE (.+?) DO UPDATE/);
	assert.ok(key, 'phải có ON CONFLICT ... WHERE ...');
	assert.deepEqual(columns(key[1]), ['source_type', 'source_id', 'user_id', 'enrollment_id']);
	assert.match(t, /'course_trainee', @course_id, src\.enrollment_id, @actor_id/);
	// Không còn khóa cũ 3 cột (nguồn lỗi "cannot affect row a second time")
	assert.doesNotMatch(t, /ON CONFLICT \(source_type, source_id, user_id\)/);
	assert.equal(up.inputs.enrollment_id, null);
	assert.equal(up.inputs.course_id, 'KH1');

	// Index của migration đúng các cột đó, NULLS NOT DISTINCT (dòng GV enrollment_id NULL vẫn
	// bắt được conflict), cùng điều kiện lọc với ON CONFLICT ... WHERE
	const mig = normalize(fs.readFileSync(MIGRATION, 'utf8'));
	const idx = mig.match(
		/CREATE UNIQUE INDEX uq_cme_records_source ON cme_records \(([^)]+)\) NULLS NOT DISTINCT WHERE \((.+?)\);/,
	);
	assert.ok(idx, 'migration phải dựng lại uq_cme_records_source');
	assert.deepEqual(columns(idx[1]), columns(key[1]));
	assert.equal(idx[2], key[2]);
	assert.match(mig, /DROP INDEX IF EXISTS uq_cme_records_source;/);
	assert.match(mig, /ADD COLUMN IF NOT EXISTS enrollment_id varchar\(20\)/);
	// Chuyển dữ liệu cũ: chỉ dòng học viên chưa có enrollment_id (chạy lại không đổi gì)
	assert.match(mig, /WHERE r2\.source_type = 'course_trainee' AND r2\.enrollment_id IS NULL/);
});

test('A3: cấp 1 giấy chỉ ghi dòng của lượt ghi danh đó', async () => {
	const n = log.length;
	await cme.syncTrainees('KH1', 'NV1', { enrollmentId: 'E2' });
	const [up] = since(n);
	assert.equal(up.inputs.enrollment_id, 'E2');
	assert.match(normalize(up.text), /\(@enrollment_id IS NULL OR e\.id = @enrollment_id\)/);
});

test('ngày ghi nhận của học viên: ngày kết thúc lớp của đúng chương trình → của khóa → ngày cấp giấy', async () => {
	const n = log.length;
	await cme.syncTrainees('KH1', 'NV1');
	const t = normalize(since(n)[0].text);
	assert.match(t, /COALESCE\(cp\.end_date, c\.end_date, cert\.issue_date\) AS activity_date/);
	// cp = lớp của chương trình của lượt ghi danh (chưa chọn thì chương trình duy nhất của khóa)
	assert.match(
		t,
		/LEFT JOIN course_programs cp ON cp\.course_id = e\.course_id AND cp\.program_id = COALESCE\(e\.program_id,/,
	);
	assert.match(
		t,
		/LEFT JOIN training_programs tp ON tp\.id = COALESCE\(e\.program_id, cp\.program_id\)/,
	);
});

test('A3: thu hồi 1 giấy chỉ từ chối dòng của lượt ghi danh của giấy đó', async () => {
	const n = log.length;
	assert.equal(await cme.withdrawForCertificate('CH2', 'NV1', { reason: 'sai hồ sơ' }), 1);
	const upd = since(n).find((e) => /UPDATE cme_records/.test(e.text));
	const t = normalize(upd.text);
	assert.match(t, /SET approval_status = 'rejected'/);
	assert.match(
		t,
		/WHERE source_type = 'course_trainee' AND source_id = @course_id AND enrollment_id = @enrollment_id$/,
	);
	assert.deepEqual(
		{ course: upd.inputs.course_id, enrollment: upd.inputs.enrollment_id },
		{ course: 'KH1', enrollment: 'E2' },
	);
	assert.equal(upd.inputs.reason, 'Thu hồi giấy chứng nhận: sai hồ sơ');
});

test('A3: xóa giấy cấp nhầm chỉ xóa dòng của giấy đó; công tắc tắt vẫn chạy; giấy không có thì thôi', async () => {
	settings.CME_AUTO_TRAINEE = 'false';
	try {
		let n = log.length;
		await cme.withdrawForCertificate('CH2', 'NV1', { remove: true });
		const del = since(n).find((e) => /DELETE FROM cme_records/.test(e.text));
		assert.match(
			normalize(del.text),
			/^DELETE FROM cme_records WHERE source_type = 'course_trainee' AND source_id = @course_id AND enrollment_id = @enrollment_id$/,
		);
		assert.equal(del.inputs.enrollment_id, 'E2');

		// công tắc tắt: không ghi dòng mới
		n = log.length;
		assert.equal(await cme.syncTrainees('KH1', 'NV1'), 0);
		assert.equal(since(n).length, 0);

		n = log.length;
		assert.equal(await cme.withdrawForCertificate('KHONG_CO', 'NV1'), 0);
		assert.ok(!since(n).some((e) => /UPDATE cme_records|DELETE FROM cme_records/.test(e.text)));
	} finally {
		delete settings.CME_AUTO_TRAINEE;
	}
});

// ─── lecturerHours: chia tiết giảng ─────────────────────────────────────────

const row = (o) => ({
	lesson_id: 'L1',
	role: 'main',
	assigned_hours: null,
	lesson_hours: 10,
	sessions: 0,
	lesson_sessions: 0,
	...o,
});
const hoursOf = (rows) =>
	Object.fromEntries(cme.lecturerHours(rows).map((x) => [x.user_id, x.hours]));

test('A2: số tiết nhập ở phân công được dùng nguyên (kể cả khi bài đã có buổi dạy)', () => {
	assert.deepEqual(
		hoursOf([
			row({ user_id: 'U1', assigned_hours: 4, sessions: 1, lesson_sessions: 2 }),
			row({ user_id: 'U2', role: 'assistant', sessions: 1, lesson_sessions: 2 }),
		]),
		{ U1: 4, U2: 5 },
	);
});

test('A2: chưa nhập số tiết ⇒ chia số tiết bài theo số buổi đã dạy, GV phụ cũng được cộng', () => {
	assert.deepEqual(
		hoursOf([
			row({ user_id: 'U1', sessions: 3, lesson_sessions: 4 }),
			row({ user_id: 'U2', role: 'assistant', sessions: 1, lesson_sessions: 4 }),
		]),
		{ U1: 7.5, U2: 2.5 },
	);
	// GV chính không dạy buổi nào của bài đã có buổi ⇒ 0 (không có minh chứng giảng dạy)
	assert.deepEqual(
		hoursOf([
			row({ user_id: 'U1', sessions: 0, lesson_sessions: 2 }),
			row({ user_id: 'U2', role: null, sessions: 2, lesson_sessions: 2 }),
		]),
		{ U2: 10 },
	);
});

test('A2: làm tròn xuống 2 chữ số — tổng không vượt số tiết bài', () => {
	const thirds = cme.lecturerHours(
		['U1', 'U2', 'U3'].map((u) => row({ user_id: u, sessions: 1, lesson_sessions: 3 })),
	);
	assert.deepEqual(
		thirds.map((x) => x.hours),
		[3.33, 3.33, 3.33],
	);
	// 8 người × 1/8 của 1 tiết: làm tròn thường ra 0,13 × 8 = 1,04 > 1
	const eighths = cme.lecturerHours(
		Array.from({ length: 8 }, (_, i) =>
			row({ user_id: `U${i}`, lesson_hours: 1, sessions: 1, lesson_sessions: 8 }),
		),
	);
	const total = eighths.reduce((s, x) => s + Math.round(x.hours * 100), 0);
	assert.ok(total <= 100, `tổng ${total / 100} vượt 1 tiết`);
	assert.ok(eighths.every((x) => x.hours === 0.12));
});

test('A2: buổi của GV chưa có tài khoản / ngoại viện vẫn tính vào mẫu số', () => {
	// bài 6 tiết, 3 buổi: U1 dạy 1, GV ngoại viện (không có dòng vì không có tài khoản) dạy 2
	assert.deepEqual(
		hoursOf([row({ user_id: 'U1', lesson_hours: 6, sessions: 1, lesson_sessions: 3 })]),
		{
			U1: 2,
		},
	);
});

test('A2: bài chưa có buổi nào gán GV ⇒ quy tắc cũ (GV chính được số tiết bài, GV phụ 0)', () => {
	assert.deepEqual(hoursOf([row({ user_id: 'U1' }), row({ user_id: 'U2', role: 'assistant' })]), {
		U1: 10,
	});
});

test('A2: phân công cả khóa chỉ tính khi có nhập số tiết; cộng dồn nhiều bài theo người', () => {
	const out = cme.lecturerHours([
		row({ lesson_id: null, user_id: 'U1', lesson_hours: 0 }),
		row({ lesson_id: null, user_id: 'U2', lesson_hours: 0, assigned_hours: 3 }),
		row({ lesson_id: 'L2', user_id: 'U2', lesson_hours: 5, sessions: 1, lesson_sessions: 2 }),
		row({ lesson_id: 'L3', user_id: 'U2', lesson_hours: 4 }),
		// số từ DB có thể là chuỗi (COUNT / SUM → bigint / numeric)
		row({ lesson_id: 'L4', user_id: 'U3', lesson_hours: 9, sessions: '2', lesson_sessions: '3' }),
	]);
	assert.deepEqual(
		out.map((x) => [x.user_id, x.hours]),
		[
			['U2', 9.5],
			['U3', 6],
		],
	);
	assert.equal(
		out[0].note,
		'Tự động khi khóa điểm — 9,5 tiết giảng (số tiết phân công 3; chia theo 1 buổi đã dạy 2,5; GV chính của bài chưa có buổi dạy 4)',
	);
	assert.ok(out.every((x) => x.note.length <= 500));
});

test('A2: dữ kiện giờ giảng đếm buổi đã diễn ra có gán GV của khóa, mọi GV (kể cả không tài khoản)', async () => {
	const n = log.length;
	await cme.syncLecturers('KH1', 'NV1', { canApprove: true });
	const facts = normalize(since(n).find((e) => /WITH sess AS/.test(e.text)).text);
	assert.match(
		facts,
		/WHERE cs\.course_id = @course_id AND cs\.subject_id IS NOT NULL AND cs\.lecturer_id IS NOT NULL AND cs\.session_date <= CAST\(now\(\) AT TIME ZONE 'Asia\/Ho_Chi_Minh' AS DATE\)/,
	);
	// lọc GV có tài khoản SAU khi đếm tổng buổi của bài
	assert.match(
		facts,
		/LEFT JOIN lesson_sess ls ON ls\.subject_id = p\.subject_id WHERE lec\.user_id IS NOT NULL/,
	);
	assert.doesNotMatch(facts.slice(0, facts.indexOf('pairs AS')), /user_id/);
});
