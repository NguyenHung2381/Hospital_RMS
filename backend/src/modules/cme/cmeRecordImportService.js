/**
 * cmeRecordImportService.js — Nhập ghi nhận CME độc lập hàng loạt từ Excel.
 * Mirror seminarImportService/traineeImportService (dò tiêu đề, khớp cột gần
 * đúng, dry_run trả preview). Khớp nhân viên theo MNV hoặc họ tên, khớp danh
 * mục quy đổi theo tên — không đính kèm minh chứng qua import (thêm sau ở
 * từng dòng nếu cần, qua addEvidence).
 */
const { getPool, sql } = require('../../config/db');
const { norm, normDept, stripQualification } = require('../../utils/vietnameseText');
const ExcelJS = require('exceljs');
const {
	parseDateCell,
	parseCredits,
	parseStaffNumber,
	readSheet,
} = require('../../utils/excelImport');
const cmeRecordService = require('./cmeRecordService');
const userService = require('../users/userService');
const notificationService = require('../notifications/notificationService');
const { ROLE, inputRoleId } = require('../access/roleCodes');
const xl = require('../../utils/excelTemplate');
const { httpError } = require('../../utils/httpError');

// Cột file mẫu nhập — header khớp COLUMN_MATCHERS. Năm (cho dòng không có Từ ngày), Nhóm/Loại
// hình thức chọn ở hộp thoại nhập (defaults) nên không có trong mẫu; file cũ còn các cột đó (và Họ tên) vẫn nhập được.
const SHEET_COLUMNS = [
	{ key: 'stt', header: 'STT', width: 6 },
	{ key: 'staff_number', header: 'Mã NV', width: 9 },
	{ key: 'full_name', header: 'Họ và tên', width: 24 },
	{ key: 'department_raw', header: 'Khoa/Phòng', width: 22 },
	{ key: 'title', header: 'Tên hoạt động', width: 34 },
	{ key: 'role', header: 'Vai trò', width: 14 },
	{ key: 'quantity', header: 'Số lượng', width: 10 },
	{ key: 'credits', header: 'Giờ tín chỉ', width: 12 },
	{ key: 'activity_date', header: 'Từ ngày', width: 13 },
	{ key: 'end_date', header: 'Đến ngày', width: 13 },
	{ key: 'notes', header: 'Ghi chú', width: 26 },
];

const templateWorkbook = async () => {
	const wb = new ExcelJS.Workbook();
	const ws = xl.buildSheet(wb, {
		sheetName: 'Ghi nhận CME',
		title: 'MẪU NHẬP GHI NHẬN CME ĐỘC LẬP',
		subtitle:
			'Bắt buộc: Mã NV. Mã NV chưa có trong hệ thống sẽ được tạo nhân viên + tài khoản — cần Họ và tên (điền trong file hoặc nhập ở bước xem trước), Khoa/Phòng không bắt buộc. Năm lấy theo Từ ngày; dòng không có ngày lấy Năm chọn ở hộp thoại nhập. Nhóm/Loại hình thức chọn ở hộp thoại nhập. Tên hoạt động để trống → lấy Tên hoạt động mặc định. Giờ tín chỉ: điền trong file thì lấy theo file. Để trống → loại hình thức có giờ quy đổi tự tính = Số lượng × giờ quy đổi (Số lượng trống lấy Số lượng mặc định); loại "Khác" lấy Giờ tín chỉ mặc định ở hộp thoại nhập. Ngày: dd/mm/yyyy.',
		columns: SHEET_COLUMNS,
		letterhead: true,
	});
	ws.getRow(5).height = 30;
	return wb;
};

const COLUMN_MATCHERS = [
	['stt', (h) => h === 'stt' || h === 'tt'],
	['staff_number', (h) => h === 'mnv' || h === 'ma nv' || h.includes('ma nhan vien')],
	['full_name', (h) => h === 'ho va ten' || h === 'ho ten'],
	[
		'department_raw',
		(h) => h === 'khoa' || h === 'khoa phong' || h === 'don vi' || h === 'khoa phong ban',
	],
	['year', (h) => h === 'nam'],
	['group_raw', (h) => h === 'nhom hinh thuc'],
	[
		'category_raw',
		(h) =>
			h.includes('danh muc') || h === 'loai hinh' || h === 'hinh thuc' || h === 'loai hinh thuc',
	],
	[
		'title',
		(h) => h.includes('noi dung') || h === 'ten hoat dong' || h === 'hoat dong' || h === 'mo ta',
	],
	['role', (h) => h === 'vai tro'],
	['quantity', (h) => h === 'so luong'],
	[
		'activity_date',
		(h) =>
			h.includes('ngay hoat dong') ||
			h === 'ngay' ||
			h === 'tu ngay' ||
			h.includes('ngay thuc hien'),
	],
	['end_date', (h) => h === 'den ngay'],
	[
		'credits',
		(h) => h.includes('so tin chi') || h === 'gio tin chi' || h === 'tin chi' || h === 'tc',
	],
	['notes', (h) => h === 'ghi chu'],
];

