/**
 * courseCmeService.js — tự cộng tín chỉ CME từ khóa ĐTLT / CTCV
 * (docs/ke-hoach-thiet-ke-lai-luong-dao-tao.md GĐ5, quyết định 14; migration
 * 2026-12-06_cme_tu_khoa_hoc, 2026-12-28_cme_khoa_hoc_theo_giay_chung_nhan). Ghi vào
 * cme_records, có nguồn (source_type, source_id = mã khóa, user_id, enrollment_id) — khóa duy
 * nhất uq_cme_records_source ⇒ chạy lại thì cập nhật, không thêm dòng.
 * Căn cứ: Thông tư 32/2023/TT-BYT, Phụ lục I mục 1.1 (khóa đào tạo ngắn hạn: học viên và
 * giảng viên đều 1 tiết = 1 giờ tín chỉ) — cả 2 vai trò ghi danh mục DT_KHOAHOC.
 *   - Học viên nội viện có tài khoản (trainees.staff_user_id) được cấp giấy chứng
 *     nhận: MỖI GIẤY 1 DÒNG (enrollment_id = lượt ghi danh của giấy) — 1 học viên học nhiều
 *     chương trình trong cùng khóa có nhiều giấy (Điều 4.1.i), không giấy nào đè giấy nào.
 *     Tín chỉ = số giờ tín chỉ của chương trình, chưa khai thì số tiết LT + TH × hệ số
 *     DT_KHOAHOC. Ngày ghi nhận = ngày kết thúc lớp của chương trình, rồi của khóa, rồi ngày
 *     cấp giấy. Thu hồi giấy ⇒ dòng CME của đúng giấy đó bị từ chối; xóa giấy (cấp nhầm)
 *     ⇒ xóa dòng đó.
 *   - Giảng viên có tài khoản, khi khóa điểm: số tiết giảng × hệ số DT_KHOAHOC, tính theo
 *     từng bài (lecturerHours): số tiết nhập ở phân công; chưa nhập thì chia số tiết của bài
 *     theo số buổi đã dạy (Điều 6.2.c — giờ giảng dựa trên minh chứng đã tham gia giảng
 *     dạy); bài chưa có buổi nào gán GV thì GV chính được số tiết của bài.
 * Công tắc CME_AUTO_TRAINEE / CME_AUTO_LECTURER (mặc định bật). Thu hồi / xóa
 * luôn chạy (kể cả công tắc tắt) để CME không còn tính cho giấy đã hủy.
 * Cách duyệt dòng tự cộng (TT 32/2023 Điều 9 khoản 1, 4: cơ sở tổ chức xác nhận, tính giờ tín
 * chỉ và quản lý việc xác nhận):
 *   - CME_TRAINEE_APPROVAL: 'approved' (mặc định — giấy chứng nhận do thủ trưởng ký đã là xác
 *     nhận, Điều 4.1.i) | 'pending' (chờ người quản lý CME duyệt).
 *   - CME_LECTURER_APPROVAL: 'permission' (mặc định — duyệt khi người khóa điểm có
 *     cme_records:manage, M-07) | 'approved' (cộng thẳng, nhưng người thiếu cme_records:manage
 *     không tự duyệt được dòng của CHÍNH MÌNH) | 'pending' (luôn chờ duyệt — thủ trưởng tính giờ
 *     giảng dựa trên minh chứng, Điều 6.2.c).
 */
const {
	getPool,
	sql,
	withTransaction,
	newIdSql,
	nowSql,
	vnTodaySql,
	datePart,
	upsert,
	nstr,
	jsonRows,
} = require('../../../config/db');
const { broadcast } = require('../../events/eventService');
const systemSettingService = require('../../settings/systemSettingService');
const { CLASS_TYPES } = require('./classTypes');

const SOURCE = { trainee: 'course_trainee', lecturer: 'course_lecturer' };
const TYPES_SQL = CLASS_TYPES.map((t) => `'${t}'`).join(', ');
// Mục Phụ lục I áp cho cả học viên và giảng viên của khóa ĐTLT / CTCV
const CATEGORY = 'DT_KHOAHOC';

