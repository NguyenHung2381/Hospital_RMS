/**
 * portalService.js — Dữ liệu "của tôi" cho cổng người dùng ngoài NCKH: khóa học
 * mình học / dạy, lịch học sắp tới, CME tích luỹ trong năm. Chỉ đọc theo
 * actor.id (trainees.user_id / staff_user_id, lecturers.user_id, seminar_participants.user_id,
 * cme_records.user_id) nên không cần quyền courses:read / seminars:read.
 */
const { getPool, sql } = require('../../config/db');
const courseDocumentService = require('../training/courses/courseDocumentService');
const courseEnrollmentService = require('../training/courses/courseEnrollmentService');
const courseService = require('../training/courses/courseService');
const programClassService = require('../training/courses/programClassService');
const { SESSION_IN_PROGRAM_SQL } = require('../training/courses/sessionScope');
const { TRAINEE_OF_USER_SQL } = require('../training/trainees/traineeOfUser');
const publicPortalService = require('../public/publicPortalService');
const examService = require('../training/exams/examService');
const trainingProgramService = require('../training/programs/trainingProgramService');
const { httpError } = require('../../utils/httpError');
const { getUserCme } = require('../cme/cmeUserService');

const VN_TODAY = 'CAST(DATEADD(HOUR, 7, GETUTCDATE()) AS DATE)';
const UPCOMING_DAYS = 30;

const withStatus = ({ enrollment_start_date, enrollment_end_date, ...c }) => ({
	...c,
	display_status: courseService.computeDisplayStatus(
		c,
		courseService.isEnrollmentOpenRow({ enrollment_start_date, enrollment_end_date }),
	),
});