const parseWorkbook = async (buffer) => {
	const { cols, rows: sheetRows } = await readSheet(buffer, {
		matchers: COLUMN_MATCHERS,
		isValid: (c) => !!(c.full_name || c.staff_number),
		headerError:
			'Không tìm thấy dòng tiêu đề (cần cột "MNV" hoặc "Họ và tên"; các cột nhận diện: Danh mục, Tên hoạt động, Ngày hoạt động, Số tín chỉ, Ghi chú).',
		// Dòng có Tên hoạt động / Giờ tín chỉ mà thiếu Mã NV + Họ tên vẫn đọc (để báo cảnh báo),
		// không lặng lẽ bỏ qua; dòng chỉ có STT là dòng trống.
		isEmpty: (get, row) =>
			!get(row, 'full_name') &&
			!parseStaffNumber(get(row, 'staff_number')) &&
			!get(row, 'title') &&
			!get(row, 'credits'),
	});

	const rows = [];
	for (const { r, row, get } of sheetRows) {
		const fullName = get(row, 'full_name');
		const staffNumber = parseStaffNumber(get(row, 'staff_number'));
		// File mẫu cũ có dòng ví dụ — bỏ nếu người dùng quên xoá
		if (/\(ví dụ\)\s*$/i.test(get(row, 'title'))) continue;
		rows.push({
			// Chữ gốc trong ô — để báo lỗi khi ô có giá trị nhưng không đọc được
			raw: {
				activity_date: get(row, 'activity_date'),
				end_date: get(row, 'end_date'),
				credits: get(row, 'credits'),
				quantity: get(row, 'quantity'),
			},
			row: r,
			full_name: fullName,
			staff_number: staffNumber,
			department_raw: get(row, 'department_raw') || null,
			category_raw: get(row, 'category_raw') || null,
			group_raw: get(row, 'group_raw') || null,
			year: parseInt(get(row, 'year'), 10) || null,
			role: get(row, 'role') || null,
			quantity: parseCredits(get(row, 'quantity')),
			end_date: parseDateCell(cols.end_date ? row.getCell(cols.end_date) : null),
			title: get(row, 'title') || null,
			activity_date: parseDateCell(cols.activity_date ? row.getCell(cols.activity_date) : null),
			credits: parseCredits(get(row, 'credits')),
			notes: get(row, 'notes') || null,
		});
	}
	if (!rows.length) {
		throw httpError(400, 'File không có dòng dữ liệu nào.');
	}
	return { rows };
};

