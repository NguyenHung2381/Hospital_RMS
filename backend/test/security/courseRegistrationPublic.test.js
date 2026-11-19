// Form đăng ký khóa đào tạo liên tục trên cổng công khai (ẩn danh, có dữ liệu cá nhân),
// chạy trên CSDL giả:
//   - CCCD sai cấu trúc / lệch giới tính / lệch năm sinh bị chặn (400) trước khi ghi gì
//   - OTP email: sai mã, hết hạn, quá số lượt thử, mã dùng 1 lần, token gắn đúng email
//   - gửi đăng ký đòi email_token khi bật OTP, không đòi khi tắt
//   - nội viện: khớp lại mã NV + họ tên ở server, khoa / trình độ lấy từ hồ sơ nhân sự
//   - tra cứu / tải đơn / nộp hồ sơ theo mã đòi yếu tố thứ hai; sai mã ≡ sai yếu tố (cùng 404)
//   - hồ sơ nộp bổ sung nhận đúng 1 file PDF
process.env.JWT_SECRET = 'test-secret';
process.env.TOTP_ENC_KEY = 'a'.repeat(64);
const test = require('node:test');
const assert = require('node:assert/strict');
const { validationResult } = require('express-validator');
const { install } = require('../auth/fakeDb');

const STAFF = {
	id: 'U1',
	full_name: 'Lê Văn Bình',
	staff_number: 123,
	email: 'binh@bvnghean.vn',
	department_id: 'K1',
	qualification: 'Bác sĩ chuyên khoa I',
	department_name: 'Khoa Nội',
};
const NO_EMAIL_STAFF = { ...STAFF, id: 'U2', staff_number: 456, email: 'u2@member.local' };

const otps = new Map(); // id → dòng registration_email_otps
const regs = new Map(); // registration_code → dòng đọc ra (SELECT_REGISTRATION)
const log = install(async (text, inputs) => {
	if (/FROM registration_email_otps WHERE email_hash = @h AND created_at/.test(text))
		return [...otps.values()]
			.filter((r) => r.email_hash === inputs.h && Date.now() - r.created < 60_000)
			.map(() => ({ x: 1 }));
	if (/DELETE FROM registration_email_otps WHERE email_hash = @h/.test(text)) {
		for (const [id, r] of otps) if (r.email_hash === inputs.h) otps.delete(id);
		otps.set(inputs.id, {
			id: inputs.id,
			email_hash: inputs.h,
			staff_user_id: inputs.sid,
			code_hash: inputs.code_hash,
			attempts: 0,
			created: Date.now(),
			expires: Date.now() + inputs.min * 60_000,
		});
		return [];
	}
	if (/UPDATE registration_email_otps SET attempts/.test(text)) {
		const r = otps.get(inputs.id);
		if (!r || r.attempts >= inputs.max || r.expires <= Date.now()) return [];
		r.attempts += 1;
		return [r];
	}
	if (/DELETE FROM registration_email_otps WHERE id = @id/.test(text)) {
		otps.delete(inputs.id);
		return [];
	}
	if (/FROM users u/.test(text))
		return [STAFF, NO_EMAIL_STAFF].filter((u) => u.staff_number === inputs.sn);
	if (/FROM course_registrations r[\s\S]*WHERE r.registration_code = @code/.test(text)) {
		const r = regs.get(inputs.code);
		return r ? [r] : [];
	}
	if (/SELECT dossier_file_id FROM course_registrations/.test(text)) {
		const r = [...regs.values()].find((x) => x.enrollment_id === inputs.id);
		return r ? [{ dossier_file_id: r.dossier_file_id }] : [];
	}
	if (/UPDATE course_registrations/.test(text) && /dossier_file_id = @file_id/.test(text))
		return [{ dossier_uploaded_at: new Date('2026-11-19T08:00:00Z') }];
	if (/FROM trainee_types WHERE id = @id/.test(text)) return [{ name: 'Bác sĩ' }];
	return [];
});

