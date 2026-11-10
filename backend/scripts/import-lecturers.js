#!/usr/bin/env node
// Nhập danh sách giảng viên từ Excel (file tổng hợp "Danh sách giảng viên các khoa").
// Cột nhận theo tiêu đề dòng 1 của trang đầu: Khoa/Đơn vị, Họ và tên, Trình độ chuyên môn,
// Phân loại (tùy chọn — chỉ lấy "Giảng viên" / "Giảng viên phụ", bỏ trợ giảng & ban biên soạn).
// Mỗi dòng được khớp với nhân sự (users) theo họ tên, ưu tiên người cùng khoa:
//   - khớp đúng 1 người → giảng viên nội viện gắn tài khoản (điện thoại / email / ngày sinh /
//     giới tính lấy từ users, như "Thêm giảng viên từ nhân sự");
//   - không khớp hoặc trùng tên nhiều người → vẫn tạo giảng viên nội viện, chưa gắn tài khoản
//     (gắn sau ở màn Giảng viên), in ra để kiểm tra.
// Cùng một người có tên ở nhiều khoa → 1 giảng viên, Chuyên môn = các khoa nối bằng dấu phẩy.
// Giảng viên đã có (cùng tài khoản, hoặc cùng họ tên) chỉ được bổ sung ô còn trống
// (tài khoản, chuyên môn, học vị) — không ghi đè dữ liệu đã nhập tay.
// Mặc định CHỈ XEM TRƯỚC; thêm --apply để ghi DB.
//   npm run import:lecturers -- "D:/ds-giang-vien.xlsx"             # xem trước
//   npm run import:lecturers -- "D:/ds-giang-vien.xlsx" --verbose   # xem trước từng người
//   npm run import:lecturers -- "D:/ds-giang-vien.xlsx" --apply     # thực hiện
//   npm run import:lecturers -- "D:/ds-giang-vien.xlsx" --sql=gv.sql  # xuất file SQL, không ghi DB
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });

const ExcelJS = require('exceljs');
const { getPool, sql } = require('../src/config/db');
const { norm, normDept } = require('../src/utils/vietnameseText');
const { ROLE, roleIdOf, requireRoleId } = require('../src/modules/access/roleCodes');

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const verbose = args.includes('--verbose');
// --sql=<đường dẫn>: không ghi DB, xuất file .sql (chạy bằng psql ở môi trường khác)
const sqlOut = args.find((a) => a.startsWith('--sql='))?.slice(6);
const file = args.find((a) => !a.startsWith('--'));

// Tên khoa trong file (sau normDept) → departments.code, khi tên không khớp trực tiếp.
// Nhiều mã: nhân sự ở khoa nào trong danh sách cũng tính là "cùng khoa".
const DEPT_ALIAS = {
	'co xuong khop': ['CLS43'],
	'hoi suc noi': ['CLS30', 'TTHS'],
	'hoi suc ngoai hstc nk': ['CLS32'],
	'huyet hoc xet nghiem': ['CLS6'],
	'huyet hoc lam sang': ['CLS39'],
	'noi tiet': ['CLS37'],
	'x quang': ['CLS2'],
};

const KEEP_KINDS = new Set(['giang vien', 'giang vien phu']);

const COLUMNS = [
	[
		'department',
		(h) => h === 'khoa don vi' || h === 'khoa' || h === 'khoa phong' || h === 'don vi',
	],
	['full_name', (h) => h === 'ho va ten' || h === 'ho ten'],
	['degree', (h) => h.startsWith('trinh do') || h.startsWith('hoc ham')],
	['kind', (h) => h === 'phan loai'],
];

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
	const missing = ['department', 'full_name'].filter((k) => !colOf[k]);
	if (missing.length)
		throw new Error(`Không thấy cột: ${missing.join(', ')} (dòng tiêu đề phải ở dòng 1)`);

	const rows = [];
	let skippedKind = 0;
	ws.eachRow((r, line) => {
		if (line === 1) return;
		const get = (k) => (colOf[k] ? cellText(r.getCell(colOf[k]).value) : '');
		const full_name = get('full_name');
		if (!full_name) return;
		if (colOf.kind && !KEEP_KINDS.has(norm(get('kind')))) {
			skippedKind++;
			return;
		}
		rows.push({
			line,
			full_name,
			deptRaw: get('department'),
			// "Ths.BsCK2; BSCKII" (nhiều file) → lấy giá trị đầu
			degree: get('degree').split(';')[0].trim().slice(0, 50) || null,
		});
	});
	return { rows, skippedKind };
};