const loadLookups = async () => {
	const pool = await getPool();
	const [users, categories, departments, taken, known] = await Promise.all([
		// Loại tài khoản khoa dùng chung (vai trò dept_head) — không phải một người
		(await inputRoleId(pool.request(), 'dept_head_role', ROLE.DEPT_HEAD)).query(
			'SELECT id, full_name, staff_number FROM users WHERE is_active = 1 AND role_id <> @dept_head_role',
		),
		pool
			.request()
			.query(
				'SELECT c.id, c.name, c.group_id, c.conversion_value, g.name AS group_name FROM cme_credit_categories c LEFT JOIN cme_credit_groups g ON g.id = c.group_id',
			),
		pool.request().query('SELECT id, name, code FROM departments'),
		// Mã NV đã thuộc tài khoản khác (kể cả đã khoá / tài khoản khoa) — không tạo trùng
		pool
			.request()
			.query('SELECT staff_number, is_active FROM users WHERE staff_number IS NOT NULL'),
		// Họ tên / khoa đã biết của Mã NV CHƯA có tài khoản — từ thành viên đề tài và người
		// tham dự hội thảo nội viện; dùng khi file chỉ có Mã NV. Bản ghi mới nhất trước,
		// thành viên đề tài (có department_id chuẩn) ưu tiên hơn hội thảo (khoa dạng chữ).
		pool.request().query(`
      SELECT staff_number, full_name, department_id, department_raw FROM (
        SELECT staff_number, full_name, department_id, department_raw,
               ROW_NUMBER() OVER (PARTITION BY staff_number ORDER BY src, created_at DESC) AS rn
        FROM (
          SELECT tm.staff_number, tm.name AS full_name, tm.department_id, NULL AS department_raw, tm.created_at, 0 AS src
          FROM topic_members tm WHERE tm.staff_number IS NOT NULL AND NULLIF(LTRIM(tm.name), '') IS NOT NULL
          UNION ALL
          SELECT sp.staff_number, sp.full_name, NULL, sp.department_raw, sp.created_at, 1
          FROM seminar_participants sp
          WHERE sp.staff_number IS NOT NULL AND sp.source = 'internal' AND NULLIF(LTRIM(sp.full_name), '') IS NOT NULL
        ) x
        WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.staff_number = x.staff_number)
      ) y WHERE rn = 1
    `),
	]);
	const knownStaff = new Map(known.recordset.map((k) => [Number(k.staff_number), k]));
	const deptById = new Map(departments.recordset.map((d) => [d.id, d]));
	const deptByKey = new Map();
	for (const d of departments.recordset) {
		if (d.code) deptByKey.set(norm(d.code), d);
		deptByKey.set(normDept(d.name), d);
	}
	const takenStaff = new Map(taken.recordset.map((u) => [Number(u.staff_number), !!u.is_active]));
	const byStaff = new Map();
	const byName = new Map();
	for (const u of users.recordset) {
		if (u.staff_number != null) byStaff.set(Number(u.staff_number), u);
		const key = norm(stripQualification(u.full_name));
		if (!byName.has(key)) byName.set(key, []);
		byName.get(key).push(u);
	}
	// Tên danh mục có thể trùng giữa các nhóm (vd "Khác (nhập số tín chỉ trực tiếp)") → giữ danh sách id
	const categoryByName = new Map();
	const categoryByGroup = new Map();
	for (const c of categories.recordset) {
		const k = norm(c.name);
		if (!categoryByName.has(k)) categoryByName.set(k, []);
		categoryByName.get(k).push(c.id);
		categoryByGroup.set(`${norm(c.group_name || '')}|${k}`, c.id);
		categoryByGroup.set(`id:${c.group_id}|${k}`, c.id);
	}
	const conversionById = new Map(
		categories.recordset.map((c) => [c.id, Number(c.conversion_value) || 0]),
	);
	return {
		byStaff,
		byName,
		categoryByName,
		categoryByGroup,
		conversionById,
		deptById,
		deptByKey,
		takenStaff,
		knownStaff,
	};
};

const matchUser = (row, lookups) => {
	if (row.staff_number != null && lookups.byStaff.has(row.staff_number)) {
		return lookups.byStaff.get(row.staff_number);
	}
	// File có Mã NV (không khớp ai) thì chỉ khớp theo tên với người CHƯA có Mã NV —
	// trùng tên với người có Mã NV khác là 2 người khác nhau (→ tạo nhân viên mới).
	const cands = (lookups.byName.get(norm(stripQualification(row.full_name || ''))) || []).filter(
		(u) => row.staff_number == null || u.staff_number == null,
	);
	return cands.length === 1 ? cands[0] : null;
};

const matchDept = (raw, lookups) =>
	raw ? lookups.deptByKey.get(norm(raw)) || lookups.deptByKey.get(normDept(raw)) || null : null;