// Mọi thứ ngoài CSDL giả: captcha, cấu hình, mail, file, ghi danh — vá TRƯỚC khi nạp controller
require('../../src/utils/captcha').verifyCaptcha = async () => true;
const settings = {};
require('../../src/modules/settings/systemSettingService').getValue = async (k) => settings[k];
const mailService = require('../../src/modules/notifications/mailService');
const sentCodes = [];
mailService.renderRegistrationOtpEmail = ({ code }) => {
	sentCodes.push(code);
	return code;
};
mailService.isEnabled = async () => true;
let mailFails = false;
const mails = [];
mailService.send = async (m) => {
	if (mailFails) throw new Error('SMTP down');
	mails.push(m);
};
const mailQueue = require('../../src/modules/notifications/mailQueue');
const trainingFileService = require('../../src/modules/training/trainingFileService');
trainingFileService.saveUploadedFile = async () => ({ id: 'TF_NEW' });
const softDeleted = [];
trainingFileService.softDelete = async (id) => softDeleted.push(id);
require('../../src/modules/forms/formCustomValueService').save = async () => {};
const courseService = require('../../src/modules/training/courses/courseService');
courseService.getById = async () => ({
	id: 'KH1',
	name: 'Nội soi tiêu hóa',
	status: 'draft',
	is_public_registration: true,
	enrollment_open: true,
});
const courseEnrollmentService = require('../../src/modules/training/courses/courseEnrollmentService');
const staffEnrolled = [];
let staffEnrollError = null;
courseEnrollmentService.registerStaff = async (courseId, userId, actorId, opts) => {
	if (staffEnrollError) throw staffEnrollError;
	staffEnrolled.push({ courseId, userId, actorId, opts });
	return { id: 'DK202611190001' };
};
courseEnrollmentService.registerTrainee = async () => ({ id: 'DK202611190002' });
const traineeService = require('../../src/modules/training/trainees/traineeService');
const traineesCreated = [];
traineeService.create = async (data) => {
	traineesCreated.push(data);
	return { id: 'HV-NEW' };
};
const registrationDocumentService = require('../../src/modules/training/registration/registrationDocumentService');
const rendered = [];
registrationDocumentService.renderApplication = async (data) => {
	rendered.push(data);
	return {
		buffer: Buffer.from('docx'),
		filename: 'don.docx',
		mime: registrationDocumentService.DOCX_MIME,
	};
};

const emailOtp = require('../../src/modules/training/registration/registrationEmailOtpService');
const reg = require('../../src/modules/public/publicCourseRegistrationService');
const controller = require('../../src/modules/public/publicPortalController');
const validators = require('../../src/modules/public/courseRegistration.validators');
const { signToken } = require('../../src/utils/keys');

const tick = () => new Promise((r) => setImmediate(r));
const regInserts = () => log.filter((q) => /INSERT INTO course_registrations/i.test(q.text));
const reset = () => {
	log.length = 0;
	otps.clear();
	sentCodes.length = 0;
	mails.length = 0;
	staffEnrolled.length = 0;
	traineesCreated.length = 0;
	staffEnrollError = null;
	mailFails = false;
	for (const k of Object.keys(settings)) delete settings[k];
};

// Chạy controller như express (asyncHandler gọi next(err) khi lỗi)
const call = (handler, body, files = []) =>
	new Promise((resolve) => {
		const out = { status: 200 };
		const res = {
			status(c) {
				out.status = c;
				return res;
			},
			json(b) {
				out.body = b;
				resolve(out);
				return res;
			},
		};
		handler({ body, files, ip: '127.0.0.1' }, res, (err) =>
			resolve({ status: err.statusCode || 500, body: { message: err.message } }),
		);
	});

