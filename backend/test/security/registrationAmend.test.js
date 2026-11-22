// Người đăng ký tự sửa bản khai khóa ĐTLT (public/publicRegistrationAmendService.js), CSDL giả:
//   - chỉ khi lượt ghi danh còn chờ duyệt / danh sách chờ; tối đa MAX_AMENDMENTS lần
//   - không đổi được đối tượng; không có gì thay đổi ⇒ 400; họ tên ký phải khớp họ tên mới
//   - nội viện: họ tên / mã NV / khoa / trình độ giữ nguyên theo hồ sơ nhân sự
//   - ghi trước → sau, cờ sửa định danh, bản ghi ký nối chuỗi mã băm (prev_hash)
//   - OTP bật: email bản sửa phải khớp token; 2 lượt sửa cùng lúc ⇒ lượt sau 409
//   - validator: yếu tố thứ hai nằm trong access, phải có lý do + cam kết + chữ ký
process.env.JWT_SECRET = 'test-secret';
process.env.TOTP_ENC_KEY = 'a'.repeat(64);
const test = require('node:test');
const assert = require('node:assert/strict');
const { validationResult } = require('express-validator');
const { install } = require('../auth/fakeDb');

let amendRows = []; // course_registration_amendments đang có
let customRow = null; // form_custom_values.data
let updateHits = 1; // số dòng UPDATE course_registrations trúng (0 = có lượt sửa khác chen vào)
const staffEmail = 'binh@bvnghean.vn';
const log = install(async (text, inputs) => {
	if (/FROM course_registration_amendments WHERE enrollment_id = @id ORDER BY seq/.test(text))
		return amendRows;
	if (/FROM form_custom_values/.test(text)) return customRow ? [{ data: customRow }] : [];
	if (/SELECT email FROM users WHERE id = @id/.test(text)) return [{ email: staffEmail }];
	if (/UPDATE course_registrations SET/.test(text))
		return Array.from({ length: updateHits }, () => ({}));
	if (/INSERT INTO course_registration_amendments/.test(text)) return [{}];
	void inputs;
	return [];
});

const mails = [];
require('../../src/modules/notifications/mailService').send = async (m) => {
	mails.push(m);
};
const mailQueue = require('../../src/modules/notifications/mailQueue');
const svc = require('../../src/modules/public/publicRegistrationAmendService');
const emailOtp = require('../../src/modules/training/registration/registrationEmailOtpService');
const { signToken } = require('../../src/utils/keys');
const { verifyRecord } = require('../../src/modules/training/registration/registrationConsent');
const validators = require('../../src/modules/public/courseRegistration.validators');

const EXT_SNAPSHOT = {
	full_name: 'Nguyễn Thị Hoa',
	dob: '2001-03-04',
	gender: 'female',
	national_id: '040301001234',
	phone: '0911222333',
	email: 'hoa@example.com',
};
const extReg = (over = {}) => ({
	enrollment_id: 'E1',
	registration_code: 'DKABCDEFGHJK',
	source: 'external',
	enrollment_status: 'pending',
	course_name: 'Khóa 1',
	snapshot: { ...EXT_SNAPSHOT },
	verified_email: 'hoa@example.com',
	consent_hash: 'a'.repeat(64),
	amendment_count: 0,
	invoice_org_name: 'Phòng khám A',
	...over,
});
const body = (over = {}) => ({
	source: 'external',
	...EXT_SNAPSHOT,
	invoice_org_name: 'Phòng khám A',
	reason: 'Gõ nhầm số điện thoại',
	declared_true: true,
	data_consent: true,
	signature_name: 'Nguyễn Thị Hoa',
	...over,
});
const reset = () => {
	log.length = 0;
	amendRows = [];
	customRow = null;
	updateHits = 1;
	mails.length = 0;
};
const inserted = () =>
	log.find((q) => /INSERT INTO course_registration_amendments/.test(q.text))?.inputs;
const updated = () => log.find((q) => /UPDATE course_registrations SET/.test(q.text))?.inputs;

test('sửa số điện thoại: ghi trước → sau, bản khai mới, bản ghi ký nối mã băm bản gốc', async () => {
	reset();
	const out = await svc.amend(extReg(), body({ phone: '0988777666' }), null, {
		client: { ip: '1.2.3.4', userAgent: 'UA' },
	});
	assert.equal(out.seq, 1);
	assert.deepEqual(out.fields, ['phone']);
	assert.equal(out.identity_changed, false);
	const ins = inserted();
	assert.deepEqual(JSON.parse(ins.changes), [
		{ key: 'phone', before: '0911222333', after: '0988777666' },
	]);
	assert.equal(ins.reason, 'Gõ nhầm số điện thoại');
	assert.equal(ins.prev_hash, 'a'.repeat(64), 'lần sửa đầu nối vào mã của bản gốc');
	assert.ok(verifyRecord(ins.consent_record, ins.consent_hash));
	const rec = JSON.parse(ins.consent_record);
	assert.equal(rec.format, 'dtlt-amendment');
	assert.equal(rec.ip, '1.2.3.4');
	assert.equal(rec.commitments.length, 2);
	const up = updated();
	assert.equal(JSON.parse(up.snapshot).phone, '0988777666');
	assert.equal(up.count, 0, 'chặn ghi đè khi 2 lượt sửa cùng lúc');
	assert.ok(log.some((q) => q.text === 'COMMIT'));
	// Thư báo tới email đã xác minh: chỉ tên mục, không có giá trị
	await mailQueue.drain();
	assert.equal(mails.length, 1);
	assert.equal(mails[0].to, 'hoa@example.com');
	assert.ok(mails[0].html.includes(ins.consent_hash));
	assert.ok(!mails[0].html.includes('0988777666'), 'thư không in giá trị đã sửa');
});