const isOn = async (key) => (await systemSettingService.getValue(key, 'true')) !== 'false';

// Chế độ duyệt (systemSettingService.ENUM_KEYS chặn giá trị lạ khi lưu; đọc vẫn rơi về mặc định)
const APPROVAL_MODES = {
	CME_TRAINEE_APPROVAL: ['approved', 'pending'],
	CME_LECTURER_APPROVAL: ['permission', 'approved', 'pending'],
};
const approvalMode = async (key) => {
	const v = await systemSettingService.getValue(key, '');
	return APPROVAL_MODES[key].includes(v) ? v : APPROVAL_MODES[key][0];
};

// Giá trị `approve` của upsertCmeSql cho dòng giảng viên theo chế độ + quyền người gọi.
const lecturerApprove = (mode, canApprove) => {
	if (mode === 'pending') return false;
	if (canApprove) return true;
	return mode === 'approved' ? 'except_self' : false;
};

// Ghi / cập nhật các dòng CME của khóa @course_id theo câu SELECT `source` (user_id,
// enrollment_id, title, role, category_id, quantity, credits, activity_date, note) — khóa duy
// nhất (source_type, source_id, user_id, enrollment_id), khớp uq_cme_records_source (NULLS NOT
// DISTINCT: dòng giảng viên enrollment_id NULL vẫn là 1 dòng / người / khóa). Mỗi dòng của
// `source` phải khác khóa, không thì PG báo "ON CONFLICT DO UPDATE command cannot affect row a
// second time". Số dòng ghi = rowsAffected[0].
const SAME_AS_INSERT = [
	'title',
	'role',
	'category_id',
	'quantity',
	'credits',
	'activity_date',
	'year',
	'note',
];
// approve=false (mặc định cho dòng giảng viên khi người gọi không có cme_records:manage):
//   - chèn 'pending' (chưa duyệt), không ghi người duyệt;
//   - conflict: 'rejected' giữ nguyên (lời từ chối của người quản lý CME không bị hoàn tác),
//     'approved' chỉ giữ khi tín chỉ không đổi, còn lại về 'pending' chờ duyệt lại.
// approve=true: chèn 'approved'; conflict vẫn giữ 'rejected', không xóa lý do từ chối.
// approve='except_self' (chế độ cộng thẳng, người gọi thiếu cme_records:manage): dòng của
//   người khác 'approved', dòng của chính người gọi (src.user_id = @actor_id) 'pending' —
//   không ai tự duyệt CME cho mình; conflict nâng lên 'approved' theo trạng thái câu INSERT.
// keepRejected=false (dòng học viên theo giấy chứng nhận): conflict bỏ trạng thái 'rejected'
//   (do thu hồi giấy) vì cấp lại giấy (cần courses:approve) phải tính lại dòng CME:
//   approve=true ⇒ 'approved'; approve=false (CME_TRAINEE_APPROVAL='pending') ⇒ 'pending',
//   trừ dòng đã duyệt mà tín chỉ không đổi.
// category_id nằm trong SAME_AS_INSERT ⇒ chạy lại sync đổi luôn danh mục của dòng cũ.
const SELF = 'src.user_id = @actor_id';
const insertStatus = (approve) => {
	if (approve === 'except_self')
		return {
			approval_status: `CASE WHEN ${SELF} THEN 'pending' ELSE 'approved' END`,
			reviewed_by: `CASE WHEN ${SELF} THEN NULL ELSE @actor_id END`,
			reviewed_at: `CASE WHEN ${SELF} THEN NULL ELSE ${nowSql} END`,
		};
	return {
		approval_status: approve ? "'approved'" : "'pending'",
		reviewed_by: approve ? '@actor_id' : 'NULL',
		reviewed_at: approve ? nowSql : 'NULL',
	};
};
const KEEP_APPROVED =
	"WHEN tgt.approval_status = 'approved' AND tgt.credits = EXCLUDED.credits THEN 'approved'";
