#!/usr/bin/env node
// Nâng cấp mô hình phân quyền + đồng bộ danh mục quyền, chạy tay.
// Server tự làm việc này lúc khởi động; dùng script khi cần XEM TRƯỚC thay đổi
// hoặc khi login của ứng dụng không có quyền ALTER TABLE (chạy bằng tài khoản
// có quyền, vd đặt DB_USER/DB_PASSWORD tạm thời qua biến môi trường).
//   npm run migrate:permissions -- --dry-run   # chỉ in kế hoạch, không ghi DB
//   npm run migrate:permissions                # thực hiện
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });

const {
	migratePermissionScopes,
	summarize,
	migrateRolesAndSessions,
	summarizeRoles,
} = require('../src/permissions/migrations');
const { syncPermissions } = require('../src/permissions/sync');

const dryRun = process.argv.includes('--dry-run');

(async () => {
	const report = await migratePermissionScopes({ dryRun });
	console.log(dryRun ? '── KẾ HOẠCH (dry-run, chưa ghi gì) ──' : '── ĐÃ THỰC HIỆN ──');
	if (report.addedColumn) console.log('• Thêm cột role_permissions.scope');
	for (const r of report.roles) {
		console.log(`• Vai trò ${r.role_id}`);
		if (r.added.length) console.log(`    + ${r.added.join(', ')}`);
		if (r.removed.length) console.log(`    - ${r.removed.join(', ')}`);
		if (r.scoped.length) console.log(`    ~ ${r.scoped.join(', ')}`);
	}
	if (report.deletedPermissions.length) {
		console.log(`• Xoá quyền kiểu cũ: ${report.deletedPermissions.join(', ')}`);
	}
	for (const w of report.warnings) console.warn(`⚠️  ${w}`);
	if (!summarize(report)) console.log('• Mô hình phân quyền đã ở phiên bản mới — không có gì để nâng cấp.');

	const roles = await migrateRolesAndSessions({ dryRun });
	const rolesSummary = summarizeRoles(roles);
	console.log(rolesSummary ? `• Vai trò & phiên đăng nhập: ${rolesSummary}` : '• Vai trò & phiên đăng nhập đã ở phiên bản mới.');
	if (dryRun && roles.addedColumns.length) {
		console.log('  (dry-run: cần thêm cột trước mới tính được phần gán mã / superuser)');
	}

	const sync = await syncPermissions({ dryRun });
	if (sync.inserted.length) console.log(`• Quyền mới từ catalog: ${sync.inserted.join(', ')}`);
	if (sync.updated.length) console.log(`• Cập nhật tên/nhóm: ${sync.updated.length} quyền`);
	for (const w of sync.warnings) console.warn(`⚠️  ${w}`);
	process.exit(0);
})().catch((err) => {
	console.error(`❌ ${err.message}`);
	process.exit(1);
});
