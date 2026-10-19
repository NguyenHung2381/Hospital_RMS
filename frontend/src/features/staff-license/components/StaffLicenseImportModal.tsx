import { useState } from 'react';
import { CheckSvg, InfoSvg, UploadSvg } from '@/assets/icons';
import { Badge, FileDropzone, Modal } from '@/shared/components';
import { FormField } from '@/shared/components/Input/FormField';
import { InlineLoading } from '@/shared/components/Loading';
import { Pagination } from '@/shared/components/Table/Pagination';
import tbl from '@/shared/components/Table/Table.module.css';
import { useClientPaging } from '@/shared/hooks/useClientPaging';
import { formatDateOr } from '@/shared/utils';
import { importStaffLicensesExcel } from '../api/staffLicenseApi';
import { IMPORT_FIELD_LABELS, type LicenseImportResult } from '../types/staffLicense.type';
import styles from '../pages/StaffLicenses.module.css';

const GENDER_LABELS: Record<string, string> = { male: 'Nam', female: 'Nữ', other: 'Khác' };
const fmt = (field: string, v: string | null) =>
	field.endsWith('_date') || field === 'date_of_birth'
		? formatDateOr(v)
		: field === 'gender'
			? (GENDER_LABELS[v ?? ''] ?? v ?? '—')
			: (v ?? '—');

// Cập nhật CCHN từ file "Danh sách người hành nghề": chọn file → dry-run liệt kê
// các dòng mới/thay đổi so với hệ thống → xác nhận ghi.
export function StaffLicenseImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
	const [file, setFile] = useState<File | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const [preview, setPreview] = useState<LicenseImportResult | null>(null);
	const [result, setResult] = useState<LicenseImportResult | null>(null);

	const onPickFile = async (f: File | null) => {
		setFile(f);
		setResult(null);
		setPreview(null);
		setError('');
		if (!f) return;
		setLoading(true);
		try {
			setPreview(await importStaffLicensesExcel(f, true));
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
			setResult(await importStaffLicensesExcel(file, false));
			onDone();
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Cập nhật thất bại');
		} finally {
			setLoading(false);
		}
	};

	const rows = preview?.rows ?? [];
	const pg = useClientPaging(rows);
	const s = preview?.summary;
	const notes = [
		...(preview?.skipped ?? []).map((x) => `Dòng ${x.row} (${x.full_name}): ${x.reason} — bỏ qua`),
		...(preview?.warnings ?? []),
	];

	return (
		<Modal
			open
			onClose={onClose}
			icon={<UploadSvg />}
			title='Cập nhật CCHN từ Excel'
			subtitle='File "Danh sách người hành nghề" — khớp nhân sự theo MNV'
			className={`${styles.modal} ${styles.modalWide}`}
			bodyClassName={styles.modalBody}
			footer={
				<>
					<button className={styles.btnCancel} onClick={onClose} disabled={loading}>
						{result ? 'Đóng' : 'Huỷ'}
					</button>
					{!result && (
						<button className={styles.btnConfirm} onClick={commit} disabled={loading || rows.length === 0}>
							{loading ? <span className={styles.spinner} /> : <UploadSvg />}
							Cập nhật {rows.length || ''} hồ sơ
						</button>
					)}
				</>
			}
		>
			{result ? (
				<>
					<div className={`${styles.noticeBox} ${styles.noticeOk}`}>
						<CheckSvg />
						<span>
							Đã cập nhật <b>{result.written}</b> hồ sơ CCHN.
						</span>
					</div>
					{result.warnings.length > 0 && (
						<ul className={styles.warnList}>
							{result.warnings.map((w, i) => (
								<li key={i}>{w}</li>
							))}
						</ul>
					)}
				</>
			) : (
				<>
					<div className={styles.noticeBox}>
						<InfoSvg />
						<span>
							Cột bắt buộc: <b>MNV</b>, <b>Số CCHN</b>. Nhận thêm: Ngày cấp, Nơi cấp (cột "Nơi cấp khác Nghệ
							An" để trống = Sở Y tế Nghệ An), Phạm vi hành nghề (ưu tiên cột "NỐI cả QĐ bổ sung", sau đó cột
							"ĐƠN"), Mã hoá phạm vi 2148, Văn bằng chuyên môn, Chuyên khoa cần cập nhật KTYK liên tục, QĐ bổ
							sung phạm vi, Điều chỉnh phạm vi, Ngày điều chỉnh, Chức danh, Ngày sinh. Cột khoa (K/P/TT) chỉ
							dùng để cảnh báo khi lệch, không đổi khoa; cột CCCD không được nhập. Ô trống trong file{' '}
							<b>không xoá</b> dữ liệu đang có; MNV chưa có trong hệ thống sẽ bị bỏ qua.
						</span>
					</div>

					<FormField label='File Excel (.xlsx)'>
						<FileDropzone value={file} onChange={onPickFile} accept='.xlsx' disabled={loading} />
					</FormField>

					{loading && <InlineLoading label='Đang đọc file…' />}
					{error && <div className={styles.fieldError}>{error}</div>}

					{s && (
						<>
							<div className={`${styles.noticeBox} ${styles.noticeOk}`} style={{ marginTop: 12 }}>
								<CheckSvg />
								<span>
									Đọc <b>{s.total}</b> dòng · <b>{s.new}</b> hồ sơ mới · <b>{s.changed}</b> thay đổi ·{' '}
									{s.unchanged} không đổi · {s.skipped} bỏ qua.
								</span>
							</div>

							{notes.length > 0 && (
								<ul className={styles.warnList}>
									{notes.map((w, i) => (
										<li key={i}>{w}</li>
									))}
								</ul>
							)}

							{rows.length > 0 && (
								<>
									<div className={styles.importPreview}>
										<table className={styles.table}>
											<thead>
												<tr>
													<th className={tbl.thIdx}>STT</th>
													<th>MNV</th>
													<th>Họ tên</th>
													<th>Thay đổi</th>
												</tr>
											</thead>
											<tbody>
												{pg.paged.map((r, i) => (
													<tr key={r.row}>
														<td className={tbl.tdIdx}>{pg.offset + i + 1}</td>
														<td className={tbl.cellCode}>{r.staff_number}</td>
														<td>
															<span className={tbl.cellTitle}>{r.full_name}</span>
															{r.status === 'new' && (
																<Badge tone='green' style={{ marginLeft: 6 }}>
																	Mới
																</Badge>
															)}
														</td>
														<td>
															{r.changes.map((c) => (
																<div key={c.field} className={tbl.cellSub}>
																	{IMPORT_FIELD_LABELS[c.field]}: {r.status === 'changed' && <s>{fmt(c.field, c.old)}</s>} →{' '}
																	<b>{fmt(c.field, c.new)}</b>
																</div>
															))}
														</td>
													</tr>
												))}
											</tbody>
										</table>
									</div>
									<Pagination {...pg.pagination} itemLabel='dòng' />
								</>
							)}
						</>
					)}
				</>
			)}
		</Modal>
	);
}