const runChain = async (chain, body) => {
	const req = { body: { ...body } };
	for (const v of chain) await v.run(req);
	return validationResult(req)
		.array()
		.map((e) => e.path);
};

const VALID_EXTERNAL = {
	source: 'external',
	full_name: 'Nguyễn Thị Hoa',
	course_id: 'KH1',
	captcha_token: 'x',
	rules_accepted: true,
	declared_true: true,
	national_id: '040301001234', // 3 = nữ sinh 20xx, 01 = 2001
	dob: '2001-03-04',
	gender: 'female',
	email: 'hoa@example.com',
	graduated_year: 2023,
	invoice_org_name: 'Phòng khám A',
};

// ─── CCCD + cam kết ─────────────────────────────────────────────────────────
test('validator: CCCD lệch giới tính / năm sinh / sai cấu trúc bị chặn; hợp lệ thì qua', async () => {
	assert.deepEqual(await runChain(validators.registration, VALID_EXTERNAL), []);
	assert.ok(
		(await runChain(validators.registration, { ...VALID_EXTERNAL, gender: 'male' })).includes(
			'national_id',
		),
	);
	assert.ok(
		(await runChain(validators.registration, { ...VALID_EXTERNAL, dob: '1990-03-04' })).includes(
			'national_id',
		),
	);
	assert.ok(
		(
			await runChain(validators.registration, { ...VALID_EXTERNAL, national_id: '04030100123' })
		).includes('national_id'),
	);
	assert.ok(
		(
			await runChain(validators.registration, { ...VALID_EXTERNAL, national_id: '040901001234' })
		).includes('national_id'),
		'số thứ 4 > 5 là sai cấu trúc',
	);
});

test('validator: 2 cam kết phải là true, đối tượng phải hợp lệ, nội viện phải có mã NV', async () => {
	const errs = await runChain(validators.registration, {
		...VALID_EXTERNAL,
		rules_accepted: false,
		declared_true: 'yes',
		source: 'vip',
	});
	assert.ok(errs.includes('rules_accepted'));
	assert.ok(errs.includes('declared_true'));
	assert.ok(errs.includes('source'));
	assert.ok(
		(await runChain(validators.registration, { ...VALID_EXTERNAL, source: 'internal' })).includes(
			'staff_number',
		),
	);
	assert.deepEqual(
		await runChain(validators.registration, {
			...VALID_EXTERNAL,
			source: 'internal',
			staff_number: '123',
		}),
		[],
	);
});

// ─── OTP email ──────────────────────────────────────────────────────────────
const requestCode = async (body) => {
	const r = await reg.requestEmailOtp(body);
	await tick();
	return { ...r, code: sentCodes.at(-1) };
};

test('OTP: đúng mã ⇒ email_token gắn với băm email; mã chỉ dùng 1 lần', async () => {
	reset();
	const r = await requestCode({ source: 'external', email: 'Hoa@Example.com ' });
	assert.match(r.challenge_id, /^[a-f0-9]{32}$/);
	assert.equal(r.to_masked, 'H***@Example.com');
	assert.equal(r.ttl_min, emailOtp.OTP_TTL_MIN);
	assert.match(r.code, /^\d{6}$/);
	// Bảng không lưu email gốc, không lưu mã gốc
	const row = otps.get(r.challenge_id);
	assert.equal(row.email_hash, emailOtp.hashEmail('hoa@example.com'));
	assert.notEqual(row.code_hash, r.code);
	assert.ok(!JSON.stringify(log).includes('hoa@example.com'));

	const { email_token } = await reg.verifyEmailOtp(r.challenge_id, r.code);
	const proof = emailOtp.readToken(email_token);
	assert.ok(emailOtp.tokenMatchesEmail(proof, 'HOA@example.com'));
	assert.ok(!emailOtp.tokenMatchesEmail(proof, 'other@example.com'));
	assert.ok(!email_token.includes('hoa'), 'token không mang email gốc');
	await assert.rejects(reg.verifyEmailOtp(r.challenge_id, r.code), { statusCode: 400 });
});

