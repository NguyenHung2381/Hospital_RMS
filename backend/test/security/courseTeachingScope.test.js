// Hồi quy cho nhóm lỗi phạm vi 'assigned' của khóa học và quyền giảng dạy / chấm điểm
// (audit run-4), chạy trên CSDL giả — mỗi ca vi phạm đi kèm ca đối chứng hợp lệ:
//   M-10 POST /courses/certificates (enrollment_id trong body) và
//        GET /training-programs/:id/results phải theo phạm vi 'assigned';
//   M-09 danh sách ứng viên chờ chỉ gồm hồ sơ của khóa NGUỒN được phân công;
//   M-02 giảng viên của khóa không ghi danh / được duyệt làm học viên khóa đó, và
//        không tự nhập điểm / tự chấm bài của chính mình;
//   L-14 giảng viên đã ngừng hoạt động không còn quyền dạy / chấm theo phân công cũ.
// CSDL giả chỉ "áp" điều kiện (phạm vi, is_active, loại hồ sơ của chính mình) khi câu SQL
// thật sự có điều kiện đó — nên ca vi phạm sẽ lọt nếu ai đó gỡ điều kiện khỏi SQL.
process.env.JWT_SECRET = 'test-secret';
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

// ─── Thế giới giả ───────────────────────────────────────────────────────────
// U1: tài khoản của giảng viên GV1 (hồ sơ người P1), được phân công KH1 (không KH2).
const world = {
	assigned: { U1: new Set(['KH1', 'KH3']) }, // tài khoản → các khóa được phân công
	inactiveUsers: new Set(), // tài khoản có hồ sơ giảng viên đã ngừng hoạt động
	// Mã đăng ký → khóa, học viên
	enrollments: {
		DK1: { course_id: 'KH1', trainee_id: 'HV1' },
		DK2: { course_id: 'KH2', trainee_id: 'HV2' },
		E_OWN: { course_id: 'KH1', trainee_id: 'HV_U1' }, // hồ sơ học viên của chính U1
		E_OTHER: { course_id: 'KH1', trainee_id: 'HV1' },
	},
	// Hồ sơ học viên: HV_U1 gắn tài khoản nhân viên U1; HV_P1 cùng hồ sơ người P1 với GV1 nhưng
	// không có tài khoản; HV1 là học viên bình thường.
	trainees: {
		HV1: { staff_user_id: null, user_id: null, person_id: 'P9' },
		HV_U1: { staff_user_id: 'U1', user_id: null, person_id: null },
		HV_P1: { staff_user_id: null, user_id: null, person_id: 'P1' },
	},
	lecturer: { user_id: 'U1', person_id: 'P1', courses: new Set(['KH1']) },
	pendingEnrollments: {
		DK_LEC: { course_id: 'KH1', trainee_id: 'HV_U1', status: 'pending', program_id: null },
		DK_OK: { course_id: 'KH1', trainee_id: 'HV1', status: 'pending', program_id: null },
	},
	attempts: { EA_OWN: 'E_OWN', EA_OTHER: 'E_OTHER' }, // lượt thi → đăng ký
	waitlist: [
		{ id: 'W2', course_id: 'KH2', program_id: 'P1', trainee_name: 'HV Hai', trainee_phone: '0900000002', trainee_email: 'hai@example.invalid' },
		{ id: 'W3', course_id: 'KH3', program_id: 'P1', trainee_name: 'HV Ba', trainee_phone: '0900000003', trainee_email: 'ba@example.invalid' },
	],
	programResults: [
		{ id: 'G1', course_id: 'KH1', course_name: 'Khóa 1', trainee_name: 'HV Một', score: 8 },
		{ id: 'G2', course_id: 'KH2', course_name: 'Khóa 2', trainee_name: 'HV Hai', score: 4 },
	],
};
const sqlLog = [];
// Câu SQL có áp điều kiện còn hoạt động cho giảng viên? (nếu không, DB giả coi như bỏ qua)
const activeOk = (text, uid) =>
	!/lec\.is_active = 'true'/.test(text) || !world.inactiveUsers.has(uid);
const isAssigned = (uid, courseId, text) =>
	!!world.assigned[uid]?.has(courseId) && activeOk(text, uid);
const ownTrainee = (uid, t) =>
	t && (t.user_id === uid || t.staff_user_id === uid || (world.lecturer.user_id === uid && t.person_id === world.lecturer.person_id));

