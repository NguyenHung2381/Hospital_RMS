/**
 * topicImportService.js — Nhập danh sách đề tài NCKH hàng loạt từ Excel.
 * Mirror cmeRecordImportService (dò tiêu đề, khớp cột gần đúng, giá trị mặc định
 * chọn ở hộp thoại, dry_run trả preview).
 *
 * Bố cục: MỖI DÒNG 1 THÀNH VIÊN; mỗi đề tài là 1 khối dòng, các cột thông tin
 * đề tài gộp ô (file mẫu dựng sẵn khối 3 dòng: Chủ nhiệm / Thư ký / Thành viên).
 * Vai trò theo vị trí dòng trong khối. File không gộp ô: dòng để trống / trùng
 * Tên đề tài với dòng trên thuộc cùng đề tài (như file "Xuất Excel").
 */
const ExcelJS = require('exceljs');
const { getPool } = require('../../config/db');
const { norm, normDept } = require('../../utils/vietnameseText');
const { parseStaffNumber, readSheet } = require('../../utils/excelImport');
const xl = require('../../utils/excelTemplate');
const topicService = require('./topicService');
const topicMemberService = require('./topicMemberService');
const { httpError } = require('../../utils/httpError');

const SHEET_COLUMNS = [
	{ key: 'stt', header: 'STT', width: 6 },
	{ key: 'department_raw', header: 'Khoa/phòng/TT', width: 22 },
	{ key: 'title', header: 'Tên Sáng kiến/Đề tài', width: 48 },
	{ key: 'category_raw', header: 'Thể loại', width: 18 },
	{ key: 'role_label', header: 'Vai trò', width: 12 },
	{ key: 'name', header: 'Họ và tên', width: 24 },
	{ key: 'position', header: 'Chức vụ', width: 16 },
	{ key: 'staff_number', header: 'MNV', width: 9 },
];

const COLUMN_MATCHERS = [
	['stt', (h) => h === 'stt' || h === 'tt'],
	['department_raw', (h) => h.startsWith('khoa') || h === 'don vi'],
	[
		'title',
		(h) =>
			h.startsWith('ten sang kien') || h.startsWith('ten de tai') || h === 'de tai' || h === 'ten',
	],
	['category_raw', (h) => h === 'the loai' || h === 'phan loai' || h === 'loai de tai'],
	['name', (h) => h === 'ho va ten' || h === 'ho ten' || h === 'thanh vien'],
	['position', (h) => h === 'chuc vu'],
	['staff_number', (h) => h === 'mnv' || h === 'ma nv' || h.includes('ma nhan vien')],
];

// Vai trò theo vị trí dòng trong khối đề tài: 1 = Chủ nhiệm, 2 = Thư ký, còn lại = Thành viên
const roleByOrder = (i) => (i === 0 ? 'leader' : i === 1 ? 'secretary' : 'member');
const SLOT_LABELS = ['Chủ nhiệm', 'Thư ký', 'Thành viên'];
const TEMPLATE_BLOCKS = 30;
// Cột thông tin đề tài — gộp ô theo khối
const TOPIC_KEYS = ['stt', 'department_raw', 'title', 'category_raw'];

