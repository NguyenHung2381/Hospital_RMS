const { scopeOf } = require('./authz');
const { isScoped, scopeRank } = require('./scopes');

// Phạm vi dữ liệu THEO THAO TÁC — dùng cho kiểm tra ghi (sửa / xóa / tạo) và cho
// chốt chặn leo thang quyền (privilegeGuard), thay cho scopeOf(user, resource)
// trần (mặc định action 'read').
//
// Vì sao không dùng thẳng scopeOf(user, resource, action):
//   - scopeOf mặc định lấy lượt cấp `read`: users:read@all + users:update@department
//     mà kiểm tra sửa bằng scopeOf(actor, 'users') thì thành 'all' — quản lý khoa
//     sửa / reset mật khẩu được tài khoản mọi khoa.
//   - Các policy runtime (topicPolicy, coursePolicy, userController...) lại dùng
//     scopeOf mặc định 'read' + fallback sang lượt cấp rộng nhất, nên phạm vi
//     "hiệu lực" của một người có thể hẹp hơn lượt cấp của riêng action đó.
// ⇒ Phạm vi hiệu lực của `action` = HẸP HƠN trong hai phạm vi: lượt cấp của
// chính action và phạm vi xem (runtime). Không bao giờ rộng hơn cái nào.
// Với vai trò mỗi resource một phạm vi (mọi vai trò seed, ma trận phân quyền
// trên giao diện) kết quả trùng scopeOf như cũ.
const effectiveScope = (user, resource, action = 'read') => {
	const own = scopeOf(user, resource, action);
	if (action === 'read' || !isScoped(resource)) return own;
	const view = scopeOf(user, resource);
	if (own == null || view == null) return null;
	return scopeRank(resource, own) <= scopeRank(resource, view) ? own : view;
};

// Giới hạn theo khoa cho resource có phạm vi department | all (users,
// staff_attendance) — fail-closed:
//   null   → không giới hạn (phạm vi hiệu lực 'all', hoặc superuser)
//   'K…'   → chỉ trong khoa này (department_id của actor)
//   false  → bị giới hạn theo khoa mà actor CHƯA có khoa ⇒ không thấy / không
//            thao tác được gì (không để NULL thành "không lọc" = mọi khoa)
const departmentLimit = (user, resource, action = 'read') =>
	effectiveScope(user, resource, action) === 'all' ? null : user?.department_id || false;

// Bản ghi thuộc khoa `departmentId` có nằm trong giới hạn khoa của actor cho
// `action` không. NULL === NULL không phải "cùng khoa".
const withinDepartment = (user, resource, action, departmentId) => {
	const limit = departmentLimit(user, resource, action);
	return limit === null || (limit !== false && departmentId === limit);
};

module.exports = { effectiveScope, departmentLimit, withinDepartment };
