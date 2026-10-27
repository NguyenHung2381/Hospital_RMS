// Luật cấu hình form (modules/forms/fieldRules.js) — thuần JS, không cần DB.
const test = require('node:test');
const assert = require('node:assert/strict');
const { getForm } = require('../../src/modules/forms/formRegistry');
const {
	resolve,
	validateValues,
	validateOverride,
	checkValue,
} = require('../../src/modules/forms/fieldRules');

const topic = getForm('topic');
const base = {
	title: 'Đề tài A',
	round_id: 'R1',
	category_id: 'C1',
	department_id: 'D1',
	article_type: 'de_tai',
};

test('không có cấu hình = giữ hành vi mặc định của registry', () => {
	const r = resolve(topic, null, 'admin');
	assert.equal(r.fields.title.required, true);
	assert.equal(r.fields.description.required, false);
	assert.equal(r.fields.department_id.required, true);
	assert.equal(r.fields.acceptance_score.editOnly, true);
	// Trường chỉ có ở form công khai không xuất hiện ở form quản trị
	assert.equal(r.fields.full_name, undefined);
	assert.deepEqual(r.custom, []);
});

test('ẩn trường theo từng form + đổi nhãn, bắt buộc', () => {
	const ov = { fields: { description: { hidden: ['public'], required: true, label: 'Tóm tắt' } } };
	assert.equal(validateOverride(topic, ov), null);
	const pub = resolve(topic, ov, 'public');
	assert.equal(pub.fields.description.visible, false);
	assert.equal(pub.fields.description.required, false);
	const adm = resolve(topic, ov, 'admin');
	assert.equal(adm.fields.description.label, 'Tóm tắt');
	assert.equal(validateValues(adm, base).errors.description, 'Vui lòng nhập Tóm tắt');
	// Bị ẩn thì không kiểm
	assert.deepEqual(
		validateValues(pub, {
			...base,
			full_name: 'A',
			staff_number: '1',
			phone: '0901234567',
			position: 'BS',
		}).errors,
		{},
	);
});

test('không cho ẩn / bỏ bắt buộc trường bị khóa', () => {
	assert.match(
		validateOverride(topic, { fields: { title: { hidden: ['admin'] } } }),
		/phải hiển thị/,
	);
	assert.match(
		validateOverride(topic, { fields: { round_id: { required: false } } }),
		/luôn bắt buộc/,
	);
	// department_id chỉ khóa bắt buộc ở form công khai ⇒ bỏ bắt buộc vẫn giữ ở đó
	const ov = { fields: { department_id: { required: false } } };
	assert.equal(validateOverride(topic, ov), null);
	assert.equal(resolve(topic, ov, 'portal').fields.department_id.required, false);
	assert.equal(resolve(topic, ov, 'public').fields.department_id.required, true);
});

test('ràng buộc chỉ được chặt hơn giới hạn cứng', () => {
	assert.match(
		validateOverride(topic, { fields: { title: { rules: { maxLength: 9000 } } } }),
		/không được vượt 500/,
	);
	assert.match(
		validateOverride(topic, { fields: { acceptance_score: { rules: { max: 101 } } } }),
		/không được vượt 100/,
	);
	assert.match(
		validateOverride(topic, { fields: { title: { rules: { min: 1 } } } }),
		/không áp dụng được/,
	);
	assert.match(
		validateOverride(topic, { fields: { round_id: { rules: { options: ['x'] } } } }),
		/không giới hạn được/,
	);
	assert.match(
		validateOverride(topic, { fields: { article_type: { rules: { options: ['xx'] } } } }),
		/không có trong danh sách/,
	);
	assert.equal(
		validateOverride(topic, { fields: { title: { rules: { minLength: 10, maxLength: 300 } } } }),
		null,
	);
});

