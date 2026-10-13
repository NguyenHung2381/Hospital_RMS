import { FormField } from '@/shared/components/Input/FormField';
import { useState } from 'react';
import { CheckSvg, InfoSvg, UploadSvg } from '@/assets/icons';
import { FileDropzone, Modal } from '@/shared/components';
import { InlineLoading } from '@/shared/components/Loading';
import { importTraineesExcel } from '../api/traineeApi';
import type { TraineeImportResult } from '../types/trainee.type';
import styles from '../pages/Trainees.module.css';
import tbl from '@/shared/components/Table/Table.module.css';
import { useClientPaging } from '@/shared/hooks/useClientPaging';
import { Pagination } from '@/shared/components/Table/Pagination';

// Nhập học viên hàng loạt từ Excel: chọn file → dry-run xem trước từng dòng
// (khớp đối tượng học viên/khoa phòng) → xác nhận nhập. Mirror
// ParticipantImportModal.tsx (seminar) — cùng cơ chế dry_run/commit ở backend.
export function TraineeImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
	const [file, setFile] = useState<File | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const [preview, setPreview] = useState<TraineeImportResult | null>(null);
	const [result, setResult] = useState<TraineeImportResult | null>(null);

	const runDryRun = async (f: File) => {
		setLoading(true);
		setError('');
		setPreview(null);
		try {
			setPreview(await importTraineesExcel(f, true));
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Đọc file thất bại');
		} finally {
			setLoading(false);
		}
	};

	const onPickFile = (f: File | null) => {
		setFile(f);
		setResult(null);
		if (f) runDryRun(f);
	};

	const commit = async () => {
		if (!file) return;
		setLoading(true);
		setError('');
		try {
			const res = await importTraineesExcel(file, false);
			setResult(res);
			onDone();
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Nhập danh sách thất bại');
		} finally {
			setLoading(false);
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
			title='Nhập học viên từ Excel'
			subtitle='Tự dò tiêu đề cột'
			className={styles.modal}
			bodyClassName={styles.modalBody}
			footer={
				<>
					<button className={styles.btnCancel} onClick={onClose} disabled={loading}>
						{result ? 'Đóng' : 'Huỷ'}
					</button>
					{!result && (
						<button className={styles.btnConfirm} onClick={commit} disabled={loading || !preview || rows.length === 0}>
							{loading ? <span className={styles.spinner} /> : <UploadSvg />}
							Nhập {rows.length || ''} học viên
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
							Cột nhận diện: <b>Họ và tên</b> (bắt buộc), Ngày sinh, Giới tính, CCCD, SĐT, Email,
							Địa chỉ, Đối tượng học viên, Khoa/phòng, Trình độ, Trường đào tạo, Năm tốt nghiệp,
							Ghi chú. Đối tượng/khoa phòng không khớp tên sẽ để trống.
						</span>
					</div>

					<FormField label='File Excel (.xlsx)'>
						<FileDropzone
							value={file}
							onChange={onPickFile}
							accept='.xlsx'
							disabled={loading}
						/>
					</FormField>

					{loading && <InlineLoading label='Đang đọc file…' />}
					{error && <div className={styles.fieldError}>{error}</div>}

					{s && (
						<>
							<div className={`${styles.noticeBox} ${styles.noticeOk}`} style={{ marginTop: 12 }}>
								<CheckSvg />
								<span>
									Đọc được <b>{s.total}</b> học viên · {s.matched_type} khớp đối tượng ·{' '}
									{s.matched_department} khớp khoa/phòng.
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
											<th className={tbl.thIdx}>STT</th>
											<th>Họ tên</th>
											<th>Đối tượng</th>
											<th>Khoa/phòng</th>
											<th>SĐT</th>
											<th>Email</th>
										</tr>
									</thead>
									<tbody>
										{pg.paged.map((r, i) => (
											<tr key={r.row}>
												<td className={styles.tdIdx}>{pg.offset + i + 1}</td>
												<td>
													<span className={tbl.cellTitle}>{r.full_name}</span>
													{r.warnings.map((w, j) => (
														<div key={j} className={styles.rowWarn}>
															{w}
														</div>
													))}
												</td>
												<td>{r.trainee_type_raw || '—'}</td>
												<td>{r.department_raw || '—'}</td>
												<td>{r.phone || '—'}</td>
												<td>{r.email || '—'}</td>
											</tr>
										))}
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
							Đã nhập <b>{result.inserted}</b> học viên.
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
