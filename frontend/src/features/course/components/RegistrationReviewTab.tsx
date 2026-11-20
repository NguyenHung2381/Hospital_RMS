import { useCallback, useEffect, useState } from 'react';
import { DocSvg } from '@/assets/icons';
import { Badge, InlineLoading } from '@/shared/components';
import { FileViewerModal } from '@/shared/components/FileViewerModal';
import { usePermission } from '@/shared/hooks/usePermission';
import { formatDateVN } from '@/shared/utils/formatDate';
import { fileSlug, saveBlob } from '@/shared/utils/saveBlob';
import { showToast } from '@/shared/utils/feedback';
import { cx } from '@/shared/utils/cx';
import {
	GENDER_LABEL,
	REGISTRATION_FIELD_GROUPS,
	REGISTRATION_FIELD_LABELS,
	REGISTRATION_FILE_LABELS,
	REVIEW_STATUS_LABEL,
	REVIEW_STATUS_TONE,
	downloadRegistrationApplication,
	getEnrollmentRegistration,
	registrationApplicationUrl,
	type RegistrationReview,
} from '../api/registrationApi';
import styles from './RegistrationReviewTab.module.css';
import cs from '../pages/Courses.module.css';

const DATE_KEYS = new Set(['dob', 'national_id_issued_date']);

// Mốc thời gian của bản khai (gửi, cam kết, xác minh email, nộp hồ sơ) lưu GIỜ VN,
// driver gắn nhãn UTC (backend/README.md, mục Giờ) ⇒ đọc theo múi UTC. formatDateTimeVN dành
// cho cột lưu giờ UTC thật — dùng ở đây sẽ cộng thêm 7 giờ.
const formatStamp = (iso: string | null | undefined): string => {
	if (!iso) return '';
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return '';
	return d.toLocaleString('vi-VN', {
		timeZone: 'UTC',
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
		hour12: false,
	});
};

/** Giá trị hiển thị của 1 trường bản khai (ngày dd/mm/yyyy, giới tính, tên danh mục). */
const show = (r: RegistrationReview, key: string, value: unknown): string => {
	if (value === null || value === undefined || value === '') return '';
	if (key === 'department_id') return r.department_name ?? String(value);
	if (key === 'trainee_type_id') return r.trainee_type_name ?? String(value);
	if (key === 'gender') return GENDER_LABEL[String(value)] ?? String(value);
	if (DATE_KEYS.has(key)) return formatDateVN(String(value));
	return String(value);
};