// Mã NV chưa có trong hệ thống → kế hoạch tạo nhân viên + tài khoản mới (create_missing,
// mặc định bật). Họ tên / khoa lấy lần lượt từ:
//   1. cột Họ và tên / Khoa/Phòng trong file
//   2. dữ liệu đã có trong hệ thống: thành viên đề tài, người tham dự hội thảo nội viện
//   3. khoa: khoa mặc định chọn ở hộp thoại
// Họ tên / khoa nhập riêng cho từng Mã NV ở bước xem trước (defaults.staff_names /
// staff_departments) đè lên tất cả.
// Không có họ tên → missing_name, dòng không hợp lệ (không tạo tài khoản); không có khoa →
// để trống (bổ sung sau).
// Cùng 1 Mã NV nhiều dòng → dùng chung kế hoạch của dòng đầu.
// Trả { staff, note } hoặc { reason } (lý do không tạo được).
const planNewStaff = (row, lookups, defaults, planned, fileNames) => {
	if (row.staff_number == null)
		return { reason: 'Không có Mã NV nên không tạo được nhân viên mới' };
	const taken = lookups.takenStaff.get(row.staff_number);
	if (taken === false) {
		return {
			reason: `Mã NV ${row.staff_number} thuộc tài khoản đã bị khoá — mở lại ở màn Người dùng rồi nhập lại`,
		};
	}
	if (taken === true)
		return { reason: `Mã NV ${row.staff_number} thuộc tài khoản khoa/phòng dùng chung` };
	const prev = planned.get(row.staff_number);
	if (prev) {
		const name = (row.full_name || '').trim();
		return {
			staff: prev,
			note:
				name && !prev.missing_name && norm(name) !== norm(prev.full_name)
					? `Họ tên "${name}" khác dòng trước của Mã NV ${row.staff_number} — dùng "${prev.full_name}"`
					: null,
		};
	}

	const known = lookups.knownStaff.get(row.staff_number);
	const notes = [];
	// Họ tên nhập riêng cho Mã NV này ở bước xem trước — ưu tiên hơn mọi nguồn khác
	let fullName = String(defaults.staff_names?.[row.staff_number] || '').trim();
	let nameSource = 'input';
	if (!fullName) {
		// Dòng này trống họ tên nhưng dòng khác cùng Mã NV có → dùng họ tên đó
		fullName = String(row.full_name || '').trim() || fileNames.get(row.staff_number) || '';
		nameSource = 'file';
	}
	if (!fullName && known) {
		fullName = known.full_name.trim();
		nameSource = 'system';
	}
	// Chưa có họ tên thì KHÔNG tạo tài khoản (tên đăng nhập sinh từ họ tên) — dòng bị bỏ qua
	// tới khi nhập họ tên ở bước xem trước.
	if (!fullName) {
		nameSource = null;
		notes.push(
			'Chưa có họ tên — nhập họ tên ở bảng nhân viên mới, nếu không sẽ bỏ qua dòng này khi nhập',
		);
	}

	// Khoa chọn riêng cho Mã NV này ở bước xem trước — ưu tiên hơn mọi nguồn khác
	let dept = lookups.deptById.get(defaults.staff_departments?.[row.staff_number]) || null;
	if (!dept) {
		dept = matchDept(row.department_raw, lookups);
		if (row.department_raw && !dept) notes.push(`Không khớp khoa/phòng "${row.department_raw}"`);
	}
	if (!dept && known)
		dept = lookups.deptById.get(known.department_id) || matchDept(known.department_raw, lookups);
	if (!dept && defaults.new_department_id)
		dept = lookups.deptById.get(defaults.new_department_id) || null;
	if (!dept) notes.push('Chưa có khoa/phòng — bổ sung ở màn Người dùng');

	const staff = {
		staff_number: row.staff_number,
		full_name: fullName,
		name_source: nameSource,
		missing_name: !fullName,
		department_id: dept?.id || null,
		department_code: dept?.code || null,
		department_name: dept?.name || null,
	};
	planned.set(row.staff_number, staff);
	return { staff, note: notes.join('; ') || null };
};

// Giới hạn theo kiểu cột cme_records — vượt thì SQL báo lỗi giữa chừng lúc nhập
const MAX_CREDITS = 9999.99; // DECIMAL(6,2)
const MAX_QUANTITY = 999999.99; // DECIMAL(8,2)
const TEXT_LIMITS = { title: 255, role: 100, notes: 500 };
const TEXT_LABELS = { title: 'Hoạt động', role: 'Vai trò', notes: 'Ghi chú' };

const sameName = (a, b) => norm(stripQualification(a || '')) === norm(stripQualification(b || ''));

