/**
 * cmeRecordImportService.js — Nhập ghi nhận CME độc lập hàng loạt từ Excel.
 * Mirror seminarImportService/traineeImportService (dò tiêu đề, khớp cột gần
 * đúng, dry_run trả preview). Khớp nhân viên theo MNV hoặc họ tên, khớp danh
 * mục quy đổi theo tên — không đính kèm minh chứng qua import (thêm sau ở
 * từng dòng nếu cần, qua addEvidence).
 */
const { getPool, sql } = require('../../config/db');
const { lazyRequire } = require('../../utils/lazyRequire');
/** @type {typeof import('exceljs')} */
const ExcelJS = lazyRequire('exceljs');
const {
	parseDateCell,
	parseCredits,
	parseStaffNumber,
	readSheet,
} = require('../../utils/excelImport');
const cmeRecordService = require('./cmeRecordService');
const userService = require('../users/userService');
const notificationService = require('../notifications/notificationService');
const xl = require('../../utils/excelTemplate');
const { httpError } = require('../../utils/httpError');
const { constraintName } = require('../../utils/dbErrors');
const { loadLookups, buildPreview, markDuplicates } = require('./cmeRecordImportPreview');

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
		// File mẫu cũ có dòng ví dụ — bỏ nếu người dùng quên xóa
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
	// applock sinh mã tới khi commit), tuần tự để không tranh khóa sinh mã cùng khoa.
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
					constraintName(err) === 'uq_users_staff_number'
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
				: `Mã NV ${staffNumber} thuộc tài khoản đã bị khóa (${existing.full_name}) — mở lại ở màn Người dùng`,
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
