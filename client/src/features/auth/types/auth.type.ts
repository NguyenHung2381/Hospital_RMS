// === TYPES ===
export interface LoginForm {
	username: string;
	password: string;
	remember: boolean;
}

export interface FormErrors {
	username?: string;
	password?: string;
}