const conflictStatus = (approve, keepRejected) => {
	if (!keepRejected) {
		if (approve) return { approval_status: "'approved'", reject_reason: 'NULL' };
		return { approval_status: `CASE ${KEEP_APPROVED} ELSE 'pending' END`, reject_reason: 'NULL' };
	}
	const rejected = "WHEN tgt.approval_status = 'rejected' THEN 'rejected'";
	let status;
	if (approve === 'except_self')
		status = `CASE ${rejected} WHEN EXCLUDED.approval_status = 'approved' THEN 'approved' ${KEEP_APPROVED} ELSE 'pending' END`;
	else if (approve) status = `CASE ${rejected} ELSE 'approved' END`;
	else status = `CASE ${rejected} ${KEEP_APPROVED} ELSE 'pending' END`;
	return { approval_status: status, reject_reason: 'tgt.reject_reason' };
};
/**
 * @param {string} sourceType
 * @param {string} source câu SELECT nguồn
 * @param {{ approve?: boolean | 'except_self', keepRejected?: boolean }} [opts]
 *   approve: true = đã duyệt, false = chờ duyệt, 'except_self' = duyệt trừ dòng của chính người ghi
 */
const upsertCmeSql = (sourceType, source, { approve = true, keepRejected = false } = {}) =>
	upsert({
		table: 'cme_records',
		key: ['source_type', 'source_id', 'user_id', 'enrollment_id'],
		conflictWhere: 'source_type IS NOT NULL',
		source,
		values: {
			id: newIdSql('CM', 18),
			user_id: 'src.user_id',
			category_id: 'src.category_id',
			title: 'src.title',
			activity_date: 'src.activity_date',
			year: datePart('YEAR', 'src.activity_date'),
			role: 'src.role',
			quantity: 'src.quantity',
			credits: 'src.credits',
			note: 'src.note',
			...insertStatus(approve),
			source_type: `'${sourceType}'`,
			source_id: '@course_id',
			enrollment_id: 'src.enrollment_id',
			created_by: '@actor_id',
		},
		update: {
			...Object.fromEntries(SAME_AS_INSERT.map((c) => [c, `EXCLUDED.${c}`])),
			...conflictStatus(approve, keepRejected),
			updated_at: nowSql,
			updated_by: '@actor_id',
		},
		// Trạng thái sau khi ghi — syncCourse báo giao diện khi dòng giảng viên còn chờ duyệt
		returning: 'tgt.approval_status',
	});

const conversionOf = (categoryId) =>
	`COALESCE((SELECT conversion_value FROM cme_credit_categories WHERE id = '${categoryId}'), 1)`;

/**
 * Học viên: ghi CME cho giấy chứng nhận còn hiệu lực của khóa (enrollmentId: chỉ 1 hồ sơ).
 * Bỏ qua học viên ngoại viện / chưa có tài khoản, chương trình không có tín chỉ.
 */
const syncTrainees = async (courseId, actorId, { enrollmentId = null } = {}) => {
	if (!(await isOn('CME_AUTO_TRAINEE'))) return 0;
	const approve = (await approvalMode('CME_TRAINEE_APPROVAL')) === 'approved';
	const pool = await getPool();
	const r = await pool
		.request()
		.input('course_id', sql.VarChar(20), courseId)
		.input('enrollment_id', sql.VarChar(20), enrollmentId)
		.input('actor_id', sql.VarChar(20), actorId)
		.query(upsertCmeSql(SOURCE.trainee, TRAINEE_SOURCE, { approve }));
	const n = r.rowsAffected[0] ?? 0;
	if (n) broadcast('update', { entity: 'cme_record' });
	return n;
};

