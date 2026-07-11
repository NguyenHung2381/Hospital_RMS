import type { AccountType } from '../../user/types/user.type';

export const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
	{ value: 'manager', label: 'Quản lý' },
	{ value: 'reviewer', label: 'Thẩm định' },
	{ value: 'dept', label: 'TK Khoa' },
	{ value: 'member', label: 'Thành viên' },
];

export const ACCOUNT_TYPE_CFG: Record<
	AccountType,
	{ label: string; cls: string; avatarCls: string }
> = {
	admin: { label: 'Quản trị', cls: 'rolePurple', avatarCls: 'avatarPurple' },
	director: { label: 'Giám đốc', cls: 'roleRed', avatarCls: 'avatarRed' },
	reviewer: { label: 'Thẩm định', cls: 'roleGray', avatarCls: 'avatarGray' },
	manager: { label: 'Quản lý', cls: 'roleBlue', avatarCls: 'avatarBlue' },
	dept: { label: 'TK Khoa', cls: 'roleAmber', avatarCls: 'avatarAmber' },
	member: { label: 'Thành viên', cls: 'roleGreen', avatarCls: 'avatarGreen' },
};

export const EDITABLE_ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
	{ value: 'dept', label: 'TK Khoa' },
	{ value: 'member', label: 'Thành viên' },
];

export interface EditForm {
	full_name: string;
	staff_number: string;
	email: string;
	role_id: string;
	account_type: AccountType;
	is_active: boolean;
	password: string;
}