test('kiểm giá trị: độ dài, số, ngày, lựa chọn bị thu hẹp', () => {
	const ov = {
		fields: {
			title: { rules: { minLength: 10 } },
			budget_estimated: { required: true, rules: { max: 1e9 } },
			acceptance_date: { rules: { maxDate: 'today' } },
			article_type: { rules: { options: ['de_tai'] } },
		},
	};
	assert.equal(validateOverride(topic, ov), null);
	const r = resolve(topic, ov, 'admin');
	const { errors } = validateValues(r, {
		...base,
		title: 'Ngắn',
		budget_estimated: '2000000000',
		acceptance_date: '2999-01-01',
	});
	assert.match(errors.title, /ít nhất 10/);
	assert.match(errors.budget_estimated, /lớn hơn 1.000.000.000/);
	// Ngày nghiệm thu chỉ có ở form sửa ⇒ kiểm khi sửa
	assert.equal(errors.acceptance_date, undefined);
	assert.match(
		validateValues(r, { article_type: 'de_tai', acceptance_date: '2999-01-01' }, { mode: 'update' })
			.errors.acceptance_date,
		/sau hôm nay/,
	);
	assert.match(
		validateValues(r, { ...base, article_type: 'bai_bao' }).errors.article_type,
		/không hợp lệ/,
	);
	assert.match(validateValues(r, base).errors.budget_estimated, /Vui lòng nhập/);
	// Bài báo không có kinh phí ⇒ không đòi
	assert.equal(
		validateValues(r, { ...base, article_type: 'bai_bao' }).errors.budget_estimated,
		undefined,
	);
});

test('when: trường bài báo chỉ bắt buộc khi loại = bài báo', () => {
	const ov = { fields: { journal_name: { required: true } } };
	const r = resolve(topic, ov, 'admin');
	// Form cổng nhân viên không có tên tạp chí
	assert.equal(resolve(topic, ov, 'portal').fields.journal_name, undefined);
	assert.equal(
		validateValues(r, { ...base, article_type: 'de_tai' }).errors.journal_name,
		undefined,
	);
	assert.match(
		validateValues(r, { ...base, article_type: 'bai_bao' }).errors.journal_name,
		/Vui lòng nhập/,
	);
	// Sửa từng phần không gửi article_type ⇒ không đòi lại
	assert.deepEqual(validateValues(r, { title: 'Đề tài mới' }, { mode: 'update' }).errors, {});
});

test('trường chỉ có ở form sửa không bị đòi khi tạo mới', () => {
	const r = resolve(topic, { fields: { budget_actual: { required: true } } }, 'admin');
	assert.deepEqual(validateValues(r, base).errors, {});
	assert.match(
		validateValues(r, { article_type: 'de_tai', budget_actual: null }, { mode: 'update' }).errors
			.budget_actual,
		/Vui lòng nhập/,
	);
});

test('sửa từng phần: chỉ kiểm trường gửi lên', () => {
	const r = resolve(topic, { fields: { description: { required: true } } }, 'admin');
	assert.deepEqual(validateValues(r, { is_featured: true }, { mode: 'update' }).errors, {});
	assert.match(
		validateValues(r, { description: '  ' }, { mode: 'update' }).errors.description,
		/Vui lòng nhập/,
	);
	// Không gửi custom khi sửa ⇒ không ghi đè
	assert.equal(validateValues(r, { is_featured: true }, { mode: 'update' }).custom, null);
});

