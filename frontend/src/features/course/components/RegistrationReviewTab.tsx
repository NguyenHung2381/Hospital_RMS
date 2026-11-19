import { useCallback, useEffect, useState } from 'react';
import { DocSvg } from '@/assets/icons';
import { Badge, InlineLoading } from '@/shared/components';
import { FileViewerModal } from '@/shared/components/FileViewerModal';
import { usePermission } from '@/shared/hooks/usePermission';
import { formatDateTimeVN, formatDateVN } from '@/shared/utils/formatDate';
import { fileSlug, saveBlob } from '@/shared/utils/saveBlob';
import { showToast } from '@/shared/utils/feedback';
import { cx } from '@/shared/utils/cx';
import {
	CHECK_LABEL,
	GENDER_LABEL,
	REGISTRATION_FIELD_GROUPS,
	REGISTRATION_FIELD_LABELS,
	downloadRegistrationApplication,
	getEnrollmentRegistration,
	registrationApplicationUrl,
	setRegistrationChecks,
	type RegistrationCheckKey,
	type RegistrationReview,
} from '../api/registrationApi';
import styles from './RegistrationReviewTab.module.css';
import cs from '../pages/Courses.module.css';

const DATE_KEYS = new Set(['dob', 'national_id_issued_date']);

/** Giá trị hiển thị của 1 trường bản khai (ngày dd/mm/yyyy, giới tính, tên danh mục). */
const show = (r: RegistrationReview, key: string, value: unknown): string => {
	if (value === null || value === undefined || value === '') return '';
	if (key === 'department_id') return r.department_name ?? String(value);
	if (key === 'trainee_type_id') return r.trainee_type_name ?? String(value);
	if (key === 'gender') return GENDER_LABEL[String(value)] ?? String(value);
	if (DATE_KEYS.has(key)) return formatDateVN(String(value));
	return String(value);
};

/** Mốc đối chiếu hiện theo đối tượng: ngoại viện CCCD + văn bằng; nội viện tờ trình. */
const checkKeysFor = (r: RegistrationReview): RegistrationCheckKey[] =>
	r.source === 'internal' ? ['proposal_checked'] : ['id_checked', 'degree_checked'];