test('OTP: sai mã, hết hạn, quá số lượt thử, challenge lạ — cùng 1 lỗi 400', async () => {
	reset();
	const r = await requestCode({ source: 'external', email: 'a@example.com' });
	const wrong = r.code === '000000' ? '111111' : '000000';
	const errors = [];
	const capture = (p) => p.catch((e) => errors.push([e.statusCode, e.message]));
	await capture(reg.verifyEmailOtp(r.challenge_id, wrong));
	await capture(reg.verifyEmailOtp('f'.repeat(32), r.code));
	// Quá MAX_ATTEMPTS lần sai: mã đúng cũng không dùng được nữa
	for (let i = 1; i < emailOtp.MAX_ATTEMPTS; i++)
		await capture(reg.verifyEmailOtp(r.challenge_id, wrong));
	await capture(reg.verifyEmailOtp(r.challenge_id, r.code));
	assert.equal(errors.length, emailOtp.MAX_ATTEMPTS + 2);
	assert.equal(new Set(errors.map((e) => e.join('|'))).size, 1, 'mọi lỗi giống hệt nhau');
	assert.equal(errors[0][0], 400);

	// Hết hạn
	otps.clear();
	const r2 = await requestCode({ source: 'external', email: 'b@example.com' });
	otps.get(r2.challenge_id).expires = Date.now() - 1;
	await assert.rejects(reg.verifyEmailOtp(r2.challenge_id, r2.code), { statusCode: 400 });
});

test('OTP: xin lại trong 60 giây bị chặn; mã mới thay mã cũ', async () => {
	reset();
	await requestCode({ source: 'external', email: 'c@example.com' });
	await assert.rejects(reg.requestEmailOtp({ source: 'external', email: 'c@example.com' }), {
		statusCode: 429,
	});
	assert.equal(otps.size, 1);
});

test('OTP nội viện: gửi tới email hồ sơ nhân sự nếu có email thật; không khớp nhân viên vẫn cùng hình dạng', async () => {
	reset();
	const r = await requestCode({
		source: 'internal',
		email: 'tu-nhap@example.com',
		staff_number: '123',
		full_name: 'le van binh',
	});
	assert.equal(r.to_masked, 'bi***@bvnghean.vn');
	assert.equal(otps.get(r.challenge_id).staff_user_id, 'U1');
	assert.equal(otps.get(r.challenge_id).email_hash, emailOtp.hashEmail(STAFF.email));

	// Nhân viên không có email thật ⇒ email đã nhập
	const r2 = await requestCode({
		source: 'internal',
		email: 'u2@example.com',
		staff_number: '456',
		full_name: 'Lê Văn Bình',
	});
	assert.equal(r2.to_masked, 'u***@example.com');
	// Không khớp ⇒ vẫn gửi tới email đã nhập, cùng các khóa
	const r3 = await requestCode({
		source: 'internal',
		email: 'x@example.com',
		staff_number: '999',
		full_name: 'Ai Đó',
	});
	assert.deepEqual(Object.keys(r3).sort(), Object.keys(r).sort());
	assert.equal(otps.get(r3.challenge_id).staff_user_id, null);
});

// ─── Gửi đăng ký: OTP bật / tắt ─────────────────────────────────────────────
const tokenFor = (email, sid) =>
	signToken(
		'registration-email',
		{ eh: emailOtp.hashEmail(email), ...(sid ? { sid } : {}) },
		'30m',
	);

