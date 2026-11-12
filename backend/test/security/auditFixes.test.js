// Hồi quy cho các lỗi của đợt rà soát bảo mật (run-3), chạy trên CSDL giả:
//   M3 ghế thay thế hội đồng hết hiệu lực khi đề tài rời hội đồng;
//   M4 báo cáo hội thảo không lộ câu hỏi + đáp án bài test, public_token;
//   M6 đăng ký hội nghị nội viện không trả vé cho người gọi ẩn danh;
//   M7 sửa / xóa thành viên đề tài ràng buộc đúng đề tài trên URL;
//   M8 API /users/:id không thao tác tài khoản học viên;
//   N1 người bị giới hạn theo khoa mà chưa có khoa thì bị từ chối;
//   N2 không tìm học viên theo CCCD khi không có quyền xem CCCD;
//   L1 route tải file chung không dùng được ghi chú dành riêng cho hội đồng;
//   L2 chấm tự luận chỉ nhận câu tự luận, điểm trong [0, điểm câu].
process.env.JWT_SECRET = 'test-secret';
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

const STAFF = {
	id: 'U9',
	full_name: 'Nguyễn Văn Bình',
	staff_number: 123,
	email: 'binh@bv.vn',
	title_prefix: null,
	department_name: 'Khoa Nội',
};
const ANSWERS = {
	essay: { question_type: 'essay', points: 2, status: 'submitted' },
	choice: { question_type: 'single_choice', points: 1, status: 'submitted' },
	open: { question_type: 'essay', points: 2, status: 'in_progress' },
};
const USERS = {
	HV: { id: 'HV', role_id: 'VT09', role_code: 'trainee', department_id: null },
	NV: { id: 'NV', role_id: 'VT07', role_code: 'member', department_id: 'K1' },
};

const log = install(async (text, inputs) => {
	if (/FROM seminars s WHERE s.public_token/.test(text))
		return [{ id: 'HN1', title: 'HN', scope: 'hosted', registration_open: true }];
	if (/SELECT id, code FROM roles/.test(text))
		return [
			{ id: 'VT08', code: 'dept_head' },
			{ id: 'VT09', code: 'trainee' },
		];
	if (/WHERE u.staff_number = @sn/.test(text)) return [STAFF];
	if (/FROM seminar_participants WHERE seminar_id/.test(text)) return [];
	// Thành viên M1 thuộc đề tài T1, không thuộc T2
	if (/UPDATE topic_members SET/.test(text)) return inputs.topic_id === 'T1' ? [{}] : [];
	if (/FROM topic_members tm WHERE tm.id = @id AND tm.topic_id = @topic_id/.test(text))
		return inputs.topic_id === 'T1' ? [{ id: 'M1', topic_id: 'T1' }] : [];
	if (/SELECT q.question_type, q.points, a.status/.test(text))
		return ANSWERS[inputs.question_id] ? [ANSWERS[inputs.question_id]] : [];
	if (/UPDATE topics SET council_id = NULL WHERE id = @topic_id/.test(text))
		return inputs.council_id === 'HD1' ? [{}] : [];
	if (
		/FROM users u\s+LEFT JOIN departments d ON d.id = u.department_id\s+LEFT JOIN roles r/.test(
			text,
		)
	)
		return USERS[inputs.id] ? [USERS[inputs.id]] : [];
	return [];
});

require('../../src/modules/seminars/seminarParticipantService').add = async () => ({ id: 'P1' });
require('../../src/modules/forms/formCustomValueService').save = async () => null;
const mailService = require('../../src/modules/notifications/mailService');
mailService.isEnabled = async () => true;
require('../../src/modules/notifications/mailQueue').enqueue = () => {};
require('../../src/modules/persons/personService').syncPerson = async () => {};

const seminarPublic = require('../../src/modules/seminars/seminarPublicService');
const assignment = require('../../src/modules/councils/councilAssignmentService');
const members = require('../../src/modules/topics/topicMemberService');
const grading = require('../../src/modules/training/exams/examGradingService');
const traineeService = require('../../src/modules/training/trainees/traineeService');
const fileService = require('../../src/modules/topics/fileService');
const { assertCanManageUser } = require('../../src/modules/access/privilegeGuard');

const since = (n) => log.slice(n).map((q) => q.text);

