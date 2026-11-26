// Danh sách học viên (GET /trainees) + lựa chọn cho bộ lọc (GET /trainees/filter-options).
// Mỗi dòng là 1 học viên; các bộ lọc theo khóa (loại hình, đợt/khóa, năm, hình thức
// học, trạng thái ghi danh / tiến độ) cùng khớp trên MỘT lượt ghi danh — "ĐTLT + năm
// 2026 + hoàn thành" là cùng 1 khóa, không ghép điều kiện từ nhiều khóa khác nhau.
const {
	getPool,
	sql,
	queryAll,
	nowSql,
	outerApply,
	ilike,
	likeCi,
	datePart,
} = require('../../../config/db');
const { paging } = require('../../../utils/paging');
const { hasPermission } = require('../../../permissions/authz');
const { DOC_STATE_SQL, DOC_STATE_WHERE } = require('./traineeDocumentSql');

// extraCols/extraJoins: cột & outerApply thêm cho danh sách lọc theo khóa.
const traineeSelectWith = (extraCols = '', extraJoins = '') => `
  SELECT t.*, tt.name AS trainee_type_name, d.name AS department_name,
         au.username AS account_username, au.is_active AS account_active${extraCols}
  FROM trainees t
  LEFT JOIN trainee_types tt ON tt.id = t.trainee_type_id
  LEFT JOIN departments d ON d.id = t.department_id
  LEFT JOIN users au ON au.id = t.user_id
  ${extraJoins}
`;

// Che bớt CCCD (chỉ hiện 4 số cuối) cho người không có quyền xem dữ liệu
// nhạy cảm — actor=null hoặc thiếu quyền 'trainees:read_sensitive'/system:manage
// đều bị che.
const maskSensitive = (row, canSeeSensitive) => {
	if (canSeeSensitive || !row.national_id) return row;
	const id = String(row.national_id);
	return { ...row, national_id: id.length > 4 ? `••••${id.slice(-4)}` : '••••' };
};

const canReadSensitive = (actor) => hasPermission(actor, 'trainees', 'read_sensitive');

const ENROLLMENT_STATUSES = ['pending', 'approved', 'waitlisted'];
const PROGRESS_STATUSES = ['in_progress', 'completed', 'dropped'];

// Năm của 1 lượt ghi danh: ngày bắt đầu thực hành (GPHN mở liên tục, mỗi người 1 ngày)
// → ngày khai giảng khóa → ngày đăng ký.
const enrollmentYearSql = (e = 'e', c = 'c') =>
	datePart('YEAR', `COALESCE(${e}.start_date, ${c}.start_date, CAST(${e}.registered_at AS DATE))`);

const toYear = (v) => {
	const y = Number(v);
	return Number.isInteger(y) && y >= 1990 && y <= 2100 ? y : null;
};

/**
 * Điều kiện trên 1 lượt ghi danh (alias e) và khóa của nó (alias c), trừ loại hình
 * (tách riêng để đếm số học viên cho từng tab loại). Khai báo tham số vào `req`.
 */
const enrollmentConds = (q, req) => {
	const conds = [];
	if (q.course_id) {
		conds.push('e.course_id = @course_id');
		req.input('course_id', sql.VarChar(20), String(q.course_id));
	}
	const year = toYear(q.year);
	if (year) {
		conds.push(`${enrollmentYearSql()} = @year`);
		req.input('year', sql.Int, year);
	}
	if (q.training_form_id) {
		conds.push('c.training_form_id = @training_form_id');
		req.input('training_form_id', sql.VarChar(20), String(q.training_form_id));
	}
	if (ENROLLMENT_STATUSES.includes(q.enrollment_status)) {
		conds.push('e.status = @enrollment_status');
		req.input('enrollment_status', sql.VarChar(15), q.enrollment_status);
	}
	if (PROGRESS_STATUSES.includes(q.progress_status)) {
		conds.push('e.progress_status = @progress_status');
		req.input('progress_status', sql.VarChar(15), q.progress_status);
	}
	return conds;
};

