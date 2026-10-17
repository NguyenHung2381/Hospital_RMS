// ─── Phạm vi dữ liệu (scope) ─────────────────────────────────────────────────
// Phạm vi là thuộc tính của TỪNG LƯỢT CẤP QUYỀN (role_permissions.scope), không
// còn là action riêng như trước (topics:read_all, users:read_department...).
// Chỉ các resource dưới đây có phạm vi; resource khác lưu scope = NULL.
// Thứ tự trong mảng = từ hẹp tới rộng (dùng để so "rộng hơn" khi cấp quyền).
const RESOURCE_SCOPES = {
	topics: ['own', 'department', 'all'],
	users: ['department', 'all'],
	courses: ['assigned', 'all'],
	// Phân ca / xem bảng chấm công: khoa trưởng, điều dưỡng trưởng chỉ khoa mình
	staff_attendance: ['department', 'all'],
};

const SCOPE_LABELS = {
	topics: { own: 'Đề tài mình tham gia', department: 'Trong khoa', all: 'Toàn viện' },
	users: { department: 'Trong khoa', all: 'Toàn viện' },
	courses: { assigned: 'Khóa được phân công', all: 'Tất cả khóa học' },
	staff_attendance: { department: 'Trong khoa', all: 'Toàn viện' },
};

const isScoped = (resource) => Object.hasOwn(RESOURCE_SCOPES, resource);

// -1 = không hợp lệ. Resource không có phạm vi: mọi lượt cấp coi như 'all'.
const scopeRank = (resource, scope) =>
	isScoped(resource) ? RESOURCE_SCOPES[resource].indexOf(scope) : 0;

// Lượt cấp của resource có phạm vi mà scope còn NULL (sync.js khi seedFrom từ
// quyền không phạm vi) nhận phạm vi HẸP nhất — trừ resource được thêm phạm vi
// SAU khi đã cấp quyền: lượt cấp cũ trước đó có hiệu lực toàn viện, thu hẹp sẽ
// làm người đang dùng mất quyền.
const NULL_SCOPE_FILL = { staff_attendance: 'all' };
const nullScopeFill = (resource) => NULL_SCOPE_FILL[resource] ?? RESOURCE_SCOPES[resource][0];

module.exports = {
	RESOURCE_SCOPES,
	SCOPE_LABELS,
	isScoped,
	scopeRank,
	nullScopeFill,
};
