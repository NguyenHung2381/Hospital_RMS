import { useRef, useState } from 'react';
import { CheckSvg, InfoSvg, UploadSvg, XSvg } from '@/assets/icons';
import { Badge } from '@/shared/components';
import { importParticipantsExcel } from '../api/seminarApi';
import {
	PARTICIPATION_LABELS,
	SOURCE_LABELS,
	type ParticipantImportResult,
} from '../types/seminar.type';
import styles from '../pages/Seminar.module.css';

const fmtDob = (row: { dob: string | null; dob_text: string | null }) => {
	if (row.dob) {
		const d = new Date(row.dob);
		return Number.isNaN(d.getTime())
			? row.dob
			: d.toLocaleDateString('vi-VN', {
					day: '2-digit',
					month: '2-digit',
					year: 'numeric',
				});
	}
	return row.dob_text || '—';
};

// Nhập danh sách người tham dự của MỘT hội thảo từ Excel: chọn file → dry-run
// xem trước từng dòng (khớp cán bộ nội viện, nguồn, tín chỉ) → xác nhận nhập;
// tuỳ chọn cấp luôn dải số quyết định CME cho toàn bộ người vừa nhập.
export function ParticipantImportModal({
	seminarId,
	grantsCme,
	eventYear,
	onClose,
	onDone,
}: {
	seminarId: string;
	grantsCme: boolean;
	eventYear: number | null;
	onClose: () => void;
	onDone: () => void;
}) {
	const [file, setFile] = useState<File | null>(null);
	const [issueCme, setIssueCme] = useState(grantsCme);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const [preview, setPreview] = useState<ParticipantImportResult | null>(null);
	const [result, setResult] = useState<ParticipantImportResult | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const runDryRun = async (f: File, issue: boolean) => {
		setLoading(true);
		setError('');
		setPreview(null);
		try {
			setPreview(await importParticipantsExcel(seminarId, f, true, issue));
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Đọc file thất bại');
		} finally {
			setLoading(false);
		}
	};

	const onPickFile = (f: File | null) => {
		setFile(f);
		setResult(null);
		if (f) runDryRun(f, issueCme);
	};

	const onToggleIssue = (next: boolean) => {
		setIssueCme(next);
		setResult(null);
		if (file) runDryRun(file, next);
	};

	const commit = async () => {
		if (!file) return;
		setLoading(true);
		setError('');
		try {
			const res = await importParticipantsExcel(seminarId, file, false, issueCme);
			setResult(res);
			onDone();
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Nhập danh sách thất bại');
		} finally {
			setLoading(false);
		}
	};

	const rows = preview?.rows ?? [];
	const s = preview?.summary;

	return (
		<div
			className={styles.modalBackdrop}
			onClick={(e) => e.target === e.currentTarget && onClose()}
		>
			<div className={styles.modal}>
				<div className={styles.modalHeader}>
					<UploadSvg />
					<div>
						<div className={styles.modalTitle}>Nhập người tham dự từ Excel</div>
						<div className={styles.modalSub}>
							Tự dò tiêu đề cột — mẫu "Danh sách cấp CME nội/ngoại viện"
						</div>
					</div>
					<button className={styles.modalClose} onClick={onClose}>
						<XSvg />
					</button>
				</div>

				<div className={styles.modalBody}>
					{!result && (
						<>
							<div className={styles.noticeBox}>
								<InfoSvg />
								<span>
									Cột nhận diện: <b>Họ và tên</b> (bắt buộc), SQĐ, Ông/Bà, Ngày
									sinh, Giới tính, Đơn vị công tác, Khoa/phòng, MNV, TĐCM, Số tín
									chỉ (chấp nhận "3,5"), Vai trò, Ghi chú. Cán bộ nội viện tự khớp
									theo MNV rồi họ tên; không khớp được sẽ lưu dạng ngoại viện.
								</span>
							</div>

							<div className={styles.formGroup}>
								<label className={styles.formLabel}>File Excel (.xlsx)</label>
								<input
									ref={fileInputRef}
									type='file'
									accept='.xlsx'
									className={styles.formInput}
									onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
								/>
							</div>

							{grantsCme && (
								<label
									className={styles.checkFilter}
									style={{ marginTop: 10 }}
								>
									<input
										type='checkbox'
										checked={issueCme}
										onChange={(e) => onToggleIssue(e.target.checked)}
									/>
									Cấp số quyết định CME ngay sau khi nhập
									{issueCme && !eventYear && (
										<span className={styles.rowWarn} style={{ marginLeft: 6 }}>
											(cần đặt "Năm sự kiện" cho hội nghị)
										</span>
									)}
								</label>
							)}

							{loading && (
								<div className={styles.modalSub} style={{ marginTop: 10 }}>
									<span className={styles.spinner} /> Đang đọc file…
								</div>
							)}
							{error && <div className={styles.fieldError}>{error}</div>}

							{s && (
								<>
									<div
										className={`${styles.noticeBox} ${styles.noticeOk}`}
										style={{ marginTop: 12 }}
									>
										<CheckSvg />
										<span>
											Đọc được <b>{s.total}</b> người · {s.matched} khớp cán bộ
											nội viện · {s.internal} nội viện · {s.external} ngoại viện
											· {s.with_credits} dòng có số tín chỉ.
										</span>
									</div>

									{preview!.warnings.length > 0 && (
										<ul className={styles.warnList}>
											{preview!.warnings.slice(0, 50).map((w, i) => (
												<li key={i}>{w}</li>
											))}
											{preview!.warnings.length > 50 && (
												<li>…và {preview!.warnings.length - 50} cảnh báo khác</li>
											)}
										</ul>
									)}

									<div className={styles.importPreview}>
										<table className={styles.table}>
											<thead>
												<tr>
													<th>#</th>
													<th>Họ tên</th>
													<th>Vai trò</th>
													<th>Nguồn</th>
													<th>Đơn vị / Khoa</th>
													<th>Ngày sinh</th>
													<th>Tín chỉ</th>
												</tr>
											</thead>
											<tbody>
												{rows.map((r, i) => (
													<tr key={r.row}>
														<td className={styles.tdIdx}>{i + 1}</td>
														<td>
															{r.title_prefix ? `${r.title_prefix} ` : ''}
															{r.full_name}
															{r.is_foreign && (
																<Badge
																	tone='amber'
																	style={{ marginLeft: 6 }}
																>
																	NN
																</Badge>
															)}
															{r.matched_user && (
																<Badge
																	tone='green'
																	style={{ marginLeft: 6 }}
																	title={r.matched_user.department_name || ''}
																>
																	đã khớp
																</Badge>
															)}
															{r.warnings.map((w, j) => (
																<div key={j} className={styles.rowWarn}>
																	{w}
																</div>
															))}
														</td>
														<td>
															{PARTICIPATION_LABELS[r.participation_type]}
														</td>
														<td>{SOURCE_LABELS[r.source]}</td>
														<td>
															{r.organization ||
																r.department_raw ||
																(r.matched_user?.department_name ?? (
																	<span className={styles.muted}>—</span>
																))}
														</td>
														<td>{fmtDob(r)}</td>
														<td>
															{r.cme_credits ?? (
																<span className={styles.muted}>—</span>
															)}
														</td>
													</tr>
												))}
											</tbody>
										</table>
									</div>
								</>
							)}
						</>
					)}

					{result && (
						<>
							<div className={`${styles.noticeBox} ${styles.noticeOk}`}>
								<CheckSvg />
								<span>
									Đã nhập <b>{result.inserted}</b> người
									{result.cme_issued ? (
										<>
											{' '}
											và cấp <b>{result.cme_issued}</b> số CME (
											<span className={styles.mono}>
												{String(result.cme_from).padStart(4, '0')}–
												{String(result.cme_to).padStart(4, '0')}
											</span>{' '}
											/ {result.cme_year}).
										</>
									) : (
										'.'
									)}
								</span>
							</div>
							{result.warnings.length > 0 && (
								<ul className={styles.warnList}>
									{result.warnings.slice(0, 50).map((w, i) => (
										<li key={i}>{w}</li>
									))}
								</ul>
							)}
						</>
					)}
				</div>

				<div className={styles.modalFooter}>
					<button
						className={styles.btnCancel}
						onClick={onClose}
						disabled={loading}
					>
						{result ? 'Đóng' : 'Huỷ'}
					</button>
					{!result && (
						<button
							className={styles.btnPrimary}
							onClick={commit}
							disabled={loading || !preview || rows.length === 0}
						>
							{loading ? <span className={styles.spinner} /> : <UploadSvg />}
							Nhập {rows.length || ''} người
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
