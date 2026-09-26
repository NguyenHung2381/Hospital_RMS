const { getPool, sql } = require('../config/db');
const { remember } = require('../utils/cache');
const traineeService = require('./traineeService');
const courseService = require('./courseService');
const researchRoundService = require('./roundService');
const topicService = require('./topicService');
const topicMemberService = require('./topicMemberService');

// ─── Cổng công khai (không đăng nhập) ───────────────────────────────────────
// Chỉ lộ ra tối thiểu dữ liệu cần thiết cho người ngoài hệ thống: danh sách
// khóa học đang mở đăng ký, danh mục đối tượng học viên (cho form), tra cứu
// kết quả theo đúng CCCD người dùng tự nhập, và tạo đăng ký mới. Không có
// endpoint liệt kê/tìm kiếm học viên hàng loạt ở đây.

const getOpenCourses = async () => {
	const pool = await getPool();
	const result = await pool.request().query(`
    SELECT c.id, c.name, c.start_date, c.end_date, c.enrollment_start_date, c.enrollment_end_date,
           c.capacity,
           (SELECT STRING_AGG(tp.name, ', ') FROM course_programs cp JOIN training_programs tp ON tp.id = cp.program_id WHERE cp.course_id = c.id) AS program_name
    FROM courses c
    WHERE c.status = 'open' AND c.is_public_registration = 1
    ORDER BY c.start_date ASC
  `);

	return result.recordset
		.filter((row) => courseService.isEnrollmentOpenRow(row))
		.map(({ enrollment_start_date, enrollment_end_date, ...publicRow }) => {
			void enrollment_start_date;
			void enrollment_end_date;
			return publicRow;
		});
};

const getTraineeTypes = async () => {
	const pool = await getPool();
	const result = await pool.request().query('SELECT id, name FROM trainee_types ORDER BY name');
	return result.recordset;
};

// Tra cứu kết quả học tập/chứng chỉ theo đúng số CCCD + ngày sinh người dùng tự
// nhập — không tìm gần đúng, không liệt kê theo tên. Sai 1 trong 2 thì trả danh
// sách rỗng như không có dữ liệu (không lộ CCCD có tồn tại hay không). Kết hợp
// rate-limit theo IP (route) và theo từng CCCD (controller).
const lookupResults = async (nationalId, dob) => {
	const pool = await getPool();
	const result = await pool
		.request()
		.input('national_id', sql.VarChar(20), nationalId)
		.input('dob', sql.Date, String(dob).slice(0, 10)).query(`
    SELECT t.full_name, c.name AS course_name, e.status AS enrollment_status,
           g.result, g.score, cert.cert_no, cert.issue_date
    FROM trainees t
    JOIN course_enrollments e ON e.trainee_id = t.id
    JOIN courses c ON c.id = e.course_id
    LEFT JOIN grades g ON g.enrollment_id = e.id AND g.subject_id IS NULL
    LEFT JOIN certificates cert ON cert.enrollment_id = e.id
    WHERE t.national_id = @national_id AND CAST(t.dob AS DATE) = @dob
    ORDER BY e.registered_at DESC
  `);
	return result.recordset;
};

