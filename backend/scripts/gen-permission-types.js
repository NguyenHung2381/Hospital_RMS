#!/usr/bin/env node
// Sinh frontend/src/shared/types/permissions.generated.ts từ
// src/permissions/catalog.js — frontend dùng PermissionKey thay cho string để
// gõ sai tên quyền (vd "topic.approve") là lỗi biên dịch ngay.
//   npm run gen:perm-types
// Chạy lại mỗi khi sửa catalog.js; file sinh ra được commit cùng.
const fs = require('fs');
const path = require('path');
const { ALL_PERMISSIONS } = require('../src/permissions/catalog');

const out = path.join(__dirname, '../../frontend/src/shared/types/permissions.generated.ts');
const keys = ALL_PERMISSIONS.map((p) => p.key);

const content = `// FILE SINH TỰ ĐỘNG — KHÔNG SỬA TAY.
// Nguồn: backend/src/permissions/catalog.js — chạy \`npm run gen:perm-types\` trong backend.

export const PERMISSION_KEYS = [
${keys.map((k) => `\t'${k}',`).join('\n')}
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];
`;

fs.mkdirSync(path.dirname(out), { recursive: true });
const before = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : null;
if (before === content) {
	console.log(`permissions.generated.ts đã cập nhật (${keys.length} quyền).`);
} else {
	fs.writeFileSync(out, content);
	console.log(`✅ Đã ghi ${path.relative(process.cwd(), out)} (${keys.length} quyền).`);
}