const templateWorkbook = async () => {
	const pool = await getPool();
	const [cats, depts] = await Promise.all([
		pool.request().query('SELECT name FROM categories ORDER BY name'),
		pool.request().query('SELECT name FROM departments ORDER BY name'),
	]);
	const wb = new ExcelJS.Workbook();
	const ws = xl.buildSheet(wb, {
		sheetName: 'Đề tài',
		title: 'MẪU NHẬP DANH SÁCH ĐỀ TÀI NGHIÊN CỨU KHOA HỌC',
		subtitle:
			'Mỗi đề tài 1 khối 3 dòng (đã gộp ô sẵn): dòng 1 Chủ nhiệm, dòng 2 Thư ký, dòng 3 Thành viên — chỉ điền Họ và tên / Chức vụ / MNV, không cần nhập vai trò. Thêm thành viên: chèn dòng trong khối. Bắt buộc: Tên đề tài, Thể loại, Họ và tên hoặc MNV. Đợt nghiên cứu và Cấp độ chọn ở hộp thoại nhập (áp cho cả file).',
		columns: SHEET_COLUMNS,
		letterhead: true,
	});
	ws.getRow(5).height = 30;
	// Dựng sẵn khối đề tài: cột thông tin đề tài gộp 3 dòng, cột thành viên để trống từng dòng
	const slots = SLOT_LABELS.length;
	const topicCols = TOPIC_KEYS.map((k) => SHEET_COLUMNS.findIndex((c) => c.key === k) + 1);
	const roleCol = SHEET_COLUMNS.findIndex((c) => c.key === 'role_label') + 1;
	for (let b = 0; b < TEMPLATE_BLOCKS; b++) {
		const top = ws.headRow + 1 + b * slots;
		for (let i = 0; i < slots; i++) {
			const row = ws.getRow(top + i);
			for (let c = 1; c <= SHEET_COLUMNS.length; c++) {
				row.getCell(c).border = xl.border;
				row.getCell(c).alignment = { vertical: 'middle', wrapText: true };
			}
			Object.assign(row.getCell(roleCol), {
				value: SLOT_LABELS[i],
				font: { italic: true, color: { argb: 'FF6B7280' } },
			});
		}
		for (const c of topicCols) {
			ws.mergeCells(top, c, top + slots - 1, c);
			ws.getCell(top, c).alignment = {
				vertical: 'middle',
				horizontal: c === topicCols[2] ? 'left' : 'center',
				wrapText: true,
			};
		}
		ws.getCell(top, 1).value = b + 1;
	}
	const range = (name, header, rows) => {
		const r = xl.addLookupSheet(
			wb,
			name,
			header,
			rows.map((x) => x.name),
		);
		return r ? { range: r } : null;
	};
	xl.addDropdowns(ws, SHEET_COLUMNS, {
		category_raw: range('DM_TheLoai', 'Thể loại', cats.recordset),
		department_raw: range('DM_Khoa', 'Khoa/phòng', depts.recordset),
	});
	return wb;
};

// Gom dòng thành viên → đề tài. Ô Tên đề tài gộp (merge), để trống hoặc trùng dòng trên = cùng đề tài.
const parseWorkbook = async (buffer) => {
	const { rows, cols } = await readSheet(buffer, {
		matchers: COLUMN_MATCHERS,
		isValid: (c) => !!c.title,
		headerError: 'Không tìm thấy dòng tiêu đề (cần cột "Tên Sáng kiến/Đề tài" hoặc "Tên đề tài").',
		isEmpty: (get, row) => !get(row, 'title') && !get(row, 'name') && !get(row, 'staff_number'),
	});
	const topics = [];
	let cur = null;
	for (const { r, row, get } of rows) {
		const title = get(row, 'title');
		// Ô Tên đề tài gộp: sang vùng gộp khác = khối đề tài mới (kể cả khi trùng tên khối trên).
		// Dòng đầu khối có thể trống (chưa có Chủ nhiệm) nên tính theo ô gốc, không theo dòng đầu đọc được.
		const tc = row.getCell(cols.title);
		const block = tc.isMerged ? tc.master.row : null;
		if (
			!cur ||
			(block != null && block !== cur.row) ||
			(title && norm(title) !== norm(cur.title))
		) {
			cur = {
				row: block ?? r,
				title,
				department_raw: get(row, 'department_raw') || null,
				category_raw: get(row, 'category_raw') || null,
				members: [],
			};
			topics.push(cur);
		}
		const name = get(row, 'name');
		const staffNumber = parseStaffNumber(get(row, 'staff_number'));
		if (name || staffNumber != null) {
			cur.members.push({
				row: r,
				name,
				staff_number: staffNumber,
				position: get(row, 'position') || null,
				role: roleByOrder(r - cur.row),
			});
		}
	}
	if (!topics.length) throw httpError(400, 'File không có dòng dữ liệu nào.');
	return topics;
};