test('sửa CCCD + ngày sinh: cờ định danh; lần sửa thứ 2 nối vào mã của lần 1', async () => {
	reset();
	amendRows = [{ seq: 1, consent_hash: 'b'.repeat(64) }];
	const out = await svc.amend(
		extReg({ amendment_count: 1 }),
		body({ dob: '2001-04-03', national_id: '040301004321' }),
		null,
	);
	assert.equal(out.seq, 2);
	assert.equal(out.identity_changed, true);
	assert.deepEqual(out.fields.sort(), ['dob', 'national_id']);
	assert.equal(inserted().prev_hash, 'b'.repeat(64));
	assert.equal(inserted().identity_changed, true);
	await mailQueue.drain();
});

test('chặn: đã duyệt / từ chối, quá số lần, đổi đối tượng, không đổi gì, chữ ký lệch họ tên mới', async () => {
	reset();
	for (const status of ['approved', 'rejected', 'completed'])
		await assert.rejects(svc.amend(extReg({ enrollment_status: status }), body(), null), {
			statusCode: 409,
		});
	await assert.rejects(svc.amend(extReg({ amendment_count: 5 }), body(), null), {
		statusCode: 409,
	});
	await assert.rejects(svc.amend(extReg(), body({ source: 'internal' }), null), {
		statusCode: 400,
	});
	await assert.rejects(svc.amend(extReg(), body(), null), (e) => {
		assert.equal(e.statusCode, 400);
		assert.match(e.message, /chưa thay đổi/);
		return true;
	});
	// Sửa họ tên thì phải ký theo họ tên MỚI
	await assert.rejects(svc.amend(extReg(), body({ full_name: 'Nguyễn Thị Hòa' }), null), {
		statusCode: 400,
	});
	assert.ok(!inserted(), 'không ghi gì');
	// Danh sách chờ vẫn sửa được
	const ok = await svc.amend(
		extReg({ enrollment_status: 'waitlisted' }),
		body({ full_name: 'Nguyễn Thị Hòa', signature_name: 'nguyễn thị hòa' }),
		null,
	);
	assert.equal(ok.identity_changed, true);
	await mailQueue.drain();
});

test('2 lượt sửa cùng lúc: UPDATE không trúng dòng nào ⇒ 409, rollback, không ghi lịch sử', async () => {
	reset();
	updateHits = 0;
	await assert.rejects(svc.amend(extReg(), body({ phone: '0900000000' }), null), {
		statusCode: 409,
	});
	assert.ok(log.some((q) => q.text === 'ROLLBACK'));
	assert.ok(!inserted());
});

test('nội viện: họ tên / mã NV / khoa / trình độ giữ theo hồ sơ nhân sự, hóa đơn không đổi', async () => {
	reset();
	const reg = extReg({
		source: 'internal',
		staff_user_id: 'U1',
		invoice_org_name: null,
		snapshot: {
			full_name: 'Lê Văn Bình',
			staff_number: 123,
			department_id: 'K1',
			qualification: 'Bác sĩ',
			phone: '0911',
		},
	});
	const out = await svc.amend(
		reg,
		{
			source: 'internal',
			full_name: 'Lê Văn Bình',
			staff_number: '999',
			department_id: 'K9',
			qualification: 'Giáo sư',
			phone: '0922',
			invoice_org_name: 'Không được ghi',
			reason: 'Đổi số điện thoại',
			declared_true: true,
			data_consent: true,
			signature_name: 'Lê Văn Bình',
		},
		null,
	);
	assert.deepEqual(out.fields, ['phone']);
	const snap = JSON.parse(updated().snapshot);
	assert.equal(snap.staff_number, 123);
	assert.equal(snap.department_id, 'K1');
	assert.equal(snap.qualification, 'Bác sĩ');
	assert.equal(updated().invoice_org_name, null);
	await mailQueue.drain();
});