test('đăng ký: bật OTP (mặc định) ⇒ thiếu / sai / lệch email token bị 400, không ghi gì', async () => {
	reset();
	for (const email_token of [undefined, 'rác', tokenFor('khac@example.com')]) {
		log.length = 0;
		const r = await call(controller.register, { ...VALID_EXTERNAL, email_token });
		assert.equal(r.status, 400, String(email_token));
		assert.match(r.body.message, /xác minh/);
		assert.equal(regInserts().length, 0);
		assert.equal(traineesCreated.length, 0);
	}
	// Token loại khác (download_token) không dùng thay được
	const wrongPurpose = signToken(
		'registration-download',
		{ eh: emailOtp.hashEmail(VALID_EXTERNAL.email) },
		'30m',
	);
	assert.equal(
		(await call(controller.register, { ...VALID_EXTERNAL, email_token: wrongPurpose })).status,
		400,
	);

	const ok = await call(controller.register, {
		...VALID_EXTERNAL,
		email_token: tokenFor('HOA@example.com'),
	});
	assert.equal(ok.status, 201);
	assert.deepEqual(Object.keys(ok.body.data).sort(), [
		'download_token',
		'registration_code',
		'submitted',
	]);
	assert.equal(regInserts()[0].inputs.verified_email, 'hoa@example.com');
});

test('đăng ký: tắt OTP ⇒ không cần email_token, không ghi email đã xác minh, không gửi mail', async () => {
	reset();
	settings.TRAINING_REGISTRATION_EMAIL_OTP = 'false';
	// CCCD khác: mỗi CCCD chỉ được gửi 5 lần/ngày (test trước đã dùng hết)
	const r = await call(controller.register, { ...VALID_EXTERNAL, national_id: '040301005678' });
	assert.equal(r.status, 201);
	assert.equal(regInserts().length, 1);
	assert.equal(regInserts()[0].inputs.verified_email, null);
	await mailQueue.drain();
	assert.equal(mails.length, 0);
});

test('đăng ký ngoại viện: bản khai chỉ chứa dữ liệu vừa gửi; hồ sơ học viên chỉ nhận TRAINEE_FIELDS; hóa đơn ghi cột riêng', async () => {
	reset();
	settings.TRAINING_REGISTRATION_EMAIL_OTP = 'false';
	await reg.register(
		{
			...VALID_EXTERNAL,
			hometown: 'Nghệ An',
			staff_number: '123',
			department_id: 'K1',
			foo: 'bar',
		},
		[],
		null,
	);
	const ins = regInserts()[0].inputs;
	const snapshot = JSON.parse(ins.snapshot);
	assert.equal(snapshot.hometown, 'Nghệ An');
	assert.equal(snapshot.foo, undefined);
	assert.equal(snapshot.staff_number, undefined, 'ngoại viện không có mã NV');
	assert.equal(snapshot.department_id, undefined);
	assert.equal(snapshot.invoice_org_name, undefined, 'hóa đơn không nằm trong bản khai');
	assert.equal(ins.invoice_org_name, 'Phòng khám A');
	assert.equal(ins.source, 'external');
	assert.equal(ins.staff_user_id, null);
	assert.equal(traineesCreated[0].hometown, undefined, 'quê quán chỉ nằm trong bản khai');
	assert.equal(traineesCreated[0].department_id, undefined);
	assert.equal(traineesCreated[0].national_id, VALID_EXTERNAL.national_id);
});

// ─── Nội viện ───────────────────────────────────────────────────────────────
const INTERNAL = {
	...VALID_EXTERNAL,
	source: 'internal',
	full_name: 'LE VAN  BINH',
	staff_number: '123',
	department_id: 'K9', // giá trị form — server phải bỏ qua
	qualification: 'Giáo sư', // giá trị form — server phải bỏ qua
	invoice_org_name: 'Không được ghi',
};

