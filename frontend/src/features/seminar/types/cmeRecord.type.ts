// CME ghi nhận độc lập — không bắt buộc qua 1 seminar cụ thể (tự học, học
// online, minh chứng đính kèm...). Khác cme_credits gắn seminar_participants.
export interface CmeRecord {
	id: string;
	user_id: string;
	user_name: string;
	staff_number: number | null;
	department_name: string | null;
	category_id: string | null;
	category_name: string | null;
	group_name: string | null;
	title: string;
	activity_date: string | null;
	end_date: string | null;
	year: number;
	role: string | null;
	quantity: number | null;
	credits: number;
	evidence_file_id: string | null;
	evidence_file_name: string | null;
	evidence_file_url: string | null;
	/** File kết quả người dùng bổ sung sau khi đã duyệt. */
	result_files?: { id: string; file_name: string; file_url: string }[];
	note: string | null;
	approval_status: 'pending' | 'approved' | 'rejected';
	reject_reason: string | null;
}

export interface CmeRecordFormData {
	user_id: string;
	category_id: string;
	title: string;
	activity_date: string;
	end_date: string;
	year: string;
	role: string;
	quantity: string;
	credits: string;
	note: string;
}

export const EMPTY_CME_RECORD_FORM: CmeRecordFormData = {
	user_id: '',
	category_id: '',
	title: '',
	activity_date: '',
	end_date: '',
	year: String(new Date().getFullYear()),
	role: '',
	quantity: '',
	credits: '',
	note: '',
};

export interface CmeCreditCategory {
	id: string;
	name: string;
	group_id: string | null;
	conversion_method: 'per_session' | 'fixed' | 'per_year' | null;
	conversion_value: number | null;
	unit_label: string | null;
}

export interface CmeRecordListResponse {
	data: CmeRecord[];
	pagination: { page: number; limit: number; total: number };
}

export interface CmeRecordImportRow {
	row: number;
	user_id: string | null;
	matched_user_name: string | null;
	/** Mã NV chưa có trong hệ thống — sẽ tạo nhân viên mới khi nhập */
	new_staff: {
		staff_number: number;
		full_name: string;
		department_id: string | null;
		department_name: string | null;
		/** Không tìm được họ tên — phải nhập ở bước xem trước, chưa nhập thì không tạo tài khoản */
		missing_name: boolean;
	} | null;
	full_name_raw: string | null;
	staff_number: number | null;
	category_id: string | null;
	category_raw: string | null;
	title: string;
	activity_date: string | null;
	end_date: string | null;
	year: number | null;
	role: string | null;
	quantity: number | null;
	credits: number | null;
	notes: string | null;
	warnings: string[];
	/** Dữ liệu dòng hợp lệ (chưa xét đã khớp nhân viên hay chưa) */
	data_ok: boolean;
	/** Trùng ghi nhận đã có trong hệ thống / dòng trước trong file — người nhập quyết định có nhập không */
	duplicate: 'existing' | 'file' | null;
	valid: boolean;
}

export interface CmeRecordImportResult {
	dry_run: boolean;
	rows?: CmeRecordImportRow[];
	summary?: { total: number; matched: number; valid: number; duplicates: number; new_staff: number };
	inserted?: number;
	created_staff?: CmeImportCreatedStaff[];
	/** Dòng không nhập được (chỉ khi nhập thật) — missing_user: chưa khớp nhân viên */
	skipped_rows?: (CmeRecordImportRow & { missing_user: boolean })[];
	warnings: string[];
}

export interface CmeImportCreatedStaff {
	id: string;
	username: string;
	full_name: string;
	staff_number: number;
	department_name: string | null;
	missing_name: boolean;
	missing_department: boolean;
}