// M6 (đã thay đổi theo yêu cầu nghiệp vụ): nội viện cũng nhận vé ngay sau đăng ký
// để hiện QR luôn — xem đánh đổi ở seminarPublicService.registerPublic.
test('M6: nội viện đăng ký hội nghị — nhận vé ngay (khớp hồ sơ nhân sự)', async () => {
	const r = await seminarPublic.registerPublic('tok', {
		source: 'internal',
		full_name: 'nguyen van binh',
		staff_number: '123',
	});
	assert.match(r.ticket_code, /^[0-9a-f]{32}$/);

	mailService.isEnabled = async () => false; // tắt email thẻ đại biểu vẫn có vé trên màn hình
	const r2 = await seminarPublic.registerPublic('tok', {
		source: 'internal',
		full_name: 'Nguyễn Văn Bình',
		staff_number: '123',
	});
	assert.match(r2.ticket_code, /^[0-9a-f]{32}$/);
});

test('M6: ngoại viện nhận vé ngay (tự nhập thông tin của mình)', async () => {
	const r = await seminarPublic.registerPublic('tok', {
		source: 'external',
		full_name: 'Khách',
		phone: '0912345678',
	});
	assert.match(r.ticket_code, /^[0-9a-f]{32}$/);
});

test('M3: gỡ đề tài khỏi hội đồng thì xóa ghế thay thế của đề tài', async () => {
	let n = log.length;
	await assignment.unassignTopic('HD1', 'T1', 'A1');
	assert.ok(
		since(n).some((t) => /DELETE FROM council_seat_substitutes WHERE topic_id = @topic_id/.test(t)),
	);

	n = log.length;
	await assignment.unassignTopic('HD-KHAC', 'T1', 'A1'); // đề tài không thuộc hội đồng này
	assert.ok(!since(n).some((t) => /DELETE FROM council_seat_substitutes/.test(t)));
});

test('M3: chuyển đề tài sang hội đồng khác thì xóa ghế thay thế của hội đồng cũ', async () => {
	const n = log.length;
	await assignment.assignTopics('HD2', ['T1', 'T2'], 'A1');
	const texts = since(n);
	const del = texts.findIndex((t) => /DELETE FROM council_seat_substitutes/.test(t));
	const upd = texts.findIndex((t) => /UPDATE topics SET council_id = @council_id/.test(t));
	assert.ok(del >= 0 && upd > del, 'xóa ghế cũ trước khi gán hội đồng mới');
	assert.match(texts[del], /council_id <> @council_id/);
});

test('M3: ghế thay thế chỉ có hiệu lực khi đề tài đang thuộc hội đồng', () => {
	const src = require('fs').readFileSync(
		require.resolve('../../src/modules/councils/councilProgressService.js'),
		'utf8',
	);
	assert.match(src, /JOIN topics ts ON ts\.id = s\.topic_id AND ts\.council_id IS NOT NULL/);
});

test('M7: sửa thành viên của đề tài khác → null (404), không đọc lại dữ liệu', async () => {
	assert.deepEqual(await members.updateMember('T1', 'M1', { ho_ten: 'A' }, 'A1'), {
		id: 'M1',
		topic_id: 'T1',
	});
	const n = log.length;
	assert.equal(await members.updateMember('T2', 'M1', { ho_ten: 'A' }, 'A1'), null);
	assert.ok(!since(n).some((t) => /FROM topic_members tm WHERE/.test(t)));
});

test('M7: xóa thành viên chỉ gỡ liên kết tài khoản khi thành viên thuộc đúng đề tài', async () => {
	const n = log.length;
	await members.deleteMember('T2', 'M1', 'A1');
	const unlink = since(n).find((t) => /UPDATE users SET topic_member_id = NULL/.test(t));
	assert.match(unlink, /topic_id = @topic_id/);
});

test('M8: PUT/DELETE/reset /users/:id từ chối tài khoản học viên (kể cả superuser)', async () => {
	const ctrl = require('../../src/modules/users/userController');
	const superuser = {
		id: 'A1',
		permissions: new Set(['system:manage']),
		permissionScopes: new Map(),
	};
	const call = (handler, id) =>
		new Promise((resolve) => {
			const res = {
				status(code) {
					this.code = code;
					return this;
				},
				json: (body) => resolve({ code: res.code ?? 200, body }),
			};
			handler({ user: superuser, params: { id }, body: {}, ip: '::1' }, res, (err) =>
				resolve({ code: err?.statusCode, err }),
			);
		});
	for (const h of [ctrl.updateOne, ctrl.removeOne, ctrl.resetPassword]) {
		const r = await call(h, 'HV');
		assert.equal(r.code, 403);
		assert.match(r.err.message, /hồ sơ học viên/);
	}
});