test('nội viện: khoa / trình độ / mã NV lấy từ hồ sơ nhân sự, ghi danh bằng registerStaff', async () => {
	reset();
	const ack = await reg.register(INTERNAL, [], null, {
		otpRequired: true,
		emailProof: emailOtp.readToken(tokenFor(STAFF.email, 'U1')),
	});
	assert.deepEqual(Object.keys(ack).sort(), ['download_token', 'registration_code', 'submitted']);
	assert.deepEqual(staffEnrolled, [
		{ courseId: 'KH1', userId: 'U1', actorId: null, opts: { programId: null } },
	]);
	assert.equal(traineesCreated.length, 0, 'không tự tạo hồ sơ học viên từ dữ liệu form');
	const ins = regInserts()[0].inputs;
	assert.equal(ins.source, 'internal');
	assert.equal(ins.staff_user_id, 'U1');
	assert.equal(ins.staff_number, 123);
	assert.equal(ins.department_id, 'K1');
	assert.equal(ins.invoice_org_name, null, 'nội viện không có hóa đơn');
	assert.equal(ins.verified_email, STAFF.email);
	const snapshot = JSON.parse(ins.snapshot);
	assert.equal(snapshot.department_id, 'K1');
	assert.equal(snapshot.qualification, STAFF.qualification);
	assert.equal(snapshot.staff_number, 123);
	assert.equal(snapshot.full_name, 'LE VAN  BINH'.trim());
	// Email xác nhận kèm mã đăng ký tới email đã xác minh
	await mailQueue.drain();
	assert.equal(mails.length, 1);
	assert.equal(mails[0].to, STAFF.email);
	assert.match(mails[0].html, new RegExp(ack.registration_code));
});

test('nội viện: sai họ tên / mã NV ⇒ 404 chung, không ghi danh; token không phải của nhân viên đó ⇒ 400', async () => {
	reset();
	await assert.rejects(reg.register({ ...INTERNAL, full_name: 'Người Khác' }, [], null), {
		statusCode: 404,
	});
	await assert.rejects(reg.register({ ...INTERNAL, staff_number: '999' }, [], null), {
		statusCode: 404,
	});
	// Nhân viên có email thật: token phải cấp cho email hồ sơ + đúng nhân viên
	for (const proof of [
		tokenFor(INTERNAL.email),
		tokenFor(STAFF.email),
		tokenFor(STAFF.email, 'U2'),
	]) {
		await assert.rejects(
			reg.register(INTERNAL, [], null, {
				otpRequired: true,
				emailProof: emailOtp.readToken(proof),
			}),
			{ statusCode: 400 },
		);
	}
	assert.equal(staffEnrolled.length, 0);
	assert.equal(regInserts().length, 0);
	// Nhân viên không có email thật: token của email đã nhập
	await reg.register({ ...INTERNAL, staff_number: '456' }, [], null, {
		otpRequired: true,
		emailProof: emailOtp.readToken(tokenFor(INTERNAL.email)),
	});
	assert.equal(staffEnrolled[0].userId, 'U2');
});

test('nội viện: gửi mail lỗi không làm hỏng đăng ký; 409 không lộ tên chương trình', async () => {
	reset();
	mailFails = true;
	const ack = await reg.register(INTERNAL, [], null, {
		otpRequired: true,
		emailProof: emailOtp.readToken(tokenFor(STAFF.email, 'U1')),
	});
	assert.equal(ack.submitted, true);
	await mailQueue.drain();

	const { httpError } = require('../../src/utils/httpError');
	staffEnrollError = httpError(409, 'Học viên đang theo học chương trình "Bí mật" (Khóa Y)');
	await assert.rejects(reg.register(INTERNAL, [], null), (e) => {
		assert.equal(e.statusCode, 409);
		assert.ok(!e.message.includes('Bí mật'));
		return true;
	});
});

test('staff-check: chỉ trả họ tên / khoa / trình độ / email đã che; không khớp ⇒ 404', async () => {
	reset();
	assert.deepEqual(await reg.staffCheck('123', 'lê văn bình'), {
		full_name: STAFF.full_name,
		department_id: 'K1',
		department_name: 'Khoa Nội',
		qualification: STAFF.qualification,
		email_masked: 'bi***@bvnghean.vn',
	});
	assert.equal((await reg.staffCheck('456', 'Lê Văn Bình')).email_masked, null);
	await assert.rejects(reg.staffCheck('123', 'Lê Văn'), { statusCode: 404 });
	await assert.rejects(reg.staffCheck('999', 'Lê Văn Bình'), { statusCode: 404 });
});

