#!/usr/bin/env node
// Nhập danh sách nhân viên từ Excel: tạo tài khoản cho người chưa có MNV trong hệ
// thống (cùng quy ước userService.createStaffAccount: mã 'NV' + mã khoa + NNNN,
// username = chữ cái đầu họ tên + "_" + MNV, mật khẩu ban đầu = username, bắt đổi
// ở lần đăng nhập đầu, vai trò Thành viên), kèm ngày sinh + trình độ.
// Người đã có (trùng MNV, cùng họ tên) chỉ được bổ sung ô còn trống (khoa, ngày sinh,
// trình độ). Trùng MNV nhưng khác họ tên → bỏ qua, in ra để kiểm tra.
// Cột nhận theo tiêu đề dòng 1: MNV, Họ và tên, K/P/TT (Khoa/Phòng), Văn bằng
// chuyên môn, Ngày tháng năm sinh (ô ngày hoặc chuỗi dd/mm/yyyy).
// Khoa/phòng khớp theo tên hoặc mã trong bảng departments (+ DEPT_ALIAS bên dưới);
// không khớp → để trống, bổ sung sau ở màn Người dùng (hoặc thêm vào DEPT_ALIAS).
// Mặc định CHỈ XEM TRƯỚC; thêm --apply để ghi DB. Khi --apply, xuất file Excel danh
// sách tài khoản mới (--out=<đường dẫn>, mặc định tai-khoan-moi-<ngày>.xlsx).
//   npm run import:staff -- "D:/ds.xlsx"                  # xem trước
//   npm run import:staff -- "D:/ds.xlsx" --verbose        # xem trước từng dòng
//   npm run import:staff -- "D:/ds.xlsx" --apply          # thực hiện
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });

const ExcelJS = require('exceljs');
const { getPool, sql } = require('../src/config/db');
const { norm, normDept } = require('../src/utils/vietnameseText');
const { ROLE, requireRoleId } = require('../src/services/roleCodes');

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const verbose = args.includes('--verbose');
const file = args.find((a) => !a.startsWith('--'));
const outPath =
	args.find((a) => a.startsWith('--out='))?.slice(6) ||
	`tai-khoan-moi-${new Date().toISOString().slice(0, 10)}.xlsx`;

// Tên khoa trong file (sau normDept) → departments.code, khi tên không khớp trực tiếp
const DEPT_ALIAS = {
	duoc: 'KHOA01',
	'cong nghe thong tin': 'PCNTT',
	'co so ha tang va trang thiet bi': 'PVT',
	'dao tao va chi dao tuyen': 'DTCDT',
	'giai phau benh trung tam xet nghiem': 'K42',
	'di truyen va sinh hoc phan tu trung tam xet nghiem': 'K46',
	xquang: 'K39',
	'phau thuat than kinh cot song': 'K20',
	'noi ho hap': 'K50',
	'hoi suc tich cuc ngoai khoa': 'K482',
	'to hanh chinh quan tri': 'HCQT',
	'to cong tac xa hoi': 'CTXH',
};

// Văn bằng chuyên môn (sau norm) → qualifications.id; xét lần lượt, khớp đầu tiên thắng.
// Không khớp (lao động phổ thông, lái xe, bảo vệ…) → để trống.
const QUAL_RULES = [
	[/^bsck ?(ii|2)$/, 'TD004'],
	[/^bsck ?(i|1)$/, 'TD003'],
	[/^(dsck ?(ii|2)|duoc sy chuyen khoa ii)$/, 'TD018'],
	[/^dsck ?(i|1)$/, 'TD017'],
	[/^thac s[iy] dd/, 'TD026'],
	[/^thac s[iy] duoc/, 'TD027'],
	[/^thac s[iy] (sinh hoc|shtn)/, 'TD028'],
	[/^thac s[iy]/, 'TD025'],
	[/^tien s[iy]/, 'TD029'],
	[/^(duoc si dai hoc|dsdh)$/, 'TD019'],
	[/^(cd duoc|cao dang duoc|duoc si cao dang)/, 'TD005'],
	[/^cao dang dieu duong/, 'TD007'],
	[/^cu nhan dieu duong/, 'TD010'],
	[/^cu nhan dinh duong/, 'TD011'],
	[/^(cn sinh hoc|cu nhan cong nghe sinh hoc)/, 'TD013'],
	[/^ddth$/, 'TD015'],
	[/^bac si/, 'TD001'],
	[/^(cao dang|cd )/, 'TD006'],
	[/^(trung cap|tc |y sy)/, 'TD024'],
	[/^(ky su|ks |cu nhan|cn|kien truc su|dh khac)/, 'TD016'],
];