// defaults = giá trị chọn ở hộp thoại nhập { year, group_id, category_id, title, quantity, credits,
// create_missing, new_department_id, staff_departments, staff_names }: chỉ dùng khi ô tương
// ứng trong file để trống (riêng staff_departments / staff_names { [Mã NV]: … } luôn được ưu tiên).
// Mỗi dòng trả: warnings (mọi thông báo), data_ok (dữ liệu hợp lệ, chưa xét nhân viên),
// valid (nhập được = data_ok + có / sẽ tạo nhân viên).
const buildPreview = (rows, lookups, defaults = {}) => {
	const planned = new Map();
	const fileNames = new Map();
	for (const r of rows) {
		const name = String(r.full_name || '').trim();
		if (r.staff_number != null && name && !fileNames.has(r.staff_number))
			fileNames.set(r.staff_number, name);
	}
	return rows.map((row) => {
		const warnings = [];
		let dataOk = true;
		const fail = (msg) => {
			dataOk = false;
			warnings.push(`${msg} — bỏ qua dòng này khi nhập.`);
		};

		const user = matchUser(row, lookups);
		let newStaff = null;
		if (!user && defaults.create_missing) {
			const plan = planNewStaff(row, lookups, defaults, planned, fileNames);
			newStaff = plan.staff || null;
			if (plan.note) warnings.push(plan.note);
			if (!newStaff) warnings.push(`${plan.reason} — bỏ qua dòng này khi nhập.`);
		} else if (!user) {
			warnings.push(
				row.staff_number == null && !row.full_name
					? 'Không có Mã NV và Họ tên — bỏ qua dòng này khi nhập.'
					: defaults.can_create_staff
						? 'Không khớp được nhân viên — bỏ qua dòng này khi nhập (bật "Tự tạo nhân viên mới" để thêm).'
						: 'Không khớp được nhân viên — bỏ qua dòng này khi nhập.',
			);
		}
		// Khớp theo Mã NV nhưng họ tên trong file khác hệ thống — có thể gõ nhầm Mã NV
		if (
			user &&
			row.full_name &&
			row.staff_number != null &&
			Number(user.staff_number) === row.staff_number &&
			!sameName(row.full_name, user.full_name)
		) {
			warnings.push(
				`Họ tên trong file "${row.full_name}" khác hệ thống "${user.full_name}" (Mã NV ${row.staff_number}) — kiểm tra lại Mã NV.`,
			);
		}

		let categoryId = null;
		if (!row.category_raw && lookups.conversionById.has(defaults.category_id)) {
			categoryId = defaults.category_id;
		} else if (row.category_raw) {
			const k = norm(row.category_raw);
			const byGroup = row.group_raw
				? lookups.categoryByGroup.get(`${norm(row.group_raw)}|${k}`)
				: defaults.group_id && lookups.categoryByGroup.get(`id:${defaults.group_id}|${k}`);
			const ids = lookups.categoryByName.get(k) || [];
			categoryId = byGroup || (ids.length === 1 ? ids[0] : null);
			if (!categoryId) warnings.push(`Không khớp danh mục "${row.category_raw}" — để trống.`);
		}

		// Ngày: ô có chữ mà không đọc được (sai dạng / ngày không có thật) → lỗi, không lặng lẽ bỏ trống
		const raw = row.raw || {};
		if (raw.activity_date && !row.activity_date)
			fail(`Từ ngày "${raw.activity_date}" không hợp lệ (cần dd/mm/yyyy)`);
		if (raw.end_date && !row.end_date)
			fail(`Đến ngày "${raw.end_date}" không hợp lệ (cần dd/mm/yyyy)`);
		if (row.activity_date && row.end_date && row.end_date < row.activity_date)
			fail('"Đến ngày" trước "Từ ngày"');

		// Năm: theo Từ ngày nếu có; không có ngày thì lấy năm chọn ở hộp thoại, rồi cột Năm
		const year = row.activity_date
			? +row.activity_date.slice(0, 4)
			: defaults.year || row.year || null;
		if (!year) fail('Thiếu Năm và Ngày hoạt động');
		else if (year < 1900 || year > 2100) fail(`Năm ${year} không hợp lệ`);

		// Tín chỉ: cột Giờ tín chỉ trong file có số → luôn lấy theo file. Ô trống thì:
		//   loại có giờ quy đổi → giờ quy đổi × Số lượng (bắt buộc có Số lượng);
		//   loại "Khác" (quy đổi 0) / không chọn loại → Giờ tín chỉ mặc định ở hộp thoại.
		const conv = categoryId ? lookups.conversionById.get(categoryId) : 0;
		const quantityBad = !!raw.quantity && row.quantity == null;
		if (quantityBad) fail(`Số lượng "${raw.quantity}" không hợp lệ`);
		const quantity = row.quantity ?? defaults.quantity ?? null;
		if (quantity != null && (quantity < 0 || quantity > MAX_QUANTITY))
			fail(`Số lượng ${quantity} không hợp lệ (0 – ${MAX_QUANTITY})`);
		let credits = row.credits;
		if (raw.credits && credits == null) {
			fail(`Giờ tín chỉ "${raw.credits}" không hợp lệ`);
		} else if (credits != null) {
			// Báo khi số trong file lệch với quy đổi — vẫn dùng số trong file
			const converted = conv > 0 && quantity > 0 ? +(conv * quantity).toFixed(2) : null;
			if (converted != null && converted !== credits)
				warnings.push(
					`Giờ tín chỉ trong file (${credits}) khác quy đổi ${conv} × ${quantity} = ${converted} — dùng số trong file.`,
				);
		} else if (conv > 0) {
			credits = quantity > 0 ? +(conv * quantity).toFixed(2) : null;
			if (credits == null && !quantityBad)
				fail('Thiếu Giờ tín chỉ và Số lượng (cần một trong hai để tính tín chỉ)');
		} else {
			credits = defaults.credits ?? null;
			if (credits == null) fail('Thiếu Giờ tín chỉ (ô trống và chưa nhập Giờ tín chỉ mặc định)');
		}
		if (credits != null && (credits < 0 || credits > MAX_CREDITS))
			fail(`Giờ tín chỉ ${credits} không hợp lệ (0 – ${MAX_CREDITS})`);

		// Chữ dài hơn cột → cắt bớt, báo để người nhập biết
		const text = {
			title: row.title || defaults.title || 'Hoạt động CME',
			role: row.role,
			notes: row.notes,
		};
		for (const [k, max] of Object.entries(TEXT_LIMITS)) {
			if (text[k] && text[k].length > max) {
				text[k] = text[k].slice(0, max);
				warnings.push(`${TEXT_LABELS[k]} dài quá ${max} ký tự — đã cắt bớt.`);
			}
		}

		return {
			row: row.row,
			user_id: user?.id || null,
			matched_user_name: user?.full_name || newStaff?.full_name || null,
			new_staff: newStaff,
			full_name_raw: row.full_name,
			staff_number: row.staff_number,
			category_id: categoryId || null,
			category_raw: row.category_raw,
			title: text.title,
			activity_date: row.activity_date,
			end_date: row.end_date,
			year,
			role: text.role,
			quantity,
			credits,
			notes: text.notes,
			warnings,
			data_ok: dataOk,
			duplicate: null,
			valid: dataOk && (!!user || (!!newStaff && !newStaff.missing_name)),
		};
	});
};