test('N1: giới hạn theo khoa mà chưa có khoa → không thao tác được tài khoản không khoa', async () => {
	const actor = {
		id: 'X',
		department_id: null,
		permissions: new Set(['users:update']),
		permissionScopes: new Map([['users:update', 'department']]),
	};
	await assert.rejects(
		assertCanManageUser(actor, { department_id: null, role_id: null }),
		(e) => e.statusCode === 403,
	);
});

test('N2: không có quyền xem CCCD thì từ khóa tìm kiếm không so với CCCD', async () => {
	const plain = { permissions: new Set(['trainees:read']), permissionScopes: new Map() };
	let n = log.length;
	// chỉ xét câu SQL sinh ra — CSDL giả không trả đủ các tập kết quả
	await traineeService.getAll({ search: '0402' }, plain).catch(() => {});
	assert.ok(
		!since(n).some((t) => /national_id\) LIKE|national_id ILIKE|t\.national_id.*@search/.test(t)),
	);

	const sensitive = {
		permissions: new Set(['trainees:read', 'trainees:read_sensitive']),
		permissionScopes: new Map(),
	};
	n = log.length;
	await traineeService.getAll({ search: '0402' }, sensitive).catch(() => {});
	assert.ok(since(n).some((t) => /t\.national_id/.test(t) && /@search/.test(t)));
});

test('L1: ghi chú lượt tải dành riêng cho hội đồng bị nhận diện', () => {
	assert.equal(fileService.isCouncilNote('Biên bản họp hội đồng'), true);
	assert.equal(fileService.isCouncilNote('  Đánh giá tiến độ của hội đồng '), true);
	assert.equal(fileService.isCouncilNote('Biên bản họp hội đồng'.normalize('NFD')), true);
	assert.equal(fileService.isCouncilNote('Báo cáo giữa kỳ'), false);
	assert.equal(fileService.isCouncilNote(undefined), false);
});

test('L2: chấm tay chỉ câu tự luận của lượt đã nộp, điểm trong [0, điểm câu]', async () => {
	const rejects = (q, score, status) =>
		assert.rejects(grading.gradeEssayAnswer('AT1', q, score, 'G1'), (e) => e.statusCode === status);
	await rejects('choice', 1, 400); // câu trắc nghiệm
	await rejects('essay', 3, 400); // vượt điểm câu
	await rejects('essay', -1, 400);
	await rejects('open', 1, 409); // lượt chưa nộp
	await rejects('khong-co', 1, 404);
	const n = log.length;
	await grading.gradeEssayAnswer('AT1', 'essay', 1.5, 'G1').catch(() => {});
	assert.ok(since(n).some((t) => /UPDATE exam_answers SET score_awarded = @score/.test(t)));
});

test('M4: báo cáo hội thảo không trả câu hỏi / đáp án bài test, public_token', async () => {
	require('../../src/modules/seminars/seminarService').getAll = async () => ({
		data: [
			{
				id: 'HN1',
				title: 'Hội thảo',
				participant_count: 3,
				test_questions: '[{"q":"?","correct":1}]',
				public_token: 'a'.repeat(32),
			},
		],
	});
	require('../../src/modules/cme/cmeReportService').getData = async () => ({ people: [] });
	const router = require('../../src/modules/dashboard/dashboard.routes');
	const layer = router.stack.find((l) => l.route?.path === '/seminar-report');
	const handle = layer.route.stack.at(-1).handle;
	const body = await new Promise((resolve, reject) => {
		const res = {
			status() {
				return this;
			},
			json: resolve,
		};
		handle({ query: { year: '2026' } }, res, reject);
	});
	const [s] = body.data.seminars;
	assert.equal(s.title, 'Hội thảo');
	assert.equal(s.participant_count, 3);
	assert.equal(s.test_questions, undefined);
	assert.equal(s.public_token, undefined);
});
