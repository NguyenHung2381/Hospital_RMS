import { useState } from 'react';
import { AlertSvg, CheckCircleSvg, CheckSmSvg, SearchSvg, UploadSvg } from '@/assets/icons';
import { ENROLLMENT_STATUS_CFG, type EnrollmentStatus } from '../../course/types/course.type';
import { formatDateOr } from '../../../shared/utils/formatDate';
import {
	getRegistrationStatus,
	uploadRegistrationDossier,
	type RegistrationProof,
	type RegistrationStatus,
} from '../api/publicApi';
import { ApplicationActions } from './ApplicationActions';
import { AttachmentPicker, type Attachment } from './AttachmentPicker';
import styles from '../pages/PublicPortal.module.css';
import s from '../pages/CourseRegisterPublic.module.css';
import r from './RegistrationLookup.module.css';

interface Step {
	label: string;
	done: boolean;
	/** Chữ phụ cho trạng thái (vd: ngày nộp) */
	note?: string;
}

// Các mốc xử lý theo đối tượng: ngoại viện đối chiếu CCCD + văn bằng; nội viện nhận tờ trình + bản scan
function progressSteps(st: RegistrationStatus): Step[] {
	if (st.source === 'external')
		return [
			{ label: st.checks.id_checked ? 'Đã đối chiếu căn cước công dân' : 'Chờ đối chiếu căn cước công dân', done: st.checks.id_checked },
			{ label: st.checks.degree_checked ? 'Đã đối chiếu văn bằng' : 'Chờ đối chiếu văn bằng', done: st.checks.degree_checked },
		];
	return [
		{ label: st.checks.proposal_checked ? 'Đã kiểm tra tờ trình' : 'Chờ kiểm tra tờ trình', done: st.checks.proposal_checked },
		{
			label: st.dossier_uploaded_at ? 'Đã nộp bản scan tờ trình' : 'Chưa nộp bản scan tờ trình',
			done: !!st.dossier_uploaded_at,
			note: st.dossier_uploaded_at ? formatDateOr(st.dossier_uploaded_at) : undefined,
		},
	];
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
	const [files, setFiles] = useState<Attachment[]>([]);
	const [uploading, setUploading] = useState(false);
	const [uploadError, setUploadError] = useState('');
	const [uploadedNow, setUploadedNow] = useState(false);

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
		setUploadedNow(false);
		setUploadError('');
		setFiles([]);
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

	const upload = async () => {
		if (!status || !proof || !files[0]) return setUploadError('Vui lòng chọn file PDF cần nộp');
		setUploading(true);
		setUploadError('');
		try {
			const res = await uploadRegistrationDossier(status.registration_code, proof, files[0].file);
			setStatus({ ...status, needs_dossier: false, dossier_uploaded_at: res.dossier_uploaded_at });
			setUploadedNow(true);
			setFiles([]);
		} catch (err) {
			setUploadError(err instanceof Error ? err.message : 'Gửi hồ sơ thất bại, vui lòng thử lại');
		} finally {
			setUploading(false);
		}
	};

	const cfg = status ? ENROLLMENT_STATUS_CFG[status.enrollment_status as EnrollmentStatus] : undefined;

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

					<h3 className={r.subTitle}>Tiến độ xử lý hồ sơ</h3>
					<ul className={r.steps}>
						{progressSteps(status).map((st) => (
							<li
								key={st.label}
								className={st.done ? r.stepDone : r.stepWait}
							>
								<span className={r.stepIcon}>{st.done && <CheckSmSvg />}</span>
								<span>
									{st.label}
									{st.note && <span className={r.stepNote}> · {st.note}</span>}
								</span>
							</li>
						))}
					</ul>

					{status.needs_dossier && (
						<div className={r.todo}>
							<h3 className={r.todoTitle}>Việc bạn cần làm: nộp bản scan tờ trình đã duyệt</h3>
							<p className={r.todoText}>
								Khi khoa/phòng đã có tờ trình được Ban giám đốc duyệt, hãy scan thành 1 file PDF và tải lên ở đây.
							</p>
							<AttachmentPicker
								value={files}
								onChange={(f) => {
									setFiles(f);
									setUploadError('');
								}}
								maxFiles={1}
								extensions={['.pdf']}
								hint='1 file PDF'
							/>
							{uploadError && (
								<div
									className={s.fieldError}
									role='alert'
								>
									{uploadError}
								</div>
							)}
							<button
								type='button'
								className={s.submitBtn}
								onClick={upload}
								disabled={uploading || files.length === 0}
							>
								<UploadSvg />
								{uploading ? 'Đang gửi...' : 'Gửi hồ sơ'}
							</button>
						</div>
					)}
					{uploadedNow && (
						<div
							className={`${styles.alertBox} ${styles.alertSuccess}`}
							role='status'
						>
							<CheckCircleSvg /> Đã nhận hồ sơ của bạn. Phòng Đào tạo sẽ kiểm tra và cập nhật tiến độ.
						</div>
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