const loadLookups = async () => {
	const pool = await getPool();
	const [cats, lvls, depts, rounds, users, existing, roundLevels] = await Promise.all([
		pool.request().query('SELECT id, name, abbr FROM categories'),
		pool.request().query('SELECT id, name FROM levels'),
		pool.request().query('SELECT id, name, code FROM departments'),
		pool.request().query('SELECT id, name, year FROM research_rounds'),
		pool
			.request()
			.query(
				'SELECT full_name, staff_number, department_id FROM users WHERE staff_number IS NOT NULL AND is_active = 1',
			),
		pool.request().query('SELECT title, round_id FROM topics'),
		// Cấp độ ăn theo đợt — cùng quy tắc roundService.getAllowedLevelIds cho mọi đợt
		pool
			.request()
			.query(
				`SELECT round_id, level_id, 0 AS src FROM research_round_levels
				 UNION ALL
				 SELECT r.id, rtl.level_id, 1 FROM research_rounds r JOIN round_type_levels rtl ON rtl.round_type_id = r.round_type_id`,
			)
			.catch(() => ({ recordset: [] })), // bảng chưa tồn tại (migration chưa chạy) ⇒ không giới hạn
	]);
	// Đợt có cấu hình riêng thì dùng của đợt, không thì theo loại đợt; [] ⇒ không giới hạn
	const own = new Map();
	const byType = new Map();
	for (const x of roundLevels.recordset) {
		const m = x.src ? byType : own;
		if (!m.has(x.round_id)) m.set(x.round_id, []);
		m.get(x.round_id).push(x.level_id);
	}
	const byKey = (list, ...keys) => {
		const m = new Map();
		for (const x of list) for (const k of keys) if (x[k]) m.set(norm(x[k]), x);
		return m;
	};
	const deptByKey = byKey(depts.recordset, 'code', 'id');
	for (const d of depts.recordset) deptByKey.set(normDept(d.name), d);
	return {
		catById: new Map(cats.recordset.map((c) => [c.id, c])),
		catByKey: byKey(cats.recordset, 'name', 'abbr', 'id'),
		levelById: new Map(lvls.recordset.map((l) => [l.id, l])),
		allowedLevels: (roundId) => own.get(roundId) || byType.get(roundId) || [],
		deptByKey,
		roundById: new Map(rounds.recordset.map((r) => [r.id, r])),
		userByStaff: new Map(users.recordset.map((u) => [Number(u.staff_number), u])),
		existing: new Set(existing.recordset.map((t) => `${t.round_id}|${norm(t.title)}`)),
	};
};

const matchDept = (raw, lk) =>
	raw ? lk.deptByKey.get(norm(raw)) || lk.deptByKey.get(normDept(raw)) || null : null;