// Tab "Đơn đăng ký" của hồ sơ ghi danh: dữ liệu người đăng ký đã khai (nhóm như trên form),
// chỗ lệch với hồ sơ học viên, 3 mốc đối chiếu (lưu ngay khi đánh dấu), hồ sơ PDF nộp bổ sung,
// Đơn đăng ký (.docx). Đủ mốc mới duyệt được (backend chặn — TRAINING_REGISTRATION_REQUIRE_CHECKS).
export function RegistrationReviewTab({
	enrollmentId,
	traineeName,
	onChanged,
}: {
	enrollmentId: string;
	traineeName: string;
	/** Gọi sau khi đổi mốc đối chiếu — nạp lại danh sách để cập nhật "sẵn sàng duyệt". */
	onChanged: () => void;
}) {
	const perm = usePermission();
	const canEdit = perm.has('courses:update');
	const canSensitive = perm.has('trainees:read_sensitive');
	const [data, setData] = useState<RegistrationReview | null>(null);
	const [loadError, setLoadError] = useState('');
	const [saving, setSaving] = useState<RegistrationCheckKey | null>(null);
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

	const toggle = async (key: RegistrationCheckKey, value: boolean) => {
		setSaving(key);
		try {
			setData(await setRegistrationChecks(enrollmentId, { [key]: value }));
			showToast('success', value ? `${CHECK_LABEL[key]} — đã lưu` : 'Đã bỏ mốc đối chiếu');
			onChanged();
		} catch (err) {
			showToast('error', err instanceof Error ? err.message : 'Không lưu được mốc đối chiếu');
		} finally {
			setSaving(null);
		}
	};

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
	const blocked = data.require_checks && data.missing.length > 0;

	return (
		<div className={styles.wrap}>
			<div className={styles.headLine}>
				<span>
					Mã đăng ký <span className={styles.code}>{data.registration_code}</span>
				</span>
				<Badge tone={data.source === 'internal' ? 'teal' : 'blue'}>{data.source === 'internal' ? 'Nội viện' : 'Ngoại viện'}</Badge>
				{data.created_at && <span>Gửi lúc {formatDateTimeVN(data.created_at)}</span>}
				{data.channel === 'portal' && <span>Qua cổng nhân viên</span>}
			</div>

			{!data.require_checks ? (
				<div className={styles.note}>Cấu hình hệ thống đang tắt yêu cầu đối chiếu trước khi duyệt — các mốc dưới đây chỉ để theo dõi.</div>
			) : blocked ? (
				<div className={cx(styles.note, styles.noteWarn)}>Chưa duyệt được — còn thiếu: {data.missing.join(', ')}.</div>
			) : (
				<div className={cx(styles.note, styles.noteOk)}>Đã đủ điều kiện duyệt.</div>
			)}

			<section className={styles.section}>
				<h3 className={styles.sectionTitle}>Đối chiếu giấy tờ</h3>
				<div className={styles.checks}>
					{checkKeysFor(data).map((key) => {
						const info = data.checks[key];
						return (
							<div
								key={key}
								className={styles.checkRow}
							>
								<label className={styles.checkLabel}>
									<input
										type='checkbox'
										checked={!!info}
										disabled={!canEdit || saving !== null}
										onChange={(e) => void toggle(key, e.target.checked)}
									/>
									{CHECK_LABEL[key]}
								</label>
								<span className={styles.checkMeta}>
									{saving === key
										? 'Đang lưu…'
										: info
											? `${info.by_name ?? info.by ?? 'Không rõ người đánh dấu'} · ${formatDateTimeVN(info.at)}`
											: 'Chưa đối chiếu'}
								</span>
							</div>
						);
					})}
					{(data.source === 'internal' || data.dossier) && (
						<div className={styles.checkRow}>
							<span className={styles.checkLabel}>Hồ sơ nộp bổ sung (đơn + tờ trình đã duyệt):</span>
							{data.dossier ? (
								<>
									<span className={styles.checkMeta}>
										{data.dossier.file_name}
										{data.dossier.uploaded_at && ` · nộp ${formatDateTimeVN(data.dossier.uploaded_at)}`}
									</span>
									{data.dossier.file_url && (
										<button
											type='button'
											className={cs.linkBtn}
											onClick={() =>
												setViewer({ url: data.dossier!.file_url!, name: data.dossier!.file_name, isWord: false })
											}
										>
											Xem PDF
										</button>
									)}
								</>
							) : (
								<span className={styles.checkMeta}>Người đăng ký chưa nộp</span>
							)}
						</div>
					)}
				</div>
				{!canEdit && <div className={cs.hint}>Cần quyền sửa khóa học để đánh dấu đối chiếu.</div>}
				{canEdit && <div className={cs.hint}>Mỗi mốc được lưu ngay khi đánh dấu — không cần bấm "Lưu hồ sơ".</div>}
			</section>

			{data.diffs.length > 0 && (
				<div className={cx(styles.note, styles.noteWarn)}>
					{data.diffs.length} trường khác với hồ sơ học viên đang lưu (tô màu bên dưới). Đối chiếu giấy tờ rồi sửa hồ sơ học viên nếu cần —
					hệ thống không tự ghi đè hồ sơ bằng dữ liệu form.
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
							{data.email_verified_at && <span className={styles.checkMeta}> · {formatDateTimeVN(data.email_verified_at)}</span>}
						</dd>
					</div>
					<div className={styles.field}>
						<dt>Cam kết nội quy / thông tin đúng sự thật</dt>
						<dd>
							{data.rules_accepted_at ? `Đã cam kết ${formatDateTimeVN(data.rules_accepted_at)}` : 'Chưa ghi nhận'}
							{data.rules_version && <span className={styles.checkMeta}> · nội quy bản {data.rules_version}</span>}
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
					<span className={cs.hint}>Đơn và hồ sơ PDF có số CCCD — cần quyền xem dữ liệu nhạy cảm của học viên để xem / tải.</span>
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