test('OTP bật: email bản sửa phải khớp token; nội viện có email hồ sơ ⇒ token của đúng nhân viên', async () => {
	reset();
	const tokenFor = (email, sid) =>
		emailOtp.readToken(
			signToken(
				'registration-email',
				{ eh: emailOtp.hashEmail(email), ...(sid ? { sid } : {}) },
				'30m',
			),
		);
	// Token phát sai cách ⇒ readToken null ⇒ coi như chưa xác minh
	await assert.rejects(
		svc.amend(extReg(), body({ email: 'moi@example.com' }), null, {
			otpRequired: true,
			emailProof: null,
		}),
		{ statusCode: 400 },
	);
	// Token của email cũ không dùng cho email mới
	await assert.rejects(
		svc.amend(extReg(), body({ email: 'moi@example.com' }), null, {
			otpRequired: true,
			emailProof: tokenFor('hoa@example.com'),
		}),
		{ statusCode: 400 },
	);
	await svc.amend(extReg(), body({ email: 'moi@example.com' }), null, {
		otpRequired: true,
		emailProof: tokenFor('moi@example.com'),
	});
	assert.equal(updated().verified_email, 'moi@example.com');
	assert.equal(updated().email_changed, true);

	// Nội viện có email hồ sơ: token phải gửi tới email hồ sơ VÀ của đúng nhân viên
	const intReg = extReg({
		source: 'internal',
		staff_user_id: 'U1',
		snapshot: { full_name: 'Lê Văn Bình', phone: '0911' },
	});
	const intBody = {
		source: 'internal',
		full_name: 'Lê Văn Bình',
		phone: '0922',
		reason: 'Đổi số điện thoại',
		declared_true: true,
		data_consent: true,
		signature_name: 'Lê Văn Bình',
	};
	reset();
	await assert.rejects(
		svc.amend(intReg, intBody, null, { otpRequired: true, emailProof: tokenFor(staffEmail, 'U2') }),
		{ statusCode: 400 },
	);
	await svc.amend(intReg, intBody, null, {
		otpRequired: true,
		emailProof: tokenFor(staffEmail, 'U1'),
	});
	assert.equal(updated().verified_email, staffEmail);
	await mailQueue.drain();
});

test('trường tùy chỉnh: so theo giá trị, ghi vào form_custom_values trong cùng transaction', async () => {
	reset();
	customRow = JSON.stringify({ shirt: 'M' });
	const out = await svc.amend(extReg(), body(), { shirt: 'L' });
	assert.deepEqual(out.fields, ['custom.shirt']);
	assert.ok(log.some((q) => /form_custom_values/.test(q.text) && /INSERT|UPDATE/.test(q.text)));
	await mailQueue.drain();
});

test('getEditable: điền sẵn bản khai + hóa đơn; nội viện kèm email hồ sơ đã che; can_edit theo trạng thái', async () => {
	reset();
	const ext = await svc.getEditable(extReg());
	assert.equal(ext.can_edit, true);
	assert.equal(ext.amendments_left, 5);
	assert.equal(ext.invoice.invoice_org_name, 'Phòng khám A');
	assert.equal(ext.staff, null);
	const closed = await svc.getEditable(extReg({ enrollment_status: 'approved' }));
	assert.equal(closed.can_edit, false);
	assert.match(closed.closed_reason, /đã được Phòng Đào tạo xử lý/);
	const int = await svc.getEditable(
		extReg({ source: 'internal', staff_user_id: 'U1', snapshot: { full_name: 'Lê Văn Bình' } }),
	);
	assert.equal(int.invoice, null);
	assert.notEqual(int.staff.email_masked, staffEmail, 'email hồ sơ đã che');
});

// ─── Validator ───────────────────────────────────────────────────────────────
const runChain = async (chain, b) => {
	const req = { body: { ...b } };
	for (const v of chain) await v.run(req);
	return validationResult(req)
		.array()
		.map((e) => e.path);
};

test('validator: phải có access (CCCD / download_token), lý do, cam kết, chữ ký khớp', async () => {
	const ok = { ...body(), access: { national_id: '040301001234' }, captcha_token: 'x' };
	assert.deepEqual(await runChain(validators.amendment, ok), []);
	assert.ok((await runChain(validators.amendment, { ...ok, access: {} })).includes('access'));
	assert.ok(
		(
			await runChain(validators.amendment, { ...ok, access: { email: 'hoa@example.com' } })
		).includes('access'),
		'email không phải yếu tố thứ hai khi sửa',
	);
	assert.ok((await runChain(validators.amendment, { ...ok, reason: ' ' })).includes('reason'));
	assert.ok(
		(await runChain(validators.amendment, { ...ok, declared_true: false })).includes(
			'declared_true',
		),
	);
	assert.ok(
		(await runChain(validators.amendment, { ...ok, signature_name: 'Người khác' })).includes(
			'signature_name',
		),
	);
	assert.ok(
		(await runChain(validators.amendment, { ...ok, gender: 'male' })).includes('national_id'),
		'CCCD vẫn phải khớp giới tính / năm sinh',
	);
});
