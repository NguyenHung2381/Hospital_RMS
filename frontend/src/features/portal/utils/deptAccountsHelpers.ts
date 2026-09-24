// Màu / nhãn vai trò: dùng roleCfg ở shared/utils/roleDisplay.ts (tra theo mã vai trò).
// Vai trò KHÔNG đổi ở trang này — backend chỉ cho superuser đổi role_id
// (userController.PRIVILEGED_FIELDS); đổi vai trò ở trang quản trị Người dùng.

export interface EditForm {
	full_name: string;
	staff_number: string;
	email: string;
	is_active: boolean;
	password: string;
}