// defaults = chọn ở hộp thoại { round_id, category_id, level_id, article_type, status }:
// chỉ dùng khi ô tương ứng trong file để trống.
const buildPreview = (topics, lk, defaults = {}) => {
	const seen = new Set();
	return topics.map((t) => {
		const errors = [];
		const warnings = [];

		// Đợt + cấp độ chọn ở hộp thoại, áp cho cả file
		const round = lk.roundById.get(defaults.round_id);
		if (!round) errors.push('Chưa chọn đợt nghiên cứu');

		const cat = t.category_raw
			? lk.catByKey.get(norm(t.category_raw))
			: lk.catById.get(defaults.category_id);
		if (!cat)
			errors.push(t.category_raw ? `Không khớp thể loại "${t.category_raw}"` : 'Thiếu thể loại');
		else if (!cat.abbr)
			errors.push(`Thể loại "${cat.name}" chưa có ký hiệu viết tắt — bổ sung ở Danh mục`);

		// Cấp độ phải thuộc danh sách cấp độ của đợt (như khi đăng ký); bài báo không có cấp độ
		let level = null;
		if (defaults.article_type !== 'bai_bao') {
			level = lk.levelById.get(defaults.level_id) || null;
			const allowed = round ? lk.allowedLevels(round.id) : [];
			if (!level && allowed.length === 1) level = lk.levelById.get(allowed[0]);
			const names = allowed.map((id) => lk.levelById.get(id)?.name || id).join(', ');
			if (allowed.length && !level)
				errors.push(`Chưa chọn cấp độ — đợt "${round.name}" cho phép: ${names}`);
			else if (allowed.length && !allowed.includes(level.id)) {
				errors.push(
					`Cấp độ "${level.name}" không thuộc đợt "${round.name}" — đợt cho phép: ${names}`,
				);
			}
		}

		const dept = matchDept(t.department_raw, lk);
		if (t.department_raw && !dept)
			warnings.push(`Không khớp khoa/phòng "${t.department_raw}" — để trống`);

		if (!t.title) errors.push('Thiếu tên đề tài');

		const members = [];
		for (const m of t.members) {
			const user = m.staff_number != null ? lk.userByStaff.get(m.staff_number) : null;
			const name = m.name || user?.full_name || '';
			if (!name) {
				warnings.push(
					`Dòng ${m.row}: MNV ${m.staff_number} chưa có trong hệ thống và thiếu họ tên — bỏ qua thành viên`,
				);
				continue;
			}
			members.push({ ...m, name, department_id: user?.department_id || dept?.id || null });
		}
		if (members.length && !members.some((m) => m.role === 'leader'))
			warnings.push('Chưa có Chủ nhiệm (dòng đầu của khối để trống)');
		if (!members.length) warnings.push('Chưa có thành viên');

		const key = round && `${round.id}|${norm(t.title)}`;
		const duplicate = !!key && (lk.existing.has(key) || seen.has(key));
		if (key) seen.add(key);
		if (duplicate) warnings.push('Đã có đề tài cùng tên trong đợt này — sẽ bỏ qua');

		return {
			row: t.row,
			title: t.title,
			round_id: round?.id || null,
			round_name: round?.name || null,
			category_id: cat?.id || null,
			category_name: cat?.name || null,
			level_id: level?.id || null,
			level_name: level?.name || null,
			department_id: dept?.id || null,
			department_name: dept?.name || null,
			article_type: defaults.article_type || 'de_tai',
			members,
			errors,
			warnings,
			duplicate,
			valid: !errors.length && !duplicate,
		};
	});
};

const importExcel = async ({ buffer, dry_run, defaults }, actorId) => {
	const topics = await parseWorkbook(buffer);
	const rows = buildPreview(topics, await loadLookups(), defaults);
	const importable = rows.filter((r) => r.valid);
	const summary = {
		total: rows.length,
		importable: importable.length,
		members: importable.reduce((n, r) => n + r.members.length, 0),
		duplicates: rows.filter((r) => r.duplicate).length,
		invalid: rows.filter((r) => r.errors.length).length,
	};
	if (dry_run) return { dry_run: true, summary, rows };

	// Tuần tự: sp_gen_topic_id / sp_gen_member_id giữ applock sinh mã theo đợt/đề tài
	let inserted = 0;
	const failures = [];
	for (const r of importable) {
		try {
			const topic = await topicService.create(r, actorId);
			for (const m of r.members) {
				await topicMemberService.addMember(
					topic.id,
					{
						ho_ten: m.name,
						staff_number: m.staff_number,
						chuc_vu: m.position,
						department_id: m.department_id,
						role: m.role,
					},
					actorId,
				);
			}
			if (defaults.status && defaults.status !== 'submitted') {
				await topicService.update(topic.id, { status: defaults.status }, actorId, true);
			}
			inserted += 1;
		} catch (e) {
			failures.push(`Dòng ${r.row} (${r.title}): ${e.message}`);
		}
	}
	return { dry_run: false, summary, inserted, failures };
};

module.exports = { importExcel, templateWorkbook };