// ─── Tra cứu theo mã ────────────────────────────────────────────────────────
const REG = {
	enrollment_id: 'DK202611190001',
	registration_code: 'DKABCDEFGH23',
	source: 'internal',
	snapshot: { full_name: 'Lê Văn Bình', national_id: '040301001234', email: 'binh@bvnghean.vn' },
	verified_email: 'binh@bvnghean.vn',
	course_name: 'Nội soi tiêu hóa',
	program_name: 'Nội soi cơ bản',
	department_name: 'Khoa Nội',
	enrollment_status: 'pending',
	registered_at: new Date('2026-11-19T01:00:00Z'),
	created_at: new Date('2026-11-19T01:00:00Z'),
	dossier_file_id: null,
	dossier_uploaded_at: null,
	id_checked_at: null,
	degree_checked_at: new Date(),
	proposal_checked_at: null,
};
const putReg = (over = {}) => {
	regs.clear();
	const r = { ...REG, ...over };
	regs.set(r.registration_code, { ...r, snapshot: JSON.stringify(r.snapshot) });
	return r;
};
const downloadToken = (eid, rc) => signToken('registration-download', { eid, rc }, '30m');

test('tra cứu theo mã: cần yếu tố thứ hai; sai mã ≡ sai yếu tố (cùng 404, cùng thông điệp, cùng số truy vấn)', async () => {
	reset();
	putReg();
	const fails = [];
	const queriesFor = async (code, body) => {
		const before = log.length;
		await reg.resolveAccess(code, body).catch((e) => fails.push(`${e.statusCode}|${e.message}`));
		return log.length - before;
	};
	const counts = [
		await queriesFor('DKZZZZZZZZZZ', { national_id: REG.snapshot.national_id }), // sai mã
		await queriesFor('xx', { national_id: REG.snapshot.national_id }), // mã sai dạng
		await queriesFor(REG.registration_code, { national_id: '040301009999' }), // sai CCCD
		await queriesFor(REG.registration_code, { email: 'khac@example.com' }), // sai email
		await queriesFor(REG.registration_code, {}), // không có yếu tố
		await queriesFor(REG.registration_code, {
			download_token: downloadToken('DK202611190009', REG.registration_code),
		}),
		await queriesFor(REG.registration_code, {
			download_token: downloadToken(REG.enrollment_id, 'DKZZZZZZZZZZ'),
		}),
		await queriesFor(REG.registration_code, { download_token: 'rác' }),
	];
	assert.equal(fails.length, counts.length);
	assert.equal(new Set(fails).size, 1);
	assert.match(fails[0], /^404\|/);
	assert.equal(new Set(counts).size, 1, 'mọi nhánh sai cùng số truy vấn');

	// Đúng: CCCD / email (không phân biệt hoa thường, kể cả mã gõ thường có dấu '-') / download_token
	for (const body of [
		{ national_id: ` ${REG.snapshot.national_id} ` },
		{ email: 'BINH@bvnghean.vn' },
		{ download_token: downloadToken(REG.enrollment_id, REG.registration_code) },
	]) {
		const r = await reg.resolveAccess('dk-abcd efgh23', body);
		assert.equal(r.enrollment_id, REG.enrollment_id);
	}
});

