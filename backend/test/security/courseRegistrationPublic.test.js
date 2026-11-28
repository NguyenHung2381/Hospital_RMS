// Form đăng ký khóa đào tạo liên tục trên cổng công khai (ẩn danh, có dữ liệu cá nhân),
// chạy trên CSDL giả:
//   - CCCD sai cấu trúc / lệch giới tính / lệch năm sinh bị chặn (400) trước khi ghi gì
//   - OTP email: sai mã, hết hạn, quá số lượt thử, mã dùng 1 lần, token gắn đúng email
//   - gửi đăng ký đòi email_token khi bật OTP, không đòi khi tắt
//   - nội viện: khớp lại mã NV + họ tên ở server, khoa / trình độ lấy từ hồ sơ nhân sự
//   - tra cứu / tải đơn / nộp hồ sơ theo mã đòi yếu tố thứ hai; sai mã ≡ sai yếu tố (cùng 404)
//   - hồ sơ bắt buộc: mỗi loại 1 file PDF / JPG / PNG; thiếu ⇒ 400 trước captcha / giới hạn / ghi CSDL
//   - đơn + tờ trình nháp của nội viện: khớp lại mã NV + họ tên, giới hạn theo mã NV
//   - nộp / thay từng file theo mã đăng ký (/files/:kind)
// Trỏ Redis vào cổng không có ai nghe → bộ đếm lượt thử (attemptLimiter) chạy bằng bộ nhớ.
// Chạy `node --test` trực tiếp trên máy có Redis dev (6379) thì vài lượt đầu rơi vào bộ nhớ
// lúc Redis đang kết nối, lượt sau vào Redis — 2 bộ đếm lệch nhau làm L-01 chập chờn.
process.env.REDIS_PORT = '1';
process.env.JWT_SECRET = 'test-secret';
process.env.TOTP_ENC_KEY = 'a'.repeat(64);
const test = require('node:test');
const assert = require('node:assert/strict');
const { validationResult } = require('express-validator');
const { install } = require('../auth/fakeDb');
const { verifyRecord } = require('../../src/modules/training/registration/registrationConsent');
const {
	RULES_VERSION,
	CLASS_RULES,
	COMMITMENTS,
} = require('../../src/modules/training/registration/registrationConstants');

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

let prevFiles = new Map(); // kind → { file_id, trainee_document_id } đang có của lượt
let fileRows = []; // kết quả liệt kê hồ sơ của lượt (listFiles)
let oldDocStatus = 'pending'; // trạng thái dòng trainee_documents cũ khi thay file ngoại viện
let coursePrograms = []; // chương trình của khóa (course_programs)
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
	// course_registration_files: dòng cũ của 1 loại / ghi 1 loại / liệt kê hồ sơ của lượt
	if (/SELECT file_id, trainee_document_id FROM course_registration_files/.test(text))
		return prevFiles.has(inputs.kind) ? [prevFiles.get(inputs.kind)] : [];
	if (/INSERT INTO course_registration_files/.test(text))
		return [{ uploaded_at: new Date('2026-11-19T08:00:00Z') }];
	if (/FROM course_registration_files crf\s+JOIN training_files/.test(text)) return fileRows;
	if (/SELECT status FROM trainee_documents WHERE id = @id/.test(text))
		return [{ status: oldDocStatus }];
	if (/FROM course_programs cp/.test(text)) return coursePrograms;
	if (/FROM trainee_types WHERE id = @id/.test(text)) return [{ name: 'Bác sĩ' }];
	return [];
});

