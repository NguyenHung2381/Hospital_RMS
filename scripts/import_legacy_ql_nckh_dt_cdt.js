#!/usr/bin/env node
/* ============================================================================
 * Nhập dữ liệu thật từ file dump hệ thống cũ `ql_nckh_dt_cdt` (PHP/MariaDB)
 * ----------------------------------------------------------------------------
 * BỐI CẢNH — xem plan 2026-09-14 "Bổ sung DB từ hệ thống cũ":
 *   - dm_giang_vien -> lecturers : AN TOÀN, lecturers vốn hỗ trợ giảng viên
 *     ngoài viện không tài khoản (is_external/user_id NULL) -> import thẳng
 *     làm dòng MỚI, không đụng dữ liệu users hiện có.
 *   - dm_hoc_vien   -> trainees  : tương tự, an toàn.
 *   - dm_nhan_vien  -> staff_practice_licenses : RỦI RO — cần user_id, mà
 *     không có khoá chung đáng tin cậy giữa dm_nhan_vien (file cũ) và users
 *     (dữ liệu sống hiện tại). Script CHỈ khớp theo full_name đã chuẩn hoá
 *     (bỏ dấu, hoa/thường, khoảng trắng thừa). Dòng khớp ĐÚNG 1 user thì import,
 *     khớp 0 hoặc >1 user thì BỎ QUA và ghi vào báo cáo CSV để admin tự liên
 *     kết tay qua UI — không đoán bừa để tránh gắn nhầm hồ sơ hành nghề.
 *
 * CHẠY:
 *   node scripts/import_legacy_ql_nckh_dt_cdt.js <đường_dẫn_file.sql> [--commit]
 *   Mặc định (không có --commit) chỉ DRY-RUN: in thống kê + ghi báo cáo CSV,
 *   KHÔNG ghi gì vào DB. Chỉ thêm --commit sau khi đã xem báo cáo dry-run.
 * ==========================================================================*/
const fs = require('fs');
const path = require('path');

const SERVER_DIR = path.resolve(__dirname, '..', 'server');
// dotenv/mssql chỉ có trong server/node_modules (không phải monorepo có root
// node_modules hoisted) — require theo đường dẫn tuyệt đối thay vì tên gói trần.
require(path.resolve(SERVER_DIR, 'node_modules/dotenv')).config({ path: path.resolve(SERVER_DIR, '.env') });

const { getPool, sql } = require(path.resolve(SERVER_DIR, 'src/config/db'));
const { parseMysqlInserts, normalizeName, mapGender } = require('./lib/mysqlDumpParser');

const args = process.argv.slice(2);
const commit = args.includes('--commit');
const filePath = args.find((a) => !a.startsWith('--'));

if (!filePath) {
	console.error('Cách dùng: node scripts/import_legacy_ql_nckh_dt_cdt.js <file.sql> [--commit]');
	process.exit(1);
}

async function importLecturers(text, pool) {
	const rows = parseMysqlInserts(text, 'dm_giang_vien').filter((r) => Number(r.da_xoa) === 0);
	console.log(`\n[dm_giang_vien] ${rows.length} dòng hợp lệ (bỏ qua da_xoa=1).`);
	if (!commit) return rows.length;

	let inserted = 0;
	for (const r of rows) {
		await pool
			.request()
			.input('id', sql.VarChar(20), 'GV' + Buffer.from(String(r.id) + r.ma_gv).toString('hex').slice(0, 18).toUpperCase())
			.input('full_name', sql.NVarChar(150), r.ho_ten)
			.input('specialty', sql.NVarChar(150), r.chuyen_mon || null)
			.input('is_external', sql.Bit, Number(r.loai_gv) !== 1)
			.input('phone', sql.VarChar(30), r.dien_thoai || null)
			.input('email', sql.VarChar(150), r.email || null)
			.input('academic_degree', sql.NVarChar(50), r.hoc_vi || null)
			.input('academic_rank', sql.NVarChar(50), r.hoc_ham || null)
			.input('dob', sql.Date, r.ngay_sinh || null)
			.input('gender', sql.VarChar(10), mapGender(r.gioi_tinh))
			.input('is_active', sql.Bit, Number(r.trang_thai) === 1)
			.query(`
        IF EXISTS (SELECT 1 FROM lecturers WHERE id = @id)
          UPDATE lecturers SET full_name=@full_name, specialty=@specialty, is_external=@is_external,
            phone=@phone, email=@email, academic_degree=@academic_degree, academic_rank=@academic_rank,
            dob=@dob, gender=@gender, is_active=@is_active, updated_at=GETDATE(), updated_by='IMPORT-LEGACY'
          WHERE id = @id;
        ELSE
          INSERT INTO lecturers (id, full_name, specialty, is_external, phone, email, academic_degree, academic_rank, dob, gender, is_active, created_by)
          VALUES (@id, @full_name, @specialty, @is_external, @phone, @email, @academic_degree, @academic_rank, @dob, @gender, @is_active, 'IMPORT-LEGACY');
      `);
		inserted++;
	}
	console.log(`[dm_giang_vien] Đã ghi ${inserted} dòng vào lecturers.`);
	return inserted;
}

