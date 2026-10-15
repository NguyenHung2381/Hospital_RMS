/**
 * topicImportService.js — Nhập danh sách đề tài NCKH hàng loạt từ Excel.
 * Mirror cmeRecordImportService (dò tiêu đề, khớp cột gần đúng, giá trị mặc định
 * chọn ở hộp thoại, dry_run trả preview).
 *
 * Bố cục file = file "Xuất Excel" đề tài: MỖI DÒNG 1 THÀNH VIÊN, các dòng liền
 * nhau cùng Tên đề tài (hoặc để trống / gộp ô) thuộc cùng một đề tài. Thông tin
 * đề tài (khoa, thể loại, cấp độ, đợt) lấy ở dòng đầu của nhóm.
 */
const ExcelJS = require('exceljs');
const { getPool } = require('../config/db');
const { norm, normDept } = require('../utils/vietnameseText');
const { parseStaffNumber, readSheet } = require('../utils/excelImport');
const xl = require('../utils/excelTemplate');
const topicService = require('./topicService');
const topicMemberService = require('./topicMemberService');

const SHEET_COLUMNS = [
	{ key: 'stt', header: 'STT', width: 6 },
	{ key: 'department_raw', header: 'Khoa/phòng/TT', width: 22 },
	{ key: 'title', header: 'Tên Sáng kiến/Đề tài', width: 48 },
	{ key: 'category_raw', header: 'Thể loại', width: 18 },
	{ key: 'level_raw', header: 'Cấp độ', width: 14 },
	{ key: 'round_raw', header: 'Đợt NC', width: 16 },
	{ key: 'name', header: 'Họ và tên', width: 24 },
	{ key: 'position', header: 'Chức vụ', width: 16 },
	{ key: 'staff_number', header: 'MNV', width: 9 },
	{ key: 'role_raw', header: 'Vai trò nhóm NC', width: 14 },
];

const COLUMN_MATCHERS = [
	['stt', (h) => h === 'stt' || h === 'tt'],
	['department_raw', (h) => h.startsWith('khoa') || h === 'don vi'],
	['title', (h) => h.startsWith('ten sang kien') || h.startsWith('ten de tai') || h === 'de tai' || h === 'ten'],
	['category_raw', (h) => h === 'the loai' || h === 'phan loai' || h === 'loai de tai'],
	['level_raw', (h) => h === 'cap do' || h === 'cap'],
	['round_raw', (h) => h.startsWith('dot')],
	['name', (h) => h === 'ho va ten' || h === 'ho ten' || h === 'thanh vien'],
	['position', (h) => h === 'chuc vu'],
	['staff_number', (h) => h === 'mnv' || h === 'ma nv' || h.includes('ma nhan vien')],
	['role_raw', (h) => h.startsWith('vai tro')],
];

const ROLE_LABELS = { leader: 'Chủ nhiệm', secretary: 'Thư ký', member: 'Thành viên' };
const parseRole = (raw) => {
	const h = norm(raw);
	if (h.includes('chu nhiem') || h.includes('chu tri')) return 'leader';
	if (h.includes('thu ky')) return 'secretary';
	return 'member';
};

const templateWorkbook = async () => {
	const pool = await getPool();
	const [cats, lvls, depts] = await Promise.all([
		pool.request().query('SELECT name FROM categories ORDER BY name'),
		pool.request().query('SELECT name FROM levels ORDER BY name'),
		pool.request().query('SELECT name FROM departments ORDER BY name'),
	]);
	const wb = new ExcelJS.Workbook();
	const ws = xl.buildSheet(wb, {
		sheetName: 'Đề tài',
		title: 'MẪU NHẬP DANH SÁCH ĐỀ TÀI NGHIÊN CỨU KHOA HỌC',
		subtitle:
			'Mỗi dòng 1 thành viên; các dòng liền nhau cùng Tên đề tài (hoặc để trống Tên đề tài) thuộc cùng một đề tài. Bắt buộc: Tên đề tài, Thể loại (hoặc chọn ở hộp thoại nhập), Họ và tên hoặc MNV. Đợt NC để trống → lấy đợt chọn ở hộp thoại. Vai trò: Chủ nhiệm / Thư ký / Thành viên.',
		columns: SHEET_COLUMNS,
		letterhead: true,
	});
	ws.getRow(5).height = 30;
	const range = (name, header, rows) => {
		const r = xl.addLookupSheet(wb, name, header, rows.map((x) => x.name));
		return r ? { range: r } : null;
	};
	xl.addDropdowns(ws, SHEET_COLUMNS, {
		category_raw: range('DM_TheLoai', 'Thể loại', cats.recordset),
		level_raw: range('DM_CapDo', 'Cấp độ', lvls.recordset),
		department_raw: range('DM_Khoa', 'Khoa/phòng', depts.recordset),
		role_raw: Object.values(ROLE_LABELS),
	});
	return wb;
};