const enrollmentExists = (
	conds,
) => `EXISTS (SELECT 1 FROM course_enrollments e JOIN courses c ON c.id = e.course_id
		  WHERE ${conds.join(' AND ')})`;

const getAll = async (query = {}, actor = null) => {
	const {
		page = 1,
		limit = 20,
		search = undefined,
		trainee_type_id = undefined,
		department_id = undefined,
		training_type_id = undefined,
		doc_state = undefined,
		missing_docs = undefined,
	} = query;
	const pool = await getPool();
	const pg = paging(page, limit, 100);
	const where = ['t.hidden_at IS NULL'];
	const req = pool.request().input('offset', sql.Int, pg.offset).input('limit', sql.Int, pg.limit);

	if (search) {
		// CCCD bị che với người thiếu quyền read_sensitive ⇒ cũng không cho tìm theo
		// CCCD, nếu không thì dò từng chữ số qua kết quả lọc là ra số đầy đủ.
		const byNationalId = canReadSensitive(actor) ? ` OR ${ilike('t.national_id', '@search')}` : '';
		where.push(
			`(${ilike('t.full_name', '@search')}${byNationalId} OR ${ilike('t.phone', '@search')} OR ${likeCi('t.email', '@search')})`,
		);
		req.input('search', sql.NVarChar, `%${search}%`);
	}
	if (trainee_type_id) {
		where.push('t.trainee_type_id = @trainee_type_id');
		req.input('trainee_type_id', sql.VarChar(20), trainee_type_id);
	}
	if (department_id) {
		where.push('t.department_id = @department_id');
		req.input('department_id', sql.VarChar(20), department_id);
	}
	// Trạng thái hồ sơ PDF: done | pending | missing (missing_docs=1 — tham số cũ = missing)
	const docState = missing_docs === '1' || missing_docs === true ? 'missing' : doc_state;
	if (Object.hasOwn(DOC_STATE_WHERE, docState ?? '')) where.push(DOC_STATE_WHERE[docState]('t'));
	const traineeWhereSql = `WHERE ${where.join(' AND ')}`;

	// Loại học viên (GPHN / ĐTLT / CTCV) suy ra từ khóa đã ghi danh — 1 người có
	// thể thuộc nhiều loại. Số cho tab loại dùng mọi bộ lọc trừ chính loại hình.
	const otherConds = enrollmentConds(query, req);
	const baseConds = ['e.trainee_id = t.id', "e.status <> 'rejected'", ...otherConds];
	const countWhere = otherConds.length ? [...where, enrollmentExists(baseConds)] : where;
	const matchConds = [...baseConds];
	if (training_type_id) {
		matchConds.push('c.training_type_id = @training_type_id');
		req.input('training_type_id', sql.VarChar(20), training_type_id);
	}
	const byEnrollment = matchConds.length > 2;
	const whereSql = `WHERE ${(byEnrollment ? [...where, enrollmentExists(matchConds)] : where).join(' AND ')}`;

	// Lượt ghi danh gần nhất khớp bộ lọc — cột Khóa/đợt, trạng thái, tiến độ của danh sách.
	const latestEnrollment = byEnrollment
		? outerApply(
				`
		    SELECT e.id AS enrollment_id, e.course_id AS enrollment_course_id, e.practice_code,
		           e.start_date AS enrollment_start_date, e.end_date AS enrollment_end_date,
		           e.status AS enrollment_status, e.progress_status AS enrollment_progress_status,
		           c.name AS course_name, c.batch_no AS course_batch_no,
		           c.training_type_id AS enrollment_training_type_id, tp.name AS program_name,
		           (SELECT r.department_name FROM enrollment_rotations r
		            WHERE r.enrollment_id = e.id AND CAST(${nowSql} AS DATE) BETWEEN r.start_date AND r.end_date
		            ORDER BY r.seq OFFSET 0 ROWS FETCH NEXT 1 ROWS ONLY) AS current_department,
		           CAST(COUNT(*) OVER () AS INTEGER) AS matched_enrollment_count
		    FROM course_enrollments e
		    JOIN courses c ON c.id = e.course_id
		    LEFT JOIN training_programs tp ON tp.id = e.program_id
		    WHERE ${matchConds.join(' AND ')}
		    ORDER BY e.created_at DESC OFFSET 0 ROWS FETCH NEXT 1 ROWS ONLY
		  `,
				'le',
			)
		: '';

	const sets = await queryAll(req, [
		`
    ${traineeSelectWith(`, ${DOC_STATE_SQL('t')} AS doc_state${byEnrollment ? ', le.*' : ''}`, latestEnrollment)} ${whereSql}
    ORDER BY t.created_at DESC
    ${pg.fetchClause}
		`,
		`
    SELECT COUNT(*) AS total FROM trainees t ${whereSql}
		`,
		`
    SELECT c.training_type_id, COUNT(DISTINCT t.id) AS total
    FROM trainees t
    JOIN course_enrollments e ON e.trainee_id = t.id
    JOIN courses c ON c.id = e.course_id
    ${traineeWhereSql} AND ${baseConds.slice(1).join(' AND ')} AND c.training_type_id IS NOT NULL
    GROUP BY c.training_type_id
		`,
		`
    SELECT COUNT(*) AS total FROM trainees t WHERE ${countWhere.join(' AND ')}
		`,
	]);

	const canSeeSensitive = canReadSensitive(actor);
	return {
		data: sets[0].map((r) => maskSensitive(r, canSeeSensitive)),
		pagination: { page: pg.page, limit: pg.limit, total: sets[1][0]?.total ?? 0 },
		type_counts: {
			'': sets[3][0]?.total ?? 0,
			...Object.fromEntries(sets[2].map((r) => [r.training_type_id, r.total])),
		},
	};
};