// Mọi thứ ngoài CSDL giả: captcha, cấu hình, mail, file, ghi danh — vá TRƯỚC khi nạp controller
let captchaCalls = 0;
require('../../src/utils/captcha').verifyCaptcha = async () => {
	captchaCalls += 1;
	return true;
};
const attemptLimiter = require('../../src/utils/attemptLimiter');
const attemptNames = []; // tên bộ đếm đã gọi attempts.hit
const realHit = attemptLimiter.hit;
attemptLimiter.hit = (name, ...rest) => {
	attemptNames.push(name);
	return realHit(name, ...rest);
};
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
const savedFiles = []; // file đã ghi training_files (nội viện)
trainingFileService.saveUploadedFile = async (entity, entityId, file) => {
	savedFiles.push({ entity, entityId, name: file.originalname });
	return { id: `TF_NEW${savedFiles.length}` };
};
const softDeleted = [];
trainingFileService.softDelete = async (id) => softDeleted.push(id);
require('../../src/modules/forms/formCustomValueService').save = async () => {};
const courseService = require('../../src/modules/training/courses/courseService');
let courseState = 'open'; // open | closed (ngoài thời gian đăng ký) | missing
courseService.getById = async () =>
	courseState === 'missing'
		? null
		: {
				id: 'KH1',
				name: 'Nội soi tiêu hóa',
				status: 'draft',
				is_public_registration: true,
				enrollment_open: courseState === 'open',
				start_date: new Date('2026-12-01T00:00:00Z'),
				end_date: new Date('2026-12-05T00:00:00Z'),
			};
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
const docsAdded = []; // giấy tờ ngoại viện thêm vào hồ sơ học viên
traineeService.addDocument = async (traineeId, file, actorId, opts) => {
	docsAdded.push({ traineeId, name: file.originalname, actorId, ...opts });
	return { id: `HS${docsAdded.length}`, file_id: `TF_DOC${docsAdded.length}` };
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
const proposals = [];
registrationDocumentService.renderProposal = async (data) => {
	proposals.push(data);
	return {
		buffer: Buffer.from('docx'),
		filename: 'To-trinh-khoa-noi-lop.docx',
		mime: registrationDocumentService.DOCX_MIME,
	};
};

const emailOtp = require('../../src/modules/training/registration/registrationEmailOtpService');
const reg = require('../../src/modules/public/publicCourseRegistrationService');
const controller = require('../../src/modules/public/publicPortalController');
const regController = require('../../src/modules/public/publicCourseRegistrationController');
const validators = require('../../src/modules/public/courseRegistration.validators');
const { signToken } = require('../../src/utils/keys');

const tick = () => new Promise((r) => setImmediate(r));
const regInserts = () => log.filter((q) => /INSERT INTO course_registrations/i.test(q.text));
const reset = () => {
	log.length = 0;
	captchaCalls = 0;
	attemptNames.length = 0;
	savedFiles.length = 0;
	docsAdded.length = 0;
	proposals.length = 0;
	rendered.length = 0;
	softDeleted.length = 0;
	prevFiles = new Map();
	fileRows = [];
	oldDocStatus = 'pending';
	coursePrograms = [];
	courseState = 'open';
	otps.clear();
	sentCodes.length = 0;
	mails.length = 0;
	staffEnrolled.length = 0;
	traineesCreated.length = 0;
	staffEnrollError = null;
	mailFails = false;
	for (const k of Object.keys(settings)) delete settings[k];
};

// File giả đúng hình dạng multer (không có path ⇒ service không chuyển file trên đĩa)
const fakeFile = (name, over = {}) => ({
	originalname: name,
	filename: `x-${name}`,
	size: 10,
	mimetype: 'application/pdf',
	...over,
});
// Nội viện: chỉ còn tờ trình đã duyệt (không bắt buộc lúc gửi — nộp bổ sung sau được)
const INT_FILES = {
	proposal_approved: fakeFile('to-trinh.jpg', { mimetype: 'image/jpeg' }),
};
const EXT_FILES = {
	national_id: fakeFile('cccd.pdf'),
	degree: fakeFile('bang.jpg', { mimetype: 'image/jpeg' }),
	license: fakeFile('cchn.png', { mimetype: 'image/png' }),
	decision: fakeFile('quyet-dinh.pdf'),
};
const filesFor = (source) => (source === 'internal' ? INT_FILES : EXT_FILES);
// { kind: file } → req.files của multer .fields(): { 'files[kind]': [file] }
const asMulter = (byKind) =>
	Object.fromEntries(Object.entries(byKind).map(([k, v]) => [`files[${k}]`, [v]]));

// Chạy controller như express (asyncHandler gọi next(err) khi lỗi). files: không truyền ⇒ đủ hồ sơ
// theo body.source; null ⇒ request không kèm file (không phải multipart)
const call = (handler, body, files) =>
	new Promise((resolve) => {
		const out = { status: 200, headers: {} };
		const res = {
			status(c) {
				out.status = c;
				return res;
			},
			setHeader(k, v) {
				out.headers[k.toLowerCase()] = v;
			},
			json(b) {
				out.body = b;
				resolve(out);
				return res;
			},
			end(buf) {
				out.buffer = buf;
				resolve(out);
			},
		};
		const reqFiles = files === undefined ? asMulter(filesFor(body.source)) : (files ?? undefined);
		handler({ body, files: reqFiles, params: {}, ip: '127.0.0.1' }, res, (err) =>
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
	data_consent: true,
	signature_name: ' nguyễn thị  HOA ', // ký: so khớp không phân biệt hoa thường / khoảng trắng thừa
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

test('validator: đồng ý xử lý dữ liệu phải là true; họ tên ký phải trùng họ tên khai', async () => {
	const noConsent = { ...VALID_EXTERNAL };
	delete noConsent.data_consent;
	assert.ok((await runChain(validators.registration, noConsent)).includes('data_consent'));
	const noSig = { ...VALID_EXTERNAL };
	delete noSig.signature_name;
	assert.ok((await runChain(validators.registration, noSig)).includes('signature_name'));
	for (const signature_name of ['', '   ', 'Nguyễn Thị Hoà', 'Nguyen Thi Hoa', 'Người Khác'])
		assert.ok(
			(await runChain(validators.registration, { ...VALID_EXTERNAL, signature_name })).includes(
				'signature_name',
			),
			`ký "${signature_name}" phải bị chặn`,
		);
	// Unicode tổ hợp (NFD) = dựng sẵn
	assert.deepEqual(
		await runChain(validators.registration, {
			...VALID_EXTERNAL,
			signature_name: 'Nguyễn Thị Hoa'.normalize('NFD'),
		}),
		[],
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
		EXT_FILES,
		null,
		{ client: { ip: '203.0.113.7', userAgent: 'Mozilla/5.0 Test' } },
	);
	const ins = regInserts()[0].inputs;
	// Bằng chứng xác nhận điện tử: nguyên văn nội quy + cam kết, họ tên ký, IP, thiết bị; băm SHA-256
	assert.match(ins.consent_hash, /^[0-9a-f]{64}$/);
	assert.ok(verifyRecord(ins.consent_record, ins.consent_hash));
	const rec = JSON.parse(ins.consent_record);
	assert.equal(rec.registration_code, ins.code, 'bản ghi mang đúng mã đăng ký của lượt này');
	assert.equal(rec.signature_name, 'nguyễn thị  HOA');
	assert.equal(rec.full_name, VALID_EXTERNAL.full_name);
	assert.equal(rec.ip, '203.0.113.7');
	assert.equal(rec.user_agent, 'Mozilla/5.0 Test');
	assert.equal(rec.rules_version, RULES_VERSION);
	assert.deepEqual(rec.rules, CLASS_RULES);
	assert.deepEqual(rec.commitments, Object.values(COMMITMENTS));
	assert.equal(ins.signature_name, 'nguyễn thị  HOA');
	assert.equal(ins.consent_ip, '203.0.113.7');
	assert.match(regInserts()[0].text, /data_consent_at/);
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
	// 4 giấy tờ → hồ sơ học viên của chính lượt ghi danh (chờ duyệt), mỗi loại 1 dòng course_registration_files
	assert.deepEqual(
		docsAdded.map((d) => [d.traineeId, d.docType, d.status, d.actorId, d.name]),
		[
			['HV-NEW', 'national_id', 'pending', null, 'cccd.pdf'],
			['HV-NEW', 'degree', 'pending', null, 'bang.jpg'],
			['HV-NEW', 'license', 'pending', null, 'cchn.png'],
			['HV-NEW', 'decision', 'pending', null, 'quyet-dinh.pdf'],
		],
	);
	const crf = log.filter((q) => /INSERT INTO course_registration_files/.test(q.text));
	assert.deepEqual(
		crf.map((q) => [q.inputs.id, q.inputs.kind, q.inputs.file_id, q.inputs.doc_id]),
		[
			['DK202611190002', 'national_id', 'TF_DOC1', 'HS1'],
			['DK202611190002', 'degree', 'TF_DOC2', 'HS2'],
			['DK202611190002', 'license', 'TF_DOC3', 'HS3'],
			['DK202611190002', 'decision', 'TF_DOC4', 'HS4'],
		],
	);
	assert.equal(
		savedFiles.length,
		0,
		'ngoại viện: file nằm ở hồ sơ học viên, không có file course_registration',
	);
});

// ─── Nội viện ───────────────────────────────────────────────────────────────
const INTERNAL = {
	...VALID_EXTERNAL,
	source: 'internal',
	full_name: 'LE VAN  BINH',
	signature_name: 'Le Van Binh',
	staff_number: '123',
	department_id: 'K9', // giá trị form — server phải bỏ qua
	qualification: 'Giáo sư', // giá trị form — server phải bỏ qua
	invoice_org_name: 'Không được ghi',
};

test('nội viện: chưa có tờ trình vẫn gửi đăng ký được (nộp bổ sung sau), không ghi file nào', async () => {
	reset();
	const ack = await reg.register(INTERNAL, {}, null, {
		otpRequired: true,
		emailProof: emailOtp.readToken(tokenFor(STAFF.email, 'U1')),
	});
	assert.ok(ack.registration_code);
	assert.equal(staffEnrolled.length, 1);
	assert.deepEqual(savedFiles, []);
	assert.ok(!log.some((q) => /INSERT INTO course_registration_files/.test(q.text)));
	await mailQueue.drain();
});

test('nội viện: khoa / trình độ / mã NV lấy từ hồ sơ nhân sự, ghi danh bằng registerStaff', async () => {
	reset();
	const ack = await reg.register(INTERNAL, INT_FILES, null, {
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
	// Tờ trình đã duyệt: file entity course_registration của lượt ghi danh, 1 dòng course_registration_files
	assert.deepEqual(savedFiles, [
		{ entity: 'course_registration', entityId: 'DK202611190001', name: 'to-trinh.jpg' },
	]);
	assert.deepEqual(
		log
			.filter((q) => /INSERT INTO course_registration_files/.test(q.text))
			.map((q) => [q.inputs.id, q.inputs.kind, q.inputs.file_id, q.inputs.doc_id]),
		[['DK202611190001', 'proposal_approved', 'TF_NEW1', null]],
	);
	assert.equal(docsAdded.length, 0, 'nội viện không ghi vào hồ sơ học viên');
	// Email xác nhận kèm mã đăng ký tới email đã xác minh
	await mailQueue.drain();
	assert.equal(mails.length, 1);
	assert.equal(mails[0].to, STAFF.email);
	assert.match(mails[0].html, new RegExp(ack.registration_code));
	// Thư kèm mã băm bản ghi xác nhận — bản đối chiếu độc lập nằm trong hộp thư người đăng ký
	assert.ok(mails[0].html.includes(ins.consent_hash));
	// Nội viện: họ tên trong bản ghi = họ tên hồ sơ nhân sự
	assert.equal(JSON.parse(ins.consent_record).full_name, STAFF.full_name);
});

test('nội viện: sai họ tên / mã NV ⇒ 404 chung, không ghi danh; token không phải của nhân viên đó ⇒ 400', async () => {
	reset();
	await assert.rejects(reg.register({ ...INTERNAL, full_name: 'Người Khác' }, INT_FILES, null), {
		statusCode: 404,
	});
	await assert.rejects(reg.register({ ...INTERNAL, staff_number: '999' }, INT_FILES, null), {
		statusCode: 404,
	});
	// Nhân viên có email thật: token phải cấp cho email hồ sơ + đúng nhân viên
	for (const proof of [
		tokenFor(INTERNAL.email),
		tokenFor(STAFF.email),
		tokenFor(STAFF.email, 'U2'),
	]) {
		await assert.rejects(
			reg.register(INTERNAL, INT_FILES, null, {
				otpRequired: true,
				emailProof: emailOtp.readToken(proof),
			}),
			{ statusCode: 400 },
		);
	}
	assert.equal(staffEnrolled.length, 0);
	assert.equal(regInserts().length, 0);
	// Nhân viên không có email thật: token của email đã nhập
	await reg.register({ ...INTERNAL, staff_number: '456' }, INT_FILES, null, {
		otpRequired: true,
		emailProof: emailOtp.readToken(tokenFor(INTERNAL.email)),
	});
	assert.equal(staffEnrolled[0].userId, 'U2');
});

test('nội viện: gửi mail lỗi không làm hỏng đăng ký; 409 không lộ tên chương trình', async () => {
	reset();
	mailFails = true;
	const ack = await reg.register(INTERNAL, INT_FILES, null, {
		otpRequired: true,
		emailProof: emailOtp.readToken(tokenFor(STAFF.email, 'U1')),
	});
	assert.equal(ack.submitted, true);
	await mailQueue.drain();

	const { httpError } = require('../../src/utils/httpError');
	staffEnrollError = httpError(409, 'Học viên đang theo học chương trình "Bí mật" (Khóa Y)');
	await assert.rejects(reg.register(INTERNAL, INT_FILES, null), (e) => {
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
		// Chỉ tên các trường hồ sơ đã có — không bao giờ kèm giá trị (CCCD, ngày sinh, SĐT...)
		known_fields: [],
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

// M-10: mã đăng ký + email là thứ cán bộ chỉ có courses:read xem được ở danh sách ghi danh ⇒
// email chỉ đủ để xem trạng thái; tải đơn (có CCCD đầy đủ) / nộp hồ sơ cần CCCD hoặc download_token.
test('M-10: tải đơn / nộp hồ sơ theo mã không nhận email làm yếu tố thứ hai (404 như sai yếu tố)', async () => {
	reset();
	putReg();
	const email = { email: REG.snapshot.email };
	// Service: allowEmail = false ⇒ email đúng vẫn 404, cùng số truy vấn như sai yếu tố
	const before = log.length;
	await assert.rejects(reg.resolveAccess(REG.registration_code, email, { allowEmail: false }), {
		statusCode: 404,
		message: 'Không tìm thấy đăng ký khớp với mã và thông tin đã nhập.',
	});
	const emailQueries = log.length - before;
	const mid = log.length;
	await reg.resolveAccess(REG.registration_code, {}).catch(() => {});
	assert.equal(emailQueries, log.length - mid, 'cùng số truy vấn như thiếu yếu tố');
	// Xem trạng thái vẫn nhận email
	assert.equal(
		(await reg.resolveAccess(REG.registration_code, email)).enrollment_id,
		REG.enrollment_id,
	);

	// Controller: /:code/application và /:code/files/:kind chặn email, nhận CCCD
	const run = (handler, body, params) =>
		new Promise((resolve) => {
			const out = { status: 200 };
			const res = {
				status(c) {
					out.status = c;
					return res;
				},
				setHeader() {},
				json(b) {
					out.body = b;
					resolve(out);
					return res;
				},
				end(buf) {
					out.buffer = buf;
					resolve(out);
				},
			};
			handler({ body, params, ip: '127.0.0.1' }, res, (err) =>
				resolve({ status: err.statusCode || 500, body: { message: err.message } }),
			);
		});
	const params = { code: REG.registration_code, kind: 'proposal_approved' };
	assert.equal((await run(regController.downloadApplication, email, params)).status, 404);
	assert.equal((await run(regController.uploadFile, email, params)).status, 404);
	assert.equal((await run(regController.getStatus, email, params)).status, 200, 'trạng thái');
	const byId = await run(
		regController.downloadApplication,
		{ national_id: REG.snapshot.national_id },
		params,
	);
	assert.equal(byId.status, 200, 'CCCD vẫn tải được đơn');
});

test('tra cứu theo mã: trạng thái không lộ dữ liệu ngoài hợp đồng; đơn gom đủ tên khóa / chương trình / khoa', async () => {
	reset();
	const r = putReg({ snapshot: { ...REG.snapshot, trainee_type_id: 'TT1' } });
	const found = await reg.resolveAccess(r.registration_code, {
		national_id: r.snapshot.national_id,
	});
	const status = await reg.getStatus(found);
	assert.deepEqual(Object.keys(status).sort(), [
		'can_upload',
		'course_name',
		'enrollment_status',
		'files',
		'files_missing',
		'full_name',
		'program_name',
		'registered_at',
		'registration_code',
		'source',
	]);
	assert.equal(status.can_upload, true);
	// Chưa nộp gì: luôn đủ dòng của đối tượng (nội viện: tờ trình — nộp bổ sung sau), báo còn thiếu
	assert.deepEqual(
		status.files.map((x) => [x.kind, x.label, x.required, x.later, x.legacy, x.uploaded_at]),
		[['proposal_approved', 'Tờ trình đã duyệt', false, true, false, null]],
	);
	assert.deepEqual(status.files_missing, ['proposal_approved']);
	assert.ok(!JSON.stringify(status).includes(r.snapshot.national_id));

	// Đơn cũ đã nộp đơn đã ký (loại thôi yêu cầu): vẫn hiện, đánh dấu legacy.
	// file_url KHÔNG bao giờ lộ ở cổng công khai
	fileRows = [
		{
			kind: 'application_signed',
			uploaded_at: new Date('2026-11-19T08:00:00Z'),
			file_id: 'TF1',
			file_name: 'don.pdf',
			file_url: '/uploads/training/course_registration/DK1/don.pdf',
			mime_type: 'application/pdf',
			review_status: null,
		},
	];
	const after = await reg.getStatus(found);
	assert.deepEqual(
		after.files.map((x) => [x.kind, x.legacy]),
		[
			['proposal_approved', false],
			['application_signed', true],
		],
	);
	assert.equal(after.files[1].file_name, 'don.pdf');
	assert.equal(after.files[1].file_url, null);
	assert.deepEqual(after.files_missing, ['proposal_approved']);
	assert.ok(!JSON.stringify(after).includes('/uploads/'));
	// Đơn đã xử lý: không nộp thêm được
	assert.equal(
		(await reg.getStatus({ ...found, enrollment_status: 'approved' })).can_upload,
		false,
	);
	assert.equal(
		(await reg.getStatus({ ...found, enrollment_status: 'waitlisted' })).can_upload,
		true,
	);

	rendered.length = 0;
	await reg.renderApplication(found);
	assert.equal(rendered[0].registration_code, r.registration_code);
	assert.equal(rendered[0].course_name, 'Nội soi tiêu hóa');
	assert.equal(rendered[0].program_name, 'Nội soi cơ bản');
	assert.equal(rendered[0].department_name, 'Khoa Nội');
	assert.equal(rendered[0].trainee_type_name, 'Bác sĩ');
	assert.equal(rendered[0].snapshot.full_name, 'Lê Văn Bình');
});

test('trạng thái ngoại viện: file bị từ chối tính là thiếu nhưng vẫn hiện trạng thái duyệt', async () => {
	reset();
	const r = putReg({ source: 'external' });
	const found = await reg.resolveAccess(r.registration_code, { email: r.verified_email });
	const row = (kind, review_status) => ({
		kind,
		uploaded_at: new Date('2026-11-19T08:00:00Z'),
		file_id: `TF_${kind}`,
		file_name: `${kind}.pdf`,
		file_url: `/uploads/${kind}.pdf`,
		mime_type: 'application/pdf',
		review_status,
	});
	fileRows = [
		row('national_id', 'rejected'),
		row('degree', 'approved'),
		row('license', 'pending'),
		row('decision', 'pending'),
	];
	const s = await reg.getStatus(found);
	assert.deepEqual(s.files_missing, ['national_id']);
	assert.deepEqual(
		s.files.map((x) => [x.kind, x.review_status]),
		[
			['national_id', 'rejected'],
			['degree', 'approved'],
			['license', 'pending'],
			['decision', 'pending'],
		],
	);
	assert.ok(s.files.every((x) => x.file_url === null));
});

test('/files/:kind: loại không thuộc đơn ⇒ 400; đơn đã xử lý ⇒ 409; chờ duyệt / danh sách chờ ⇒ nhận và thay file cũ', async () => {
	reset();
	const r = putReg();
	const found = await reg.resolveAccess(r.registration_code, { email: r.verified_email });
	const png = fakeFile('don-ky.png', { mimetype: 'image/png' });
	await assert.rejects(reg.uploadFile(found, 'proposal_approved', undefined), {
		statusCode: 400,
		message: 'Vui lòng chọn file cần nộp.',
	});
	// Loại của ngoại viện nộp vào đơn nội viện
	await assert.rejects(reg.uploadFile(found, 'national_id', png), {
		statusCode: 400,
		message: 'Loại hồ sơ không hợp lệ cho đơn này.',
	});
	await assert.rejects(reg.uploadFile(found, 'dossier', png), { statusCode: 400 });
	// Đơn đăng ký đã ký thôi yêu cầu ⇒ không nộp mới được
	await assert.rejects(reg.uploadFile(found, 'application_signed', png), {
		statusCode: 400,
		message: 'Loại hồ sơ không hợp lệ cho đơn này.',
	});
	// Đuôi ngoài PDF / JPG / PNG
	await assert.rejects(reg.uploadFile(found, 'proposal_approved', fakeFile('don.docx')), {
		statusCode: 400,
		message: 'Hồ sơ chỉ nhận file PDF, JPG hoặc PNG.',
	});
	assert.ok(
		!log.some((q) => /INSERT INTO course_registration_files/.test(q.text)),
		'file sai không được ghi',
	);

	// Có file cũ cùng loại ⇒ ghi file mới rồi xóa mềm file cũ
	prevFiles.set('proposal_approved', { file_id: 'TF_OLD', trainee_document_id: null });
	const out = await reg.uploadFile(found, 'proposal_approved', png);
	assert.deepEqual(Object.keys(out).sort(), ['files_missing', 'kind', 'uploaded_at']);
	assert.equal(out.kind, 'proposal_approved');
	assert.ok(out.uploaded_at instanceof Date);
	// listFiles giả trả [] ⇒ tờ trình vẫn tính là còn thiếu
	assert.deepEqual(out.files_missing, ['proposal_approved']);
	const ins = log.find((q) => /INSERT INTO course_registration_files/.test(q.text));
	assert.equal(ins.inputs.id, r.enrollment_id);
	assert.equal(ins.inputs.kind, 'proposal_approved');
	assert.equal(ins.inputs.file_id, 'TF_NEW1');
	assert.equal(ins.inputs.actor_id, null);
	assert.deepEqual(softDeleted, ['TF_OLD']);

	await reg.uploadFile({ ...found, enrollment_status: 'waitlisted' }, 'proposal_approved', png);
	for (const status of ['approved', 'rejected']) {
		log.length = 0;
		await assert.rejects(
			reg.uploadFile({ ...found, enrollment_status: status }, 'proposal_approved', png),
			(e) => e.statusCode === 409 && /Đơn đăng ký đã được xử lý/.test(e.message),
		);
		assert.ok(
			!log.some((q) => /INSERT INTO course_registration_files/.test(q.text)),
			'đơn đã xử lý không ghi',
		);
	}
});

test('/files/:kind ngoại viện: thay file ⇒ xóa dòng giấy tờ cũ còn chờ duyệt, giữ dòng đã duyệt / từ chối', async () => {
	reset();
	const r = putReg({ source: 'external' });
	const found = {
		...(await reg.resolveAccess(r.registration_code, { email: r.verified_email })),
		trainee_id: 'HV1',
	};
	const removed = [];
	const traineeServiceMod = require('../../src/modules/training/trainees/traineeService');
	traineeServiceMod.removeDocument = async (id) => removed.push(id);
	const png = fakeFile('cccd-moi.png', { mimetype: 'image/png' });
	for (const [status, expectRemoved] of [
		['pending', ['HS_OLD']],
		['approved', []],
		['rejected', []],
	]) {
		removed.length = 0;
		docsAdded.length = 0;
		oldDocStatus = status;
		prevFiles.set('national_id', { file_id: 'TF_OLD', trainee_document_id: 'HS_OLD' });
		await reg.uploadFile(found, 'national_id', png);
		assert.deepEqual(removed, expectRemoved, status);
		assert.deepEqual(
			docsAdded.map((d) => [d.traineeId, d.docType, d.status]),
			[['HV1', 'national_id', 'pending']],
		);
	}
	assert.deepEqual(softDeleted, [], 'ngoại viện không xóa mềm file trực tiếp');
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

// ─── Hồ sơ bắt buộc khi gửi đăng ký ─────────────────────────────────────────
const NO_FILES_STEPS = (label) => `${label}: không gọi captcha / bộ đếm giới hạn / ghi CSDL nào`;
const assertNothingHappened = (label) => {
	assert.equal(captchaCalls, 0, NO_FILES_STEPS(label));
	assert.deepEqual(attemptNames, [], NO_FILES_STEPS(label));
	assert.equal(regInserts().length, 0, label);
	assert.equal(traineesCreated.length, 0, label);
	assert.equal(staffEnrolled.length, 0, label);
	assert.equal(
		log.filter((q) => /INSERT INTO|UPDATE /.test(q.text)).length,
		0,
		`${label}: không ghi CSDL`,
	);
};

test('đăng ký: thiếu hồ sơ ⇒ 400 liệt kê nhãn đúng thứ tự, trước captcha / giới hạn / ghi CSDL', async () => {
	reset();
	// Ngoại viện: không file nào (kể cả request không phải multipart)
	for (const files of [{}, null]) {
		const r = await call(controller.register, VALID_EXTERNAL, files);
		assert.equal(r.status, 400);
		assert.equal(
			r.body.message,
			'Vui lòng đính kèm đủ hồ sơ bắt buộc: Căn cước công dân, Bằng tốt nghiệp, Chứng chỉ hành nghề, Quyết định cử đi học.',
		);
		assertNothingHappened('ngoại viện không file');
	}
	// Thiếu 1 loại
	const { license: _l, ...noLicense } = EXT_FILES;
	const r = await call(controller.register, VALID_EXTERNAL, asMulter(noLicense));
	assert.equal(r.status, 400);
	assert.equal(r.body.message, 'Vui lòng đính kèm đủ hồ sơ bắt buộc: Chứng chỉ hành nghề.');
	assertNothingHappened('thiếu 1 loại');
});

test('đăng ký: file loại của đối tượng kia / đuôi ngoài PDF-JPG-PNG ⇒ 400 trước captcha và ghi CSDL', async () => {
	reset();
	let r = await call(
		controller.register,
		VALID_EXTERNAL,
		asMulter({ ...EXT_FILES, proposal_approved: INT_FILES.proposal_approved }),
	);
	assert.equal(r.status, 400);
	assert.equal(r.body.message, 'Hồ sơ "Tờ trình đã duyệt" không thuộc đối tượng đăng ký đã chọn.');
	r = await call(
		controller.register,
		INTERNAL,
		asMulter({ ...INT_FILES, national_id: EXT_FILES.national_id }),
	);
	assert.equal(r.status, 400);
	assert.equal(r.body.message, 'Hồ sơ "Căn cước công dân" không thuộc đối tượng đăng ký đã chọn.');
	r = await call(
		controller.register,
		VALID_EXTERNAL,
		asMulter({ ...EXT_FILES, degree: fakeFile('bang.docx') }),
	);
	assert.equal(r.status, 400);
	assert.equal(r.body.message, 'Hồ sơ chỉ nhận file PDF, JPG hoặc PNG.');
	assertNothingHappened('sai loại / sai đuôi');
});

test('đăng ký: honeypot không kèm file vẫn nhận phản hồi giả cùng hình dạng, không ghi gì', async () => {
	reset();
	const ok = await call(controller.register, { ...VALID_EXTERNAL, website: 'http://spam' }, null);
	assert.equal(ok.status, 201);
	assert.deepEqual(Object.keys(ok.body.data).sort(), [
		'download_token',
		'registration_code',
		'submitted',
	]);
	assert.equal(ok.body.message, 'Đã nhận đăng ký khóa học, vui lòng chờ duyệt.');
	assert.equal(log.length, 0);
	assertNothingHappened('honeypot');
});

test('đăng ký: gửi đủ hồ sơ ⇒ captcha + giới hạn theo CCCD chạy sau khi kiểm file', async () => {
	reset();
	settings.TRAINING_REGISTRATION_EMAIL_OTP = 'false';
	const r = await call(controller.register, { ...VALID_EXTERNAL, national_id: '040301009012' });
	assert.equal(r.status, 201, JSON.stringify(r.body));
	assert.equal(captchaCalls, 1);
	assert.deepEqual(attemptNames, ['course-registration']);
	assert.equal(docsAdded.length, 4);
});

// ─── Giấy tờ nháp của nội viện ─────────────────────────────────────────────
const DRAFT_BASE = {
	source: 'internal',
	course_id: 'KH1',
	staff_number: '123',
	full_name: 'lê văn bình',
	dob: '2001-03-04',
	national_id: '040301001234',
	gender: 'female',
	phone: '0912345678',
	foo: 'khóa thừa bị bỏ qua',
};
const errorsOf = async (chain, body) => {
	const req = { body: { ...body } };
	for (const v of chain) await v.run(req);
	return validationResult(req).array();
};

test('đơn nháp: validator chỉ nhận nội viện, không đòi captcha / cam kết', async () => {
	assert.deepEqual(await errorsOf(validators.draftApplication, DRAFT_BASE), []);
	const bad = await errorsOf(validators.draftApplication, { ...DRAFT_BASE, source: 'external' });
	assert.deepEqual(
		bad.map((e) => [e.path, e.msg]),
		[['source', 'Chỉ nhân viên nội viện mới tải đơn điền sẵn ở bước này.']],
	);
	assert.ok(
		(await errorsOf(validators.draftApplication, { ...DRAFT_BASE, staff_number: 'abc' })).some(
			(e) => e.path === 'staff_number',
		),
	);
	assert.ok(
		(await errorsOf(validators.draftApplication, { ...DRAFT_BASE, national_id: '123' })).some(
			(e) => e.path === 'national_id',
		),
	);
	assert.deepEqual(
		await errorsOf(validators.draftProposal, {
			course_id: 'KH1',
			staff_number: '123',
			full_name: 'A',
		}),
		[],
	);
	assert.deepEqual(
		(
			await errorsOf(validators.draftProposal, {
				course_id: '',
				staff_number: '12a',
				full_name: '',
			})
		)
			.map((e) => e.path)
			.sort(),
		['course_id', 'full_name', 'staff_number'],
	);
});

test('đơn nháp: khớp lại nhân viên, lấy khoa / trình độ từ hồ sơ nhân sự; đơn không mã, không ngày lập', async () => {
	reset();
	const r = await call(regController.draftApplication, DRAFT_BASE);
	assert.equal(r.status, 200);
	assert.equal(r.headers['content-type'], registrationDocumentService.DOCX_MIME);
	assert.match(r.headers['content-disposition'], /^attachment; filename\*=UTF-8''/);
	assert.equal(r.headers['cache-control'], 'no-store');
	assert.equal(r.buffer.toString(), 'docx');
	const d = rendered[0];
	assert.equal(d.draft, true);
	assert.equal(d.source, 'internal');
	assert.equal(d.registration_code, null);
	assert.equal(d.created_at, null);
	assert.equal(d.course_name, 'Nội soi tiêu hóa');
	assert.equal(d.program_name, null);
	assert.equal(d.department_name, 'Khoa Nội');
	assert.equal(d.snapshot.department_id, 'K1');
	assert.equal(d.snapshot.qualification, STAFF.qualification);
	assert.equal(d.snapshot.staff_number, 123);
	assert.equal(d.snapshot.phone, '0912345678');
	assert.equal(d.snapshot.foo, undefined);
	assert.equal(captchaCalls, 0, 'không dùng captcha');
	assert.deepEqual(attemptNames, ['course-reg-draft']);
	assert.ok(!log.some((q) => /INSERT INTO|UPDATE /.test(q.text)), 'không ghi CSDL');
});

test('đơn / tờ trình nháp: sai mã NV hoặc họ tên ⇒ 404 chung, không sinh file', async () => {
	reset();
	for (const handler of [regController.draftApplication, regController.draftProposal]) {
		for (const over of [{ full_name: 'Người Khác' }, { staff_number: '999' }]) {
			const r = await call(handler, { ...DRAFT_BASE, ...over });
			assert.equal(r.status, 404);
			assert.equal(r.body.message, 'Không tìm thấy nhân viên khớp họ tên và mã nhân viên đã nhập.');
		}
	}
	assert.equal(rendered.length, 0);
	assert.equal(proposals.length, 0);
});

test('đơn / tờ trình nháp: quá 20 lượt / mã NV / giờ (dùng chung 2 loại) ⇒ 429', async () => {
	reset();
	const body = { ...DRAFT_BASE, staff_number: '555' };
	for (let i = 0; i < 20; i++) {
		const handler = i % 2 ? regController.draftProposal : regController.draftApplication;
		assert.equal((await call(handler, body)).status, 404, `lượt ${i + 1}`);
	}
	for (const handler of [regController.draftApplication, regController.draftProposal]) {
		const r = await call(handler, body);
		assert.equal(r.status, 429);
		assert.equal(
			r.body.message,
			'Mã nhân viên này đã tạo giấy tờ quá nhiều lần. Vui lòng thử lại sau 1 giờ.',
		);
	}
});

test('đơn / tờ trình nháp: khóa đóng / không có ⇒ 403 / 404; chương trình thiếu hoặc lạ ⇒ 400', async () => {
	reset();
	for (const handler of [regController.draftApplication, regController.draftProposal]) {
		courseState = 'missing';
		let r = await call(handler, DRAFT_BASE);
		assert.equal(r.status, 404);
		assert.equal(r.body.message, 'Khóa học không tồn tại hoặc đã đóng đăng ký.');
		courseState = 'closed';
		r = await call(handler, DRAFT_BASE);
		assert.equal(r.status, 403);
		assert.equal(r.body.message, 'Khóa học hiện không trong thời gian đăng ký.');
		courseState = 'open';
		coursePrograms = [{ program_id: 'P1', name: 'Nội soi cơ bản', tuition_fee: 1500000 }];
		r = await call(handler, DRAFT_BASE);
		assert.equal(r.status, 400);
		assert.equal(r.body.message, 'Vui lòng chọn chương trình của khóa học.');
		r = await call(handler, { ...DRAFT_BASE, program_id: 'P9' });
		assert.equal(r.status, 400);
		assert.equal(r.body.message, 'Chương trình không thuộc khóa học đã chọn.');
		coursePrograms = [];
	}
	assert.equal(rendered.length + proposals.length, 0);
});

test('tờ trình nháp: đúng 1 người (chính người đăng ký), bảng phân tích để trống, kinh phí theo chương trình', async () => {
	reset();
	coursePrograms = [{ program_id: 'P1', name: 'Nội soi cơ bản', tuition_fee: 1500000 }];
	const r = await call(regController.draftProposal, { ...DRAFT_BASE, program_id: 'P1' });
	assert.equal(r.status, 200);
	assert.match(r.headers['content-disposition'], /To-trinh-khoa-noi-lop-ban-nhap\.docx/);
	assert.equal(proposals.length, 1);
	const p = proposals[0];
	assert.equal(p.blank_analysis, true);
	assert.equal(p.department_name, 'Khoa Nội');
	assert.equal(p.course_name, 'Nội soi tiêu hóa');
	assert.equal(p.program_name, 'Nội soi cơ bản');
	assert.equal(p.tuition_fee, 1500000);
	assert.equal(p.start_date.toISOString(), '2026-12-01T00:00:00.000Z');
	assert.equal(p.end_date.toISOString(), '2026-12-05T00:00:00.000Z');
	assert.deepEqual(p.people, [
		{
			staff_number: 123,
			full_name: STAFF.full_name,
			birth_year: 2001,
			qualification: STAFF.qualification,
		},
	]);
	assert.equal(p.analysis, undefined);
	assert.equal(attemptNames[0], 'course-reg-draft');
});

// ─── Router thật ───────────────────────────────────────────────────────────
test('router thật: /draft/application không bị /:code/application bắt; /:code/dossier không còn', async () => {
	reset();
	const express = require('express');
	const { errorHandler } = require('../../src/middlewares/errorHandler');
	const app = express();
	app.use(express.json());
	app.use('/api/v1/public', require('../../src/modules/public/public.routes'));
	app.use(errorHandler);
	const srv = app.listen(0, '127.0.0.1');
	await new Promise((r) => srv.once('listening', r));
	try {
		const base = `http://127.0.0.1:${srv.address().port}/api/v1/public/course-registration`;
		const post = (p, body) =>
			fetch(base + p, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			});
		// Đúng route draft: validator của draft báo lỗi source (route :code/application sẽ đòi CCCD / email)
		let res = await post('/draft/application', { ...DRAFT_BASE, source: 'external' });
		assert.equal(res.status, 400);
		assert.match(await res.text(), /Chỉ nhân viên nội viện mới tải đơn điền sẵn ở bước này/);
		// Nội dung hợp lệ ⇒ trả .docx thật qua router
		res = await post('/draft/application', DRAFT_BASE);
		assert.equal(res.status, 200, 'draft application');
		assert.equal(res.headers.get('content-type'), registrationDocumentService.DOCX_MIME);
		res = await post('/draft/proposal', DRAFT_BASE);
		assert.equal(res.status, 200, 'draft proposal');
		// Route /dossier đã bỏ
		res = await post('/DKABCDEFGH23/dossier', { email: 'a@b.vn' });
		assert.equal(res.status, 404);
		// /files/:kind: loại lạ bị chặn bằng validator trước khi nhận file
		res = await post('/DKABCDEFGH23/files/dossier', { email: 'a@b.vn' });
		assert.equal(res.status, 400);
		assert.match(await res.text(), /Loại hồ sơ không hợp lệ/);
	} finally {
		await new Promise((r) => srv.close(r));
	}
});

// L-01: '0123', '000123'... cùng là nhân viên 123 (findStaff dùng Number) ⇒ phải chung 1 bộ đếm
test('L-01: bộ đếm lần thử theo mã NV dùng mã đã chuẩn hóa — số 0 đứng đầu không tạo bộ đếm mới', async () => {
	reset();
	const keys = [];
	const wrapped = attemptLimiter.hit;
	attemptLimiter.hit = (name, key, ...rest) => {
		keys.push([name, key]);
		return wrapped(name, key, ...rest);
	};
	try {
		await call(regController.staffCheck, { staff_number: ' 000123 ', full_name: 'x' });
		await call(regController.requestEmailOtp, {
			source: 'internal',
			staff_number: '0123',
			email: 'l01@example.com',
		});
		await call(regController.draftApplication, { ...DRAFT_BASE, staff_number: '00123' });
		await call(controller.register, {
			...INTERNAL,
			national_id: 'L01-CCCD-RIENG',
			staff_number: '000000123',
		});
	} finally {
		attemptLimiter.hit = wrapped;
	}
	const staffKeys = Object.fromEntries(
		keys.filter(([n]) => /staff|draft/.test(n)).map(([n, k]) => [n, k]),
	);
	assert.deepEqual(staffKeys, {
		'course-reg-staff-check': '123',
		'course-reg-otp-staff': '123',
		'course-reg-draft': '123',
		'course-registration-staff': '123',
	});

	// Hành vi: hết 10 lượt tra với '777' thì '0777', '000000777' cũng bị chặn (429)
	for (let i = 0; i < 10; i++)
		assert.equal(
			(await call(regController.staffCheck, { staff_number: '777', full_name: 'x' })).status,
			404,
		);
	for (const sn of ['0777', '000000777'])
		assert.equal(
			(await call(regController.staffCheck, { staff_number: sn, full_name: 'x' })).status,
			429,
			sn,
		);
});