// Giấy chứng nhận còn hiệu lực của khóa (@enrollment_id NULL = mọi hồ sơ), có tín chỉ > 0.
// 1 dòng / giấy: certificates.enrollment_id UNIQUE, mỗi lượt ghi danh 1 học viên, cp / tp tối
// đa 1 dòng (uq_crsprog_course_program, khóa chính) ⇒ khóa (user_id, enrollment_id) không lặp.
const TRAINEE_SOURCE = `
    SELECT x.* FROM (
      SELECT t.staff_user_id AS user_id,
             e.id AS enrollment_id,
             LEFT(CONCAT(c.name, CASE WHEN tp.name IS NOT NULL THEN CONCAT(' — ', tp.name) END), 255) AS title,
             ${nstr('Học viên')} AS role,
             '${CATEGORY}' AS category_id,
             CAST(COALESCE(tp.theory_hours, 0) + COALESCE(tp.practice_hours, 0) AS DECIMAL(8, 2)) AS quantity,
             CAST(COALESCE(tp.credit_hours,
                           (COALESCE(tp.theory_hours, 0) + COALESCE(tp.practice_hours, 0)) * ${conversionOf(CATEGORY)})
                  AS DECIMAL(6, 2)) AS credits,
             -- Học xong lớp nào tính năm của lớp đó: khóa nhiều chương trình có thể kéo qua năm
             COALESCE(cp.end_date, c.end_date, cert.issue_date) AS activity_date,
             CONCAT(${nstr('Giấy chứng nhận số ')}, cert.cert_no) AS note
      FROM certificates cert
      JOIN course_enrollments e ON e.id = cert.enrollment_id
      JOIN courses c ON c.id = e.course_id
      JOIN trainees t ON t.id = e.trainee_id
      -- Khóa chỉ 1 chương trình ⇒ lượt ghi danh chưa chọn chương trình lấy chương trình đó
      LEFT JOIN course_programs cp ON cp.course_id = e.course_id AND cp.program_id = COALESCE(e.program_id,
        (SELECT CASE WHEN COUNT(*) = 1 THEN MIN(program_id) END FROM course_programs WHERE course_id = @course_id))
      LEFT JOIN training_programs tp ON tp.id = COALESCE(e.program_id, cp.program_id)
      WHERE e.course_id = @course_id AND (@enrollment_id IS NULL OR e.id = @enrollment_id)
        AND cert.status <> 'revoked' AND t.staff_user_id IS NOT NULL
        AND c.training_type_id IN (${TYPES_SQL})
    ) x WHERE x.credits > 0`;

/** Giấy chứng nhận bị thu hồi (remove=false) hoặc xóa vì cấp nhầm (remove=true). */
const withdrawForCertificate = async (certId, actorId, { remove = false, reason = null } = {}) => {
	const pool = await getPool();
	const owner = (
		await pool.request().input('cert_id', sql.VarChar(20), certId).query(`
      SELECT e.course_id, e.id AS enrollment_id
      FROM certificates cert
      JOIN course_enrollments e ON e.id = cert.enrollment_id
      WHERE cert.id = @cert_id`)
	).recordset[0];
	if (!owner) return 0;
	// Chỉ dòng của đúng lượt ghi danh (giấy) này — giấy khác của cùng học viên trong khóa giữ
	// nguyên. Không lọc theo user_id: học viên đã bỏ liên kết tài khoản thì dòng cũ vẫn phải
	// bị thu hồi. source_id đứng đầu uq_cme_records_source ⇒ câu dùng được index.
	const where = `source_type = '${SOURCE.trainee}' AND source_id = @course_id AND enrollment_id = @enrollment_id`;
	const r = await pool
		.request()
		.input('course_id', sql.VarChar(20), owner.course_id)
		.input('enrollment_id', sql.VarChar(20), owner.enrollment_id)
		.input('actor_id', sql.VarChar(20), actorId)
		.input(
			'reason',
			sql.NVarChar(500),
			reason ? `Thu hồi giấy chứng nhận: ${reason}` : 'Thu hồi giấy chứng nhận',
		)
		.query(
			remove
				? `DELETE FROM cme_records WHERE ${where}`
				: `UPDATE cme_records SET approval_status = 'rejected', reject_reason = @reason,
                 reviewed_by = @actor_id, reviewed_at = ${nowSql}, updated_at = ${nowSql}, updated_by = @actor_id
         WHERE ${where}`,
		);
	const n = r.rowsAffected[0] ?? 0;
	if (n) broadcast('update', { entity: 'cme_record' });
	return n;
};

// ─── Giảng viên ─────────────────────────────────────────────────────────────

