// Hồi quy đợt rà soát bảo mật run-4 cho luồng đăng ký khóa học công khai (ẩn danh), chạy trên CSDL giả:
//   M-03 giấy tờ tải lên qua cổng công khai luôn 'pending' (không nhận mặc định 'approved' của bảng);
//        nhân viên tải lên (addDocument không truyền status) vẫn 'approved'.
//   L-06 chỉ gắn vào hồ sơ đã có khi CCCD + ngày sinh + họ tên (chuẩn hóa) đều khớp và hồ sơ có ngày sinh;
//        mọi nhánh trả CÙNG 1 phản hồi cố định — không lộ CCCD có tồn tại hay không.
process.env.JWT_SECRET = 'test-secret';
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

const OWNER = {
	id: 'HV1',
	national_id: '040200001234',
	full_name: 'Nguyễn Văn An',
	dob: new Date('2000-05-15T00:00:00Z'),
};
// Hồ sơ cũ thiếu ngày sinh — không đối chiếu được chủ hồ sơ
const NO_DOB = { id: 'HV2', national_id: '040200009999', full_name: 'Trần Thị Bích', dob: null };

const log = install(async (text, inputs) => {
	if (/SELECT \* FROM trainees WHERE national_id/.test(text))
		return [OWNER, NO_DOB].filter((t) => t.national_id === inputs.national_id);
	return [];
});

// Mọi thứ ngoài DB giả: lưu file, di chuyển file upload, tạo học viên, ghi danh, trường tùy chỉnh
const uploadPaths = require('../../src/utils/uploadPaths');
uploadPaths.moveUploadedFiles = async (files) => files;
require('../../src/modules/training/trainingFileService').saveUploadedFile = async () => ({
	id: 'F1',
});
const traineeService = require('../../src/modules/training/trainees/traineeService');
const courseEnrollmentService = require('../../src/modules/training/courses/courseEnrollmentService');
const courseService = require('../../src/modules/training/courses/courseService');
require('../../src/modules/forms/formCustomValueService').save = async () => {};

const created = [];
const enrolled = [];
let enrollError = null;
courseService.getById = async () => ({
	id: 'KH1',
	status: 'draft',
	is_public_registration: true,
	enrollment_open: true,
});
traineeService.create = async (data, actorId) => {
	const t = { id: `HV-NEW${created.length + 1}` };
	created.push({ ...data, id: t.id, actorId });
	return t;
};
courseEnrollmentService.registerTrainee = async (courseId, traineeId) => {
	// 409 phụ thuộc hồ sơ chỉ xảy ra với hồ sơ ĐÃ CÓ (đang học chương trình khác, đã ghi danh...)
	if (enrollError && ['HV1', 'HV2'].includes(traineeId)) throw enrollError;
	enrolled.push(traineeId);
	return { id: 'DK1' };
};

const portal = require('../../src/modules/public/publicPortalService');
const controller = require('../../src/modules/public/publicPortalController');
const { httpError } = require('../../src/utils/httpError');

const FILE = [{ originalname: 'cccd.pdf', filename: 'x.pdf', size: 1, mimetype: 'application/pdf' }];
const reset = () => {
	created.length = 0;
	enrolled.length = 0;
	enrollError = null;
	log.length = 0;
};
const docInserts = () => log.filter((q) => /INSERT INTO trainee_documents/i.test(q.text));
const base = (over) => ({ course_id: 'KH1', ...over });

// ─── M-03 ────────────────────────────────────────────────────────────────────
test('M-03: giấy tờ đính kèm khi đăng ký công khai luôn là pending (chủ hồ sơ khớp đủ 3 yếu tố)', async () => {
	reset();
	await portal.register(
		base({
			full_name: 'nguyen van an',
			national_id: OWNER.national_id,
			dob: '2000-05-15',
			doc_types: ['degree'],
		}),
		FILE,
		null,
	);
	const docs = docInserts();
	assert.equal(docs.length, 1);
	assert.equal(docs[0].inputs.status, 'pending');
	assert.equal(docs[0].inputs.trainee_id, 'HV1');
	assert.match(docs[0].text, /status/, 'INSERT phải ghi status tường minh, không dựa vào mặc định của bảng');
});

test('M-03: CCCD chưa có hồ sơ → hồ sơ mới, giấy tờ vẫn pending', async () => {
	reset();
	await portal.register(
		base({ full_name: 'Người Mới', national_id: '000000000555', dob: '1990-01-01' }),
		FILE,
		['national_id'],
	);
	const docs = docInserts();
	assert.equal(docs.length, 1);
	assert.equal(docs[0].inputs.status, 'pending');
	assert.equal(docs[0].inputs.trainee_id, 'HV-NEW1');
});

test('M-03: nhân viên đã đăng nhập tải giấy tờ (addDocument mặc định) vẫn approved; status lạ bị từ chối', async () => {
	reset();
	await traineeService.addDocument('HV1', 'degree', { originalname: 'a.pdf' }, 'U1');
	assert.equal(docInserts()[0].inputs.status, 'approved');
	await assert.rejects(
		traineeService.addDocument('HV1', 'degree', { originalname: 'a.pdf' }, null, {
			status: "approved'; --",
		}),
	);
});