// File Excel đối chiếu đi kèm file SQL: mỗi giảng viên khớp với MNV / tài khoản nào
// (theo DB đang chạy script — file SQL tự khớp lại trên DB nơi nó được chạy).
const writeReview = async (outPath, people, depts) => {
	const deptName = new Map(depts.map((d) => [d.id, d.name]));
	const wb = new ExcelJS.Workbook();
	const ws = wb.addWorksheet('Đối chiếu');
	ws.columns = [
		{ header: 'STT', key: 'stt', width: 6 },
		{ header: 'Họ và tên (file)', key: 'name', width: 26 },
		{ header: 'Khoa (file)', key: 'khoa', width: 34 },
		{ header: 'Trình độ', key: 'degree', width: 16 },
		{ header: 'MNV', key: 'mnv', width: 8 },
		{ header: 'Mã tài khoản', key: 'uid', width: 14 },
		{ header: 'Họ tên trong tài khoản', key: 'uname', width: 26 },
		{ header: 'Khoa của tài khoản', key: 'udept', width: 30 },
		{ header: 'Kết quả khớp', key: 'match', width: 40 },
		{ header: 'Trạng thái', key: 'status', width: 12 },
	];
	people.forEach((p, i) =>
		ws.addRow({
			stt: i + 1,
			name: p.full_name,
			khoa: p.khoa.join(', '),
			degree: p.degree,
			mnv: p.user?.staff_number ?? null,
			uid: p.user?.id ?? null,
			uname: p.user?.full_name ?? null,
			udept: p.user ? deptName.get(p.user.department_id) || '(chưa có khoa)' : null,
			match: [...new Set(p.rows.map((r) => r.match))].join('; '),
			status: p.existing ? 'Đã có' : 'Tạo mới',
		}),
	);
	ws.getRow(1).font = { bold: true };
	ws.views = [{ state: 'frozen', ySplit: 1 }];
	ws.autoFilter = { from: 'A1', to: 'J1' };
	await wb.xlsx.writeFile(outPath);
	console.log(`File đối chiếu MNV: ${path.resolve(outPath)}`);
};