// Dữ kiện tính giờ giảng của khóa @course_id: 1 dòng / (bài, giảng viên có tài khoản) — gồm
// GV được phân công (lecturer_assignments, kể cả phân công cả khóa subject_id NULL) và GV đã
// dạy buổi của bài mà không có phân công (dạy thay). lesson_sessions đếm buổi đã diễn ra có
// gán GV của bài, KỂ CẢ GV chưa có tài khoản / ngoại viện, để phần của họ không dồn sang người
// khác. class_sessions không có số tiết ⇒ chia theo số buổi, không quy đổi theo phút.
// Trợ giảng (session_lecturers) tính như 1 lượt dạy buổi đó: buổi đồng giảng 2 người ⇒
// mỗi người 1 lượt, số tiết bài chia theo tổng lượt (không cộng dồn quá số tiết bài).
const LECTURER_FACTS = `
    WITH sess AS (
      SELECT x.subject_id, x.lecturer_id, COUNT(*) AS n
      FROM (
        SELECT cs.subject_id, cs.lecturer_id
        FROM class_sessions cs
        WHERE cs.course_id = @course_id AND cs.subject_id IS NOT NULL AND cs.lecturer_id IS NOT NULL
          AND cs.session_date <= ${vnTodaySql}
        UNION ALL
        SELECT cs.subject_id, sl.lecturer_id
        FROM session_lecturers sl JOIN class_sessions cs ON cs.id = sl.session_id
        WHERE cs.course_id = @course_id AND cs.subject_id IS NOT NULL
          AND cs.session_date <= ${vnTodaySql}
      ) x
      GROUP BY x.subject_id, x.lecturer_id
    ), lesson_sess AS (
      SELECT subject_id, SUM(n) AS n FROM sess GROUP BY subject_id
    ), pairs AS (
      SELECT la.subject_id, la.lecturer_id, la.role, la.hours
      FROM lecturer_assignments la
      WHERE la.course_id = @course_id
      UNION ALL
      SELECT s.subject_id, s.lecturer_id, NULL, NULL
      FROM sess s
      WHERE NOT EXISTS (SELECT 1 FROM lecturer_assignments la
                        WHERE la.course_id = @course_id AND la.subject_id = s.subject_id
                          AND la.lecturer_id = s.lecturer_id)
    )
    SELECT p.subject_id AS lesson_id, lec.user_id, p.role, p.hours AS assigned_hours,
           COALESCE(pl.theory_hours, 0) + COALESCE(pl.practice_hours, 0) AS lesson_hours,
           COALESCE(s.n, 0) AS sessions, COALESCE(ls.n, 0) AS lesson_sessions
    FROM pairs p
    JOIN lecturers lec ON lec.id = p.lecturer_id
    JOIN courses c ON c.id = @course_id
    LEFT JOIN program_lessons pl ON pl.id = p.subject_id
    LEFT JOIN sess s ON s.subject_id = p.subject_id AND s.lecturer_id = p.lecturer_id
    LEFT JOIN lesson_sess ls ON ls.subject_id = p.subject_id
    WHERE lec.user_id IS NOT NULL AND c.training_type_id IN (${TYPES_SQL})`;

const fmtHours = (hundredths) => String(hundredths / 100).replace('.', ',');

/**
 * Số tiết giảng của từng giảng viên (hàm thuần, test được không cần DB). Mỗi dòng
 * LECTURER_FACTS (1 bài × 1 GV) tính theo thứ tự:
 *   1. assigned_hours có nhập ⇒ dùng số đó (đã chặn trần ở lecturerAssignmentService);
 *   2. phân công cả khóa (lesson_id NULL) chưa nhập ⇒ 0;
 *   3. bài có buổi đã dạy có gán GV ⇒ số tiết bài × buổi của người đó / tổng buổi của bài,
 *      làm tròn XUỐNG 2 chữ số để tổng các phần không vượt số tiết bài (làm tròn thường:
 *      8 người × 0,125 → 0,13 × 8 = 1,04 > 1);
 *   4. bài chưa có buổi nào gán GV ⇒ GV chính được số tiết bài, GV phụ 0 (quy tắc cũ).
 * Cộng theo đơn vị 1/100 tiết (số nguyên) để không lệch số thực. Trả về người có > 0 tiết:
 * [{ user_id, hours, note }], note ghi rõ phần nào tính theo cách nào.
 * @param {Array<{ lesson_id: string | null, user_id: string, role: string | null,
 *   assigned_hours: number | null, lesson_hours: number | string,
 *   sessions: number | string, lesson_sessions: number | string }>} rows
 */