test('trường tùy chỉnh: kiểm + chuẩn hóa giá trị', () => {
	const ov = {
		custom: [
			{
				key: 'cf_orcid',
				label: 'ORCID',
				type: 'text',
				required: true,
				rules: {
					pattern: '\\d{4}-\\d{4}-\\d{4}-\\d{3}[\\dX]',
					patternMessage: 'ORCID sai định dạng',
				},
			},
			{ key: 'cf_so_ca', label: 'Số ca', type: 'number', rules: { min: 1, integer: true } },
			{
				key: 'cf_nguon',
				label: 'Nguồn kinh phí',
				type: 'select',
				options: [
					{ value: 'bv', label: 'Bệnh viện' },
					{ value: 'ngoai', label: 'Ngoài' },
				],
			},
			{
				key: 'cf_tags',
				label: 'Từ khóa',
				type: 'multiselect',
				options: [{ value: 'a', label: 'A' }],
				rules: { maxItems: 1 },
			},
			{
				key: 'cf_cam_ket',
				label: 'Cam kết',
				type: 'checkbox',
				required: true,
				variants: ['public'],
			},
		],
	};
	assert.equal(validateOverride(topic, ov), null);
	const adm = resolve(topic, ov, 'admin');
	assert.equal(adm.custom.length, 4); // cam kết chỉ ở form công khai
	let out = validateValues(adm, base, {
		customValues: { cf_orcid: '123', cf_so_ca: '1.5', cf_nguon: 'x', cf_tags: ['a', 'b'] },
	});
	assert.equal(out.errors.cf_orcid, 'ORCID sai định dạng');
	assert.match(out.errors.cf_so_ca, /số nguyên/);
	assert.match(out.errors.cf_nguon, /không hợp lệ/);
	assert.match(out.errors.cf_tags, /không hợp lệ/);
	out = validateValues(adm, base, {
		customValues: { cf_orcid: ' 0000-0002-1825-009X ', cf_so_ca: '12' },
	});
	assert.deepEqual(out.errors, {});
	assert.deepEqual(out.custom, {
		cf_orcid: '0000-0002-1825-009X',
		cf_so_ca: 12,
		cf_nguon: null,
		cf_tags: null,
	});
	const pub = resolve(topic, ov, 'public');
	const pubCf = pub.custom.find((f) => f.key === 'cf_cam_ket');
	assert.match(checkValue(pubCf, false), /xác nhận/);
	assert.equal(checkValue(pubCf, true), null);
});

test('trường tùy chỉnh không hợp lệ bị từ chối khi lưu', () => {
	const cf = (x) => ({ custom: [{ key: 'cf_a', label: 'A', type: 'text', ...x }] });
	assert.match(validateOverride(topic, cf({ key: 'bad key' })), /Mã trường/);
	assert.match(validateOverride(topic, cf({ type: 'file' })), /không hỗ trợ/);
	assert.match(validateOverride(topic, cf({ type: 'select' })), /ít nhất 1 lựa chọn/);
	assert.match(
		validateOverride(topic, cf({ rules: { maxLength: 100000 } })),
		/không được vượt 500/,
	);
	assert.match(validateOverride(topic, cf({ rules: { pattern: '(a+)+$' } })), /lồng nhau/);
	assert.match(validateOverride(topic, cf({ rules: { pattern: '([a-z' } })), /không hợp lệ/);
	assert.match(validateOverride(topic, cf({ variants: ['khong_co'] })), /form áp dụng/);
	assert.match(
		validateOverride(topic, {
			custom: [
				{ key: 'cf_a', label: 'A', type: 'text' },
				{ key: 'cf_a', label: 'B', type: 'text' },
			],
		}),
		/bị trùng/,
	);
});

test('kinh phí ở cổng nhân viên: chỉ form nhập đề tài đã hoàn thành kiểm', () => {
	const ov = { fields: { budget_estimated: { required: true } } };
	const portal = resolve(topic, ov, 'portal');
	assert.equal(portal.fields.budget_estimated.editOnly, true);
	// Form đăng ký mới không có ô kinh phí ⇒ không đòi
	assert.equal(validateValues(portal, base).errors.budget_estimated, undefined);
	// Form nhập đề tài đã hoàn thành ⇒ đòi
	assert.equal(
		validateValues(portal, base, { includeEditOnly: true }).errors.budget_estimated,
		'Vui lòng nhập Kinh phí dự toán',
	);
	// Form quản trị vẫn đòi ngay khi tạo
	assert.equal(resolve(topic, ov, 'admin').fields.budget_estimated.editOnly, false);
});