/**
 * Lựa chọn cho thanh lọc: các khóa/đợt có học viên (kèm số học viên), các năm có
 * lượt ghi danh, hình thức học. training_type_id: chỉ khóa / năm của loại đó.
 */
const getFilterOptions = async ({ training_type_id = undefined } = {}) => {
	const pool = await getPool();
	const req = pool.request();
	const typeCond = training_type_id ? ' AND c.training_type_id = @training_type_id' : '';
	if (training_type_id) req.input('training_type_id', sql.VarChar(20), String(training_type_id));
	const sets = await queryAll(req, [
		`
    SELECT c.id, c.name, c.training_type_id, c.batch_no, c.start_date, c.end_date, c.status, c.is_rolling,
           COUNT(DISTINCT e.trainee_id) AS trainee_count
    FROM courses c
    JOIN course_enrollments e ON e.course_id = c.id AND e.status <> 'rejected'
    JOIN trainees t ON t.id = e.trainee_id AND t.hidden_at IS NULL
    WHERE 1 = 1${typeCond}
    GROUP BY c.id, c.name, c.training_type_id, c.batch_no, c.start_date, c.end_date, c.status, c.is_rolling
    ORDER BY c.start_date DESC NULLS LAST, c.batch_no DESC NULLS LAST, c.name
		`,
		`
    SELECT DISTINCT ${enrollmentYearSql()} AS year
    FROM course_enrollments e
    JOIN courses c ON c.id = e.course_id
    WHERE e.status <> 'rejected'${typeCond}
		`,
		`
    SELECT id, name FROM training_forms ORDER BY name
		`,
	]);
	return {
		courses: sets[0],
		years: sets[1]
			.map((r) => r.year)
			.filter((y) => y != null)
			.sort((a, b) => b - a),
		training_forms: sets[2],
	};
};

module.exports = { traineeSelectWith, maskSensitive, canReadSensitive, getAll, getFilterOptions };
