// Cấu hình form đợt 3 (module Đào tạo) — thuần JS, không cần DB.
const test = require('node:test');
const assert = require('node:assert/strict');
const { getForm } = require('../../src/modules/forms/formRegistry');
const { resolve, validateValues, validateOverride } = require('../../src/modules/forms/fieldRules');
const { bodyVariant } = require('../../src/modules/forms/formConfigGuard');
const { attachResult } = require('../../src/modules/forms/formCustomValueService');

test('đợt 3: các form đào tạo có trong registry, trường nghiệp vụ bị khóa', () => {
	const keys = [
		['trainee', 'admin', 'full_name'],
		['training_program', 'admin', 'code'],
		['training_program', 'admin', 'training_type_id'],
		['course', 'admin', 'name'],
		['lesson', 'admin', 'title'],
		['lecturer', 'admin', 'full_name'],
	];
	for (const [key, variant, locked] of keys) {
		const form = getForm(key);
		assert.ok(form, key);
		assert.equal(resolve(form, null, variant).fields[locked].required, true, `${key}.${locked}`);
		assert.ok(
			validateOverride(form, { fields: { [locked]: { required: false } } }),
			`${key}.${locked}`,
		);
	}
	// Ghi danh: 2 form (trong khóa học / hồ sơ thực hành) dùng chung bộ trường
	const enrollment = getForm('enrollment');
	assert.deepEqual(
		enrollment.variants.map((v) => v.key),
		['course', 'practice'],
	);
	assert.ok(validateOverride(enrollment, { fields: { program_id: { hidden: ['course'] } } }));
	assert.ok(
		validateOverride(getForm('course_session'), {
			fields: { session_date: { hidden: ['admin'] } },
		}),
	);
});

test('học viên: không nới giới hạn cột DB, năm tốt nghiệp là số nguyên', () => {
	const form = getForm('trainee');
	assert.ok(validateOverride(form, { fields: { full_name: { rules: { maxLength: 300 } } } }));
	assert.equal(
		validateOverride(form, { fields: { full_name: { rules: { maxLength: 100 } } } }),
		null,
	);
	const r = resolve(form, { fields: { phone: { required: true } } }, 'admin');
	const errs = validateValues(r, { full_name: 'Nguyễn Văn A', graduated_year: 2020.5 }).errors;
	assert.match(errs.phone, /Vui lòng nhập/);
	assert.match(errs.graduated_year, /số nguyên/);
	assert.deepEqual(
		validateValues(r, { full_name: 'Nguyễn Văn A', phone: '0912345678', graduated_year: 2020 })
			.errors,
		{},
	);
});

test('chương trình: thu hẹp phần thi cuối khóa, giá trị ngoài danh sách bị chặn', () => {
	const form = getForm('training_program');
	const ov = { fields: { exam_parts: { rules: { options: ['theory', 'both'] } } } };
	assert.equal(validateOverride(form, ov), null);
	const r = resolve(form, ov, 'admin');
	const base = { code: 'CT01', training_type_id: 1, name: 'Điều dưỡng cơ bản' };
	assert.ok(validateValues(r, { ...base, exam_parts: 'practice' }).errors.exam_parts);
	assert.deepEqual(validateValues(r, { ...base, exam_parts: 'both' }).errors, {});
});

test('bodyVariant: chỉ nhận variant cho phép, luôn gỡ form_variant khỏi body', () => {
	const pick = bodyVariant('course', 'practice');
	const a = { body: { form_variant: 'practice', note: 'x' } };
	assert.equal(pick(a), 'practice');
	assert.deepEqual(a.body, { note: 'x' });
	const b = { body: { form_variant: 'admin' } };
	assert.equal(pick(b), null);
	assert.deepEqual(b.body, {});
	// Request cũ không gửi form_variant ⇒ bỏ qua cấu hình (route dùng chung)
	assert.equal(pick({ body: { note: 'x' } }), null);
	assert.equal(pick({}), null);
});

test('attachResult: danh sách rỗng / không phải danh sách thì trả nguyên', async () => {
	assert.deepEqual(await attachResult('trainee', []), []);
	const paged = { data: [], total: 0 };
	assert.equal(await attachResult('trainee', paged), paged);
	assert.equal(await attachResult('trainee', null), null);
});