const lecturerHours = (rows) => {
	/** @type {Map<string, { assigned: number, shared: number, taught: number, main: number }>} */
	const byUser = new Map();
	for (const r of rows) {
		const acc = byUser.get(r.user_id) ?? { assigned: 0, shared: 0, taught: 0, main: 0 };
		byUser.set(r.user_id, acc);
		const lessonHours = Number(r.lesson_hours) || 0;
		const own = Number(r.sessions) || 0;
		const total = Number(r.lesson_sessions) || 0;
		if (r.assigned_hours !== null && r.assigned_hours !== undefined) {
			acc.assigned += Math.round(Number(r.assigned_hours) * 100) || 0;
		} else if (!r.lesson_id) {
			// phân công cả khóa chỉ tính khi có nhập số tiết
		} else if (total > 0) {
			acc.shared += Math.floor((lessonHours * 100 * own) / total);
			acc.taught += own;
		} else if (r.role === 'main') {
			acc.main += lessonHours * 100;
		}
	}
	const out = [];
	for (const [userId, acc] of byUser) {
		const sum = acc.assigned + acc.shared + acc.main;
		if (sum <= 0) continue;
		const parts = [
			acc.assigned && `số tiết phân công ${fmtHours(acc.assigned)}`,
			acc.shared && `chia theo ${acc.taught} buổi đã dạy ${fmtHours(acc.shared)}`,
			acc.main && `GV chính của bài chưa có buổi dạy ${fmtHours(acc.main)}`,
		].filter(Boolean);
		out.push({
			user_id: userId,
			hours: sum / 100,
			note: `Tự động khi khóa điểm — ${fmtHours(sum)} tiết giảng (${parts.join('; ')})`,
		});
	}
	return out;
};

const LECTURER_ROWS = jsonRows('@rows', 'j', [
	['user_id', 'VARCHAR(20)'],
	['hours', 'DECIMAL(8, 2)'],
	['note', 'NVARCHAR(500)'],
]);

// Dòng CME giảng viên từ số tiết đã tính (@rows, JSON của lecturerHours). Hoạt động ghi theo
// khóa: ngày ghi nhận = ngày kết thúc khóa (chưa có thì hôm nay).
const LECTURER_SOURCE = `
    SELECT j.user_id,
           CAST(NULL AS VARCHAR(20)) AS enrollment_id,
           LEFT(CONCAT(${nstr('Giảng dạy: ')}, c.name), 255) AS title,
           ${nstr('Giảng viên')} AS role,
           '${CATEGORY}' AS category_id,
           CAST(j.hours AS DECIMAL(8, 2)) AS quantity,
           CAST(j.hours * ${conversionOf(CATEGORY)} AS DECIMAL(6, 2)) AS credits,
           COALESCE(c.end_date, CAST(${nowSql} AS DATE)) AS activity_date,
           LEFT(j.note, 500) AS note
    FROM ${LECTURER_ROWS}
    JOIN courses c ON c.id = @course_id
    WHERE j.hours > 0`;

// Ghi CME giảng viên, trả { n: số dòng ghi, pending: số dòng đang chờ duyệt sau khi ghi }.
const writeLecturers = async (courseId, actorId, { canApprove = false } = {}) => {
	const approve = lecturerApprove(await approvalMode('CME_LECTURER_APPROVAL'), canApprove);
	// Đọc dữ kiện, xóa dòng của GV không còn giờ giảng rồi ghi / cập nhật, trong 1 transaction
	const result = await withTransaction(async (tx) => {
		const req = () =>
			new sql.Request(tx)
				.input('course_id', sql.VarChar(20), courseId)
				.input('actor_id', sql.VarChar(20), actorId);
		const facts = (await req().query(LECTURER_FACTS)).recordset ?? [];
		const rows = JSON.stringify(lecturerHours(facts));
		// Người không có quyền duyệt chỉ dọn được dòng còn chờ duyệt, không xóa dòng đã duyệt / từ chối
		await req().input('rows', sql.NVarChar(sql.MAX), rows).query(`
      DELETE FROM cme_records
      WHERE source_type = '${SOURCE.lecturer}' AND source_id = @course_id
        ${canApprove ? '' : "AND approval_status = 'pending'"}
        AND NOT EXISTS (SELECT 1 FROM ${LECTURER_ROWS} WHERE j.user_id = cme_records.user_id AND j.hours > 0)`);
		const r = await req()
			.input('rows', sql.NVarChar(sql.MAX), rows)
			.query(upsertCmeSql(SOURCE.lecturer, LECTURER_SOURCE, { approve, keepRejected: true }));
		return {
			n: r.rowsAffected[0] ?? 0,
			pending: (r.recordset ?? []).filter((x) => x.approval_status === 'pending').length,
		};
	});
	if (result.n) broadcast('update', { entity: 'cme_record' });
	return result;
};