// Đánh dấu dòng trùng: cùng nhân viên + năm + nội dung + Từ ngày + tín chỉ với ghi nhận đã có
// trong hệ thống ('existing') hoặc với dòng trước trong file ('file'). Chỉ xét dòng hợp lệ.
// Người nhập quyết định có nhập dòng trùng không (defaults.include_duplicates).
const dupKey = (who, year, title, date, credits) =>
	`${who}|${year}|${norm(title || '')}|${date || ''}|${Number(credits).toFixed(2)}`;

const markDuplicates = async (preview) => {
	const valid = preview.filter((p) => p.valid);
	const userIds = [...new Set(valid.map((p) => p.user_id).filter(Boolean))];
	const existing = new Set();
	if (userIds.length) {
		const pool = await getPool();
		const r = await pool
			.request()
			.input('users', sql.NVarChar(sql.MAX), JSON.stringify(userIds))
			.input('years', sql.NVarChar(sql.MAX), JSON.stringify([...new Set(valid.map((p) => p.year))]))
			.query(`SELECT user_id, year, title, activity_date, credits FROM cme_records
			        WHERE user_id IN (SELECT [value] FROM OPENJSON(@users))
			          AND year IN (SELECT CAST([value] AS INT) FROM OPENJSON(@years))`);
		for (const e of r.recordset) {
			const date = e.activity_date ? new Date(e.activity_date).toISOString().slice(0, 10) : null;
			existing.add(dupKey(e.user_id, e.year, e.title, date, e.credits));
		}
	}
	const seen = new Map();
	for (const p of valid) {
		const who = p.user_id || `sn:${p.new_staff?.staff_number}`;
		const key = dupKey(who, p.year, p.title, p.activity_date, p.credits);
		if (p.user_id && existing.has(key)) {
			p.duplicate = 'existing';
			p.warnings.push('Trùng ghi nhận đã có trong hệ thống (cùng nội dung, ngày, tín chỉ).');
		} else if (seen.has(key)) {
			p.duplicate = 'file';
			p.warnings.push(`Trùng dòng ${seen.get(key)} trong file.`);
		} else {
			seen.set(key, p.row);
		}
	}
};