async function importTrainees(text, pool) {
	const rows = parseMysqlInserts(text, 'dm_hoc_vien').filter((r) => Number(r.da_xoa) === 0);
	console.log(`\n[dm_hoc_vien] ${rows.length} dòng hợp lệ (bỏ qua da_xoa=1).`);
	if (!commit) return rows.length;

	let inserted = 0;
	for (const r of rows) {
		await pool
			.request()
			.input('id', sql.VarChar(20), 'HV' + Buffer.from(String(r.id) + r.ma_hv).toString('hex').slice(0, 18).toUpperCase())
			.input('full_name', sql.NVarChar(150), r.ho_ten)
			.input('dob', sql.Date, r.ngay_sinh || null)
			.input('gender', sql.VarChar(10), mapGender(r.gioi_tinh))
			.input('national_id', sql.VarChar(20), r.cccd || null)
			.input('phone', sql.VarChar(20), r.dien_thoai || null)
			.input('email', sql.VarChar(100), r.email || null)
			.input('address', sql.NVarChar(255), r.dia_chi || null)
			.input('national_id_issued_date', sql.Date, r.cccd_ngay_cap || null)
			.input('national_id_issued_place', sql.NVarChar(200), r.cccd_noi_cap || null)
			.input('graduated_school', sql.NVarChar(200), r.truong_dao_tao || null)
			.input('graduated_year', sql.SmallInt, r.nam_tot_nghiep || null)
			.input('workplace', sql.NVarChar(200), r.don_vi_cong_tac || null)
			.input('position', sql.NVarChar(100), r.chuc_vu || null)
			.input('qualification', sql.NVarChar(150), r.trinh_do_chuyen_mon || null)
			.input('notes', sql.NVarChar(sql.MAX), r.ghi_chu || null)
			.input('is_active', sql.Bit, Number(r.trang_thai) === 1)
			.query(`
        IF EXISTS (SELECT 1 FROM trainees WHERE id = @id)
          UPDATE trainees SET full_name=@full_name, dob=@dob, gender=@gender, national_id=@national_id,
            phone=@phone, email=@email, address=@address,
            national_id_issued_date=@national_id_issued_date, national_id_issued_place=@national_id_issued_place,
            graduated_school=@graduated_school, graduated_year=@graduated_year, workplace=@workplace, position=@position,
            qualification=@qualification, notes=@notes, is_active=@is_active,
            updated_at=GETDATE(), updated_by='IMPORT-LEGACY'
          WHERE id = @id;
        ELSE
          INSERT INTO trainees (
            id, full_name, dob, gender, national_id, phone, email, address,
            national_id_issued_date, national_id_issued_place, graduated_school, graduated_year, workplace, position,
            qualification, notes, is_active,
            created_by
          )
          VALUES (
            @id, @full_name, @dob, @gender, @national_id, @phone, @email, @address,
            @national_id_issued_date, @national_id_issued_place, @graduated_school, @graduated_year, @workplace, @position,
            @qualification, @notes, @is_active,
            'IMPORT-LEGACY'
          );
      `);
		inserted++;
	}
	console.log(`[dm_hoc_vien] Đã ghi ${inserted} dòng vào trainees.`);
	return inserted;
}

