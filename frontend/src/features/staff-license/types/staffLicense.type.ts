export interface StaffLicense {
	id: string;
	user_id: string;
	user_full_name: string;
	staff_number: number | null;
	department_id: string | null;
	department_name: string | null;
	license_no: string | null;
	issued_date: string | null;
	issuing_authority: string | null;
	practice_scope: string | null;
	primary_specialty: string | null;
	cme_specialty: string | null;
	qualification: string | null;
	title: string | null;
	notes: string | null;
	scope_decision_no: string | null;
	adjusted_scope: string | null;
	scope_adjusted_date: string | null;
}

export const LICENSE_FIELDS = [
	'license_no',
	'issued_date',
	'issuing_authority',
	'practice_scope',
	'primary_specialty',
	'cme_specialty',
	'qualification',
	'title',
	'scope_decision_no',
	'adjusted_scope',
	'scope_adjusted_date',
	'notes',
] as const;
export type LicenseField = (typeof LICENSE_FIELDS)[number];

export type StaffLicenseFormData = { user_id: string } & Record<LicenseField, string>;

export const FIELD_LABELS: Record<LicenseField, string> = {
	license_no: 'Số CCHN',
	issued_date: 'Ngày cấp',
	issuing_authority: 'Nơi cấp',
	practice_scope: 'Phạm vi hành nghề',
	primary_specialty: 'Chuyên khoa',
	cme_specialty: 'Chuyên khoa cần cập nhật KTYK liên tục',
	qualification: 'Văn bằng chuyên môn',
	title: 'Chức danh',
	scope_decision_no: 'QĐ bổ sung phạm vi',
	adjusted_scope: 'Phạm vi HĐCM sau điều chỉnh',
	scope_adjusted_date: 'Ngày điều chỉnh phạm vi',
	notes: 'Ghi chú',
};

export interface StaffLicenseListResponse {
	data: StaffLicense[];
	pagination: { page: number; limit: number; total: number };
}

export interface LicenseImportRow {
	row: number;
	staff_number: number;
	full_name: string;
	status: 'new' | 'changed';
	changes: { field: LicenseField; old: string | null; new: string | null }[];
	warnings: string[];
}

export interface LicenseImportResult {
	dry_run: boolean;
	summary: { total: number; new: number; changed: number; unchanged: number; skipped: number };
	rows?: LicenseImportRow[];
	written?: number;
	skipped: { row: number; staff_no: string; full_name: string; reason: string }[];
	warnings: string[];
}
