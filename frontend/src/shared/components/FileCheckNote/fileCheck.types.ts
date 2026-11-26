// Kết quả tự kiểm tra 1 file (backend training/registration/docCheck/docCheckService.present
// và presentTraineeDocument) — dùng chung cho hồ sơ đăng ký khóa ĐTLT và hồ sơ học viên.

/** ok = không cảnh báo; warn = nên xem lại; info = đang kiểm / chỉ báo, không kết luận */
export type DocCheckLevel = 'ok' | 'warn' | 'info';

/** Mã cảnh báo chữ ký (backend docCheck/signature/signatureRules.js SIG_WARNING_MESSAGES) */
export type SignatureWarningCode =
	| 'digital_invalid'
	| 'digital_modified'
	| 'digital_untrusted'
	| 'chain_incomplete'
	| 'signer_org_mismatch'
	| 'seal_image_no_digital'
	| 'seal_missing'
	| 'hand_signature_missing'
	| 'signature_missing'
	| 'marks_unclear';

/** Có / không / không xác định được (null) */
type Tri = boolean | null;

/** Khối `signature` (backend signatureRules.presentSignature). null = chưa kiểm / loại không kiểm / công tắc tắt */
export interface DocSignatureCheck {
	/** Độc lập với `level` của phần đoán loại giấy tờ */
	level: DocCheckLevel;
	message: string;
	verdict: 'ok' | 'warn' | 'missing' | 'unclear' | null;
	/** Kết quả chữ ký số; null = file ảnh (không có chữ ký số để kiểm) */
	digital: 'valid' | 'invalid' | 'modified' | 'untrusted' | 'none' | null;
	/** Chỉ có khi file có chữ ký số — người ký của chữ ký cuối */
	signer?: {
		cn: string | null;
		o: string | null;
		issuer_cn: string | null;
		signed_at: string | null;
		/** tsa = dấu thời gian của đơn vị cấp; claimed = thời điểm do người ký tự khai */
		time_source: 'tsa' | 'claimed' | null;
	};
	marks: {
		seal: Tri;
		hand_signature: Tri;
		pages: { page: number; seal: Tri; hand_signature: Tri }[];
	};
	warnings: { code: SignatureWarningCode; message: string }[];
}

/** Kết quả kiểm 1 file. W = mã cảnh báo của phần đoán loại giấy tờ */
export interface DocFileCheck<W extends string = string> {
	status: 'pending' | 'running' | 'done' | 'error' | 'skipped';
	/** ok = đúng loại; mismatch = có vẻ sai loại; unclear = không đọc được; null = chưa xong / không đoán loại */
	verdict: 'ok' | 'mismatch' | 'unclear' | null;
	detected_kind: string | null;
	detected_label: string | null;
	level: DocCheckLevel;
	message: string;
	warnings: { code: W; message: string }[];
	signature?: DocSignatureCheck | null;
}