const getMyTraining = async (actor) => {
	const pool = await getPool();
	const r = await pool.request().input('uid', sql.VarChar(20), actor.id).query(`
    SELECT c.id, c.name, c.start_date, c.end_date, c.status,
           c.enrollment_start_date, c.enrollment_end_date,
           e.id AS enrollment_id, e.status AS enrollment_status, e.registered_at, tp.name AS program_name,
           CASE WHEN e.status = 'waitlisted' THEN ${programClassService.WAITLIST_POSITION_SQL('e')} END AS waitlist_position,
           cert.cert_no, cert.issue_date AS cert_issue_date, cert.status AS cert_status,
           (SELECT COUNT(*) FROM class_sessions s WHERE s.course_id = c.id AND ${SESSION_IN_PROGRAM_SQL('s', 'e')}) AS session_count,
           (SELECT COUNT(*) FROM attendance a JOIN class_sessions s ON s.id = a.session_id
            WHERE a.enrollment_id = e.id AND a.status IN ('present', 'late') AND ${SESSION_IN_PROGRAM_SQL('s', 'e')}) AS attended_count,
           (SELECT COUNT(*) FROM course_documents d WHERE d.course_id = c.id AND d.is_public = 1) AS document_count
    FROM course_enrollments e
    JOIN trainees t ON t.id = e.trainee_id AND ${TRAINEE_OF_USER_SQL('t')}
    JOIN courses c ON c.id = e.course_id
    LEFT JOIN training_programs tp ON tp.id = e.program_id
    LEFT JOIN certificates cert ON cert.enrollment_id = e.id
    ORDER BY c.start_date DESC;

    SELECT g.enrollment_id, s.title AS subject_name, g.theory_score, g.practice_score,
           g.theory_flag, g.practice_flag, g.regular_score, g.midterm_score,
           g.final_score, g.score, g.result, g.classification
    FROM grades g
    JOIN course_enrollments e ON e.id = g.enrollment_id
    JOIN trainees t ON t.id = e.trainee_id AND ${TRAINEE_OF_USER_SQL('t')}
    LEFT JOIN program_lessons s ON s.id = g.subject_id;

    SELECT c.id, c.name, c.start_date, c.end_date, c.status,
           c.enrollment_start_date, c.enrollment_end_date, x.subjects,
           (SELECT COUNT(*) FROM course_enrollments WHERE course_id = c.id AND status = 'approved') AS approved_count,
           (SELECT COUNT(*) FROM class_sessions WHERE course_id = c.id) AS session_count
    FROM courses c
    CROSS APPLY (
      SELECT COUNT(*) AS n, STRING_AGG(s.title, ', ') AS subjects
      FROM lecturer_assignments la
      JOIN lecturers l ON l.id = la.lecturer_id AND l.user_id = @uid
      LEFT JOIN program_lessons s ON s.id = la.subject_id
      WHERE la.course_id = c.id
    ) x
    WHERE x.n > 0
    ORDER BY c.start_date DESC;

    SELECT sess.id, sess.course_id, c.name AS course_name, s.title AS subject_name,
           l.full_name AS lecturer_name, sess.session_date, sess.start_time, sess.end_time, sess.room,
           CASE WHEN EXISTS (
             SELECT 1 FROM lecturer_assignments la JOIN lecturers lec ON lec.id = la.lecturer_id
             WHERE la.course_id = c.id AND lec.user_id = @uid
           ) THEN 'teaching' ELSE 'learning' END AS my_role
    FROM class_sessions sess
    JOIN courses c ON c.id = sess.course_id AND c.status <> 'cancelled'
    LEFT JOIN program_lessons s ON s.id = sess.subject_id
    LEFT JOIN lecturers l ON l.id = sess.lecturer_id
    WHERE sess.session_date >= ${VN_TODAY}
      AND sess.session_date < DATEADD(DAY, ${UPCOMING_DAYS}, ${VN_TODAY})
      AND (
        EXISTS (SELECT 1 FROM course_enrollments e JOIN trainees t ON t.id = e.trainee_id
                WHERE e.course_id = c.id AND e.status = 'approved' AND ${TRAINEE_OF_USER_SQL('t')}
                  AND ${SESSION_IN_PROGRAM_SQL('sess', 'e')})
        OR EXISTS (SELECT 1 FROM lecturer_assignments la JOIN lecturers lec ON lec.id = la.lecturer_id
                   WHERE la.course_id = c.id AND lec.user_id = @uid)
      )
    ORDER BY sess.session_date, sess.start_time;

    -- Bài tôi dạy: từng bài được phân (GV chính / phụ) + số buổi mình đã được xếp dạy bài đó
    SELECT la.id, la.course_id, c.name AS course_name, c.start_date, c.end_date,
           s.code AS lesson_code, s.title AS lesson_title, la.role, la.hours,
           (SELECT COUNT(*) FROM class_sessions cs
            WHERE cs.course_id = la.course_id AND cs.subject_id = la.subject_id
              AND cs.lecturer_id = la.lecturer_id) AS session_count
    FROM lecturer_assignments la
    JOIN lecturers l ON l.id = la.lecturer_id AND l.user_id = @uid
    JOIN courses c ON c.id = la.course_id AND c.status <> 'cancelled'
    JOIN program_lessons s ON s.id = la.subject_id
    ORDER BY c.start_date DESC, c.name, s.title;
  `);
	const [enrolled, grades, teaching, sessions, myLessons] = r.recordsets;
	// Đề đang mở mà mình chưa nộp — nhắc trên thẻ khóa học (tab "Thi online" đã gộp vào đây).
	const papers = await examService.listAvailablePapersForUser(actor);
	const openExamCount = (courseId) =>
		papers.filter(
			(p) => p.course_id === courseId && (!p.attempt_status || p.attempt_status === 'in_progress'),
		).length;

	const enrolledIds = new Set(enrolled.map((e) => e.id));
	const openCourses = (await publicPortalService.getOpenCourses()).filter(
		(c) => !enrolledIds.has(c.id),
	);

	return {
		enrolled: enrolled.map((e) => ({
			...withStatus(e),
			open_exam_count: openExamCount(e.id),
			grades: grades.filter((g) => g.enrollment_id === e.enrollment_id),
		})),
		teaching: teaching.map(withStatus),
		teaching_lessons: myLessons,
		upcoming_sessions: sessions,
		open_courses: openCourses,
	};
};

