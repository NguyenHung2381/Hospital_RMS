// ─── Danh mục quyền — NGUỒN CHÂN LÝ DUY NHẤT ─────────────────────────────────
// Mọi quyền "resource:action" của hệ thống khai báo ở đây. Khi server khởi
// động, permissions/sync.js đồng bộ danh mục này vào bảng `permissions` (thêm
// quyền mới, cập nhật tên/mô tả/nhóm; KHÔNG xóa quyền lạ — chỉ cảnh báo), API
// GET /permissions/catalog trả nó cho màn hình phân quyền, và
// scripts/gen-permission-types.js sinh kiểu PermissionKey cho frontend.
//
// Thêm quyền mới:
//   1. Thêm p(...) vào đúng resource ở catalogBusiness.js (nghiệp vụ) hoặc
//      catalogAdmin.js (quản trị) — id cố định, không đổi về sau.
//   2. Quyền tách ra từ một quyền cũ → khai báo `seedFrom`: lần đầu tạo, mọi
//      vai trò đang có quyền cũ được cấp luôn quyền mới (không ai mất quyền).
//   3. `npm run gen:perm-types` rồi dùng key mới ở route/frontend.
//
// Quy ước (xem middlewares/auth.js):
//   - Superuser (bỏ qua mọi kiểm tra) là cờ roles.is_superuser, KHÔNG phải quyền
//     trong danh mục này — không cấp được qua ma trận phân quyền. Trong code nó
//     hiện dưới dạng key 'system:manage' (permissions/permissionCache.js).
//   - Có đúng quyền được cấp mới được làm — "manage" KHÔNG còn là wildcard bao
//     các action khác; nó chỉ là tên của một quyền cụ thể (vd roles:manage =
//     phân quyền, surveys:manage = quản lý khảo sát).
//   - Phạm vi dữ liệu (của mình / trong khoa / toàn viện...) là thuộc tính của
//     lượt cấp quyền, không phải action — xem permissions/scopes.js.
//   - critical: quyền cho phép quản lý tài khoản / phân quyền — giao diện cảnh báo khi cấp.

const { BUSINESS_MODULES } = require('./catalogBusiness');
const { ADMIN_MODULE } = require('./catalogAdmin');

const ACTION_LABELS = {
	read: 'Xem',
	read_sensitive: 'Xem dữ liệu nhạy cảm',
	create: 'Tạo',
	update: 'Sửa',
	delete: 'Xóa',
	approve: 'Duyệt',
	import: 'Nhập Excel',
	export: 'Xuất Excel',
	merge: 'Gộp',
	cme_manage: 'Cấp CME',
	access: 'Truy cập',
	manage: 'Quản lý',
	roster: 'Phân ca',
	unlock: 'Mở khóa',
};

// Thứ tự module = thứ tự hiển thị (sortOrder bên dưới)
const MODULES = [...BUSINESS_MODULES, ADMIN_MODULE];

// ─── Chỉ mục & kiểm tra nhất quán (chạy 1 lần lúc require) ───────────────────
const ALL = [];
const BY_KEY = new Map(); // "resource:action" → permission (kèm resource, module)
const BY_ID = new Map();
const NAMES = new Set(); // permissions.name có UNIQUE trong DB

for (const [moduleOrder, mod] of MODULES.entries()) {
	for (const [resourceOrder, res] of mod.resources.entries()) {
		for (const [actionOrder, perm] of res.permissions.entries()) {
			const key = `${res.key}:${perm.action}`;
			if (!ACTION_LABELS[perm.action]) throw new Error(`[permissions] action lạ: ${key}`);
			if (BY_KEY.has(key)) throw new Error(`[permissions] trùng key: ${key}`);
			if (BY_ID.has(perm.id)) throw new Error(`[permissions] trùng id: ${perm.id}`);
			if (NAMES.has(perm.name)) throw new Error(`[permissions] trùng tên: ${perm.name}`);
			NAMES.add(perm.name);
			const entry = {
				...perm,
				key,
				resource: res.key,
				module: mod.key,
				// Thứ tự hiển thị ổn định: module → resource → action
				sortOrder: moduleOrder * 10000 + resourceOrder * 100 + actionOrder,
			};
			ALL.push(entry);
			BY_KEY.set(key, entry);
			BY_ID.set(perm.id, entry);
		}
	}
}
for (const perm of ALL) {
	for (const src of perm.seedFrom ?? []) {
		if (!BY_KEY.has(src))
			throw new Error(`[permissions] ${perm.key}.seedFrom trỏ tới quyền không tồn tại: ${src}`);
	}
}

// Quyền "đi kèm" khi cấp một quyền — giao diện tự tick theo (vd có quyền Sửa
// mà không có Xem thì không mở được màn hình để sửa).
const impliesOf = (perm) => {
	if (perm.action === 'read') return [];
	const read = `${perm.resource}:read`;
	return BY_KEY.has(read) ? [read] : [];
};

const isKnownKey = (key) => BY_KEY.has(key);

module.exports = {
	ACTION_LABELS,
	MODULES,
	ALL_PERMISSIONS: ALL,
	BY_KEY,
	BY_ID,
	impliesOf,
	isKnownKey,
};
