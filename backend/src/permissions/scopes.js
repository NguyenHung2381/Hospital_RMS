const { BY_KEY, ALL_PERMISSIONS } = require('./catalog');

// ─── Phạm vi dữ liệu (scope) ─────────────────────────────────────────────────
// Phạm vi là thuộc tính của TỪNG LƯỢT CẤP QUYỀN (role_permissions.scope), không
// còn là action riêng như trước (topics:read_all, users:read_department...).
// Chỉ các resource dưới đây có phạm vi; resource khác lưu scope = NULL.
// Thứ tự trong mảng = từ hẹp tới rộng (dùng để so "rộng hơn" khi cấp quyền).
const RESOURCE_SCOPES = {
	topics: ['own', 'department', 'all'],
	users: ['department', 'all'],
	courses: ['assigned', 'all'],
};

const SCOPE_LABELS = {
	topics: { own: 'Đề tài mình tham gia', department: 'Trong khoa', all: 'Toàn viện' },
	users: { department: 'Trong khoa', all: 'Toàn viện' },
	courses: { assigned: 'Khóa được phân công', all: 'Tất cả khóa học' },
};

const isScoped = (resource) => Object.hasOwn(RESOURCE_SCOPES, resource);

// -1 = không hợp lệ. Resource không có phạm vi: mọi lượt cấp coi như 'all'.
const scopeRank = (resource, scope) =>
	isScoped(resource) ? RESOURCE_SCOPES[resource].indexOf(scope) : 0;

// ─── Mô hình cũ → mô hình mới ────────────────────────────────────────────────
// CHỈ dùng cho migration (migrations.js, tương đương file SQL 20260924_01):
// quy đổi dữ liệu phân quyền kiểu cũ còn sót trong một CSDL chưa nâng cấp.

// Quyền giả dùng để biểu diễn phạm vi trong mô hình cũ.
const LEGACY_SCOPE_KEYS = {
	'topics:read_all': 'topics',
	'topics:read_department': 'topics',
	'users:read_all': 'users',
	'users:read_department': 'users',
	'courses:read_assigned': 'courses',
};

// Resource mà "manage" chỉ là wildcard (bao mọi action) — sau migrate bị bung
// thành từng quyền cụ thể rồi xoá. roles:manage, trainees:manage KHÔNG ở đây:
// đó là quyền thật (phân quyền / cấp tài khoản học viên) nên được giữ lại,
// nhưng người đang có vẫn được bung thêm các action còn lại (trước đây
// wildcard bao chúng).
const LEGACY_WILDCARD_MANAGE = [
	'catalog', 'councils', 'courses', 'departments', 'lecturers', 'notifications',
	'rounds', 'seminars', 'staff_licenses', 'training_catalog', 'training_programs', 'venues',
];
const LEGACY_MANAGE_ALSO_ACTION = ['roles', 'trainees'];

const LEGACY_REMOVED_KEYS = [
	...Object.keys(LEGACY_SCOPE_KEYS),
	...LEGACY_WILDCARD_MANAGE.map((r) => `${r}:manage`),
];

const actionsOf = (resource) =>
	ALL_PERMISSIONS.filter((p) => p.resource === resource).map((p) => p.key);

// Tập quyền cũ (Set "resource:action") → { keys, scopes } theo mô hình mới,
// giữ NGUYÊN hành vi của các hàm topicScope/userScope/courseScope trước đây.
const normalizeLegacy = (legacyKeys) => {
	const had = (k) => legacyKeys.has(k);
	const keys = new Set([...legacyKeys].filter((k) => !LEGACY_REMOVED_KEYS.includes(k)));

	for (const r of [...LEGACY_WILDCARD_MANAGE, ...LEGACY_MANAGE_ALSO_ACTION]) {
		if (had(`${r}:manage`)) actionsOf(r).forEach((k) => keys.add(k));
	}
	// Quyền giả phạm vi luôn đi kèm quyền Xem của resource đó.
	for (const [k, r] of Object.entries(LEGACY_SCOPE_KEYS)) {
		if (had(k) && BY_KEY.has(`${r}:read`)) keys.add(`${r}:read`);
	}

	const superuser = had('system:manage');
	const legacyScope = {
		topics:
			superuser || had('topics:read_all')
				? 'all'
				: had('topics:read_department')
					? 'department'
					: 'own',
		// Cũ: không có users:read_all ⇒ luôn bị giới hạn trong khoa.
		users: superuser || had('users:read_all') ? 'all' : 'department',
		// Cũ: 'courses:read' phẳng = xem tất cả; chỉ read_assigned (không kèm
		// manage) mới thu hẹp về khóa được phân công.
		courses:
			superuser || had('courses:manage') || !had('courses:read_assigned') ? 'all' : 'assigned',
	};

	const scopes = new Map();
	for (const k of keys) {
		const [r] = k.split(':');
		if (isScoped(r)) scopes.set(k, legacyScope[r]);
	}
	return { keys, scopes };
};

module.exports = {
	RESOURCE_SCOPES,
	SCOPE_LABELS,
	isScoped,
	scopeRank,
	LEGACY_REMOVED_KEYS,
	normalizeLegacy,
};
