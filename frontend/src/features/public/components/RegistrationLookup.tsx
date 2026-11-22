import { useState, type ReactNode } from 'react';
import { AlertSvg, CheckCircleSvg, EditSvg, SearchSvg, UploadSvg } from '@/assets/icons';
import { useUploadPolicy } from '@/shared/hooks/useUploadPolicy';
import { ENROLLMENT_STATUS_CFG, type EnrollmentStatus } from '../../course/types/course.type';
import { formatDateOr } from '../../../shared/utils/formatDate';
import {
	getRegistrationStatus,
	uploadRegistrationFile,
	type RegistrationFileItem,
	type RegistrationFileKind,
	type RegistrationProof,
	type RegistrationStatus,
} from '../api/publicApi';
import { REGISTRATION_FILE_EXTENSIONS } from '../utils/registrationFiles';
import { ApplicationActions } from './ApplicationActions';
import { RegistrationAmend } from './RegistrationAmend';
import { FileSlot } from './courseRegister/FileSlot';
import styles from '../pages/PublicPortal.module.css';
import s from '../pages/CourseRegisterPublic.module.css';
import r from './RegistrationLookup.module.css';

const REVIEW_LABEL = { pending: 'Chờ duyệt', approved: 'Đã duyệt' } as const;

// Cảnh báo tự kiểm tra hiện cho người nộp — chỉ những lỗi rõ (nộp nhầm loại, trang trắng, thiếu mặt
// CCCD, trùng file); cảnh báo dễ sai do OCR (không thấy họ tên...) chỉ người duyệt thấy.
const APPLICANT_WARNINGS = new Set(['blank', 'cccd_missing_front', 'cccd_missing_back', 'duplicate']);
function checkHint(item: RegistrationFileItem): string | null {
	const c = item.check;
	if (!c || c.status !== 'done' || item.review_status === 'approved') return null;
	const parts = c.verdict === 'mismatch' ? [c.message] : [];
	for (const w of c.warnings) if (APPLICANT_WARNINGS.has(w.code)) parts.push(w.message);
	return parts.length ? `Hệ thống tự kiểm tra: ${parts.join(' ')} Nếu nộp nhầm, hãy nộp lại file đúng.` : null;
}

// Dòng trạng thái của 1 loại hồ sơ theo dữ liệu máy chủ
function fileStatus(item: RegistrationFileItem): ReactNode {
	if (item.legacy) return `File gộp nộp trước đây${item.uploaded_at ? ` · ${formatDateOr(item.uploaded_at)}` : ''}`;
	if (item.uploaded_at && item.review_status === 'rejected')
		return <span className={s.slotStatusBad}>Bị từ chối — vui lòng nộp lại</span>;
	if (!item.uploaded_at) return 'Chưa nộp';
	const review = item.review_status && item.review_status !== 'rejected' ? REVIEW_LABEL[item.review_status] : null;
	const hint = checkHint(item);
	return (
		<>
			Đã nộp {formatDateOr(item.uploaded_at)}
			{item.file_name ? ` · ${item.file_name}` : ''}
			{review && (
				<>
					{' · '}
					<span className={item.review_status === 'approved' ? s.slotStatusOk : undefined}>{review}</span>
				</>
			)}
			{hint && <span className={r.checkWarn}>{hint}</span>}
		</>
	);
}