test('tra cứu theo mã: trạng thái không lộ dữ liệu ngoài hợp đồng; đơn gom đủ tên khóa / chương trình / khoa', async () => {
	reset();
	const r = putReg({ snapshot: { ...REG.snapshot, trainee_type_id: 'TT1' } });
	const found = await reg.resolveAccess(r.registration_code, {
		national_id: r.snapshot.national_id,
	});
	const status = reg.getStatus(found);
	assert.deepEqual(Object.keys(status).sort(), [
		'checks',
		'course_name',
		'dossier_uploaded_at',
		'enrollment_status',
		'full_name',
		'needs_dossier',
		'program_name',
		'registered_at',
		'registration_code',
		'source',
	]);
	assert.equal(status.needs_dossier, true);
	assert.deepEqual(status.checks, {
		id_checked: false,
		degree_checked: true,
		proposal_checked: false,
	});
	assert.ok(!JSON.stringify(status).includes(r.snapshot.national_id));

	rendered.length = 0;
	await reg.renderApplication(found);
	assert.equal(rendered[0].registration_code, r.registration_code);
	assert.equal(rendered[0].course_name, 'Nội soi tiêu hóa');
	assert.equal(rendered[0].program_name, 'Nội soi cơ bản');
	assert.equal(rendered[0].department_name, 'Khoa Nội');
	assert.equal(rendered[0].trainee_type_name, 'Bác sĩ');
	assert.equal(rendered[0].snapshot.full_name, 'Lê Văn Bình');
});

test('hồ sơ nộp bổ sung: đúng 1 file PDF; thay file cũ; đã đối chiếu tờ trình thì không cho thay', async () => {
	reset();
	const r = putReg({ dossier_file_id: 'TF_OLD' });
	const found = await reg.resolveAccess(r.registration_code, { email: r.verified_email });
	const pdf = {
		originalname: 'ho-so.pdf',
		filename: 'x.pdf',
		size: 10,
		mimetype: 'application/pdf',
	};
	await assert.rejects(reg.uploadDossier(found, []), { statusCode: 400 });
	await assert.rejects(reg.uploadDossier(found, undefined), { statusCode: 400 });
	await assert.rejects(reg.uploadDossier(found, [pdf, pdf]), { statusCode: 400 });
	await assert.rejects(reg.uploadDossier(found, [{ ...pdf, originalname: 'anh.png' }]), {
		statusCode: 400,
	});
	assert.ok(!log.some((q) => /dossier_file_id = @file_id/.test(q.text)), 'file sai không được ghi');

	softDeleted.length = 0;
	const out = await reg.uploadDossier(found, [pdf]);
	assert.equal(out.uploaded, true);
	assert.ok(out.dossier_uploaded_at instanceof Date);
	const upd = log.find((q) => /dossier_file_id = @file_id/.test(q.text));
	assert.equal(upd.inputs.file_id, 'TF_NEW');
	assert.equal(upd.inputs.id, r.enrollment_id);
	assert.deepEqual(softDeleted, ['TF_OLD']);

	await assert.rejects(reg.uploadDossier({ ...found, proposal_checked_at: new Date() }, [pdf]), {
		statusCode: 409,
	});
});

test('honeypot: mã + token giả đúng định dạng, không dùng được để tra cứu, không ghi gì', async () => {
	reset();
	const fake = reg.fakeAck();
	assert.match(fake.registration_code, /^DK[A-HJ-NP-Z2-9]{10}$/);
	assert.equal(log.length, 0);
	putReg();
	await assert.rejects(
		reg.resolveAccess(REG.registration_code, { download_token: fake.download_token }),
		{
			statusCode: 404,
		},
	);
});

test('job dọn dữ liệu xoá OTP đăng ký đã hết hạn', async () => {
	reset();
	const job = require('../../src/jobs/accountMaintenanceJob');
	const pool = await require('../../src/config/db').getPool();
	await job.purgeExpiredRegistrationOtps(pool);
	const q = log.find((x) =>
		/DELETE FROM registration_email_otps WHERE expires_at < @now/.test(x.text),
	);
	assert.ok(q);
	assert.ok(Math.abs(q.inputs.now.getTime() - Date.now()) < 5000);
});
