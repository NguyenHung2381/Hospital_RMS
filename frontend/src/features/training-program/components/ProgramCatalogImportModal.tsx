import { FormField } from '@/shared/components/Input/FormField';
import { useState } from 'react';
import { CheckSvg, InfoSvg, UploadSvg } from '@/assets/icons';
import { FileDropzone, Modal } from '@/shared/components';
import { InlineLoading } from '@/shared/components/Loading';
import { importProgramCatalog, type CatalogImportResult } from '../api/trainingProgramApi';
import styles from '../pages/TrainingPrograms.module.css';
import tbl from '@/shared/components/Table/Table.module.css';

const StatusTag = ({ status }: { status: 'new' | 'update' }) => (
	<span
		className={styles.badge}
		style={status === 'new' ? { background: '#e1f5ea', color: '#085028' } : undefined}
	>
		{status === 'new' ? 'Mới' : 'Cập nhật'}
	</span>
);

// Nhập danh mục chương trình + vòng thực hành từ file Excel của phòng Đào tạo
// (sheet "Mã CT" và "Bài học"): chọn file → xem trước → xác nhận. Backend cập
// nhật theo mã nên nhập lại nhiều lần an toàn — xem programCatalogImportService.
export function ProgramCatalogImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
	const [file, setFile] = useState<File | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const [preview, setPreview] = useState<CatalogImportResult | null>(null);
	const [result, setResult] = useState<CatalogImportResult | null>(null);

	const onPickFile = async (f: File | null) => {
		setFile(f);
		setResult(null);
		setPreview(null);
		setError('');
		if (!f) return;
		setLoading(true);
		try {
			setPreview(await importProgramCatalog(f, true));
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
			setResult(await importProgramCatalog(file, false));
			onImported();
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Nhập danh mục thất bại');
		} finally {
			setLoading(false);
		}
	};

	const s = preview?.summary;
	const warnings = (result ?? preview)?.warnings ?? [];

	return (
		<Modal
			open
			onClose={onClose}
			icon={<UploadSvg />}
			title='Nhập danh mục chương trình'
			subtitle='Chương trình (sheet "Mã CT") và vòng thực hành (sheet "Bài học")'
			size='xl'
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
							className={styles.btnConfirm}
							onClick={commit}
							disabled={loading || !s?.programs_total}
						>
							{loading ? <span className={styles.spinner} /> : <UploadSvg />}
							Nhập {s ? `${s.programs_total} chương trình, ${s.lessons_total} vòng` : ''}
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
							Sheet chương trình cần cột <b>Mã Chương trình đào tạo</b> và <b>Tên Chương trình đào tạo</b>;
							loại hình suy ra từ tiền tố mã (ĐTLT_, GPHN_, CTCV_, THBV_). Sheet vòng: dòng có mã GPHN_* mở
							chương trình, dòng có mã khác là 1 vòng, dòng chỉ có nội dung là khoa của vòng ngay trên.
							Trùng mã thì cập nhật; ô trống không xoá dữ liệu đang có.
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

					{s && preview && (
						<>
							<div
								className={`${styles.noticeBox} ${styles.noticeOk}`}
								style={{ marginTop: 12 }}
							>
								<CheckSvg />
								<span>
									<b>{s.programs_total}</b> chương trình ({s.programs_new} mới) · <b>{s.lessons_total}</b> vòng
									thực hành ({s.lessons_new} mới) · {warnings.length} cảnh báo.
								</span>
							</div>
							{warnings.length > 0 && (
								<ul className={styles.warnList}>
									{warnings.map((w, i) => (
										<li key={i}>{w}</li>
									))}
								</ul>
							)}

							{!!preview.lessons?.length && (
								<div className={styles.importPreview}>
									<table className={styles.table}>
										<thead>
											<tr>
												<th>Chương trình</th>
												<th>Vòng</th>
												<th>Thời lượng</th>
												<th>Khoa được chọn</th>
												<th />
											</tr>
										</thead>
										<tbody>
											{preview.lessons.map((l) => (
												<tr key={l.row}>
													<td>{l.program_code}</td>
													<td>
														<span className={tbl.cellTitle}>{l.code}</span>
														<div className={styles.descText}>{l.title}</div>
													</td>
													<td>{l.duration ?? '—'}</td>
													<td>
														{l.departments.map((d) => d.name).join(', ') || '—'}
														{l.allow_split && <div className={styles.descText}>Chia thời gian cho nhiều khoa</div>}
													</td>
													<td>
														<StatusTag status={l.status} />
													</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							)}

							<div className={styles.importPreview}>
								<table className={styles.table}>
									<thead>
										<tr>
											<th>Mã</th>
											<th>Chương trình</th>
											<th>Thời lượng</th>
											<th>Khoa phụ trách</th>
											<th />
										</tr>
									</thead>
									<tbody>
										{preview.programs?.map((p) => (
											<tr key={p.row}>
												<td>{p.code}</td>
												<td>
													<span className={tbl.cellTitle}>{p.name}</span>
													{p.target_audience && <div className={styles.descText}>{p.target_audience}</div>}
												</td>
												<td>{p.duration ?? '—'}</td>
												<td>{p.department_name ?? p.department_note ?? '—'}</td>
												<td>
													<StatusTag status={p.status} />
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
							Chương trình: <b>{result.programs_created}</b> mới, <b>{result.programs_updated}</b> cập nhật ·
							Vòng: <b>{result.lessons_created}</b> mới, <b>{result.lessons_updated}</b> cập nhật ·{' '}
							<b>{result.links_created}</b> lượt gắn vòng vào chương trình.
						</span>
					</div>
					{warnings.length > 0 && (
						<ul className={styles.warnList}>
							{warnings.map((w, i) => (
								<li key={i}>{w}</li>
							))}
						</ul>
					)}
				</>
			)}
		</Modal>
	);
}
