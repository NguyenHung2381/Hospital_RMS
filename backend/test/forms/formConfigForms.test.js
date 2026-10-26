// Cấu hình form đợt 2 (form công khai + cổng người dùng) — thuần JS, không cần DB.
const test = require('node:test');
const assert = require('node:assert/strict');
const { getForm } = require('../../src/modules/forms/formRegistry');
const { resolve, validateValues, validateOverride } = require('../../src/modules/forms/fieldRules');
const { formConfigGuard } = require('../../src/modules/forms/formConfigGuard');

test('đợt 2: các form mới có trong registry, trường nghiệp vụ bị khóa', () => {
	const keys = [
		['topic_member', 'portal', 'ho_ten'],
		['seminar_participant', 'public', 'full_name'],
		['course_registration', 'public', 'full_name'],
		['cme_record', 'portal', 'title'],
		['leave_request', 'portal', 'reason'],
		['user_profile', 'profile', 'full_name'],
	];
	for (const [key, variant, locked] of keys) {
		const form = getForm(key);
		assert.ok(form, key);
		const r = resolve(form, null, variant);
		assert.equal(r.fields[locked].required, true, `${key}.${locked}`);
		// Trường khóa: không cho bỏ bắt buộc
		assert.ok(
			validateOverride(form, { fields: { [locked]: { required: false } } }),
			`${key}.${locked}`,
		);
	}
});

test('hội nghị: trường ngoại viện chỉ đòi khi nguồn = ngoài viện', () => {
	const r = resolve(getForm('seminar_participant'), null, 'public');
	const internal = validateValues(r, {
		source: 'internal',
		full_name: 'A',
		staff_number: '123',
	}).errors;
	assert.deepEqual(internal, {});
	const external = validateValues(r, {
		source: 'external',
		full_name: 'A',
		phone: '',
		organization: '',
	}).errors;
	assert.match(external.phone, /Vui lòng nhập/);
	assert.match(external.organization, /Vui lòng nhập/);
	// Mã NV chỉ đòi với người trong viện
	assert.equal(external.staff_number, undefined);
	assert.match(
		validateValues(r, { source: 'internal', full_name: 'A', staff_number: '' }).errors.staff_number,
		/Vui lòng nhập/,
	);
});

test('hội nghị: admin bỏ bắt buộc đơn vị công tác, SĐT vẫn khóa (dùng để chống trùng)', () => {
	const form = getForm('seminar_participant');
	const ov = { fields: { organization: { required: false } } };
	assert.equal(validateOverride(form, ov), null);
	const r = resolve(form, ov, 'public');
	const errs = validateValues(r, {
		source: 'external',
		full_name: 'A',
		phone: '0912345678',
		organization: '',
	}).errors;
	assert.deepEqual(errs, {});
	assert.ok(validateOverride(form, { fields: { phone: { required: false } } }));
});

test('đơn xin phép: lý do tối thiểu 5 ký tự là giới hạn cứng', () => {
	const form = getForm('leave_request');
	assert.match(
		validateOverride(form, { fields: { reason: { rules: { minLength: 3 } } } }),
		/tối thiểu/,
	);
	assert.equal(validateOverride(form, { fields: { reason: { rules: { minLength: 20 } } } }), null);
	const r = resolve(form, { fields: { reason: { rules: { minLength: 20 } } } }, 'portal');
	assert.match(
		validateValues(r, {
			type: 'absent',
			from_date: '2026-10-26',
			to_date: '2026-10-26',
			reason: 'Bị ốm',
		}).errors.reason,
		/ít nhất 20/,
	);
	// Xin đi muộn không có "Đến ngày"
	const late = validateValues(resolve(form, null, 'portal'), {
		type: 'late',
		from_date: '2026-10-26',
		reason: 'Kẹt xe giờ cao điểm',
	});
	assert.deepEqual(late.errors, {});
});

test('CME tự khai: năm luôn là số nguyên, giới hạn số buổi', () => {
	const form = getForm('cme_record');
	assert.match(
		validateOverride(form, { fields: { year: { rules: { integer: false } } } }),
		/số nguyên/,
	);
	const r = resolve(form, { fields: { quantity: { rules: { max: 10 } } } }, 'portal');
	assert.match(
		validateValues(r, { title: 'Tự học', year: 2026, quantity: 12 }).errors.quantity,
		/lớn hơn/,
	);
	assert.match(validateValues(r, { title: 'Tự học', year: 2026.5 }).errors.year, /số nguyên/);
});

test('guard: variant trả null ⇒ bỏ qua cấu hình, gỡ custom khỏi body', async () => {
	const guard = formConfigGuard('topic_member', { variant: () => null, mode: 'create' });
	const req = { body: { ho_ten: 'A', custom: { x: 1 } } };
	let called = false;
	await guard(req, {}, () => {
		called = true;
	});
	assert.equal(called, true);
	assert.equal(req.formCustom, null);
	assert.equal(req.body.custom, undefined);
});