/**
 * Giảng viên: ghi CME theo số tiết giảng (gọi khi khóa điểm). GV không còn giờ giảng
 * (bỏ phân công, không dạy buổi nào) thì xóa dòng tự động cũ của khóa.
 */
// canApprove: người gọi có cme_records:manage — chỉ khi đó dòng mới được 'approved'; người chỉ
// có courses:update/approve (kể cả phạm vi 'assigned') ghi dòng 'pending' chờ người quản lý CME duyệt.
const syncLecturers = async (courseId, actorId, { canApprove = false } = {}) => {
	if (!(await isOn('CME_AUTO_LECTURER'))) return 0;
	return (await writeLecturers(courseId, actorId, { canApprove })).n;
};

// Bảng điểm đã khóa hết (mọi hồ sơ đã duyệt có dòng điểm khóa) — giống gradebook.locked.
const gradesLocked = async (courseId) => {
	const pool = await getPool();
	const r = await pool.request().input('course_id', sql.VarChar(20), courseId).query(`
      SELECT COUNT(*) AS total,
             SUM(CASE WHEN g.locked_at IS NOT NULL THEN 1 ELSE 0 END) AS locked
      FROM course_enrollments e
      LEFT JOIN grades g ON g.enrollment_id = e.id AND g.subject_id IS NULL
      WHERE e.course_id = @course_id AND e.status = 'approved'`);
	const { total, locked } = r.recordset[0];
	return total > 0 && locked === total;
};

/**
 * Nút "Ghi lại CME" ở tab Kết quả: học viên theo giấy đã cấp, giảng viên khi điểm đã khóa.
 * lecturers_pending: có dòng giảng viên đang chờ duyệt sau lần ghi này (người gọi thiếu
 * cme_records:manage) — giao diện báo "chờ người quản lý CME duyệt" thay vì "đã ghi".
 */
const syncCourse = async (courseId, actorId, { canApprove = false } = {}) => {
	const [traineeOn, lecturerOn, locked] = [
		await isOn('CME_AUTO_TRAINEE'),
		await isOn('CME_AUTO_LECTURER'),
		await gradesLocked(courseId),
	];
	const trainees = traineeOn ? await syncTrainees(courseId, actorId) : null;
	const lecturer =
		lecturerOn && locked ? await writeLecturers(courseId, actorId, { canApprove }) : null;
	return {
		trainees,
		// CME_TRAINEE_APPROVAL='pending' ⇒ dòng học viên vừa ghi chờ người quản lý CME duyệt
		trainees_pending: !!trainees && (await approvalMode('CME_TRAINEE_APPROVAL')) === 'pending',
		lecturers: lecturer ? lecturer.n : null,
		// còn dòng chờ duyệt sau lần ghi (người gọi thiếu quyền, chế độ "luôn chờ duyệt", hoặc dòng
		// của chính người gọi ở chế độ cộng thẳng)
		lecturers_pending: (lecturer?.pending ?? 0) > 0,
		trainee_enabled: traineeOn,
		lecturer_enabled: lecturerOn,
		grades_locked: locked,
	};
};

module.exports = {
	SOURCE,
	syncTrainees,
	syncLecturers,
	syncCourse,
	withdrawForCertificate,
	lecturerHours,
};