// dm_nhan_vien -> staff_practice_licenses: chỉ khớp theo full_name chuẩn hoá.
// Khớp đúng 1 user -> import (dry-run: chỉ đếm). Khớp 0/nhiều -> ghi báo cáo CSV.
async function matchAndImportLicenses(text, pool) {
	const rows = parseMysqlInserts(text, 'dm_nhan_vien').filter(
		(r) => Number(r.da_xoa) === 0 && Number(r.trang_thai) === 1,
	);
	console.log(`\n[dm_nhan_vien] ${rows.length} dòng active (bỏ qua da_xoa=1, trang_thai=0).`);

	const usersRes = await pool.request().query('SELECT id, full_name FROM users');
	const byName = new Map();
	for (const u of usersRes.recordset) {
		const key = normalizeName(u.full_name);
		if (!byName.has(key)) byName.set(key, []);
		byName.get(key).push(u);
	}

	const matched = [];
	const unmatched = [];
	for (const r of rows) {
		const candidates = byName.get(normalizeName(r.ho_ten)) || [];
		if (candidates.length === 1) {
			matched.push({ legacy: r, user: candidates[0] });
		} else {
			unmatched.push({ ...r, match_count: candidates.length });
		}
	}

	console.log(`[dm_nhan_vien] Khớp đúng 1 user: ${matched.length}. Không khớp/khớp nhiều: ${unmatched.length}.`);

	const reportPath = path.resolve(__dirname, '..', 'staff_license_import_unmatched.csv');
	const header = 'ma_nv,ho_ten,chuyen_khoa,so_cchn,ngay_cap_cchn,pham_vi_hanh_nghe,match_count\n';
	const csvLines = unmatched.map((r) =>
		[r.ma_nv, r.ho_ten, r.chuyen_khoa, r.so_cchn, r.ngay_cap_cchn, r.pham_vi_hanh_nghe, r.match_count]
			.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
			.join(','),
	);
	fs.writeFileSync(reportPath, header + csvLines.join('\n'), 'utf8');
	console.log(`[dm_nhan_vien] Báo cáo dòng KHÔNG import: ${reportPath}`);

	if (!commit) return { matched: matched.length, unmatched: unmatched.length };

	let inserted = 0;
	for (const { legacy: r, user } of matched) {
		await pool
			.request()
			.input('id', sql.VarChar(20), 'LIC' + Buffer.from(String(r.id) + r.ma_nv).toString('hex').slice(0, 17).toUpperCase())
			.input('user_id', sql.VarChar(20), user.id)
			.input('license_no', sql.VarChar(50), r.so_cchn || null)
			.input('issued_date', sql.Date, r.ngay_cap_cchn || null)
			.input('practice_scope', sql.NVarChar(500), r.pham_vi_hanh_nghe || null)
			.input('primary_specialty', sql.NVarChar(255), r.chuyen_khoa || null)
			.input('cme_specialty', sql.NVarChar(300), r.chuyen_khoa_cap_nhat || null)
			.input('qualification', sql.NVarChar(150), r.trinh_do || null)
			.input('title', sql.NVarChar(150), r.chuc_danh || null)
			.query(`
        IF NOT EXISTS (SELECT 1 FROM staff_practice_licenses WHERE user_id = @user_id)
        INSERT INTO staff_practice_licenses (
          id, user_id, license_no, issued_date, practice_scope, primary_specialty, cme_specialty, qualification, title, created_by
        )
        VALUES (
          @id, @user_id, @license_no, @issued_date, @practice_scope, @primary_specialty, @cme_specialty, @qualification, @title, 'IMPORT-LEGACY'
        );
      `);
		inserted++;
	}
	console.log(`[dm_nhan_vien] Đã ghi ${inserted} hồ sơ CCHN vào staff_practice_licenses.`);
	return { matched: inserted, unmatched: unmatched.length };
}

async function main() {
	const text = fs.readFileSync(filePath, 'utf8');
	console.log(commit ? '=== CHẾ ĐỘ COMMIT — sẽ ghi vào DB ===' : '=== DRY-RUN — không ghi gì vào DB, chỉ thống kê ===');

	const pool = await getPool();
	await importLecturers(text, pool);
	await importTrainees(text, pool);
	await matchAndImportLicenses(text, pool);

	console.log('\nHoàn tất.' + (commit ? '' : ' Chạy lại kèm --commit để ghi thật vào DB.'));
	process.exit(0);
}

main().catch((err) => {
	console.error('❌ Lỗi:', err);
	process.exit(1);
});