// Tiêu đề cột (sau norm) → khoá
const COLUMNS = [
	['mnv', (h) => h === 'mnv' || h === 'ma nv' || h === 'ma nhan vien'],
	['full_name', (h) => h === 'ho va ten' || h === 'ho ten'],
	['department', (h) => h === 'k p tt' || h === 'khoa phong' || h === 'khoa' || h === 'don vi'],
	['qualification', (h) => h.startsWith('van bang') || h === 'trinh do'],
	['dob', (h) => h.startsWith('ngay thang nam sinh') || h === 'ngay sinh'],
];

const matchQual = (raw) => {
	const k = norm(raw);
	for (const [re, id] of QUAL_RULES) if (re.test(k)) return id;
	return null;
};

// Ô ngày (exceljs trả Date UTC 0h) hoặc chuỗi d/m/yyyy
const parseDob = (v) => {
	if (v instanceof Date)
		return new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()));
	const m = String(v ?? '')
		.trim()
		.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
	if (!m) return null;
	const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
	return d.getUTCDate() === +m[1] ? d : null;
};

const cellText = (v) => {
	if (v && typeof v === 'object' && !(v instanceof Date))
		v = v.text ?? v.result ?? v.richText?.map((t) => t.text).join('');
	return String(v ?? '')
		.replace(/\s+/g, ' ')
		.trim();
};

const readRows = async () => {
	const wb = new ExcelJS.Workbook();
	await wb.xlsx.readFile(file);
	const ws = wb.worksheets[0];
	const colOf = {};
	ws.getRow(1).eachCell((cell, col) => {
		const h = norm(cellText(cell.value));
		const hit = COLUMNS.find(([, test]) => test(h));
		if (hit && !colOf[hit[0]]) colOf[hit[0]] = col;
	});
	const missing = COLUMNS.map(([k]) => k).filter((k) => !colOf[k] && k !== 'qualification');
	if (missing.length)
		throw new Error(`Không thấy cột: ${missing.join(', ')} (dòng tiêu đề phải ở dòng 1)`);

	const rows = [];
	ws.eachRow((r, line) => {
		if (line === 1) return;
		const get = (k) => (colOf[k] ? r.getCell(colOf[k]).value : null);
		const full_name = cellText(get('full_name'));
		const mnvText = cellText(get('mnv'));
		if (!full_name && !mnvText) return;
		rows.push({
			line,
			mnv: /^\d+$/.test(mnvText) ? parseInt(mnvText, 10) : null,
			mnvText,
			full_name,
			deptRaw: cellText(get('department')),
			qualRaw: cellText(get('qualification')),
			dob: parseDob(get('dob') instanceof Date ? get('dob') : cellText(get('dob'))),
		});
	});
	return rows;
};

const countBy = (items, key) => {
	const m = new Map();
	for (const it of items) m.set(key(it), (m.get(key(it)) || 0) + 1);
	return [...m].sort((a, b) => b[1] - a[1]);
};
const ymd = (d) => (d ? d.toISOString().slice(0, 10) : '—');