// Báo tài khoản vừa tạo: người được tạo (thấy khi đăng nhập; kèm email nếu bật
// ACCOUNT_GRANTED) và người nhập (xem lại danh sách sau khi đã đóng hộp thoại).
// push tự nuốt lỗi → thông báo hỏng không ảnh hưởng việc nhập.
const notifyCreatedStaff = async (staff, actorId) => {
	if (!staff.length) return;
	await notificationService.pushWithEmail(
		'account_granted',
		'Tài khoản hệ thống đã được cấp',
		staff.map((s) => s.id),
		{
			message:
				'Tài khoản được tạo khi nhập ghi nhận CME. Mật khẩu ban đầu do khoa/phòng cung cấp — hệ thống sẽ yêu cầu đổi mật khẩu ở lần đăng nhập đầu.',
			mailEvent: 'ACCOUNT_GRANTED',
		},
	);
	const incomplete = staff.filter((s) => s.missing_name || s.missing_department).length;
	const list = staff
		.map(
			(s) =>
				`${s.full_name} (MNV ${s.staff_number}, ${s.department_name || 'chưa có khoa'}) — TĐN: ${s.username}`,
		)
		.join('; ');
	await notificationService.push(
		'account_granted',
		`Đã tạo ${staff.length} tài khoản nhân viên mới khi nhập CME`,
		[actorId],
		{
			message: `Mật khẩu ban đầu = tên đăng nhập, bắt đổi khi đăng nhập lần đầu.${
				incomplete ? ` ${incomplete} người cần bổ sung thông tin ở màn Người dùng.` : ''
			} ${list}`,
		},
	);
};

const importExcel = async ({ buffer, dry_run, defaults }, actorId) => {
	const { rows: rawRows } = await parseWorkbook(buffer);
	const lookups = await loadLookups();
	const preview = buildPreview(rawRows, lookups, defaults);
	await markDuplicates(preview);
	// Dòng sẽ nhập: hợp lệ, trừ dòng trùng khi người nhập chọn bỏ qua
	const willImport = (p) => p.valid && (!p.duplicate || defaults.include_duplicates);

	const warnings = [];
	for (const p of preview) {
		for (const w of p.warnings) {
			warnings.push(
				`Dòng ${p.row} (${p.matched_user_name || p.full_name_raw || p.staff_number}): ${w}`,
			);
		}
	}

	// Nhân viên mới chỉ tạo cho dòng hợp lệ (dòng sẽ bị bỏ qua thì không tạo người)
	const newStaff = new Map();
	for (const p of preview)
		if (willImport(p) && p.new_staff) newStaff.set(p.new_staff.staff_number, p.new_staff);

	const summary = {
		total: preview.length,
		matched: preview.filter((p) => p.user_id).length,
		valid: preview.filter((p) => p.valid).length,
		duplicates: preview.filter((p) => p.duplicate).length,
		new_staff: newStaff.size,
	};

	if (dry_run) {
		return { dry_run: true, rows: preview, summary, warnings };
	}

	// Tạo nhân viên mới trước — mỗi người 1 transaction ngắn (sp_gen_user_id giữ
	// applock sinh mã tới khi commit), tuần tự để không tranh khoá sinh mã cùng khoa.
	const created_staff = [];
	const failedStaff = new Set();
	for (const st of newStaff.values()) {
		try {
			const u = await userService.createStaffAccount(st, actorId);
			st.user_id = u.id;
			created_staff.push({
				id: u.id,
				username: u.username,
				full_name: st.full_name,
				staff_number: st.staff_number,
				department_name: st.department_name,
				missing_name: st.missing_name,
				missing_department: !st.department_id,
			});
		} catch (err) {
			failedStaff.add(st.staff_number);
			warnings.push(
				`Không tạo được nhân viên ${st.full_name} (Mã NV ${st.staff_number}): ${
					/UQ_users_staff_number/.test(err?.message)
						? 'Mã NV vừa được dùng cho tài khoản khác'
						: err.message
				} — bỏ qua các dòng của người này.`,
			);
		}
	}
	for (const p of preview) if (p.new_staff && !p.user_id) p.user_id = p.new_staff.user_id || null;

	// Id sinh bằng NEWID() nên chèn song song an toàn — chạy theo lô CONCURRENCY
	// dòng thay vì tuần tự từng dòng (pool DB tối đa 10 kết nối). Dòng lỗi không làm
	// hỏng cả lần nhập: ghi lại để báo, các dòng khác vẫn nhập (nhập lại cả file sẽ trùng).
	const CONCURRENCY = 5;
	const valid = preview.filter(
		(p) => willImport(p) && p.user_id && !failedStaff.has(p.new_staff?.staff_number),
	);
	const insertedRows = new Set();
	for (let i = 0; i < valid.length; i += CONCURRENCY) {
		const batch = valid.slice(i, i + CONCURRENCY);
		const results = await Promise.allSettled(
			batch.map((p) =>
				cmeRecordService.create(
					{
						user_id: p.user_id,
						category_id: p.category_id,
						title: p.title,
						activity_date: p.activity_date,
						end_date: p.end_date,
						year: p.year,
						role: p.role,
						quantity: p.quantity,
						credits: p.credits,
						note: p.notes,
					},
					actorId,
					{ fetch: false },
				),
			),
		);
		results.forEach((res, j) => {
			if (res.status === 'fulfilled') return insertedRows.add(batch[j].row);
			const p = batch[j];
			p.warnings.push(`Lỗi khi lưu: ${res.reason?.message || res.reason}`);
			warnings.push(
				`Dòng ${p.row} (${p.matched_user_name || p.full_name_raw || p.staff_number}): lỗi khi lưu — chưa được nhập.`,
			);
		});
	}
	const inserted = insertedRows.size;

	// Dòng không nhập được — trả lại đủ dữ liệu để giao diện "Thêm NV" rồi nhập tiếp
	// đúng các dòng này (không phải nhập lại cả file → không trùng dòng đã nhập).
	const skipped_rows = preview
		.filter((p) => !insertedRows.has(p.row))
		.map(({ warnings: w, ...p }) => ({ ...p, missing_user: !p.user_id, warnings: w }));

	await notifyCreatedStaff(created_staff, actorId);

	return { dry_run: false, inserted, created_staff, skipped_rows, warnings };
};