// Tab "Đơn đăng ký" của hồ sơ ghi danh: dữ liệu người đăng ký đã khai (nhóm như trên form),
// chỗ lệch với hồ sơ học viên, hồ sơ đính kèm (từng loại), Đơn đăng ký (.docx). Chỉ để xem —
// duyệt / từ chối ở danh sách ghi danh, không có điều kiện nào chặn việc duyệt.
export function RegistrationReviewTab({
	enrollmentId,
	traineeName,
}: {
	enrollmentId: string;
	traineeName: string;
}) {
	const perm = usePermission();
	const canSensitive = perm.has('trainees:read_sensitive');
	const [data, setData] = useState<RegistrationReview | null>(null);
	const [loadError, setLoadError] = useState('');
	const [downloading, setDownloading] = useState(false);
	const [viewer, setViewer] = useState<{ url: string; name: string; isWord: boolean } | null>(null);

	const load = useCallback(
		() =>
			getEnrollmentRegistration(enrollmentId)
				.then((r) => {
					setData(r);
					setLoadError(r ? '' : 'Lượt ghi danh này không có bản khai đăng ký.');
				})
				.catch((err) => setLoadError(err instanceof Error ? err.message : 'Không tải được bản khai')),
		[enrollmentId],
	);
	useEffect(() => {
		void load();
	}, [load]);

	if (loadError) return <div className={cs.errorBanner}>{loadError}</div>;
	if (!data) return <InlineLoading />;

	const download = async () => {
		setDownloading(true);
		try {
			saveBlob(await downloadRegistrationApplication(enrollmentId), `don-dang-ky_${fileSlug(traineeName)}_${data.registration_code}.docx`);
		} catch (err) {
			showToast('error', err instanceof Error ? err.message : 'Không tạo được đơn đăng ký');
		} finally {
			setDownloading(false);
		}
	};

	const diffs = new Map(data.diffs.map((d) => [d.key, d]));
	const invoice = Object.entries(data.invoice).filter(([, v]) => v);

	return (
		<div className={styles.wrap}>
			<div className={styles.headLine}>
				<span>
					Mã đăng ký <span className={styles.code}>{data.registration_code}</span>
				</span>
				<Badge tone={data.source === 'internal' ? 'teal' : 'blue'}>{data.source === 'internal' ? 'Nội viện' : 'Ngoại viện'}</Badge>
				{data.created_at && <span>Gửi lúc {formatStamp(data.created_at)}</span>}
				{data.channel === 'portal' && <span>Qua cổng nhân viên</span>}
			</div>

			<section className={styles.section}>
				<h3 className={styles.sectionTitle}>Hồ sơ đính kèm</h3>
				{data.files_missing.length > 0 && (
					<div className={cx(styles.note, styles.noteWarn)}>
						Còn thiếu:{' '}
						{data.files_missing
							.map((k) => data.files.find((f) => f.kind === k)?.label ?? REGISTRATION_FILE_LABELS[k] ?? k)
							.join(', ')}
						.
					</div>
				)}
				<ul className={styles.fileList}>
					{data.files.map((f) => (
						<li
							key={f.kind}
							className={styles.fileRow}
						>
							<span className={styles.fileLabel}>
								{f.label}
								{f.legacy && ' (nộp theo cách cũ)'}
							</span>
							{f.uploaded_at ? (
								<span className={styles.meta}>
									{f.file_name}
									{` · nộp ${formatStamp(f.uploaded_at)}`}
								</span>
							) : (
								<span className={cx(styles.meta, styles.empty)}>Chưa nộp</span>
							)}
							{f.review_status && (
								<Badge tone={REVIEW_STATUS_TONE[f.review_status]}>{REVIEW_STATUS_LABEL[f.review_status]}</Badge>
							)}
							{f.file_url && (
								<button
									type='button'
									className={cs.linkBtn}
									onClick={() => setViewer({ url: f.file_url!, name: `${f.label} — ${traineeName}`, isWord: false })}
								>
									Xem
								</button>
							)}
						</li>
					))}
				</ul>
				{!canSensitive && data.files.some((f) => f.uploaded_at) && (
					<p className={cx(cs.hint, styles.fileHint)}>Cần quyền xem dữ liệu nhạy cảm của học viên để xem file.</p>
				)}
				{data.source === 'external' && (
					<p className={cx(cs.hint, styles.fileHint)}>
						Các file này cũng nằm ở tab Hồ sơ của học viên — duyệt / từ chối từng file ở đó.
					</p>
				)}
				{data.source === 'external' && data.files.every((f) => !f.uploaded_at) && (
					<div className={styles.note}>
						Đơn gửi trước khi áp dụng hồ sơ bắt buộc — file (nếu có) nằm ở tab Hồ sơ của học viên.
					</div>
				)}
			</section>

			{data.diffs.length > 0 && (
				<div className={cx(styles.note, styles.noteWarn)}>
					{data.diffs.length} trường khác với hồ sơ học viên đang lưu (tô màu bên dưới). Kiểm tra rồi sửa hồ sơ học viên nếu cần — hệ
					thống không tự ghi đè hồ sơ bằng dữ liệu form.
				</div>
			)}

			{REGISTRATION_FIELD_GROUPS.map((g) => {
				const keys = g.keys.filter((k) => show(data, k, data.snapshot[k]) || diffs.has(k));
				if (!keys.length) return null;
				return (
					<section
						key={g.title}
						className={styles.section}
					>
						<h3 className={styles.sectionTitle}>{g.title}</h3>
						<dl className={styles.grid}>
							{keys.map((k) => {
								const diff = diffs.get(k);
								const value = show(data, k, data.snapshot[k]);
								const profile = diff ? (diff.profile_label ?? show(data, k, diff.profile)) : '';
								return (
									<div
										key={k}
										className={cx(styles.field, diff && styles.fieldDiff)}
									>
										<dt>{REGISTRATION_FIELD_LABELS[k] ?? k}</dt>
										<dd>
											{value || <span className={styles.empty}>Không khai</span>}
											{diff && <span className={styles.profileValue}>Hồ sơ học viên: {profile || '(trống)'}</span>}
										</dd>
									</div>
								);
							})}
						</dl>
					</section>
				);
			})}

			{invoice.length > 0 && (
				<section className={styles.section}>
					<h3 className={styles.sectionTitle}>Thông tin xuất hóa đơn</h3>
					<dl className={styles.grid}>
						{invoice.map(([k, v]) => (
							<div
								key={k}
								className={styles.field}
							>
								<dt>{REGISTRATION_FIELD_LABELS[k] ?? k}</dt>
								<dd>{v}</dd>
							</div>
						))}
					</dl>
				</section>
			)}

			<section className={styles.section}>
				<h3 className={styles.sectionTitle}>Xác minh và cam kết</h3>
				<dl className={styles.grid}>
					<div className={styles.field}>
						<dt>Email đã xác minh</dt>
						<dd>
							{data.verified_email ?? <span className={styles.empty}>Không xác minh (cấu hình tắt OTP)</span>}
							{data.email_verified_at && <span className={styles.meta}> · {formatStamp(data.email_verified_at)}</span>}
						</dd>
					</div>
					<div className={styles.field}>
						<dt>Cam kết nội quy / thông tin đúng sự thật</dt>
						<dd>
							{data.rules_accepted_at ? `Đã cam kết ${formatStamp(data.rules_accepted_at)}` : 'Chưa ghi nhận'}
							{data.rules_version && <span className={styles.meta}> · nội quy bản {data.rules_version}</span>}
						</dd>
					</div>
				</dl>
			</section>

			<div className={styles.actions}>
				{canSensitive ? (
					<>
						<button
							type='button'
							className={cs.btnGhost}
							onClick={() =>
								setViewer({ url: registrationApplicationUrl(enrollmentId), name: `Đơn đăng ký — ${traineeName}`, isWord: true })
							}
						>
							Xem đơn
						</button>
						<button
							type='button'
							className={cs.btnPrimary}
							disabled={downloading}
							onClick={() => void download()}
						>
							<DocSvg /> {downloading ? 'Đang tạo…' : 'Tải đơn đăng ký (.docx)'}
						</button>
					</>
				) : (
					<span className={cs.hint}>
						Đơn và hồ sơ đính kèm có số CCCD — cần quyền xem dữ liệu nhạy cảm của học viên để xem / tải.
					</span>
				)}
			</div>

			{viewer && (
				<FileViewerModal
					file={viewer}
					onClose={() => setViewer(null)}
				/>
			)}
		</div>
	);
}
