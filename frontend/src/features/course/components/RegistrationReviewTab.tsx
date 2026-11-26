import { useCallback, useEffect, useState } from 'react';
import { DocSvg } from '@/assets/icons';
import { Badge, FileCheckNote, InlineLoading } from '@/shared/components';
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
	downloadRegistrationConsent,
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

// signed_at trong bản ghi xác nhận là ISO giờ UTC thật ⇒ đổi sang giờ Việt Nam
const formatRealTime = (iso: string): string => {
	const d = new Date(iso);
	return Number.isNaN(d.getTime())
		? ''
		: d.toLocaleString('vi-VN', {
				timeZone: 'Asia/Ho_Chi_Minh',
				day: '2-digit',
				month: '2-digit',
				year: 'numeric',
				hour: '2-digit',
				minute: '2-digit',
				second: '2-digit',
				hour12: false,
			});
};

/** Giá trị trước / sau của 1 lần sửa (ngày dd/mm/yyyy, giới tính; trường bổ sung nhiều lựa chọn) */
const showChange = (key: string, value: unknown): string => {
	if (value === null || value === undefined || value === '') return '';
	if (Array.isArray(value)) return value.join(', ');
	if (typeof value === 'object') return JSON.stringify(value);
	if (key === 'gender') return GENDER_LABEL[String(value)] ?? String(value);
	if (DATE_KEYS.has(key)) return formatDateVN(String(value));
	return String(value);
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

	const downloadConsent = async (seq?: number) => {
		try {
			saveBlob(
				await downloadRegistrationConsent(enrollmentId, seq),
				seq ? `xac-nhan-sua-lan-${seq}_${data.registration_code}.json` : `xac-nhan-dien-tu_${data.registration_code}.json`,
			);
		} catch (err) {
			showToast('error', err instanceof Error ? err.message : 'Không tải được bản ghi xác nhận');
		}
	};

	const diffs = new Map(data.diffs.map((d) => [d.key, d]));
	const consent = data.consent;
	const amendments = data.amendments ?? [];
	const identityAmended = amendments.some((a) => a.identity_changed);
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
				{amendments.length > 0 && (
					<Badge tone={identityAmended ? 'amber' : 'blue'}>Người đăng ký đã sửa {amendments.length} lần</Badge>
				)}
			</div>

			{amendments.length > 0 && (
				<section className={styles.section}>
					<h3 className={styles.sectionTitle}>Lịch sử sửa của người đăng ký</h3>
					<div className={cx(styles.note, identityAmended && styles.noteWarn)}>
						Thông tin bên dưới là bản mới nhất. Hồ sơ học viên không tự đổi theo bản sửa — đối chiếu mục lệch rồi cập nhật hồ sơ nếu
						cần.
						{identityAmended &&
							' Có lần sửa thông tin định danh (họ tên, ngày sinh, giới tính hoặc số CCCD): đối chiếu lại với giấy tờ trước khi duyệt.'}
					</div>
					<ol className={styles.amendList}>
						{amendments.map((a) => (
							<li
								key={a.seq}
								className={styles.amendItem}
							>
								<div className={styles.amendHead}>
									<strong>Lần {a.seq}</strong>
									{a.created_at && <span className={styles.meta}>{formatStamp(a.created_at)}</span>}
									<span className={styles.meta}>ký: {a.signature_name}</span>
									{a.identity_changed && <Badge tone='amber'>Sửa định danh</Badge>}
									{a.intact && a.chained ? (
										<Badge tone='green'>Nguyên vẹn</Badge>
									) : (
										<Badge tone='red'>{a.intact ? 'Chuỗi lịch sử bị đứt' : 'Bản ghi đã bị sửa'}</Badge>
									)}
									{canSensitive && (
										<button
											type='button'
											className={styles.linkBtn}
											onClick={() => void downloadConsent(a.seq)}
										>
											Tải bản ghi (.json)
										</button>
									)}
								</div>
								<p className={styles.amendReason}>Lý do: {a.reason}</p>
								<table className={styles.amendTable}>
									<thead>
										<tr>
											<th scope='col'>Mục</th>
											<th scope='col'>Trước</th>
											<th scope='col'>Sau</th>
										</tr>
									</thead>
									<tbody>
										{a.changes.map((c) => (
											<tr key={c.key}>
												<th scope='row'>
													{c.key.startsWith('custom.')
														? `Trường bổ sung: ${c.key.slice(7)}`
														: (REGISTRATION_FIELD_LABELS[c.key] ?? c.key)}
												</th>
												<td>{showChange(c.key, c.before) || <span className={styles.empty}>(trống)</span>}</td>
												<td>{showChange(c.key, c.after) || <span className={styles.empty}>(trống)</span>}</td>
											</tr>
										))}
									</tbody>
								</table>
								{(a.ip || a.user_agent) && (
									<p className={styles.meta}>
										Gửi từ {a.ip ?? '—'}
										{a.user_agent ? ` · ${a.user_agent}` : ''}
									</p>
								)}
							</li>
						))}
					</ol>
				</section>
			)}

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
							{f.uploaded_at && <FileCheckNote check={f.check} />}
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
					{consent && (
						<>
							<div className={styles.field}>
								<dt>Ký xác nhận điện tử</dt>
								<dd>
									<strong>{consent.signature_name}</strong>
									{consent.signed_at && <span className={styles.meta}> · {formatRealTime(consent.signed_at)}</span>}
									{consent.consent_version && <span className={styles.meta}> · mẫu cam kết {consent.consent_version}</span>}
								</dd>
							</div>
							<div className={styles.field}>
								<dt>Đồng ý xử lý dữ liệu cá nhân</dt>
								<dd>{consent.data_consent_at ? `Đã đồng ý ${formatStamp(consent.data_consent_at)}` : 'Chưa ghi nhận'}</dd>
							</div>
							{(consent.ip || consent.user_agent) && (
								<div className={styles.field}>
									<dt>Gửi từ</dt>
									<dd>
										{consent.ip ?? '—'}
										{consent.user_agent && <span className={styles.meta}> · {consent.user_agent}</span>}
									</dd>
								</div>
							)}
							<div className={styles.field}>
								<dt>Mã xác nhận (SHA-256)</dt>
								<dd>
									<span className={styles.hash}>{consent.hash}</span>{' '}
									{consent.intact ? (
										<Badge tone='green'>Nguyên vẹn</Badge>
									) : (
										<Badge tone='red'>Bản ghi đã bị sửa</Badge>
									)}
								</dd>
							</div>
						</>
					)}
				</dl>
				{consent && consent.commitments.length > 0 && (
					<ol className={styles.commitments}>
						{consent.commitments.map((c, i) => (
							<li key={i}>{c}</li>
						))}
					</ol>
				)}
				{consent && (
					<p className={styles.meta}>
						Mã xác nhận cũng in trong thư xác nhận gửi người đăng ký — đối chiếu để chứng minh bản ghi không bị sửa.
					</p>
				)}
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
						{consent && (
							<button
								type='button'
								className={cs.btnGhost}
								onClick={() => void downloadConsent()}
							>
								Tải bản ghi xác nhận (.json)
							</button>
						)}
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