// Tra cứu đơn đăng ký bằng mã đăng ký + số CCCD (gửi trong body, không đưa lên URL)
export function RegistrationLookup({ initialCode = '' }: { initialCode?: string }) {
	const [code, setCode] = useState(initialCode);
	const [nationalId, setNationalId] = useState('');
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const [status, setStatus] = useState<RegistrationStatus | null>(null);
	// Yếu tố đã dùng tra cứu thành công — dùng lại để tải đơn / nộp hồ sơ, chỉ nằm trong bộ nhớ
	const [proof, setProof] = useState<RegistrationProof | null>(null);
	const [picked, setPicked] = useState<Partial<Record<RegistrationFileKind, File>>>({});
	// Loại hồ sơ đang nộp (bận theo từng ô), lỗi từng ô, thông báo nộp xong
	const [uploading, setUploading] = useState<RegistrationFileKind | null>(null);
	const [slotErrors, setSlotErrors] = useState<Partial<Record<RegistrationFileKind, string>>>({});
	const [uploadedLabel, setUploadedLabel] = useState('');
	// Sửa thông tin đã khai (chỉ khi còn chờ duyệt) + thông báo vừa lưu bản sửa
	const [editing, setEditing] = useState(false);
	const [amended, setAmended] = useState<{ seq: number; hash: string } | null>(null);
	const policy = useUploadPolicy();

	const search = async (e: React.FormEvent) => {
		e.preventDefault();
		const c = code.trim();
		const id = nationalId.trim();
		if (!c) return setError('Vui lòng nhập mã đăng ký');
		if (!id) return setError('Vui lòng nhập số CCCD đã khai khi đăng ký');
		setLoading(true);
		setError('');
		setStatus(null);
		setProof(null);
		setUploadedLabel('');
		setSlotErrors({});
		setPicked({});
		setEditing(false);
		setAmended(null);
		try {
			const p = { national_id: id };
			setStatus(await getRegistrationStatus(c, p));
			setProof(p);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Tra cứu thất bại, vui lòng thử lại');
		} finally {
			setLoading(false);
		}
	};

	const upload = async (item: RegistrationFileItem) => {
		const kind = item.kind as RegistrationFileKind;
		const file = picked[kind];
		if (!status || !proof || !file) return setSlotErrors((e) => ({ ...e, [kind]: 'Vui lòng chọn file cần nộp' }));
		setUploading(kind);
		setSlotErrors((e) => ({ ...e, [kind]: undefined }));
		setUploadedLabel('');
		try {
			const res = await uploadRegistrationFile(status.registration_code, proof, kind, file);
			// Cập nhật tại chỗ từ phản hồi nộp file. Không gọi lại tra cứu: mỗi lượt tra cứu tốn 1 lượt
			// giới hạn theo mã, hết lượt thì file đã lưu mà trang lại báo lỗi.
			setStatus(
				(s) =>
					s && {
						...s,
						files_missing: res.files_missing,
						files: s.files.map((it) =>
							it.kind === res.kind
								? {
										...it,
										uploaded_at: res.uploaded_at,
										file_name: file.name,
										mime_type: file.type || it.mime_type,
										// File ngoại viện vừa nộp luôn chờ phòng Đào tạo duyệt
										review_status: s.source === 'external' ? 'pending' : null,
									}
								: it,
						),
					},
			);
			setPicked((p) => ({ ...p, [kind]: undefined }));
			setUploadedLabel(item.label);
		} catch (err) {
			setSlotErrors((e) => ({
				...e,
				[kind]: err instanceof Error ? err.message : 'Gửi hồ sơ thất bại, vui lòng thử lại',
			}));
		} finally {
			setUploading(null);
		}
	};

	const cfg = status ? ENROLLMENT_STATUS_CFG[status.enrollment_status as EnrollmentStatus] : undefined;
	const missingLabels = status
		? status.files.filter((it) => !it.legacy && status.files_missing.includes(it.kind as RegistrationFileKind)).map((it) => it.label)
		: [];

	return (
		<>
			{error && (
				<div
					className={`${styles.alertBox} ${styles.alertError}`}
					role='alert'
				>
					<AlertSvg /> {error}
				</div>
			)}
			<form
				onSubmit={search}
				className={`${styles.searchRow} ${styles.searchRowLabeled}`}
				noValidate
			>
				<div className={styles.searchField}>
					<label
						className={styles.label}
						htmlFor='reg-code'
					>
						Mã đăng ký <span className={styles.required}>*</span>
					</label>
					<input
						id='reg-code'
						className={styles.input}
						value={code}
						onChange={(e) => setCode(e.target.value)}
						placeholder='Mã in trên đơn / trong thư xác nhận'
						autoComplete='off'
						autoCapitalize='characters'
						spellCheck={false}
						maxLength={40}
					/>
				</div>
				<div className={styles.searchField}>
					<label
						className={styles.label}
						htmlFor='reg-id'
					>
						Số CCCD <span className={styles.required}>*</span>
					</label>
					<input
						id='reg-id'
						className={styles.input}
						value={nationalId}
						onChange={(e) => setNationalId(e.target.value.replace(/\s/g, ''))}
						placeholder='Số CCCD đã khai khi đăng ký'
						inputMode='numeric'
						autoComplete='off'
						maxLength={20}
					/>
				</div>
				<button
					type='submit'
					className={styles.searchBtn}
					disabled={loading}
				>
					<SearchSvg /> {loading ? 'Đang tra cứu...' : 'Tra cứu'}
				</button>
			</form>
			<p className={styles.searchHint}>
				Mã đăng ký có ở màn hình sau khi gửi đăng ký, trên đơn đăng ký và trong thư xác nhận. Thông tin được gửi kín,
				không hiện trên đường dẫn.
			</p>

			{status && (
				<section
					className={r.result}
					aria-label='Kết quả tra cứu đơn đăng ký'
				>
					<header className={r.head}>
						<div>
							<h2 className={r.name}>{status.full_name}</h2>
							<div className={r.code}>Mã đăng ký {status.registration_code}</div>
						</div>
						{cfg ? (
							<span
								className={styles.badge}
								style={{ color: cfg.color, background: cfg.bg }}
							>
								{cfg.label}
							</span>
						) : (
							<span className={styles.badge}>{status.enrollment_status}</span>
						)}
					</header>
					<dl className={r.facts}>
						<div>
							<dt>Khóa học</dt>
							<dd>{status.course_name}</dd>
						</div>
						{status.program_name && (
							<div>
								<dt>Chương trình</dt>
								<dd>{status.program_name}</dd>
							</div>
						)}
						<div>
							<dt>Đối tượng</dt>
							<dd>{status.source === 'internal' ? 'Nội viện' : 'Ngoại viện'}</dd>
						</div>
						<div>
							<dt>Ngày đăng ký</dt>
							<dd>{formatDateOr(status.registered_at)}</dd>
						</div>
					</dl>

					<h3 className={r.subTitle}>Hồ sơ đính kèm</h3>
					{status.can_upload && missingLabels.length > 0 && (
						<div className={r.todo}>
							<h4 className={r.todoTitle}>Việc bạn cần làm: nộp {missingLabels.length} giấy tờ còn thiếu</h4>
							<ul className={r.todoList}>
								{missingLabels.map((label) => (
									<li key={label}>{label}</li>
								))}
							</ul>
						</div>
					)}
					{uploadedLabel && (
						<div
							className={`${styles.alertBox} ${styles.alertSuccess}`}
							role='status'
						>
							<CheckCircleSvg /> Đã nhận file {uploadedLabel}.
						</div>
					)}
					<div className={s.slotGrid}>
						{status.files.map((item) => {
							const kind = item.kind as RegistrationFileKind;
							const editable = status.can_upload && !item.legacy;
							if (!editable)
								return (
									<div
										key={item.kind}
										className={s.slot}
									>
										<span className={s.slotLabel}>{item.label}</span>
										<div className={s.slotStatus}>{fileStatus(item)}</div>
									</div>
								);
							const file = picked[kind] ?? null;
							return (
								<FileSlot
									key={item.kind}
									kind={kind}
									label={item.label}
									required={item.required}
									later={item.later}
									file={file}
									onChange={(f) => {
										setPicked((p) => ({ ...p, [kind]: f ?? undefined }));
										setSlotErrors((e) => ({ ...e, [kind]: undefined }));
									}}
									error={slotErrors[kind]}
									extensions={REGISTRATION_FILE_EXTENSIONS}
									maxSizeMB={policy.maxSizeMB}
									status={fileStatus(item)}
									disabled={uploading !== null}
									actions={
										<button
											type='button'
											className={s.submitBtn}
											onClick={() => void upload(item)}
											disabled={uploading !== null || !file}
											aria-label={`${item.uploaded_at ? 'Nộp lại' : 'Nộp'} ${item.label}`}
										>
											<UploadSvg />
											{uploading === kind ? 'Đang gửi...' : item.uploaded_at ? 'Nộp lại' : 'Nộp'}
										</button>
									}
								/>
							);
						})}
					</div>
					{!status.can_upload && (
						<p className={s.hint}>
							Đơn đã được xử lý — muốn thay hồ sơ, vui lòng liên hệ Trung tâm Đào tạo và Chỉ đạo tuyến.
						</p>
					)}

					<h3 className={r.subTitle}>Thông tin đã khai</h3>
					{amended && (
						<div
							className={`${styles.alertBox} ${styles.alertSuccess} ${r.amendDone}`}
							role='status'
						>
							<CheckCircleSvg />
							<span>
								Đã lưu bản sửa lần {amended.seq}. Mã xác nhận lần sửa: <span className={r.hash}>{amended.hash}</span>
							</span>
						</div>
					)}
					{editing && proof ? (
						<RegistrationAmend
							code={status.registration_code}
							proof={proof}
							onCancel={() => setEditing(false)}
							onSaved={(res, nextProof) => {
								setStatus(res.status);
								setProof(nextProof);
								if ('national_id' in nextProof) setNationalId(nextProof.national_id);
								setAmended({ seq: res.seq, hash: res.consent_hash });
								setEditing(false);
							}}
						/>
					) : status.can_upload ? (
						<div className={r.amendCta}>
							<p className={s.hint}>
								Phát hiện khai sai (họ tên, ngày sinh, số CCCD, liên hệ, văn bằng...)? Bạn tự sửa được khi đăng ký còn chờ duyệt — cần
								ghi lý do và ký xác nhận lại.
							</p>
							<button
								type='button'
								className={s.ghostBtn}
								onClick={() => {
									setAmended(null);
									setEditing(true);
								}}
							>
								<EditSvg /> Sửa thông tin đã khai
							</button>
						</div>
					) : (
						<p className={s.hint}>
							Đăng ký đã được xử lý — muốn điều chỉnh thông tin, vui lòng liên hệ Trung tâm Đào tạo và Chỉ đạo tuyến.
						</p>
					)}

					{proof && (
						<>
							<h3 className={r.subTitle}>Đơn đăng ký</h3>
							<ApplicationActions
								code={status.registration_code}
								proof={proof}
							/>
						</>
					)}
				</section>
			)}
		</>
	);
}