// Thêm 1 nhân viên từ hộp thoại nhập (nút "Thêm NV" ở dòng chưa khớp nhân viên).
// Caller kiểm tra quyền users:create. Trả thông tin để giao diện nhập tiếp các dòng.
const createMissingStaff = async ({ staff_number, full_name, department_id }, actorId) => {
	const fail = (message, statusCode = 400) => httpError(statusCode, message);
	const staffNumber = parseStaffNumber(staff_number);
	const name = String(full_name || '').trim();
	if (staffNumber == null) throw fail('Mã NV không hợp lệ');
	if (!name) throw fail('Vui lòng nhập họ và tên');
	if (!department_id) throw fail('Vui lòng chọn khoa/phòng');

	const pool = await getPool();
	const r = await pool
		.request()
		.input('sn', sql.Int, staffNumber)
		.input('dept', sql.VarChar(20), department_id).query(`
      SELECT TOP 1 id, full_name, is_active FROM users WHERE staff_number = @sn;
      SELECT id, name, code FROM departments WHERE id = @dept;
    `);
	const [existing] = r.recordsets[0];
	if (existing) {
		throw fail(
			existing.is_active
				? `Mã NV ${staffNumber} đã thuộc ${existing.full_name} — đọc lại file để khớp`
				: `Mã NV ${staffNumber} thuộc tài khoản đã bị khoá (${existing.full_name}) — mở lại ở màn Người dùng`,
			409,
		);
	}
	const [dept] = r.recordsets[1];
	if (!dept) throw fail('Khoa/phòng không tồn tại');

	const u = await userService.createStaffAccount(
		{
			full_name: name,
			staff_number: staffNumber,
			department_id: dept.id,
			department_code: dept.code,
		},
		actorId,
	);
	const staff = {
		id: u.id,
		username: u.username,
		full_name: name,
		staff_number: staffNumber,
		department_name: dept.name,
		missing_name: false,
		missing_department: false,
	};
	await notifyCreatedStaff([staff], actorId);
	return staff;
};

module.exports = { importExcel, templateWorkbook, createMissingStaff };
