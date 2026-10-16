import { useState } from 'react';
import { CheckSvg, DownloadSvg, InfoSvg, UploadSvg } from '@/assets/icons';
import { Badge, FileDropzone, Modal } from '@/shared/components';
import { downloadSeminarImportTemplate, importSeminarsExcel } from '../api/seminarApi';
import {
	EVENT_TYPE_LABELS,
	type SeminarListImportResult,
	type SeminarListImportRow,
} from '../types/seminar.type';
import { saveBlob } from '@/shared/utils/saveBlob';
import styles from '../pages/Seminar.module.css';
import tbl from '@/shared/components/Table/Table.module.css';
import { useClientPaging } from '@/shared/hooks/useClientPaging';
import { Pagination } from '@/shared/components/Table/Pagination';

const fmtDate = (s: string | null) => {
	if (!s) return '';
	const [y, m, d] = s.split('-');
	return d ? `${d}/${m}/${y}` : s;
};

const fmtTime = (r: SeminarListImportRow) => {
	if (r.start_date) {
		return r.end_date && r.end_date !== r.start_date
			? `${fmtDate(r.start_date)} – ${fmtDate(r.end_date)}`
			: fmtDate(r.start_date);
	}
	return r.date_text || (r.event_year ? String(r.event_year) : '—');
};

// Nhập DANH SÁCH hội thảo/hội nghị từ Excel: chọn file → dry-run xem trước
// (dòng lỗi / trùng bị bỏ qua) → xác nhận nhập các dòng hợp lệ.
export function SeminarListImportModal({
	onClose,
	onDone,
}: {
	onClose: () => void;
	onDone: () => void;
}) {
	const [file, setFile] = useState<File | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const [preview, setPreview] = useState<SeminarListImportResult | null>(null);
	const [result, setResult] = useState<SeminarListImportResult | null>(null);
	const [downloading, setDownloading] = useState(false);

	const onPickFile = async (f: File | null) => {
		setFile(f);
		setResult(null);
		setPreview(null);
		setError('');
		if (!f) return;
		setLoading(true);
		try {
			setPreview(await importSeminarsExcel(f, true));
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Đọc file thất bại');
		} finally {
			setLoading(false);
		}
	};

	const commit = async () => {
		if (!file) return;
		setLoading(true);
		setError('');
		try {
			setResult(await importSeminarsExcel(file, false));
			onDone();
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Nhập danh sách thất bại');
		} finally {
			setLoading(false);
		}
	};

	const downloadTemplate = async () => {
		setDownloading(true);
		try {
			saveBlob(await downloadSeminarImportTemplate(), 'mau-nhap-hoi-thao.xlsx');
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Tải file mẫu thất bại');
		} finally {
			setDownloading(false);
		}
	};

	const rows = preview?.rows ?? [];
	const pg = useClientPaging(rows);
	const s = preview?.summary;

	return (
		<Modal
			open
			onClose={onClose}
			icon={<UploadSvg />}
			title='Nhập hội thảo / hội nghị từ Excel'
			subtitle='Dùng file mẫu hoặc file "Xuất Excel" của hệ thống — tự dò tiêu đề cột'
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
							disabled={loading || !s || s.importable === 0}
						>
							{loading ? <span className={styles.spinner} /> : <UploadSvg />}
							Nhập {s?.importable || ''} sự kiện
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
							Cột bắt buộc: <b>Tên hội thảo/hội nghị</b>. Các cột khác: Hình thức, Phạm vi,
							Ngày bắt đầu/kết thúc (dd/mm/yyyy), Năm, Địa điểm, Chủ trì, Báo cáo viên, Cấp
							CME (Có/Không), Số tín chỉ, số người dự… Dòng <b>trùng tên + năm</b> với dữ liệu
							đã có hoặc <b>có lỗi</b> sẽ bị bỏ qua.
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

					{loading && (
						<div
							className={styles.modalSub}
							style={{ marginTop: 10 }}
						>
							<span className={styles.spinner} /> Đang đọc file…
						</div>
					)}
					{error && <div className={styles.fieldError}>{error}</div>}

					{s && (
						<>
							<div
								className={`${styles.noticeBox} ${s.importable > 0 ? styles.noticeOk : styles.noticeWarn}`}
								style={{ marginTop: 12 }}
							>
								<CheckSvg />
								<span>
									Đọc được <b>{s.total}</b> dòng · <b>{s.importable}</b> sẽ được nhập
									{s.duplicates > 0 && <> · {s.duplicates} trùng</>}
									{s.invalid > 0 && <> · {s.invalid} có lỗi</>}
								</span>
							</div>

							<div className={styles.importPreview}>
								<table className={styles.table}>
									<thead>
										<tr>
											<th className={tbl.thIdx}>Dòng</th>
											<th>Tên hội thảo / hội nghị</th>
											<th>Hình thức</th>
											<th>Thời gian</th>
											<th>Địa điểm</th>
											<th>CME</th>
											<th>Trạng thái</th>
										</tr>
									</thead>
									<tbody>
										{pg.paged.map((r) => {
											const bad = r.errors.length > 0;
											return (
												<tr
													key={r.row}
													style={bad || r.duplicate ? { opacity: 0.65 } : undefined}
												>
													<td className={styles.tdIdx}>{r.row}</td>
													<td>
														<span className={tbl.cellTitle}>{r.title}</span>
														{[...r.errors, ...r.warnings].map((w, j) => (
															<div
																key={j}
																className={styles.rowWarn}
															>
																{w}
															</div>
														))}
													</td>
													<td>{EVENT_TYPE_LABELS[r.event_type]}</td>
													<td>{fmtTime(r)}</td>
													<td>{r.location || <span className={styles.muted}>—</span>}</td>
													<td>
														{r.grants_cme ? (
															`Có${r.cme_default_credits != null ? ` · ${r.cme_default_credits} TC` : ''}`
														) : (
															<span className={styles.muted}>—</span>
														)}
													</td>
													<td>
														{bad ? (
															<Badge tone='red'>Lỗi</Badge>
														) : r.duplicate ? (
															<Badge tone='amber'>Trùng</Badge>
														) : (
															<Badge tone='green'>Hợp lệ</Badge>
														)}
													</td>
												</tr>
											);
										})}
									</tbody>
								</table>
							</div>
							<Pagination
								{...pg.pagination}
								itemLabel='dòng'
							/>
						</>
					)}
				</>
			)}

			{result && (
				<>
					<div className={`${styles.noticeBox} ${styles.noticeOk}`}>
						<CheckSvg />
						<span>
							Đã nhập <b>{result.inserted}</b> sự kiện
							{result.summary.duplicates > 0 && <>, bỏ qua {result.summary.duplicates} dòng trùng</>}
							{result.summary.invalid > 0 && <>, {result.summary.invalid} dòng lỗi</>}.
						</span>
					</div>
					{result.failures && result.failures.length > 0 && (
						<ul className={styles.warnList}>
							{result.failures.map((w, i) => (
								<li key={i}>{w}</li>
							))}
						</ul>
					)}
				</>
			)}
		</Modal>
	);
}