// File .sql (PostgreSQL) chỉ chứa dữ liệu trong file Excel (họ tên, khoa, trình độ).
// Việc khớp nhân sự làm NGAY TRONG DB nơi chạy file, cùng quy tắc với script này:
// họ tên so không dấu (unaccent), ưu tiên người cùng khoa, trùng tên nhiều người thì
// không gắn; gộp người có tên ở nhiều khoa khi khớp cùng 1 tài khoản. Giảng viên đã có
// (cùng tài khoản / cùng họ tên) không tạo lại, chỉ bổ sung ô trống ⇒ chạy lại không trùng.
// Bảng persons không ghi ở đây — job đêm (personLinkJob) gắn nốt person_id còn trống.
const writeSql = (outPath, rows) => {
	const fs = require('fs');
	const q = (v) => (v == null || v === '' ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
	const arr = (codes) => (codes?.length ? `ARRAY[${codes.map(q).join(', ')}]` : 'NULL');
	const values = rows
		.map(
			(r, i) =>
				`  (${i + 1}, ${q(r.full_name)}, ${q(r.deptRaw)}, ${arr(DEPT_ALIAS[normDept(r.deptRaw)])}, ${q(r.degree)})`,
		)
		.join(',\n');
	const sqlText = `-- Nhập giảng viên từ: ${path.basename(file)} (${rows.length} dòng)
-- Sinh lúc ${new Date().toISOString()} bởi backend/scripts/import-lecturers.js
-- Khớp nhân sự (users) theo họ tên + khoa NGAY TRONG DB đang chạy; chạy lại không tạo trùng.
-- Chạy: psql -v ON_ERROR_STOP=1 -d <db> -f <file này>
BEGIN;

-- Người thực hiện (nhật ký thay đổi) = tài khoản quản trị đang hoạt động đầu tiên
SELECT set_config('app.current_user_id', coalesce((
  SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
  WHERE r.code IN ('admin', 'superadmin') AND u.is_active
  ORDER BY (r.code = 'admin') DESC, u.id LIMIT 1), ''), true);

-- "Nguyễn Đức  Thuỷ" → "nguyen duc thuy" (như utils/vietnameseText.norm)
CREATE FUNCTION pg_temp.gv_norm(t text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT trim(regexp_replace(lower(unaccent(normalize(coalesce(t, ''), NFC))), '[^a-z0-9]+', ' ', 'g'))
$$;
-- "Khoa Hóa Sinh" → "hoa sinh" (như normDept)
CREATE FUNCTION pg_temp.gv_dept_key(t text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT regexp_replace(pg_temp.gv_norm(t), '^(khoa|phong|trung tam|tt|don vi|vp khoa|bo mon) +', '')
$$;

-- 1) Dữ liệu từ file Excel. alias_codes: mã khoa dùng khi tên khoa không khớp danh mục.
CREATE TEMP TABLE _gv_src (row_no int, full_name varchar(150), khoa varchar(255), alias_codes text[], degree varchar(50)) ON COMMIT DROP;
INSERT INTO _gv_src (row_no, full_name, khoa, alias_codes, degree) VALUES
${values};

-- 2) Khoa của từng dòng: khớp tên khoa, không có thì theo alias_codes
CREATE TEMP TABLE _gv_dept ON COMMIT DROP AS
SELECT s.row_no, d.id AS dept_id, d.name
FROM _gv_src s
JOIN departments d ON pg_temp.gv_dept_key(d.name) = pg_temp.gv_dept_key(s.khoa)
UNION
SELECT s.row_no, d.id, d.name
FROM _gv_src s
JOIN departments d ON d.code = ANY (s.alias_codes)
WHERE NOT EXISTS (SELECT 1 FROM departments d2 WHERE pg_temp.gv_dept_key(d2.name) = pg_temp.gv_dept_key(s.khoa));

-- 3) Nhân sự (bỏ tài khoản học viên), khóa so khớp họ tên tính 1 lần
CREATE TEMP TABLE _gv_users ON COMMIT DROP AS
SELECT u.id, u.department_id, u.is_active, pg_temp.gv_norm(u.full_name) AS name_key
FROM users u LEFT JOIN roles r ON r.id = u.role_id
WHERE r.code IS DISTINCT FROM 'trainee';

-- 4) Khớp từng dòng: đúng 1 người cùng khoa → gắn; nhiều người cùng khoa → không gắn;
--    không ai cùng khoa mà cả viện chỉ 1 người trùng tên → gắn (đánh dấu "khác khoa").
--    Nhiều ứng viên thì chỉ xét người còn hoạt động.
CREATE TEMP TABLE _gv_match ON COMMIT DROP AS
WITH c AS (
  SELECT s.row_no, u.id, u.is_active,
         EXISTS (SELECT 1 FROM _gv_dept gd WHERE gd.row_no = s.row_no AND gd.dept_id = u.department_id) AS in_dept
  FROM _gv_src s JOIN _gv_users u ON u.name_key = pg_temp.gv_norm(s.full_name)
), agg AS (
  SELECT s.row_no,
         count(c.id) FILTER (WHERE c.in_dept) AS n_in,
         count(c.id) FILTER (WHERE c.in_dept AND c.is_active) AS n_in_act,
         count(c.id) AS n_all,
         count(c.id) FILTER (WHERE c.is_active) AS n_all_act
  FROM _gv_src s LEFT JOIN c ON c.row_no = s.row_no
  GROUP BY s.row_no
), e AS (
  SELECT row_no, n_in, n_all,
         CASE WHEN n_in > 1 THEN n_in_act ELSE n_in END AS e_in,
         CASE WHEN n_all > 1 THEN n_all_act ELSE n_all END AS e_all
  FROM agg
)
SELECT e.row_no,
       CASE
         WHEN e.e_in = 1 THEN (SELECT c.id FROM c WHERE c.row_no = e.row_no AND c.in_dept AND (e.n_in = 1 OR c.is_active))
         WHEN e.e_in = 0 AND e.e_all = 1 THEN (SELECT c.id FROM c WHERE c.row_no = e.row_no AND (e.n_all = 1 OR c.is_active))
       END AS user_id,
       CASE
         WHEN e.e_in = 1 THEN 'cùng khoa'
         WHEN e.e_in > 1 THEN 'trùng tên ' || e.e_in || ' người cùng khoa'
         WHEN e.e_all = 1 THEN 'khác khoa'
         WHEN e.n_all > 1 THEN 'trùng tên ' || e.n_all || ' người, không ai cùng khoa'
         ELSE 'không có trong nhân sự'
       END AS match
FROM e;

-- 5) Gộp theo người: cùng tài khoản; chưa gắn tài khoản thì cùng tên + cùng khoa
CREATE TEMP TABLE _gv_person ON COMMIT DROP AS
WITH r AS (
  SELECT s.row_no, s.full_name, s.degree, m.user_id, m.match,
         coalesce((SELECT min(gd.name) FROM _gv_dept gd WHERE gd.row_no = s.row_no HAVING count(*) = 1), s.khoa) AS khoa_name,
         CASE WHEN m.user_id IS NOT NULL THEN 'u:' || m.user_id
              ELSE 'n:' || pg_temp.gv_norm(s.full_name) || '|' || pg_temp.gv_dept_key(s.khoa) END AS pkey
  FROM _gv_src s JOIN _gv_match m USING (row_no)
), k AS (
  SELECT pkey, khoa_name, min(row_no) AS f FROM r GROUP BY pkey, khoa_name
)
SELECT r.pkey,
       min(r.row_no) AS first_row,
       (array_agg(r.full_name ORDER BY r.row_no))[1] AS full_name,
       (array_agg(r.degree ORDER BY r.row_no) FILTER (WHERE r.degree IS NOT NULL))[1] AS degree,
       max(r.user_id) AS user_id,
       left((SELECT string_agg(k.khoa_name, ', ' ORDER BY k.f) FROM k WHERE k.pkey = r.pkey), 150) AS specialty,
       string_agg(DISTINCT r.match, '; ') AS match,
       'GV' || upper(left(replace(gen_random_uuid()::text, '-', ''), 18)) AS new_id,
       CAST(NULL AS varchar(20)) AS existing_id,
       false AS exists_any
FROM r GROUP BY r.pkey;

-- 6) Giảng viên đã có: cùng tài khoản, hoặc cùng họ tên (chưa gắn / cùng tài khoản)
UPDATE _gv_person p SET
  exists_any = EXISTS (
    SELECT 1 FROM lecturers l
    WHERE (p.user_id IS NOT NULL AND l.user_id = p.user_id)
       OR (pg_temp.gv_norm(l.full_name) = pg_temp.gv_norm(p.full_name) AND (l.user_id IS NULL OR l.user_id = p.user_id))),
  existing_id = coalesce(
    (SELECT min(l.id) FROM lecturers l WHERE p.user_id IS NOT NULL AND l.user_id = p.user_id),
    (SELECT min(l.id) FROM lecturers l
     WHERE pg_temp.gv_norm(l.full_name) = pg_temp.gv_norm(p.full_name) AND (l.user_id IS NULL OR l.user_id = p.user_id)
     HAVING count(*) = 1));

-- 7) Đã có (khớp đúng 1 giảng viên) → chỉ bổ sung ô còn trống
UPDATE lecturers l SET
  user_id = coalesce(l.user_id, CASE WHEN NOT EXISTS (SELECT 1 FROM lecturers x WHERE x.user_id = p.user_id) THEN p.user_id END),
  specialty = coalesce(l.specialty, p.specialty),
  academic_degree = coalesce(l.academic_degree, p.degree),
  updated_at = LOCALTIMESTAMP,
  updated_by = nullif(current_setting('app.current_user_id'), '')
FROM _gv_person p
WHERE l.id = p.existing_id
  AND ((l.user_id IS NULL AND p.user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lecturers x WHERE x.user_id = p.user_id))
    OR (l.specialty IS NULL AND p.specialty IS NOT NULL)
    OR (l.academic_degree IS NULL AND p.degree IS NOT NULL));

-- 8) Tạo mới — điện thoại / email / ngày sinh / giới tính lấy từ tài khoản
INSERT INTO lecturers (id, user_id, full_name, specialty, is_external, phone, email, academic_degree, dob, gender, created_by)
SELECT p.new_id, p.user_id, p.full_name, p.specialty, false, u.phone_number,
       CASE WHEN u.email NOT ILIKE '%.local' AND length(u.email) <= 100 THEN u.email END,
       p.degree, u.date_of_birth, u.gender, nullif(current_setting('app.current_user_id'), '')
FROM _gv_person p
LEFT JOIN users u ON u.id = p.user_id
WHERE NOT p.exists_any
ORDER BY p.first_row;

-- 9) Kết quả từng người + tổng hợp
SELECT row_number() OVER (ORDER BY p.first_row) AS stt, p.full_name AS ho_ten, p.specialty AS khoa,
       u.staff_number AS mnv, u.full_name AS ten_tai_khoan, d.name AS khoa_tai_khoan,
       p.match AS ket_qua_khop, CASE WHEN p.exists_any THEN 'Đã có' ELSE 'Tạo mới' END AS trang_thai
FROM _gv_person p
LEFT JOIN users u ON u.id = p.user_id
LEFT JOIN departments d ON d.id = u.department_id
ORDER BY p.first_row;

SELECT count(*) AS so_nguoi,
       count(*) FILTER (WHERE NOT exists_any) AS tao_moi,
       count(*) FILTER (WHERE exists_any) AS da_co,
       count(user_id) AS gan_tai_khoan,
       count(*) FILTER (WHERE match LIKE '%khác khoa%') AS khac_khoa_can_kiem_tra
FROM _gv_person;

COMMIT;
`;
	fs.writeFileSync(outPath, sqlText, 'utf8');
	console.log(`\nĐã xuất ${rows.length} dòng ra ${path.resolve(outPath)} (chưa ghi DB).`);
};

(async () => {
	if (!file)
		throw new Error(
			'Thiếu đường dẫn file Excel. Ví dụ: npm run import:lecturers -- "D:/ds-giang-vien.xlsx"',
		);
	const pool = await getPool();

	const depts = (await pool.request().query('SELECT id, code, name FROM departments')).recordset;
	const byCode = new Map(depts.map((d) => [d.code, d]));
	const byKey = new Map(depts.map((d) => [normDept(d.name), d]));
	const matchDepts = (raw) => {
		const k = normDept(raw);
		if (byKey.has(k)) return [byKey.get(k)];
		return (DEPT_ALIAS[k] || []).map((c) => byCode.get(c)).filter(Boolean);
	};

	const traineeRoleId = await roleIdOf(ROLE.TRAINEE);
	const users = (
		await pool.request().query(`
			SELECT u.id, u.full_name, u.department_id, u.role_id, u.is_active, u.email,
			       u.phone_number, u.date_of_birth, u.gender, u.staff_number
			FROM users u`)
	).recordset.filter((u) => u.role_id !== traineeRoleId);
	const usersByName = new Map();
	for (const u of users) {
		const k = norm(u.full_name);
		if (!usersByName.has(k)) usersByName.set(k, []);
		usersByName.get(k).push(u);
	}

	const lecturers = (
		await pool
			.request()
			.query('SELECT id, user_id, full_name, specialty, academic_degree, is_active FROM lecturers')
	).recordset;
	const lecByUser = new Map(lecturers.filter((l) => l.user_id).map((l) => [l.user_id, l]));
	const lecByName = new Map();
	for (const l of lecturers) {
		const k = norm(l.full_name);
		if (!lecByName.has(k)) lecByName.set(k, []);
		lecByName.get(k).push(l);
	}

	const { rows, skippedKind } = await readRows();

	// 1) Khớp nhân sự cho từng dòng
	for (const r of rows) {
		r.depts = matchDepts(r.deptRaw);
		const deptIds = new Set(r.depts.map((d) => d.id));
		const cands = usersByName.get(norm(r.full_name)) || [];
		const pickActive = (list) => (list.length > 1 ? list.filter((u) => u.is_active) : list);
		const inDept = pickActive(cands.filter((u) => deptIds.has(u.department_id)));
		if (inDept.length === 1) {
			r.user = inDept[0];
			r.match = 'cùng khoa';
		} else if (inDept.length > 1) {
			r.match = `trùng tên ${inDept.length} người cùng khoa`;
		} else if (pickActive(cands).length === 1) {
			r.user = pickActive(cands)[0];
			r.match = 'khác khoa';
		} else if (cands.length > 1) {
			r.match = `trùng tên ${cands.length} người, không ai cùng khoa`;
		} else {
			r.match = 'không có trong nhân sự';
		}
	}

	// 2) Gộp theo người: cùng tài khoản. Chưa gắn tài khoản thì chỉ gộp khi cùng tên + cùng
	// khoa — cùng tên khác khoa có thể là 2 người khác nhau.
	const people = new Map();
	for (const r of rows) {
		const key = r.user ? `u:${r.user.id}` : `n:${norm(r.full_name)}|${normDept(r.deptRaw)}`;
		if (!people.has(key)) people.set(key, { key, user: r.user, rows: [] });
		people.get(key).rows.push(r);
	}
	for (const p of people.values()) {
		const first = p.rows[0];
		p.full_name = first.full_name;
		p.degree = p.rows.map((r) => r.degree).find(Boolean) || null;
		// Tên khoa theo danh mục khi khớp đúng 1 khoa, ngược lại giữ tên trong file
		const khoaNames = [
			...new Set(p.rows.map((r) => (r.depts.length === 1 ? r.depts[0].name : r.deptRaw))),
		];
		p.specialty = khoaNames.join(', ').slice(0, 150);
		p.khoa = khoaNames;
		// Giảng viên đã có trong hệ thống
		p.existing =
			(p.user && lecByUser.get(p.user.id)) ||
			(() => {
				const same = (lecByName.get(norm(p.full_name)) || []).filter(
					(l) => !l.user_id || l.user_id === p.user?.id,
				);
				return same.length === 1 ? same[0] : null;
			})();
	}

	const list = [...people.values()];
	const toCreate = list.filter((p) => !p.existing);
	const toFill = list
		.filter((p) => p.existing)
		.map((p) => {
			const l = p.existing;
			const patch = {};
			if (!l.user_id && p.user && !lecByUser.has(p.user.id)) patch.user_id = p.user.id;
			if (!l.specialty && p.specialty) patch.specialty = p.specialty;
			if (!l.academic_degree && p.degree) patch.academic_degree = p.degree;
			return { p, l, patch };
		});
	const fillable = toFill.filter((x) => Object.keys(x.patch).length);

	console.log(
		`${rows.length} dòng → ${list.length} giảng viên: tạo mới ${toCreate.length} | ` +
			`đã có ${toFill.length} (bổ sung ô trống ${fillable.length}) | ` +
			`gắn được tài khoản ${list.filter((p) => p.user).length}` +
			(skippedKind ? ` | bỏ qua ${skippedKind} dòng trợ giảng/ban biên soạn` : ''),
	);
	const noDept = [...new Set(rows.filter((r) => !r.depts.length).map((r) => r.deptRaw))];
	if (noDept.length)
		console.log(`Khoa không khớp danh mục (chỉ khớp nhân sự theo tên): ${noDept.join(', ')}`);
	const notLinked = list.filter((p) => !p.user);
	if (notLinked.length) {
		console.log(
			`\nChưa gắn được tài khoản (${notLinked.length}) — tạo giảng viên không tài khoản:`,
		);
		for (const p of notLinked)
			console.log(
				`  ${p.full_name} [${p.khoa.join(', ')}]: ${p.rows.map((r) => r.match).join('; ')}`,
			);
	}
	const otherDept = list.filter((p) => p.user && p.rows.every((r) => r.match === 'khác khoa'));
	if (otherDept.length) {
		console.log(
			`\nGắn tài khoản duy nhất cùng tên nhưng khác khoa (${otherDept.length}) — nên kiểm tra:`,
		);
		const deptName = new Map(depts.map((d) => [d.id, d.name]));
		for (const p of otherDept)
			console.log(
				`  ${p.full_name} [file: ${p.khoa.join(', ')}] → ${p.user.id} (MNV ${p.user.staff_number ?? '—'}, ` +
					`${deptName.get(p.user.department_id) || 'chưa có khoa'})`,
			);
	}
	const merged = list.filter((p) => p.rows.length > 1);
	if (merged.length) {
		console.log(`\nGộp thành 1 giảng viên vì cùng tài khoản ở nhiều khoa (${merged.length}):`);
		for (const p of merged) console.log(`  ${p.full_name}: ${p.khoa.join(', ')}`);
	}
	if (verbose) {
		console.log('\nChi tiết:');
		for (const p of list)
			console.log(
				`  ${p.existing ? 'CÓ SẴN ' : 'TẠO MỚI'}\t${p.full_name}\t${p.degree ?? '—'}\t${p.specialty}\t` +
					`${p.user ? `${p.user.id} (MNV ${p.user.staff_number ?? '—'})` : '— chưa gắn tài khoản'}`,
			);
	}

	if (sqlOut) {
		writeSql(sqlOut, rows);
		await writeReview(sqlOut.replace(/\.sql$/i, '') + '-kiem-tra.xlsx', list, depts);
		process.exit(0);
	}
	if (!apply) {
		if (toCreate.length || fillable.length) console.log('\nChạy lại với --apply để thực hiện.');
		process.exit(0);
	}

	// require muộn: service nạp redis/event bus, không cần khi chỉ xem trước
	const lecturerService = require('../src/modules/training/lecturers/lecturerService');
	const adminRoleId = await requireRoleId(ROLE.ADMIN);
	const actorId = (
		await pool
			.request()
			.input('role', sql.VarChar(20), adminRoleId)
			.query(
				"SELECT id FROM users WHERE role_id = @role AND is_active = 'true' ORDER BY id OFFSET 0 ROWS FETCH NEXT 1 ROWS ONLY",
			)
	).recordset[0]?.id;
	if (!actorId) throw new Error('Không tìm thấy tài khoản quản trị để ghi người thực hiện');

	let created = 0;
	let filled = 0;
	const failed = [];
	for (const p of toCreate) {
		const u = p.user;
		// Email giữ chỗ (*.local) của tài khoản tạo tự động không phải email thật
		const email = u?.email && !/\.local$/i.test(u.email) && u.email.length <= 100 ? u.email : null;
		try {
			await lecturerService.create(
				{
					user_id: u?.id || null,
					full_name: p.full_name,
					specialty: p.specialty || null,
					is_external: false,
					phone: u?.phone_number || null,
					email,
					academic_degree: p.degree,
					dob: u?.date_of_birth || null,
					gender: u?.gender || null,
				},
				actorId,
			);
			created++;
		} catch (err) {
			failed.push({ p, err: err.message });
		}
	}
	for (const { p, l, patch } of fillable) {
		try {
			await lecturerService.update(l.id, patch, actorId);
			filled++;
		} catch (err) {
			failed.push({ p, err: err.message });
		}
	}

	console.log(
		`\nĐã tạo ${created} giảng viên, bổ sung ${filled} giảng viên có sẵn, lỗi ${failed.length}.`,
	);
	for (const f of failed) console.log(`  LỖI ${f.p.full_name}: ${f.err}`);
	process.exit(failed.length ? 1 : 0);
})().catch((err) => {
	console.error(`❌ ${err.message}`);
	process.exit(1);
});
