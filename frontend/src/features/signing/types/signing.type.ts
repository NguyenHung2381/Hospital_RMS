export type SigningAccountKind = 'organization' | 'personal';

export interface SigningAccount {
	id: number;
	label: string;
	kind: SigningAccountKind;
	user_id: string | null;
	user_name?: string | null;
	username?: string | null;
	region: string;
	/** Bản che: 4 ký tự đầu … 4 ký tự cuối */
	api_key: string;
	cert_subject: string | null;
	cert_issuer: string | null;
	cert_serial: string | null;
	cert_valid_from: string | null;
	cert_valid_to: string | null;
	cert_expired: boolean;
	has_cert: boolean;
	checked_at: string | null;
	last_error: string | null;
	use_for_certificates: boolean;
	is_active: boolean;
	/** Có ảnh chữ ký tay (hiện trong khung chữ ký số) */
	has_signature_image: boolean;
	/** In chức vụ bên dưới ảnh chữ ký */
	signature_show_text: boolean;
	/** Chức vụ in dưới chữ ký (null = lấy chức vụ trong hồ sơ) */
	signature_caption?: string | null;
	/** Họ tên in dưới khung chữ ký (null = họ tên tài khoản) */
	signature_display_name?: string | null;
	/** Chức vụ trong hồ sơ người dùng — mặc định khi chưa nhập */
	profile_position?: string | null;
	created_at: string;
}

export interface SigningAccountForm {
	label: string;
	region: string;
	api_key: string;
	secret: string;
	use_for_certificates: boolean;
	/** Chỉ khi thêm mới: chứng thư bệnh viện hay cấp cho 1 cán bộ */
	kind?: SigningAccountKind;
	user_id?: string | null;
}

export interface SigningAccountBrief {
	label: string;
	active: boolean;
	cert_subject: string | null;
	cert_valid_to: string | null;
	last_error: string | null;
}

/** Có chứng thư cá nhân / chứng thư ký giấy chứng nhận hay chưa — bật tắt nút "Ký số" */
export interface SigningStatus {
	personal: SigningAccountBrief | null;
	certificate: SigningAccountBrief | null;
	/** Cấu hình bật/tắt (Quản trị → Ký số → Cấu hình); features đã tính công tắc tổng */
	config?: SigningPublicConfig;
}

/** Nơi dùng ký số bật/tắt được — khớp backend signingConfig.FEATURES */
export type SigningFeature =
	| 'sign_requests'
	| 'user_document'
	| 'seminar_certificate'
	| 'training_documents'
	| 'topic_approval';

export interface SigningPublicConfig {
	enabled: boolean;
	self_manage: boolean;
	features: Record<SigningFeature, boolean>;
}

/** Cấu hình đầy đủ cho trang quản trị */
export interface SigningConfig {
	enabled: boolean;
	self_manage: boolean;
	features: Record<string, boolean>;
	providers: Record<string, boolean>;
	feature_list: { key: SigningFeature; label: string; description: string }[];
	provider_list: { key: string; label: string; description: string }[];
}

export type SigningDocType =
	| 'seminar_certificate'
	| 'practice_document'
	| 'registration_document'
	| 'topic_approval'
	| 'user_document'
	| 'sign_request'
	| 'test';

export interface SigningLog {
	id: number;
	account_id: number | null;
	account_label: string | null;
	actor_id: string | null;
	actor_name: string | null;
	doc_type: SigningDocType;
	doc_ref: string | null;
	endpoint: string;
	input_sha256: string | null;
	output_sha256: string | null;
	cert_serial: string | null;
	status: 'ok' | 'error';
	error_code: number | null;
	error_message: string | null;
	duration_ms: number | null;
	created_at: string;
}

export interface SigningLogPage {
	items: SigningLog[];
	total: number;
	page: number;
	limit: number;
}