install(async (text, inputs) => {
	sqlLog.push({ text, inputs: { ...inputs } });
	// coursePolicy.assertCourseInScope
	if (/FROM courses c WHERE c\.id = @id AND EXISTS/.test(text))
		return isAssigned(inputs.actor_id, inputs.id, text) ? [{ ok: 1 }] : [];
	if (/^\s*SELECT course_id FROM course_enrollments WHERE id = @id/.test(text)) {
		const e = world.enrollments[inputs.id];
		return e ? [{ course_id: e.course_id }] : [];
	}
	// certificateRepository (đã thay hàm) — không có SQL
	// trainingProgramService.listProgramResults
	if (/FROM grades g\s+JOIN course_enrollments e ON e\.id = g\.enrollment_id\s+JOIN trainees t/.test(text)) {
		const scoped = /la\.course_id = c\.id/.test(text) && 'actor_id' in inputs;
		return world.programResults.filter(
			(r) => !scoped || isAssigned(inputs.actor_id, r.course_id, text),
		);
	}
	// waitlistTransferService.listCandidates
	if (/FROM courses c\s+JOIN course_programs cp/.test(text))
		return [{ program_id: 'P1', program_code: 'P1', program_name: 'CT 1', started: 0, class_rule: 1, class_max: null, class_approved: 0, class_min: 1 }];
	if (/e\.course_id <> @course_id/.test(text)) {
		const scoped = /la\.course_id = c\.id/.test(text) && 'actor_id' in inputs;
		return world.waitlist
			.filter((w) => w.course_id !== inputs.course_id)
			.filter((w) => !scoped || isAssigned(inputs.actor_id, w.course_id, text))
			.map((w) => ({ ...w, from_course_id: w.course_id, from_course_name: `Khóa ${w.course_id}`, waitlist_position: 1, decided_at: null, registered_at: null }));
	}
	// courseEnrollmentService.assertNotLecturerOfCourse
	if (/FROM lecturer_assignments la\s+JOIN lecturers l ON l\.id = la\.lecturer_id\s+JOIN trainees t ON t\.id = @trainee_id/.test(text)) {
		const t = world.trainees[inputs.trainee_id];
		const l = world.lecturer;
		const hit =
			t &&
			l.courses.has(inputs.course_id) &&
			((l.person_id && l.person_id === t.person_id) ||
				(l.user_id && (l.user_id === t.user_id || l.user_id === t.staff_user_id)));
		return hit ? [{ conflict: 1 }] : [];
	}
	if (/INSERT INTO course_enrollments/.test(text)) return [{ id: 'DK_NEW' }];
	if (/^\s*SELECT \* FROM course_enrollments WHERE id = @id/.test(text)) {
		const e = world.pendingEnrollments[inputs.id];
		return e ? [{ id: inputs.id, ...e }] : [];
	}
	if (/SELECT full_name, email FROM trainees WHERE id = @trainee_id/.test(text)) return [];
	// gradebookService.teachingAccess
	if (/AS assigned/.test(text)) {
		const ok = isAssigned(inputs.uid, inputs.course_id, text) ? 1 : 0;
		return [{ assigned: ok, theory: ok, practice: ok }];
	}
	// gradebookService.saveBulk — hồ sơ của chính người gọi trong khóa
	if (/SELECT e\.id FROM course_enrollments e WHERE e\.course_id = @course_id AND EXISTS/.test(text)) {
		if (!/ot\.user_id = @uid OR ot\.staff_user_id = @uid/.test(text)) return [];
		return Object.entries(world.enrollments)
			.filter(([, e]) => e.course_id === inputs.course_id && ownTrainee(inputs.uid, world.trainees[e.trainee_id]))
			.map(([id]) => ({ id }));
	}
	if (/FROM course_enrollments e\s+JOIN trainees t/.test(text) && /theory_hours/.test(text))
		return ['E_OWN', 'E_OTHER'].map((id) => ({
			enrollment_id: id, trainee_id: world.enrollments[id].trainee_id, trainee_name: `HV ${id}`,
			program_id: 'P1', program_name: 'CT', theory_hours: 10, practice_hours: 10, exam_parts: null,
			grade_id: `G_${id}`, theory_score: null, practice_score: null, theory_flag: null, practice_flag: null,
			theory_attempt: 1, practice_attempt: 1, note: null, locked_at: null,
		}));
	if (/FROM grades g WHERE g\.enrollment_id/.test(text))
		return [{ id: 'G1', locked_at: null, theory_score: null, practice_score: null, theory_attempt: 1, practice_attempt: 1 }];
	// examGradingService.assertGrader
	if (/SELECT p\.blind_grading FROM exam_attempts/.test(text)) {
		const enr = world.attempts[inputs.id];
		if (!enr || !activeOk(text, inputs.uid)) return [];
		const excludesSelf = /NOT EXISTS \(\s+SELECT 1 FROM course_enrollments oe/.test(text);
		const own = ownTrainee(inputs.uid, world.trainees[world.enrollments[enr].trainee_id]);
		return excludesSelf && own ? [] : [{ blind_grading: false }];
	}
	if (/SELECT q\.question_type, q\.points, a\.status/.test(text)) return [{ question_type: 'essay', points: 5, status: 'submitted' }];
	if (/SUM\(CASE WHEN score_awarded IS NULL/.test(text)) return [{ pending: 1, total: 0 }];
	return [];
});

// Thay trước khi nạp service (chúng destructure lúc nạp module)
const courseService = require('../../src/modules/training/courses/courseService');
courseService.getById = async (id) => ({ id, enrollment_open: true, program_ids: [] });
require('../../src/utils/idGenerator').genCourseEnrollmentId = async () => 'DK_NEW';
const issued = [];
const certRepo = require('../../src/modules/training/courses/certificateRepository');
certRepo.findEnrollmentStatus = async () => 'approved';
certRepo.insert = async ({ enrollmentId, actorId }) => {
	issued.push({ enrollmentId, actorId });
	return { id: 'CH1', course_id: world.enrollments[enrollmentId].course_id };
};
require('../../src/modules/training/courses/courseCmeService').syncTrainees = async () => {};

const coursePolicy = require('../../src/modules/training/courses/coursePolicy');
const courseController = require('../../src/modules/training/courses/courseController');
const trainingProgramService = require('../../src/modules/training/programs/trainingProgramService');
const waitlistTransferService = require('../../src/modules/training/courses/waitlistTransferService');
const courseEnrollmentService = require('../../src/modules/training/courses/courseEnrollmentService');
const gradebookService = require('../../src/modules/training/courses/gradebookService');
const examService = require('../../src/modules/training/exams/examService');

const actor = (id, grants) => ({
	id,
	permissions: new Set(Object.keys(grants)),
	permissionScopes: new Map(Object.entries(grants)),
});
const LECTURER = actor('U1', { 'courses:read': 'assigned', 'courses:approve': 'assigned' });
const MANAGER = actor('QL1', { 'courses:read': 'all', 'courses:approve': 'all' });

const denied = (p, code = 403) => assert.rejects(p, (e) => e.statusCode === code);
// Chạy handler Express (asyncHandler) với req/res giả; trả { status, body, error }
const callHandler = (handler, req) =>
	new Promise((resolve) => {
		const out = {};
		const res = {
			status(s) {
				out.status = s;
				return res;
			},
			json(b) {
				out.body = b;
				resolve(out);
			},
		};
		handler({ params: {}, body: {}, ...req }, res, (err) => {
			out.error = err;
			resolve(out);
		});
	});

// ─── M-10: cấp chứng chỉ theo mã đăng ký trong body ─────────────────────────
test('M-10: giảng viên phạm vi assigned không cấp chứng chỉ cho đăng ký của khóa khác', async () => {
	issued.length = 0;
	const r = await callHandler(courseController.issueCertificate, {
		user: LECTURER,
		body: { enrollment_id: 'DK2' },
	});
	assert.equal(r.error?.statusCode, 403);
	assert.equal(issued.length, 0, 'không được INSERT chứng chỉ');
});

test('M-10 đối chứng: khóa được phân công thì cấp được; phạm vi all cấp được mọi khóa', async () => {
	issued.length = 0;
	const own = await callHandler(courseController.issueCertificate, {
		user: LECTURER,
		body: { enrollment_id: 'DK1' },
	});
	assert.equal(own.status, 201);
	const any = await callHandler(courseController.issueCertificate, {
		user: MANAGER,
		body: { enrollment_id: 'DK2' },
	});
	assert.equal(any.status, 201);
	assert.deepEqual(
		issued.map((i) => i.enrollmentId),
		['DK1', 'DK2'],
	);
});

test('M-10: kết quả theo chương trình chỉ gồm khóa được phân công khi phạm vi assigned', async () => {
	const rows = await trainingProgramService.listProgramResults('P1', LECTURER);
	assert.deepEqual(
		rows.map((r) => r.course_id),
		['KH1'],
	);
});

test('M-10 đối chứng: phạm vi all hoặc không truyền actor thì thấy mọi khóa', async () => {
	assert.equal((await trainingProgramService.listProgramResults('P1', MANAGER)).length, 2);
	assert.equal((await trainingProgramService.listProgramResults('P1')).length, 2);
});

// ─── M-09: ứng viên danh sách chờ ──────────────────────────────────────────
test('M-09: ứng viên chờ chỉ gồm khóa nguồn được phân công (không lộ SĐT/email khóa khác)', async () => {
	const groups = await waitlistTransferService.listCandidates('KH1', LECTURER);
	const ids = groups.flatMap((g) => g.candidates.map((c) => c.id));
	assert.deepEqual(ids, ['W3']);
	assert.ok(!JSON.stringify(groups).includes('hai@example.invalid'));
});

test('M-09 đối chứng: phạm vi all (hoặc nội bộ không actor) thấy cả hai khóa nguồn', async () => {
	for (const a of [MANAGER, undefined]) {
		const groups = await waitlistTransferService.listCandidates('KH1', a);
		assert.deepEqual(
			groups.flatMap((g) => g.candidates.map((c) => c.id)).sort(),
			['W2', 'W3'],
		);
	}
});

// ─── M-02: xung đột giảng viên – học viên ──────────────────────────────────
test('M-02: giảng viên của khóa không tự ghi danh (theo tài khoản nhân viên) được', async () => {
	const before = sqlLog.length;
	// registerStaff tìm / tạo hồ sơ học viên rồi gọi registerTrainee — kiểm trực tiếp ở registerTrainee
	await denied(courseEnrollmentService.registerTrainee('KH1', 'HV_U1', 'U1'), 400);
	assert.ok(
		!sqlLog.slice(before).some((l) => /INSERT INTO course_enrollments/.test(l.text)),
		'không được INSERT đăng ký',
	);
});

test('M-02: chặn cả khi chỉ trùng hồ sơ người (person_id), không có tài khoản', async () => {
	await denied(courseEnrollmentService.registerTrainee('KH1', 'HV_P1', 'QL1'), 400);
});

test('M-02 đối chứng: học viên khác, hoặc khóa khác của giảng viên, vẫn ghi danh được', async () => {
	assert.deepEqual(await courseEnrollmentService.registerTrainee('KH1', 'HV1', 'QL1'), { id: 'DK_NEW' });
	// GV1 chỉ được phân công KH1 — đăng ký học KH2 là hợp lệ
	assert.deepEqual(await courseEnrollmentService.registerTrainee('KH2', 'HV_U1', 'U1'), { id: 'DK_NEW' });
});

test('M-02: duyệt hồ sơ đăng ký của giảng viên bị chặn; từ chối vẫn được', async () => {
	let before = sqlLog.length;
	await denied(courseEnrollmentService.decideEnrollment('DK_LEC', 'approved', 'QL1'), 400);
	assert.ok(!sqlLog.slice(before).some((l) => /UPDATE course_enrollments/.test(l.text)));
	before = sqlLog.length;
	const r = await courseEnrollmentService.decideEnrollment('DK_LEC', 'rejected', 'QL1');
	assert.equal(r.status, 'rejected');
	assert.ok(sqlLog.slice(before).some((l) => /UPDATE course_enrollments/.test(l.text)));
});

test('M-02 đối chứng: duyệt hồ sơ của học viên thường vẫn được', async () => {
	const r = await courseEnrollmentService.decideEnrollment('DK_OK', 'approved', 'QL1');
	assert.equal(r.status, 'approved');
});

test('M-02: GV không nhập điểm cho chính mình qua saveBulk (không UPDATE grades)', async () => {
	const access = { theory: false, practice: true };
	const before = sqlLog.length;
	await denied(
		gradebookService.saveBulk('KH1', [{ enrollment_id: 'E_OWN', practice_score: 10 }], 'U1', { access }),
	);
	assert.ok(!sqlLog.slice(before).some((l) => /UPDATE grades SET practice_score/.test(l.text)));
});

test('M-02 đối chứng: GV vẫn nhập điểm cho học viên khác; cán bộ (FULL_ACCESS) không bị ảnh hưởng', async () => {
	const access = { theory: false, practice: true };
	const r = await gradebookService.saveBulk(
		'KH1',
		[{ enrollment_id: 'E_OTHER', practice_score: 9 }],
		'U1',
		{ access },
	);
	assert.deepEqual(r, { saved: 1 });
	// Đường quản lý (courseController.saveGradesBulk) không truyền access ⇒ không kiểm hồ sơ của chính mình
	const mgr = await gradebookService.saveBulk('KH1', [{ enrollment_id: 'E_OWN', practice_score: 7 }], 'QL1');
	assert.deepEqual(mgr, { saved: 1 });
});

test('M-02: người chấm không chấm được bài thi của chính mình; bài của người khác thì được', async () => {
	await denied(examService.gradeEssayAsGrader('EA_OWN', 'Q1', 5, 'U1'));
	await examService.gradeEssayAsGrader('EA_OTHER', 'Q1', 5, 'U1');
	assert.ok(
		sqlLog.some((l) => /UPDATE exam_answers SET score_awarded/.test(l.text) && l.inputs.attempt_id === 'EA_OTHER'),
	);
	assert.ok(
		!sqlLog.some((l) => /UPDATE exam_answers SET score_awarded/.test(l.text) && l.inputs.attempt_id === 'EA_OWN'),
	);
});

test('M-02: danh sách bài chờ chấm loại bài của chính người chấm', async () => {
	const before = sqlLog.length;
	await examService.listPendingForGrader('U1');
	const q = sqlLog.slice(before).find((l) => /FROM exam_attempts a/.test(l.text));
	assert.match(q.text, /NOT EXISTS \(\s+SELECT 1 FROM course_enrollments oe/);
});

// ─── L-14: giảng viên ngừng hoạt động mất quyền dạy / chấm ─────────────────
const everyLecturerCheckIsActive = (text, userParam) => {
	const users = text.match(new RegExp(`lec\\.user_id = @${userParam}`, 'g')) ?? [];
	const actives = text.match(/lec\.is_active = 'true'/g) ?? [];
	assert.ok(users.length > 0);
	assert.equal(actives.length, users.length, 'mỗi điều kiện lec.user_id phải kèm lec.is_active');
};

test('L-14: mọi truy vấn phân quyền theo giảng viên đều kèm lec.is_active', () => {
	everyLecturerCheckIsActive(gradebookService.PAPER_GRADER_SQL('p'), 'uid');
	everyLecturerCheckIsActive(coursePolicy.ASSIGNED_EXISTS_SQL, 'actor_id');
});

test('L-14: teachingAccess — GV đang hoạt động qua, đã ngừng hoạt động bị 403', async () => {
	world.inactiveUsers.clear();
	assert.deepEqual(await gradebookService.teachingAccess('KH1', 'U1'), { theory: true, practice: true });
	const sqlOf = sqlLog.filter((l) => /AS assigned/.test(l.text)).at(-1).text;
	everyLecturerCheckIsActive(sqlOf, 'uid');
	world.inactiveUsers.add('U1');
	try {
		await denied(gradebookService.teachingAccess('KH1', 'U1'));
	} finally {
		world.inactiveUsers.clear();
	}
});

test('L-14: assertGrader / chấm bài — GV ngừng hoạt động bị 403, đang hoạt động thì chấm được', async () => {
	world.inactiveUsers.add('U1');
	try {
		await denied(examService.gradeEssayAsGrader('EA_OTHER', 'Q1', 5, 'U1'));
	} finally {
		world.inactiveUsers.clear();
	}
	await examService.gradeEssayAsGrader('EA_OTHER', 'Q1', 5, 'U1');
});

test('L-14: phạm vi assigned (ASSIGNED_EXISTS_SQL) không còn áp cho giảng viên ngừng hoạt động', async () => {
	await coursePolicy.assertCourseInScope('KH1', LECTURER);
	world.inactiveUsers.add('U1');
	try {
		await denied(coursePolicy.assertCourseInScope('KH1', LECTURER));
		assert.deepEqual(await trainingProgramService.listProgramResults('P1', LECTURER), []);
	} finally {
		world.inactiveUsers.clear();
	}
});