// 'YYYY-MM-DD' của cột DATE (driver trả Date lúc 00:00 UTC) hoặc chuỗi ISO từ form
const toDateKey = (v) => {
	if (!v) return null;
	const d = v instanceof Date ? v : new Date(String(v).slice(0, 10));
	return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

// Đăng ký khóa học công khai: tự tìm học viên đã có theo CCCD (tránh tạo
// trùng nếu học viên đã từng đăng ký khóa khác), nếu chưa có thì tạo mới với
// actor_id = NULL (không có tài khoản đứng sau thao tác này — cột created_by
// cho phép NULL, giống các trường hợp import/nguồn ngoài khác).
const register = async (data) => {
	const course = await courseService.getById(data.course_id);
	if (!course || course.status !== 'open') {
		const err = new Error('Khóa học không tồn tại hoặc đã đóng đăng ký.');
		err.statusCode = 404;
		throw err;
	}
	if (!course.enrollment_open) {
		const err = new Error('Khóa học hiện không trong thời gian đăng ký.');
		err.statusCode = 403;
		throw err;
	}

	let trainee = null;
	if (data.national_id) {
		const pool = await getPool();
		const existing = await pool
			.request()
			.input('national_id', sql.VarChar(20), data.national_id)
			.query('SELECT TOP 1 * FROM trainees WHERE national_id = @national_id ORDER BY created_at DESC');
		trainee = existing.recordset[0] || null;
		// Người đăng ký phải là chủ hồ sơ: ngày sinh khớp hồ sơ đã có. Trước đây
		// chỉ cần biết số CCCD của người khác là ghi danh được họ vào khoá học.
		// Hồ sơ cũ chưa có ngày sinh (nhập tay/import thiếu) thì không đối chiếu
		// được — vẫn cho ghi danh vì đăng ký công khai đều phải chờ duyệt.
		if (trainee?.dob && toDateKey(trainee.dob) !== toDateKey(data.dob)) {
			const err = new Error(
				'Thông tin không khớp với hồ sơ học viên đã có. Vui lòng kiểm tra lại ngày sinh hoặc liên hệ phòng Đào tạo.',
			);
			err.statusCode = 409;
			throw err;
		}
	}
	if (!trainee) {
		trainee = await traineeService.create(
			{
				full_name: data.full_name,
				dob: data.dob,
				gender: data.gender,
				national_id: data.national_id,
				phone: data.phone,
				email: data.email,
				address: data.address,
				trainee_type_id: data.trainee_type_id,
			},
			null,
		);
	}

	const enrollment = await courseService.registerTrainee(data.course_id, trainee.id, null);
	return { trainee_id: trainee.id, enrollment_id: enrollment.id };
};

// ─── Đăng ký đề tài công khai (rút gọn) ─────────────────────────────────────
// Chỉ nhận loại "đề tài" (không hỗ trợ "bài báo") để giữ form ngắn gọn. Đề tài
// được tạo thẳng ở trạng thái 'submitted' (chờ duyệt), created_by = NULL —
// mirror cách trainees/courses cho phép actor NULL khi không có tài khoản đứng
// sau thao tác (xem register() ở trên). Người nộp được lưu thành một
// topic_member vai trò 'leader' để khoa/phòng và admin có thông tin liên hệ;
// không cấp tài khoản tự động, không đụng tới workflow thành viên/file phức
// tạp của form nội bộ.

const getOpenTopicRounds = async () => {
	const { data } = await researchRoundService.getAll({ status: 'active', limit: 0 });
	return data
		.filter((r) => r.registration_open)
		.map((r) => ({
			id: r.id,
			name: r.name,
			year: r.year,
			round_type_id: r.round_type_id,
			round_type_name: r.round_type_name,
			registration_start: r.registration_start,
			registration_end: r.registration_end,
		}));
};

const getPublicCategories = async () => {
	const pool = await getPool();
	const result = await pool.request().query('SELECT id, name FROM categories ORDER BY name');
	return result.recordset;
};

const getPublicDepartments = async () => {
	const pool = await getPool();
	const result = await pool.request().query('SELECT id, name FROM departments ORDER BY name');
	return result.recordset;
};

// Cấp độ hợp lệ theo loại đợt (round_type_levels); loại đợt chưa cấu hình cấp
// độ nào hoặc bảng chưa tồn tại (migration chưa chạy) ⇒ trả tất cả (fallback),
// mirror logic ở routes/lookups.js (GET /levels).
const getPublicLevels = async (roundId) => {
	const pool = await getPool();
	const all = await pool.request().query('SELECT id, name FROM levels ORDER BY name');
	if (!roundId) return all.recordset;
	try {
		const rt = await pool
			.request()
			.input('rid', sql.VarChar(10), roundId)
			.query('SELECT round_type_id FROM research_rounds WHERE id = @rid');
		const rtId = rt.recordset[0]?.round_type_id;
		if (!rtId) return all.recordset;
		const allowed = await pool
			.request()
			.input('rt', sql.VarChar(6), rtId)
			.query('SELECT level_id FROM round_type_levels WHERE round_type_id = @rt');
		const ids = allowed.recordset.map((x) => x.level_id);
		return ids.length ? all.recordset.filter((l) => ids.includes(l.id)) : all.recordset;
	} catch {
		return all.recordset;
	}
};

const registerTopic = async (data) => {
	const round = await researchRoundService.getById(data.round_id);
	if (!round || round.status !== 'active') {
		const err = new Error('Đợt nghiên cứu không tồn tại hoặc đã đóng.');
		err.statusCode = 404;
		throw err;
	}
	if (!round.registration_open) {
		const err = new Error('Đợt này hiện không trong thời gian nhận đăng ký đề tài.');
		err.statusCode = 403;
		throw err;
	}
	await topicService.assertLevelForRound(data.round_id, data.level_id, 'de_tai');

	const topic = await topicService.create(
		{
			title: data.title,
			description: data.description,
			round_id: data.round_id,
			category_id: data.category_id,
			level_id: data.level_id,
			department_id: data.department_id,
			article_type: 'de_tai',
		},
		null,
	);

	await topicMemberService.addMember(
		topic.id,
		{
			ho_ten: data.full_name,
			email: data.email,
			so_dien_thoai: data.phone,
			chuc_vu: data.position,
			department_id: data.department_id,
			role: 'leader',
		},
		null,
	);

	return { topic_id: topic.id };
};

// Thư viện đề tài công khai — chỉ đề tài đã duyệt VÀ được admin/khoa gắn cờ
// is_featured (TopicModal.tsx, quyền topics:update). Trả tối thiểu: không lộ
// thành viên/CCCD/file — mirror mức lộ thông tin của getOpenTopicRounds.
const getFeaturedTopics = async () => {
	const pool = await getPool();
	const result = await pool.request().query(`
    SELECT t.id, t.title, t.description, t.article_type, t.journal_name, t.publish_date,
           t.created_at, d.name AS department_name, r.year AS round_year, c.name AS category_name
    FROM topics t
    LEFT JOIN departments d ON d.id = t.department_id
    LEFT JOIN research_rounds r ON r.id = t.round_id
    LEFT JOIN categories c ON c.id = t.category_id
    WHERE t.is_featured = 1 AND t.status = 'approved'
    ORDER BY t.publish_date DESC, t.created_at DESC
  `);
	return result.recordset;
};

// Tra cứu trạng thái hồ sơ đề tài đã nộp qua cổng công khai bằng chính mã đề
// tài trả về lúc đăng ký (registerTopic ở trên) — chỉ trả tối thiểu, không
// JOIN thành viên/file/khoa phòng.
// Tra cứu trạng thái hồ sơ theo mã + email HOẶC số điện thoại của 1 thành viên
// đề tài (người đăng ký đã tự nhập lúc nộp). Trước đây chỉ cần mã — mã sinh
// theo thứ tự (<LOẠI>_<năm>_001...) nên người ngoài dò được tiêu đề của mọi đề
// tài, kể cả đề tài nháp / bị từ chối. Sai mã hay sai liên hệ đều trả null như
// nhau (không lộ mã nào tồn tại).
const normalizeEmail = (v) => String(v ?? '').trim().toLowerCase();
const normalizePhone = (v) => {
	const digits = String(v ?? '').replace(/\D/g, '');
	// 0912345678 ≡ 84912345678 ≡ +84 912 345 678
	return digits.startsWith('84') ? `0${digits.slice(2)}` : digits;
};

const getTopicStatus = async (topicId, contact) => {
	const email = normalizeEmail(contact);
	const phone = normalizePhone(contact);
	if (!email.includes('@') && phone.length < 9) return null;

	const pool = await getPool();
	const result = await pool.request().input('id', sql.VarChar(15), topicId).query(`
    SELECT t.id, t.title, t.status, t.created_at, t.updated_at, tm.email, tm.phone_number
    FROM topics t
    JOIN topic_members tm ON tm.topic_id = t.id
    WHERE t.id = @id
  `);
	const rows = result.recordset;
	const matched = rows.some((r) =>
		email.includes('@')
			? normalizeEmail(r.email) === email
			: !!r.phone_number && normalizePhone(r.phone_number) === phone,
	);
	if (!matched) return null;
	const { id, title, status, created_at, updated_at } = rows[0];
	return { id, title, status, created_at, updated_at };
};

// Danh sách công khai (không cần đăng nhập, không rate-limit) — trước đây mỗi
// request truy vấn thẳng SQL Server, ai cũng dội được vào DB. Cache Redis ngắn
// (utils/cache.js, Redis lỗi thì đọc DB như cũ): dữ liệu đổi (gắn cờ đề tài
// nổi bật, mở đợt, sửa danh mục...) hiện ra trang công khai chậm tối đa 60s.
const PUBLIC_TTL_SEC = 60;
const cached = (name, fn) => () => remember(`public:${name}`, PUBLIC_TTL_SEC, fn);

// roundId do người ngoài tự gửi: chỉ cache id đúng dạng (VarChar(10)), tránh
// bị nhồi key rác vào Redis; id lạ vẫn trả kết quả, chỉ không cache.
const getPublicLevelsCached = (roundId) =>
	!roundId || /^[\w-]{1,10}$/.test(roundId)
		? remember(`public:levels:${roundId || ''}`, PUBLIC_TTL_SEC, () => getPublicLevels(roundId))
		: getPublicLevels(roundId);

module.exports = {
	getOpenCourses: cached('open-courses', getOpenCourses),
	getTraineeTypes: cached('trainee-types', getTraineeTypes),
	lookupResults,
	register,
	getOpenTopicRounds: cached('open-topic-rounds', getOpenTopicRounds),
	getPublicCategories: cached('categories', getPublicCategories),
	getPublicDepartments: cached('departments', getPublicDepartments),
	getPublicLevels: getPublicLevelsCached,
	registerTopic,
	getTopicStatus,
	getFeaturedTopics: cached('featured-topics', getFeaturedTopics),
};