(async () => {
	if (!file)
		throw new Error('Thiếu đường dẫn file Excel. Ví dụ: npm run import:staff -- "D:/ds.xlsx"');
	const pool = await getPool();

	const depts = (await pool.request().query('SELECT id, code, name FROM departments')).recordset;
	const byCode = new Map(depts.map((d) => [d.code, d]));
	const byKey = new Map(depts.map((d) => [normDept(d.name), d]));
	const matchDept = (raw) => {
		if (!raw) return null;
		const k = normDept(raw);
		return byKey.get(k) || byCode.get(DEPT_ALIAS[k]) || byCode.get(raw.toUpperCase()) || null;
	};

	const rows = await readRows();
	for (const r of rows) {
		r.dept = matchDept(r.deptRaw);
		r.qual_id = matchQual(r.qualRaw);
	}

	const invalid = rows.filter((r) => !r.full_name || r.mnv == null);
	const valid = rows.filter((r) => r.full_name && r.mnv != null);
	const dupInFile = countBy(valid, (r) => r.mnv)
		.filter(([, n]) => n > 1)
		.map(([mnv]) => mnv);
	const usable = valid.filter((r) => !dupInFile.includes(r.mnv));

	const existing = new Map();
	if (usable.length) {
		const res = await pool
			.request()
			.input('mnvs', sql.NVarChar(sql.MAX), usable.map((r) => r.mnv).join(',')).query(`
				SELECT id, staff_number, full_name, department_id, date_of_birth, qualification_id
				FROM users
				WHERE staff_number IN (SELECT TRY_CAST(value AS INT) FROM STRING_SPLIT(@mnvs, ','))
			`);
		for (const u of res.recordset) existing.set(u.staff_number, u);
	}
	const toCreate = usable.filter((r) => !existing.has(r.mnv));
	const toFill = [];
	const conflicts = [];
	for (const r of usable.filter((x) => existing.has(x.mnv))) {
		const u = existing.get(r.mnv);
		(norm(u.full_name) === norm(r.full_name) ? toFill : conflicts).push({ r, u });
	}

	console.log(
		`${rows.length} dòng: tạo mới ${toCreate.length} | đã có (bổ sung ô trống) ${toFill.length} | ` +
			`trùng MNV khác tên ${conflicts.length} | lỗi dữ liệu ${invalid.length} | MNV lặp trong file ${dupInFile.length}`,
	);
	const noDept = countBy(
		usable.filter((r) => !r.dept),
		(r) => r.deptRaw || '(trống)',
	);
	if (noDept.length) {
		console.log('Khoa/phòng không khớp (sẽ để trống — thêm vào DEPT_ALIAS nếu cần):');
		for (const [k, n] of noDept) console.log(`  ${n} × ${k}`);
	}
	const noQual = countBy(
		usable.filter((r) => r.qualRaw && !r.qual_id),
		(r) => r.qualRaw,
	);
	if (noQual.length)
		console.log(
			`Văn bằng không xếp được trình độ (để trống): ${noQual.map(([k, n]) => `${k} (${n})`).join(', ')}`,
		);
	const noDob = usable.filter((r) => !r.dob);
	if (noDob.length)
		console.log(`Ngày sinh không đọc được ở dòng: ${noDob.map((r) => r.line).join(', ')}`);
	for (const r of invalid)
		console.log(`  BỎ QUA dòng ${r.line}: thiếu họ tên hoặc MNV không hợp lệ ("${r.mnvText}")`);
	for (const mnv of dupInFile) console.log(`  BỎ QUA MNV ${mnv}: xuất hiện nhiều lần trong file`);
	for (const { r, u } of conflicts)
		console.log(
			`  BỎ QUA MNV ${r.mnv}: file "${r.full_name}" nhưng hệ thống là "${u.full_name}" (${u.id})`,
		);
	if (verbose)
		for (const r of usable)
			console.log(
				`  ${r.line}\t${r.mnv}\t${r.full_name}\t${r.deptRaw} → ${r.dept?.name ?? '—'}\t${r.qualRaw} → ${r.qual_id ?? '—'}\t${ymd(r.dob)}`,
			);

	if (!apply) {
		if (toCreate.length || toFill.length) console.log('\nChạy lại với --apply để thực hiện.');
		process.exit(0);
	}

	// require muộn: các service nạp redis/event bus, không cần khi chỉ xem trước
	const { createStaffAccount } = require('../src/services/userService');
	const personService = require('../src/services/personService');
	const adminRoleId = await requireRoleId(ROLE.ADMIN);
	const actorId = (
		await pool
			.request()
			.input('role', sql.VarChar(20), adminRoleId)
			.query('SELECT TOP 1 id FROM users WHERE role_id = @role AND is_active = 1 ORDER BY id')
	).recordset[0]?.id;
	if (!actorId) throw new Error('Không tìm thấy tài khoản quản trị để ghi người thực hiện');

	const created = [];
	const failed = [];
	for (const r of toCreate) {
		try {
			const acc = await createStaffAccount(
				{
					full_name: r.full_name,
					staff_number: r.mnv,
					department_id: r.dept?.id || null,
					department_code: r.dept?.code || '',
				},
				actorId,
			);
			await pool
				.request()
				.input('id', sql.VarChar(20), acc.id)
				.input('dob', sql.Date, r.dob)
				.input('qual', sql.VarChar(20), r.qual_id)
				.input('actor_id', sql.VarChar(20), actorId).query(`
					EXEC sp_set_actor @actor_id;
					UPDATE users SET date_of_birth = @dob, qualification_id = @qual, updated_at = GETDATE(), updated_by = @actor_id
					WHERE id = @id
				`);
			created.push({ ...r, ...acc });
		} catch (err) {
			failed.push({ r, err: err.message });
		}
	}

	let filled = 0;
	for (const { r, u } of toFill) {
		const res = await pool
			.request()
			.input('id', sql.VarChar(20), u.id)
			.input('dept', sql.VarChar(20), r.dept?.id || null)
			.input('dob', sql.Date, r.dob)
			.input('qual', sql.VarChar(20), r.qual_id)
			.input('actor_id', sql.VarChar(20), actorId).query(`
				EXEC sp_set_actor @actor_id;
				UPDATE users
				SET department_id = ISNULL(department_id, @dept),
				    date_of_birth = ISNULL(date_of_birth, @dob),
				    qualification_id = ISNULL(qualification_id, @qual),
				    updated_at = GETDATE(), updated_by = @actor_id
				WHERE id = @id
				  AND ((department_id IS NULL AND @dept IS NOT NULL)
				    OR (date_of_birth IS NULL AND @dob IS NOT NULL)
				    OR (qualification_id IS NULL AND @qual IS NOT NULL))
			`);
		filled += res.rowsAffected.at(-1) || 0;
	}

	// createStaffAccount đã gắn persons trước khi có ngày sinh → đồng bộ lại cho đủ thông tin
	await personService.syncPersons(
		'users',
		[...created.map((c) => c.id), ...toFill.map((x) => x.u.id)],
		{ actorId },
	);

	console.log(
		`\nĐã tạo ${created.length} tài khoản, bổ sung ${filled} người, lỗi ${failed.length}.`,
	);
	for (const f of failed)
		console.log(`  LỖI dòng ${f.r.line} (MNV ${f.r.mnv}, ${f.r.full_name}): ${f.err}`);

	if (created.length) {
		const out = new ExcelJS.Workbook();
		const ws = out.addWorksheet('Tài khoản mới');
		ws.columns = [
			{ header: 'MNV', key: 'mnv', width: 8 },
			{ header: 'Họ và tên', key: 'full_name', width: 28 },
			{ header: 'Khoa/Phòng', key: 'dept', width: 34 },
			{ header: 'Mã người dùng', key: 'id', width: 14 },
			{ header: 'Tên đăng nhập (mật khẩu ban đầu = tên đăng nhập)', key: 'username', width: 44 },
		];
		ws.getRow(1).font = { bold: true };
		for (const c of created)
			ws.addRow({
				mnv: c.mnv,
				full_name: c.full_name,
				dept: c.dept?.name || c.deptRaw,
				id: c.id,
				username: c.username,
			});
		await out.xlsx.writeFile(outPath);
		console.log(`Danh sách tài khoản mới: ${path.resolve(outPath)}`);
	}
	process.exit(failed.length ? 1 : 0);
})().catch((err) => {
	console.error(`❌ ${err.message}`);
	process.exit(1);
});
