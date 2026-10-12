import { useState } from 'react';
import { CheckSvg, DownloadSvg, InfoSvg, UploadSvg } from '@/assets/icons';
import { Badge, FileDropzone, Modal } from '@/shared/components';
import { downloadParticipantImportTemplate, importParticipantsExcel } from '../api/seminarApi';
import { saveBlob } from '../utils/saveBlob';
import {
	PARTICIPATION_LABELS,
	SOURCE_LABELS,
	type ParticipantImportResult,
	type ParticipationType,
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
	defaultCredits,
	onClose,
	onDone,
}: {
	seminarId: string;
	grantsCme: boolean;
	eventYear: number | null;
	defaultCredits: number | null;
	onClose: () => void;
	onDone: () => void;
}) {
	const [file, setFile] = useState<File | null>(null);
	const [issueCme, setIssueCme] = useState(grantsCme);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const [preview, setPreview] = useState<ParticipantImportResult | null>(null);
	const [result, setResult] = useState<ParticipantImportResult | null>(null);
	const [downloading, setDownloading] = useState(false);
	// Số tín chỉ (chuỗi đang gõ) cho các dòng để trống cột "Số tín chỉ", theo vai trò
	const [roleCredits, setRoleCredits] = useState<Partial<Record<ParticipationType, string>>>({});

	const runDryRun = async (f: File, issue: boolean) => {
		setLoading(true);
		setError('');
		setPreview(null);
		try {
			const res = await importParticipantsExcel(seminarId, f, true, issue);
			setPreview(res);
			// Điền sẵn tín chỉ mặc định của hội thảo cho vai trò mới xuất hiện (giữ số đã sửa)
			setRoleCredits((prev) => {
				const next = { ...prev };
				for (const r of res.rows ?? []) {
					if (r.cme_credits == null && next[r.participation_type] === undefined) {
						next[r.participation_type] = defaultCredits != null ? String(defaultCredits) : '';
					}
				}
				return next;
			});
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
		else {
			setPreview(null);
			setError('');
		}
	};

	const downloadTemplate = async () => {
		setDownloading(true);
		try {
			saveBlob(await downloadParticipantImportTemplate(), 'mau-nhap-nguoi-tham-du.xlsx');
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Tải file mẫu thất bại');
		} finally {
			setDownloading(false);
		}
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
			const res = await importParticipantsExcel(
				seminarId,
				file,
				false,
				issueCme,
				creditsPayload,
			);
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

	const parseCredit = (v: string | undefined) => {
		const n = Number(String(v ?? '').replace(',', '.').trim());
		return v != null && v.trim() !== '' && Number.isFinite(n) && n >= 0 && n < 1000 ? n : null;
	};
	// Vai trò có dòng để trống tín chỉ trong file → cần nhập mặc định
	const blankByRole = rows.reduce<Partial<Record<ParticipationType, number>>>((acc, r) => {
		if (r.cme_credits == null) acc[r.participation_type] = (acc[r.participation_type] ?? 0) + 1;
		return acc;
	}, {});
	const blankRoles = Object.keys(blankByRole) as ParticipationType[];
	const creditsPayload = Object.fromEntries(
		blankRoles
			.map((role) => [role, parseCredit(roleCredits[role])] as const)
			.filter(([, n]) => n != null),
	) as Partial<Record<ParticipationType, number>>;
	const invalidCredit = blankRoles.some(
		(role) => (roleCredits[role] ?? '').trim() !== '' && parseCredit(roleCredits[role]) == null,
	);
	const effectiveCredits = (r: (typeof rows)[number]) =>
		r.cme_credits ?? creditsPayload[r.participation_type] ?? null;
	const withCredits = rows.filter((r) => effectiveCredits(r) != null).length;

	return (
		<Modal
			open
			onClose={onClose}
			icon={<UploadSvg />}
			title='Nhập người tham dự từ Excel'
			subtitle='Tự dò tiêu đề cột — mẫu "Danh sách cấp CME nội/ngoại viện"'
			className={styles.modal}
			bodyClassName={styles.modalBody}
			footer={
				<>
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
							disabled={loading || !preview || rows.length === 0 || invalidCredit}
						>
							{loading ? <span className={styles.spinner} /> : <UploadSvg />}
							Nhập {rows.length || ''} người
						</button>
					)}
				</>
			}
		>
			{!result && (
				<>
					<div className={styles.noticeBox}>
						<InfoSvg />
						<span>
							Cột nhận diện: <b>Họ và tên</b> (bắt buộc), SQĐ, Ông/Bà, Ngày
							sinh, Giới tính, Đơn vị công tác, Khoa/phòng, MNV, TĐCM, Số tín
							chỉ (chấp nhận "3,5"), Vai trò, Ghi chú. Cán bộ nội viện tự khớp
							theo MNV rồi họ tên; không khớp được sẽ lưu dạng ngoại viện.
							Mỗi người có thể có <b>số tín chỉ riêng</b> — ô để trống sẽ lấy
							mặc định theo vai trò bên dưới.
						</span>
					</div>

					<button
						type='button'
						className={styles.btnGhost}
						onClick={downloadTemplate}
						disabled={downloading}
						style={{ marginBottom: 12 }}
					>
						{downloading ? <span className={styles.spinner} /> : <DownloadSvg />}
						Tải file mẫu
					</button>

					<div className={styles.formGroup}>
						<label className={styles.formLabel}>File Excel (.xlsx)</label>
						<FileDropzone
							value={file}
							onChange={onPickFile}
							accept='.xlsx'
							disabled={loading}
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
									· {withCredits}/{s.total} người có số tín chỉ.
								</span>
							</div>

							{blankRoles.length > 0 && (
								<div className={styles.creditsBox}>
									<div className={styles.creditsTitle}>
										Số tín chỉ cho người để trống cột "Số tín chỉ"
									</div>
									<div className={styles.creditsGrid}>
										{blankRoles.map((role) => {
											const v = roleCredits[role] ?? '';
											const bad = v.trim() !== '' && parseCredit(v) == null;
											return (
												<label
													key={role}
													className={styles.creditsItem}
												>
													<span>
														{PARTICIPATION_LABELS[role]}{' '}
														<span className={styles.muted}>({blankByRole[role]} người)</span>
													</span>
													<input
														className={`${styles.formInput} ${bad ? styles.inputError : ''}`}
														inputMode='decimal'
														placeholder='Để trống'
														value={v}
														onChange={(e) =>
															setRoleCredits((m) => ({ ...m, [role]: e.target.value }))
														}
													/>
												</label>
											);
										})}
									</div>
									<div className={styles.modalSub}>
										Người đã có số tín chỉ trong file giữ nguyên số của mình. Để trống = chưa
										ghi tín chỉ{issueCme && defaultCredits != null
											? ` (khi cấp CME sẽ lấy mặc định của hội thảo: ${defaultCredits})`
											: ''}
										.
									</div>
									{invalidCredit && (
										<div className={styles.fieldError}>
											Số tín chỉ phải là số ≥ 0 (VD: 3 hoặc 3,5).
										</div>
									)}
								</div>
							)}

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
													{r.cme_credits != null ? (
														r.cme_credits
													) : effectiveCredits(r) != null ? (
														<span title='Mặc định theo vai trò'>
															{effectiveCredits(r)}{' '}
															<span className={styles.muted}>(mặc định)</span>
														</span>
													) : (
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
		</Modal>
	);
}