// Đã được duyệt trong khóa; programCol: và đúng chương trình đã chọn khi ghi danh
// (lượt ghi danh cũ chưa có chương trình thì xem được mọi chương trình của khóa).
const APPROVED_IN_COURSE = (courseCol, programCol) => `EXISTS (
    SELECT 1 FROM course_enrollments e JOIN trainees t ON t.id = e.trainee_id
    WHERE e.course_id = ${courseCol} AND e.status = 'approved' AND ${TRAINEE_OF_USER_SQL('t')}${
			programCol ? ` AND (e.program_id IS NULL OR e.program_id = ${programCol})` : ''
		})`;

// Chi tiết 1 khóa mình đang học: tài liệu học viên được xem (is_public) + đề thi.
// Chỉ học viên đã được duyệt mới thấy nội dung; đang chờ duyệt thì chỉ thấy thông tin khóa.
const getMyCourse = async (courseId, actor) => {
	const pool = await getPool();
	const r = await pool
		.request()
		.input('id', sql.VarChar(20), courseId)
		.input('uid', sql.VarChar(20), actor.id).query(`
    SELECT TOP 1 c.id, c.name, c.description, c.start_date, c.end_date, c.status,
           c.enrollment_start_date, c.enrollment_end_date, e.status AS enrollment_status,
           -- Chuyên cần của lượt ghi danh này (buổi thuộc lớp mình — sessionScope)
           (SELECT COUNT(*) FROM class_sessions s WHERE s.course_id = c.id AND ${SESSION_IN_PROGRAM_SQL('s', 'e')}) AS session_count,
           (SELECT COUNT(*) FROM attendance a JOIN class_sessions s ON s.id = a.session_id
            WHERE a.enrollment_id = e.id AND a.status IN ('present', 'late') AND ${SESSION_IN_PROGRAM_SQL('s', 'e')}) AS attended_count
    FROM course_enrollments e
    JOIN trainees t ON t.id = e.trainee_id AND ${TRAINEE_OF_USER_SQL('t')}
    JOIN courses c ON c.id = e.course_id
    WHERE c.id = @id
    ORDER BY CASE WHEN e.status = 'approved' THEN 0 ELSE 1 END;

    SELECT d.id, d.doc_type, d.title, d.exam_type, d.source_type, d.external_url, d.created_at,
           f.file_name, f.file_url, f.mime_type, f.file_size
    FROM course_documents d
    LEFT JOIN training_files f ON f.id = d.file_id AND f.is_deleted = 0
    WHERE d.course_id = @id AND d.is_public = 1
    ORDER BY d.created_at DESC;

    -- Bài học: khóa → chương trình học viên đã chọn khi ghi danh → bài học theo thứ tự trong chương trình.
    SELECT tp.id AS program_id, tp.name AS program_name, pl.id, pl.code, pl.title, pl.description,
           pl.theory_hours, pl.practice_hours, pl.total_hours, pl.credits
    FROM course_programs cp
    JOIN training_programs tp ON tp.id = cp.program_id
    JOIN lesson_programs lp ON lp.program_id = cp.program_id
    JOIN program_lessons pl ON pl.id = lp.lesson_id AND pl.is_active = 1
    WHERE cp.course_id = @id AND ${APPROVED_IN_COURSE('@id', 'cp.program_id')}
    ORDER BY tp.name, lp.display_order, pl.created_at;

    SELECT d.id, d.lesson_id, d.title, d.source_type, d.external_url, d.created_at,
           f.file_name, f.file_url, f.file_size
    FROM lesson_documents d
    LEFT JOIN training_files f ON f.id = d.file_id AND f.is_deleted = 0
    WHERE d.is_public = 1 AND d.lesson_id IN (
      SELECT lp.lesson_id FROM course_programs cp
      JOIN lesson_programs lp ON lp.program_id = cp.program_id
      WHERE cp.course_id = @id AND ${APPROVED_IN_COURSE('@id', 'cp.program_id')})
    ORDER BY d.created_at;
  `);
	const [, , lessons, lessonDocs] = r.recordsets;
	const course = r.recordsets[0][0];
	if (!course) throw httpError(404, 'Bạn không tham gia khóa học này.');
	const approved = course.enrollment_status === 'approved';
	return {
		...withStatus(course),
		documents: approved ? r.recordsets[1] : [],
		lessons: approved
			? lessons.map((l) => ({ ...l, documents: lessonDocs.filter((d) => d.lesson_id === l.id) }))
			: [],
		papers: approved
			? (await examService.listAvailablePapersForUser(actor)).filter(
					(p) => p.course_id === courseId,
				)
			: [],
	};
};

