// ─── TYPES ────────────────────────────────
export type AccountType =
	| 'admin'
	| 'director'
	| 'reviewer'
	| 'manager'
	| 'dept'
	| 'member';
export type TabKey = 'all' | 'active' | 'inactive';

export interface User {
	id: string;
	username: string;
	staff_number: string | null;
	full_name: string;
	email: string;
	department_id: string;
	role_id: string;
	account_type: AccountType;
	is_active: boolean;
	topic_member_id: string | null;
	password_changed_at: string | null;
	created_at: string;
	created_by: string;
}

export interface UserForm {
	username: string;
	staff_number: string;
	full_name: string;
	email: string;
	department_id: string;
	role_id: string;
	account_type: AccountType;
	is_active: boolean;
	password: string;
}

export interface FormErrors {
	[k: string]: string;
}
