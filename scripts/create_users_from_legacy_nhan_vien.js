#!/usr/bin/env node
/* ============================================================================
 * Tạo mới tài khoản `users` + hồ sơ CCHN (`staff_practice_licenses`) từ
 * dm_nhan_vien (file dump ql_nckh_dt_cdt) — cho 1480 dòng KHÔNG khớp được với
 * user có sẵn (xem staff_license_import_unmatched.csv từ
 * import_legacy_ql_nckh_dt_cdt.js). Người dùng đã xác nhận muốn tạo mới thay
 * vì bỏ qua.
 * ----------------------------------------------------------------------------
 * QUYẾT ĐỊNH THIẾT KẾ:
 *   - role_id mặc định 'VT06' (thanh_vien — quyền thấp nhất, KHÔNG phải admin)
 *     cho toàn bộ tài khoản tạo hàng loạt — an toàn, đúng convention sẵn có
 *     của userService.create() (role_id || 'VT06').
 *   - username = 'nv' + mã NV đã chuẩn hoá (bỏ dấu). 2 dòng có mã không phải
 *     số thuần (ĐHV1, ĐHV3) và 1 cặp trùng mã (1455 x2) được xử lý bằng hậu tố
 *     số nếu đụng độ, kiểm tra đụng độ với username đã có trong DB.
 *   - staff_number = mã NV dạng số nếu parse được, NULL nếu không (users.staff_number
 *     là INT).
 *   - Mật khẩu: sinh ngẫu nhiên 10 ký tự/người, hash bcrypt (cost 10, giống
 *     userService.create()). KHÔNG đặt password_changed_at khi tạo (giữ NULL)
 *     — đúng hành vi hiện có của users mới tạo, dashboard admin đã tự flag
 *     "pwd_warn" cho tài khoản chưa từng đổi mật khẩu.
 *   - Khoa/phòng: khớp dm_nhan_vien.khoa_phong_text với departments.name theo
 *     tên đã chuẩn hoá (bỏ dấu/hoa thường) — departments hiện tại (66 dòng)
 *     dùng tên khoa/phòng thật của cùng bệnh viện nên tỷ lệ khớp cao; không
 *     khớp được thì để NULL (sửa tay sau qua UI).
 *   - Ngay sau khi tạo user, tạo luôn staff_practice_licenses gắn user đó
 *     (không cần bước "match" nữa vì user vừa tạo chính là 1-1 với dòng nhân
 *     viên).
 *
 * AN TOÀN MẬT KHẨU: báo cáo CSV xuất ra chứa MẬT KHẨU DẠNG RÕ (plaintext) để
 * admin phân phối cho từng người — file này PHẢI được xoá / chuyển ra ngoài
 * repo ngay sau khi dùng xong, KHÔNG commit vào git.
 *
 * CHẠY:
 *   node scripts/create_users_from_legacy_nhan_vien.js <file.sql> [--commit]
 *   Mặc định DRY-RUN (không ghi DB). Thêm --commit để ghi thật.
 * ==========================================================================*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SERVER_DIR = path.resolve(__dirname, '..', 'server');
require(path.resolve(SERVER_DIR, 'node_modules/dotenv')).config({ path: path.resolve(SERVER_DIR, '.env') });

const { getPool, sql } = require(path.resolve(SERVER_DIR, 'src/config/db'));
const bcrypt = require(path.resolve(SERVER_DIR, 'node_modules/bcryptjs'));
const { parseMysqlInserts, normalizeName } = require('./lib/mysqlDumpParser');

const args = process.argv.slice(2);
const commit = args.includes('--commit');
const filePath = args.find((a) => !a.startsWith('--'));

if (!filePath) {
	console.error('Cách dùng: node scripts/create_users_from_legacy_nhan_vien.js <file.sql> [--commit]');
	process.exit(1);
}

const PASSWORD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'; // gitleaks:allow (bảng ký tự, không phải secret)
const genPassword = (len = 10) =>
	Array.from(crypto.randomBytes(len))
		.map((b) => PASSWORD_CHARS[b % PASSWORD_CHARS.length])
		.join('');

// 'ĐHV1' -> 'DHV1' (bỏ dấu, an toàn cho username ASCII)
const slugifyCode = (s) =>
	String(s || '')
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/đ/gi, 'd')
		.replace(/[^a-zA-Z0-9]/g, '')
		.toLowerCase();

async function main() {
	const text = fs.readFileSync(filePath, 'utf8');
	console.log(commit ? '=== CHẾ ĐỘ COMMIT — sẽ tạo user + hồ sơ CCHN thật trong DB ===' : '=== DRY-RUN — không ghi gì vào DB ===');

	const pool = await getPool();
	console.log('✅ Connected to SQL Server');

	const rows = parseMysqlInserts(text, 'dm_nhan_vien').filter(
		(r) => Number(r.da_xoa) === 0 && Number(r.trang_thai) === 1,
	);
	console.log(`[dm_nhan_vien] ${rows.length} dòng active sẽ tạo user.`);

	// ─── Chuẩn bị dữ liệu tra cứu: username đã tồn tại, department theo tên ───
	// alreadyImportedUsernames = snapshot TRƯỚC khi chạy vòng này — dùng để
	// nhận diện "dòng này đã được import ở lần chạy trước" (username sinh ra
	// tất định từ ma_nv) và BỎ QUA hẳn, không tạo user trùng khi chạy lại script.
	const existingUsersRes = await pool.request().query('SELECT username, staff_number FROM users');
	const alreadyImportedUsernames = new Set(
		existingUsersRes.recordset.map((u) => String(u.username).toLowerCase()),
	);
	const usedUsernames = new Set(alreadyImportedUsernames);
	const usedStaffNumbers = new Set(
		existingUsersRes.recordset.filter((u) => u.staff_number != null).map((u) => u.staff_number),
	);

	const deptRes = await pool.request().query('SELECT id, name FROM departments');
	// departments.name có tiền tố "Khoa/Phòng/Đơn Vị/Trung Tâm ..." mà
	// dm_nhan_vien.khoa_phong_text thường chỉ ghi tên lõi (vd "Bỏng" khớp
	// "Khoa Bỏng") — so khớp theo 3 mức: nguyên văn -> bỏ tiền tố -> chứa nhau.
	const stripDeptPrefix = (s) => s.replace(/^(khoa|phong|don vi|trung tam)\s+/, '');
	const depts = deptRes.recordset.map((d) => ({
		id: d.id,
		norm: normalizeName(d.name),
		core: stripDeptPrefix(normalizeName(d.name)),
	}));
	const matchDepartment = (khoaPhongText) => {
		const rn = normalizeName(khoaPhongText);
		if (!rn) return null;
		const rCore = stripDeptPrefix(rn);
		return (
			depts.find((d) => d.norm === rn)?.id ||
			depts.find((d) => d.core === rCore)?.id ||
			depts.find((d) => d.norm.includes(rCore) || rCore.includes(d.core))?.id ||
			null
		);
	};

	// ─── Sinh dữ liệu từng user (username duy nhất, tránh đụng ma_nv trùng) ───
	// Chạy lại script (vd sau khi thêm dòng mới vào file cũ, hoặc chạy nhầm lần 2):
	// username 'nv<ma_nv>' sinh TẤT ĐỊNH từ ma_nv — nếu username gốc (chưa hậu
	// tố) đã tồn tại từ TRƯỚC khi vòng lặp này bắt đầu, coi như dòng đã được
	// import ở lần chạy trước ⇒ BỎ QUA hẳn, không tạo thêm user trùng người.
	const plan = [];
	let skippedAlreadyImported = 0;
	for (const r of rows) {
		const base = 'nv' + (slugifyCode(r.ma_nv) || 'x');
		if (alreadyImportedUsernames.has(base)) {
			skippedAlreadyImported++;
			continue;
		}

		let username = base;
		let n = 2;
		while (usedUsernames.has(username)) {
			username = `${base}${n}`;
			n++;
		}
		usedUsernames.add(username);

		let staffNumber = /^\d+$/.test(String(r.ma_nv)) ? Number(r.ma_nv) : null;
		if (staffNumber !== null && usedStaffNumbers.has(staffNumber)) staffNumber = null; // tránh đụng độ, không quan trọng bằng username
		if (staffNumber !== null) usedStaffNumbers.add(staffNumber);

		const departmentId = matchDepartment(r.khoa_phong_text);
		const password = genPassword();

		plan.push({ legacy: r, username, staffNumber, departmentId, password });
	}

	if (skippedAlreadyImported) {
		console.log(`[dm_nhan_vien] Bỏ qua ${skippedAlreadyImported} dòng đã import ở lần chạy trước (username đã tồn tại).`);
	}
	const matchedDept = plan.filter((p) => p.departmentId).length;
	console.log(`[departments] Khớp được khoa/phòng: ${matchedDept}/${plan.length} (còn lại NULL, sửa tay sau).`);

	if (!commit) {
		console.log('\nMẫu 3 dòng đầu (không ghi DB):');
		console.log(
			plan.slice(0, 3).map((p) => ({
				username: p.username,
				full_name: p.legacy.ho_ten,
				staff_number: p.staffNumber,
				department_id: p.departmentId,
			})),
		);
		console.log('\nDry-run xong. Chạy lại kèm --commit để tạo thật.');
		process.exit(0);
	}

	// ─── Ghi thật: users rồi staff_practice_licenses, batch tuần tự (đơn giản,
	// ưu tiên đúng hơn nhanh — 1480 dòng, bcrypt cost 10 ~vài phút là chấp nhận được).
	const csvRows = ['username,temp_password,full_name,ma_nv,department_id,department_matched'];
	let createdUsers = 0;
	let createdLicenses = 0;

	for (const p of plan) {
		const r = p.legacy;
		const hashed = await bcrypt.hash(p.password, 10);
		const userId = 'NV' + crypto.randomBytes(4).toString('hex').toUpperCase();

		await pool
			.request()
			.input('id', sql.VarChar(20), userId)
			.input('username', sql.VarChar(50), p.username)
			.input('password', sql.VarChar(255), hashed)
			.input('staff_number', sql.Int, p.staffNumber)
			.input('full_name', sql.NVarChar(200), r.ho_ten)
			.input('department_id', sql.VarChar(20), p.departmentId)
			.query(`
        INSERT INTO users (id, username, password, staff_number, full_name, department_id, role_id, created_by)
        VALUES (@id, @username, @password, @staff_number, @full_name, @department_id, 'VT06', 'IMPORT-LEGACY');
      `);
		createdUsers++;

		await pool
			.request()
			.input('id', sql.VarChar(20), 'LIC' + crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 17))
			.input('user_id', sql.VarChar(20), userId)
			.input('license_no', sql.VarChar(50), r.so_cchn || null)
			.input('issued_date', sql.Date, r.ngay_cap_cchn || null)
			.input('practice_scope', sql.NVarChar(500), r.pham_vi_hanh_nghe || null)
			.input('primary_specialty', sql.NVarChar(255), r.chuyen_khoa || null)
			.input('cme_specialty', sql.NVarChar(300), r.chuyen_khoa_cap_nhat || null)
			.input('qualification', sql.NVarChar(150), r.trinh_do || null)
			.input('title', sql.NVarChar(150), r.chuc_danh || null)
			.query(`
        INSERT INTO staff_practice_licenses (
          id, user_id, license_no, issued_date, practice_scope, primary_specialty, cme_specialty, qualification, title, created_by
        )
        VALUES (
          @id, @user_id, @license_no, @issued_date, @practice_scope, @primary_specialty, @cme_specialty, @qualification, @title, 'IMPORT-LEGACY'
        );
      `);
		createdLicenses++;

		csvRows.push(
			[p.username, p.password, r.ho_ten, r.ma_nv, p.departmentId || '', p.departmentId ? '1' : '0']
				.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
				.join(','),
		);

		if (createdUsers % 200 === 0) console.log(`... đã tạo ${createdUsers}/${plan.length}`);
	}

	const csvPath = path.resolve(__dirname, '..', 'legacy_users_created_CHUA_MAT_KHAU.csv');
	fs.writeFileSync(csvPath, csvRows.join('\n'), 'utf8');

	console.log(`\n✅ Đã tạo ${createdUsers} users + ${createdLicenses} hồ sơ CCHN.`);
	console.log(`⚠️  Mật khẩu tạm (PLAINTEXT) đã ghi ra: ${csvPath}`);
	console.log('⚠️  File này KHÔNG được commit vào git — xoá hoặc chuyển ra ngoài repo ngay sau khi phân phối mật khẩu cho từng người.');
	process.exit(0);
}

main().catch((err) => {
	console.error('❌ Lỗi:', err);
	process.exit(1);
});