// Học viên mở tài liệu → tăng lượt tải (route quản trị cần courses:read /
// training_programs:read, học viên không có). kind 'lesson' = tài liệu của bài học,
// được xem khi bài học thuộc chương trình mình đã ghi danh trong khóa đã được duyệt.
const DOC_ACCESS_SQL = {
	course: `SELECT 1 AS ok FROM course_documents d
    WHERE d.id = @id AND d.is_public = 1 AND ${APPROVED_IN_COURSE('d.course_id')}`,
	lesson: `SELECT 1 AS ok FROM lesson_documents d
    JOIN lesson_programs lp ON lp.lesson_id = d.lesson_id
    JOIN course_programs cp ON cp.program_id = lp.program_id
    WHERE d.id = @id AND d.is_public = 1 AND ${APPROVED_IN_COURSE('cp.course_id', 'cp.program_id')}`,
};

const openDocument = async (docId, actor, kind = 'course') => {
	const pool = await getPool();
	const ok = (
		await pool
			.request()
			.input('id', sql.VarChar(20), docId)
			.input('uid', sql.VarChar(20), actor.id)
			.query(DOC_ACCESS_SQL[kind])
	).recordset[0];
	if (!ok) throw httpError(404, 'Không tìm thấy tài liệu.');
	return kind === 'lesson'
		? trainingProgramService.incrementLessonDocumentDownload(docId)
		: courseDocumentService.incrementDocumentDownload(docId);
};

// Tự đăng ký khóa học — chỉ khóa bật "đăng ký công khai" (cùng danh sách với
// cổng công khai), vẫn theo cửa sổ đăng ký và ở trạng thái 'pending' chờ duyệt.
// programId: 1 trong các chương trình của khóa (bắt buộc khi khóa có > 1).
const registerCourse = async (courseId, actor, programId = null) => {
	const pool = await getPool();
	const row = (
		await pool
			.request()
			.input('id', sql.VarChar(20), courseId)
			.query(
				"SELECT 1 AS ok FROM courses WHERE id = @id AND is_public_registration = 1 AND status <> 'cancelled'",
			)
	).recordset[0];
	if (!row) {
		throw httpError(403, 'Khóa học không mở đăng ký cho cá nhân.');
	}
	return courseEnrollmentService.registerStaff(courseId, actor.id, actor.id, { programId });
};

// CME của tôi trong 1 năm (cmeUserService.getUserCme)
const getMyCme = (actor, year) => getUserCme(actor.id, year);

// Danh mục quy đổi để người dùng chọn khi tự khai CME
const getCmeCategories = async () => {
	const pool = await getPool();
	return (
		await pool.request().query(`
    SELECT c.id, c.name, g.name AS group_name, c.conversion_method, c.conversion_value, c.unit_label
    FROM cme_credit_categories c LEFT JOIN cme_credit_groups g ON g.id = c.group_id
    ORDER BY g.name, c.name`)
	).recordset;
};

module.exports = {
	getMyTraining,
	getMyCourse,
	openDocument,
	registerCourse,
	getMyCme,
	getCmeCategories,
};