// Gom dòng thành viên → đề tài. Tên đề tài trống hoặc trùng dòng trên (ô gộp) = cùng đề tài.
const parseWorkbook = async (buffer) => {
	const { rows } = await readSheet(buffer, {
		matchers: COLUMN_MATCHERS,
		isValid: (c) => !!c.title,
		headerError: 'Không tìm thấy dòng tiêu đề (cần cột "Tên Sáng kiến/Đề tài" hoặc "Tên đề tài").',
		isEmpty: (get, row) => !get(row, 'title') && !get(row, 'name') && !get(row, 'staff_number'),
	});
	const topics = [];
	let cur = null;
	for (const { r, row, get } of rows) {
		const title = get(row, 'title');
		if (!cur || (title && norm(title) !== norm(cur.title))) {
			cur = {
				row: r,
				title,
				department_raw: get(row, 'department_raw') || null,
				category_raw: get(row, 'category_raw') || null,
				level_raw: get(row, 'level_raw') || null,
				round_raw: get(row, 'round_raw') || null,
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
				role: parseRole(get(row, 'role_raw')),
			});
		}
	}
	if (!topics.length) throw Object.assign(new Error('File không có dòng dữ liệu nào.'), { statusCode: 400 });
	return topics;
};

const loadLookups = async () => {
	const pool = await getPool();
	const [cats, lvls, depts, rounds, users, existing] = await Promise.all([
		pool.request().query('SELECT id, name, abbr FROM categories'),
		pool.request().query('SELECT id, name FROM levels'),
		pool.request().query('SELECT id, name, code FROM departments'),
		pool.request().query('SELECT id, name, year FROM research_rounds'),
		pool.request().query('SELECT full_name, staff_number, department_id FROM users WHERE staff_number IS NOT NULL AND is_active = 1'),
		pool.request().query('SELECT title, round_id FROM topics'),
	]);
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
		levelByKey: byKey(lvls.recordset, 'name', 'id'),
		deptById: new Map(depts.recordset.map((d) => [d.id, d])),
		deptByKey,
		roundById: new Map(rounds.recordset.map((r) => [r.id, r])),
		roundByKey: byKey(rounds.recordset, 'name', 'id'),
		userByStaff: new Map(users.recordset.map((u) => [Number(u.staff_number), u])),
		existing: new Set(existing.recordset.map((t) => `${t.round_id}|${norm(t.title)}`)),
	};
};

const matchDept = (raw, lk) => (raw ? lk.deptByKey.get(norm(raw)) || lk.deptByKey.get(normDept(raw)) || null : null);

// defaults = chọn ở hộp thoại { round_id, category_id, level_id, department_id, article_type }:
// chỉ dùng khi ô tương ứng trong file để trống.
const buildPreview = (topics, lk, defaults = {}) => {
	const seen = new Set();
	return topics.map((t) => {
		const errors = [];
		const warnings = [];

		const round = t.round_raw ? lk.roundByKey.get(norm(t.round_raw)) : lk.roundById.get(defaults.round_id);
		if (!round) errors.push(t.round_raw ? `Không khớp đợt "${t.round_raw}"` : 'Chưa chọn đợt nghiên cứu');

		const cat = t.category_raw ? lk.catByKey.get(norm(t.category_raw)) : lk.catById.get(defaults.category_id);
		if (!cat) errors.push(t.category_raw ? `Không khớp thể loại "${t.category_raw}"` : 'Thiếu thể loại');
		else if (!cat.abbr) errors.push(`Thể loại "${cat.name}" chưa có ký hiệu viết tắt — bổ sung ở Danh mục`);

		const level = t.level_raw ? lk.levelByKey.get(norm(t.level_raw)) : lk.levelById.get(defaults.level_id);
		if (t.level_raw && !level) warnings.push(`Không khớp cấp độ "${t.level_raw}" — để trống`);

		const dept = t.department_raw ? matchDept(t.department_raw, lk) : lk.deptById.get(defaults.department_id);
		if (t.department_raw && !dept) warnings.push(`Không khớp khoa/phòng "${t.department_raw}" — để trống`);

		if (!t.title) errors.push('Thiếu tên đề tài');

		const members = [];
		for (const m of t.members) {
			const user = m.staff_number != null ? lk.userByStaff.get(m.staff_number) : null;
			const name = m.name || user?.full_name || '';
			if (!name) {
				warnings.push(`Dòng ${m.row}: MNV ${m.staff_number} chưa có trong hệ thống và thiếu họ tên — bỏ qua thành viên`);
				continue;
			}
			members.push({ ...m, name, department_id: user?.department_id || dept?.id || null });
		}
		if (members.length && !members.some((m) => m.role === 'leader')) {
			members[0].role = 'leader';
			warnings.push(`Không có Chủ nhiệm — lấy "${members[0].name}" làm Chủ nhiệm`);
		}
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
					{ ho_ten: m.name, staff_number: m.staff_number, chuc_vu: m.position, department_id: m.department_id, role: m.role },
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
