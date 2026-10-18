#!/usr/bin/env node
// Đồng bộ permissions/catalog.js vào bảng permissions, chạy tay. Server tự làm
// việc này lúc khởi động; dùng script để XEM TRƯỚC thay đổi.
//   npm run sync:permissions -- --dry-run   # chỉ in kế hoạch, không ghi DB
//   npm run sync:permissions                # thực hiện
require('../src/config/loadEnv');
const { findSchemaProblems } = require('../src/permissions');
const { syncPermissions } = require('../src/permissions/sync');

const dryRun = process.argv.includes('--dry-run');

(async () => {
	const problems = await findSchemaProblems();
	if (problems.length)
		throw new Error(
			`CSDL chưa nâng cấp — chạy npm run migrate trước:\n  - ${problems.join('\n  - ')}`,
		);

	const sync = await syncPermissions({ dryRun });
	console.log(dryRun ? '── KẾ HOẠCH (dry-run, chưa ghi gì) ──' : '── ĐÃ THỰC HIỆN ──');
	if (sync.inserted.length) console.log(`• Quyền mới từ catalog: ${sync.inserted.join(', ')}`);
	if (sync.updated.length) console.log(`• Cập nhật tên/nhóm: ${sync.updated.length} quyền`);
	if (!sync.inserted.length && !sync.updated.length)
		console.log('• Danh mục quyền đã khớp catalog.');
	for (const w of sync.warnings) console.warn(`⚠️  ${w}`);
	process.exit(0);
})().catch((err) => {
	console.error(`❌ ${err.message}`);
	process.exit(1);
});
