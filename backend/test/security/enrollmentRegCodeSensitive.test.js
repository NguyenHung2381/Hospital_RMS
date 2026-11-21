// M-10 (tích hợp): danh sách ghi danh / 1 hồ sơ ghi danh che mã đăng ký với người chỉ có
// courses:read, nhưng người có trainees:read_sensitive (vd admin) vẫn thấy mã đầy đủ.
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

const CODE = 'DKABCDEFGHJK';
install(async () => [
	{ id: 'E1', course_id: 'KH1', reg_code: CODE, reg_source: 'internal', reg_file_kinds: null },
]);

const forms = require('../../src/modules/forms/formCustomValueService');
forms.attachResult = async (_form, rows) => rows;
forms.get = async () => ({});
const courseCtrl = require('../../src/modules/training/courses/courseController');
const practiceCtrl = require('../../src/modules/training/courses/practiceRecordController');

const mk = (...perms) => ({ id: 'U1', permissions: new Set(perms), permissionScopes: new Map() });
const call = (handler, user, params) =>
	new Promise((resolve, reject) => {
		const res = { status: () => res, json: (b) => resolve(b.data ?? b) };
		handler({ params, query: {}, body: {}, user }, res, (e) =>
			e ? reject(e) : resolve(undefined),
		);
	});

test('listEnrollments: chỉ courses:read ⇒ mã đăng ký bị che', async () => {
	const [row] = await call(courseCtrl.listEnrollments, mk('courses:read'), { id: 'KH1' });
	assert.notEqual(row.registration.code, CODE);
	assert.match(row.registration.code, /^DK•+GHJK$/);
});

test('listEnrollments: có trainees:read_sensitive ⇒ mã đầy đủ', async () => {
	const [row] = await call(
		courseCtrl.listEnrollments,
		mk('courses:read', 'trainees:read_sensitive'),
		{ id: 'KH1' },
	);
	assert.equal(row.registration.code, CODE);
});

test('getEnrollment: che / không che theo trainees:read_sensitive', async () => {
	const masked = await call(practiceCtrl.getEnrollment, mk('courses:read'), { enrollmentId: 'E1' });
	assert.notEqual(masked.registration.code, CODE);
	const full = await call(
		practiceCtrl.getEnrollment,
		mk('courses:read', 'trainees:read_sensitive'),
		{
			enrollmentId: 'E1',
		},
	);
	assert.equal(full.registration.code, CODE);
});