// ─── L-06 ────────────────────────────────────────────────────────────────────
const CASES = {
	'khớp đủ CCCD + ngày sinh + họ tên': {
		full_name: 'Nguyễn  Văn An',
		national_id: OWNER.national_id,
		dob: '2000-05-15',
	},
	'CCCD đã có nhưng sai ngày sinh': {
		full_name: 'Nguyễn Văn An',
		national_id: OWNER.national_id,
		dob: '1999-01-01',
	},
	'đúng ngày sinh nhưng họ tên khác': {
		full_name: 'Hoàn Toàn Khác',
		national_id: OWNER.national_id,
		dob: '2000-05-15',
	},
	'hồ sơ cũ thiếu ngày sinh': {
		full_name: 'Trần Thị Bích',
		national_id: NO_DOB.national_id,
		dob: '1990-01-01',
	},
	'CCCD chưa có hồ sơ': { full_name: 'Người Lạ', national_id: '000000000777', dob: '1995-03-03' },
	'không khai CCCD': { full_name: 'Không CCCD' },
};

test('L-06: mọi nhánh trả cùng một phản hồi cố định (không enrollment_id / documents_skipped / 409)', async () => {
	for (const [name, input] of Object.entries(CASES)) {
		reset();
		const r = await portal.register(base(input), FILE, ['national_id']);
		assert.deepEqual(r, { submitted: true }, name);
		assert.equal(r, portal.PUBLIC_REGISTER_ACK, name);
	}
	// ghi danh bị từ chối vì lý do phụ thuộc hồ sơ (đang học chương trình khác, lớp đầy, đã ghi danh...)
	reset();
	enrollError = httpError(409, 'Học viên đang theo học chương trình "X" (Khóa Y)');
	const r = await portal.register(base(CASES['khớp đủ CCCD + ngày sinh + họ tên']), FILE, null);
	assert.deepEqual(r, { submitted: true });
});

test('L-06: chỉ gắn vào hồ sơ đã có khi khớp đủ CCCD + ngày sinh + họ tên (bỏ dấu/hoa thường/khoảng trắng)', async () => {
	reset();
	await portal.register(
		base({ full_name: '  NGUYEN  van An ', national_id: OWNER.national_id, dob: '2000-05-15' }),
		FILE,
		null,
	);
	assert.deepEqual(enrolled, ['HV1']);
	assert.equal(created.length, 0);
	assert.equal(docInserts()[0].inputs.trainee_id, 'HV1');
});

test('L-06: sai ngày sinh / sai họ tên / hồ sơ cũ thiếu ngày sinh ⇒ không đụng hồ sơ đã có, không đính giấy tờ vào đó', async () => {
	for (const name of [
		'CCCD đã có nhưng sai ngày sinh',
		'đúng ngày sinh nhưng họ tên khác',
		'hồ sơ cũ thiếu ngày sinh',
	]) {
		reset();
		await portal.register(base(CASES[name]), FILE, ['national_id']);
		assert.ok(!enrolled.includes('HV1') && !enrolled.includes('HV2'), `${name}: ghi danh vào hồ sơ có sẵn`);
		assert.equal(created.length, 1, name);
		assert.equal(created[0].national_id, null, `${name}: không chiếm CCCD của hồ sơ có sẵn`);
		assert.match(created[0].notes, /chưa xác minh/);
		assert.deepEqual(enrolled, [created[0].id], name);
		for (const d of docInserts())
			assert.equal(d.inputs.trainee_id, created[0].id, `${name}: giấy tờ phải gắn vào hồ sơ mới`);
	}
});

test('L-06: ghi danh hồ sơ khớp bị 409 ⇒ không lộ lỗi, chuyển thành đăng ký chưa xác minh', async () => {
	reset();
	enrollError = httpError(409, 'Học viên đang theo học chương trình "X" (Khóa Y)');
	const r = await portal.register(base(CASES['khớp đủ CCCD + ngày sinh + họ tên']), null, null);
	assert.deepEqual(r, { submitted: true });
	assert.ok(!enrolled.includes('HV1'), 'không ghi danh vào hồ sơ có sẵn');
	assert.equal(created.length, 1, 'lưu thành đăng ký chưa xác minh cho phòng Đào tạo');
	assert.equal(created[0].national_id, null);
});

test('L-06: lỗi không phụ thuộc hồ sơ (khóa đóng đăng ký) vẫn báo như cũ', async () => {
	reset();
	courseService.getById = async () => null;
	await assert.rejects(portal.register(base(CASES['khớp đủ CCCD + ngày sinh + họ tên'])), (e) => e.statusCode === 404);
	courseService.getById = async () => ({
		id: 'KH1',
		status: 'draft',
		is_public_registration: true,
		enrollment_open: true,
	});
});

test('L-06: honeypot trả đúng cùng thân + thông điệp với đăng ký thật', async () => {
	const call = async (body) => {
		let out;
		const res = {
			status(c) {
				out = { status: c };
				return res;
			},
			json(b) {
				out.body = b;
				return res;
			},
		};
		const req = { body, files: [], ip: '127.0.0.1' };
		await new Promise((resolve, reject) => {
			controller.register(req, res, reject);
			const t = setInterval(() => out?.body && (clearInterval(t), resolve()), 5);
		});
		return out;
	};
	const bot = await call({ website: 'http://spam', ...base(CASES['CCCD chưa có hồ sơ']) });
	assert.equal(bot.status, 201);
	assert.deepEqual(bot.body.data, { submitted: true });
	assert.equal(bot.body.message, 'Đã nhận đăng ký khóa học, vui lòng chờ duyệt.');
});
