import { useMemo, useState, type ReactNode } from 'react';
import { AlertSvg, CheckSvg, DownloadSvg, FileTextSvg, InfoSvg, UploadSvg } from '@/assets/icons';
import { apiClient } from '@/shared/api/axios';
import { buildExcel, norm, type ExcelColumn, type ExcelRecord } from './excelHelpers';
import { FormField } from '@/shared/components/Input/FormField';
import { FileDropzone } from '@/shared/components/Input/FileDropzone';
import { InlineLoading } from '@/shared/components/Loading';
import { Modal } from '@/shared/components/Modal';
import { Pagination } from '@/shared/components/Table/Pagination';
import tbl from '@/shared/components/Table/Table.module.css';
import { useClientPaging } from '@/shared/hooks/useClientPaging';
import { showToast } from '@/shared/utils/feedback';
import { formatDateVN } from '@/shared/utils/formatDate';
import { saveBlob } from '@/shared/utils/saveBlob';
import styles from './Excel.module.css';

/**
 * Nhập/xuất Excel dùng chung cho trang danh sách chưa có endpoint riêng.
 * - Xuất: lấy dữ liệu qua `getRows` (đã lọc theo trang), server chỉ dựng file (/excel/build).
 * - Nhập: server đọc file thành bảng chữ (/excel/parse), client khớp tiêu đề cột
 *   theo `header` rồi gọi `importRow` (API tạo mới sẵn có) cho từng dòng.
 * Helper đổi chữ → giá trị (matchLabel, isYes, dateText…) ở ./excelHelpers.
 */
export type { ExcelColumn, ExcelRecord } from './excelHelpers';

interface Props<T> {
	/** Tên file không dấu, vd 'khoa-phong'. */
	fileName: string;
	/** Nhãn số nhiều trong câu thông báo, vd 'khoa phòng'. */
	itemLabel: string;
	columns: ExcelColumn<T>[];
	getRows?: () => Promise<T[]> | T[];
	/** Ném lỗi (message hiển thị cho người dùng) nếu dòng không hợp lệ. */
	importRow?: (rec: ExcelRecord) => Promise<unknown>;
	onImported?: () => void;
	/** Ghi chú thêm trong hộp thoại nhập (vd cách ghi giá trị danh mục). */
	importHint?: ReactNode;
}

export function ExcelActions<T>({ fileName, itemLabel, columns, getRows, importRow, onImported, importHint }: Props<T>) {
	const [exporting, setExporting] = useState(false);
	const [showImport, setShowImport] = useState(false);
	const exportCols = columns.filter((c) => c.value);

	const doExport = async () => {
		if (!getRows) return;
		setExporting(true);
		try {
			const data = await getRows();
			if (!data.length) {
				showToast('info', `Không có ${itemLabel} để xuất`);
				return;
			}
			const blob = await buildExcel(
				fileName,
				itemLabel,
				['STT', ...exportCols.map((c) => c.header)],
				data.map((r, i) => [i + 1, ...exportCols.map((c) => c.value!(r) ?? '')]),
			);
			saveBlob(blob, `${fileName}-${formatDateVN(new Date()).replace(/\//g, '-')}.xlsx`);
		} catch (e) {
			showToast('error', e instanceof Error ? e.message : 'Xuất Excel thất bại');
		} finally {
			setExporting(false);
		}
	};

	return (
		<div className={styles.actions}>
			{importRow && (
				<button className={styles.btn} onClick={() => setShowImport(true)}>
					<UploadSvg /> Nhập Excel
				</button>
			)}
			{getRows && exportCols.length > 0 && (
				<button className={styles.btn} onClick={doExport} disabled={exporting}>
					<DownloadSvg /> {exporting ? 'Đang xuất…' : 'Xuất Excel'}
				</button>
			)}
			{showImport && importRow && (
				<ImportModal
					fileName={fileName}
					itemLabel={itemLabel}
					columns={columns.filter((c) => c.key)}
					importRow={importRow}
					hint={importHint}
					onClose={() => setShowImport(false)}
					onImported={onImported}
				/>
			)}
		</div>
	);
}

interface ParsedRow {
	line: number; // số dòng trong Excel
	rec: ExcelRecord;
	missing: string[];
}

function ImportModal<T>({
	fileName,
	itemLabel,
	columns,
	importRow,
	hint,
	onClose,
	onImported,
}: {
	fileName: string;
	itemLabel: string;
	columns: ExcelColumn<T>[];
	importRow: (rec: ExcelRecord) => Promise<unknown>;
	hint?: ReactNode;
	onClose: () => void;
	onImported?: () => void;
}) {
	const [file, setFile] = useState<File | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const [parsed, setParsed] = useState<ParsedRow[] | null>(null);
	const [progress, setProgress] = useState<number | null>(null);
	const [result, setResult] = useState<{ ok: number; errors: string[] } | null>(null);
	const pg = useClientPaging(parsed ?? []);
	const valid = useMemo(() => (parsed ?? []).filter((r) => !r.missing.length), [parsed]);

	const downloadTemplate = async () => {
		try {
			const blob = await buildExcel(
				`mau-nhap-${fileName}`,
				itemLabel,
				columns.map((c) => (c.required ? `${c.header} *` : c.header)),
				[],
			);
			saveBlob(blob, `mau-nhap-${fileName}.xlsx`);
		} catch (e) {
			showToast('error', e instanceof Error ? e.message : 'Tải file mẫu thất bại');
		}
	};

	const parse = async (f: File) => {
		setLoading(true);
		setError('');
		setParsed(null);
		try {
			const form = new FormData();
			form.append('file', f);
			const { rows } = await apiClient.postForm<{ rows: string[][] }>('/excel/parse', form);
			const required = columns.filter((c) => c.required);
			// Dò dòng tiêu đề trong 20 dòng đầu: đủ cột bắt buộc và khớp ít nhất 1 cột.
			let headerIdx = -1;
			let colIdx: (number | undefined)[] = [];
			for (let r = 0; r < Math.min(rows.length, 20) && headerIdx < 0; r++) {
				const cells = rows[r].map(norm);
				const idx = columns.map((c) => {
					const i = cells.indexOf(norm(c.header));
					return i < 0 ? undefined : i;
				});
				const hit = idx.filter((i) => i !== undefined).length;
				if (hit && required.every((c) => idx[columns.indexOf(c)] !== undefined)) {
					headerIdx = r;
					colIdx = idx;
				}
			}
			if (headerIdx < 0) {
				throw new Error(
					`Không tìm thấy dòng tiêu đề. Cần các cột: ${(required.length ? required : columns).map((c) => c.header).join(', ')}.`,
				);
			}
			const out: ParsedRow[] = [];
			for (let r = headerIdx + 1; r < rows.length; r++) {
				const rec: ExcelRecord = {};
				columns.forEach((c, j) => {
					const i = colIdx[j];
					rec[c.key!] = i === undefined ? '' : (rows[r][i] ?? '').trim();
				});
				if (Object.values(rec).every((v) => !v)) continue;
				out.push({ line: r + 1, rec, missing: required.filter((c) => !rec[c.key!]).map((c) => c.header) });
			}
			if (!out.length) throw new Error('File không có dòng dữ liệu nào dưới tiêu đề.');
			setParsed(out);
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Đọc file thất bại');
		} finally {
			setLoading(false);
		}
	};

	const commit = async () => {
		setLoading(true);
		const errors: string[] = (parsed ?? [])
			.filter((r) => r.missing.length)
			.map((r) => `Dòng ${r.line}: thiếu ${r.missing.join(', ')}`);
		let ok = 0;
		// Tuần tự để không dội hàng trăm request cùng lúc vào rate-limit.
		for (let i = 0; i < valid.length; i++) {
			setProgress(i + 1);
			try {
				await importRow(valid[i].rec);
				ok++;
			} catch (e) {
				errors.push(`Dòng ${valid[i].line}: ${e instanceof Error ? e.message : 'lỗi không xác định'}`);
			}
		}
		setProgress(null);
		setLoading(false);
		setResult({ ok, errors });
		if (ok) onImported?.();
	};

	return (
		<Modal
			open
			onClose={loading ? () => {} : onClose}
			icon={<UploadSvg />}
			title={`Nhập ${itemLabel} từ Excel`}
			subtitle='Mỗi dòng tạo một bản ghi mới'
			size='lg'
			className={styles.modal}
			bodyClassName={styles.body}
			footer={
				<>
					<button className={styles.btn} onClick={onClose} disabled={loading}>
						{result ? 'Đóng' : 'Huỷ'}
					</button>
					{!result && (
						<button
							className={styles.btnPrimary}
							onClick={commit}
							disabled={loading || !valid.length}
						>
							<UploadSvg />
							{progress ? `Đang nhập ${progress}/${valid.length}…` : `Nhập ${valid.length || ''} ${itemLabel}`}
						</button>
					)}
				</>
			}
		>
			{result ? (
				<>
					<div className={`${styles.notice} ${result.errors.length ? styles.bad : styles.ok}`}>
						{result.errors.length ? <AlertSvg /> : <CheckSvg />}
						<span>
							Đã nhập <b>{result.ok}</b> {itemLabel}
							{result.errors.length > 0 && (
								<>
									, <b>{result.errors.length}</b> dòng lỗi
								</>
							)}
							.
						</span>
					</div>
					{result.errors.length > 0 && (
						<ul className={styles.errList}>
							{result.errors.map((e, i) => (
								<li key={i}>{e}</li>
							))}
						</ul>
					)}
				</>
			) : (
				<>
					<div className={styles.notice}>
						<InfoSvg />
						<span>
							Cột nhận diện:{' '}
							{columns.map((c, i) => (
								<span key={c.header}>
									{i > 0 && ', '}
									{c.required ? <b>{c.header}</b> : c.header}
								</span>
							))}
							. Cột in đậm là bắt buộc. {hint}
						</span>
					</div>
					<button className={styles.btnSm} onClick={downloadTemplate} disabled={loading}>
						<FileTextSvg /> Tải file mẫu
					</button>
					<FormField label='File Excel (.xlsx)'>
						<FileDropzone
							value={file}
							onChange={(f) => {
								setFile(f);
								if (f) parse(f);
								else setParsed(null);
							}}
							accept='.xlsx'
							disabled={loading}
						/>
					</FormField>
					{loading && !progress && <InlineLoading label='Đang đọc file…' />}
					{error && <div className={styles.error}>{error}</div>}
					{parsed && (
						<>
							<div className={styles.preview}>
								<table className={styles.table}>
									<thead>
										<tr>
											<th className={tbl.thIdx}>STT</th>
											<th>Dòng</th>
											{columns.map((c) => (
												<th key={c.header}>{c.header}</th>
											))}
										</tr>
									</thead>
									<tbody>
										{pg.paged.map((r, i) => (
											<tr key={r.line}>
												<td className={tbl.tdIdx}>{pg.offset + i + 1}</td>
												<td>
													<span className={tbl.cellSub}>{r.line}</span>
													{r.missing.length > 0 && (
														<div className={styles.rowErr}>Thiếu {r.missing.join(', ')}</div>
													)}
												</td>
												{columns.map((c) => (
													<td key={c.header}>{r.rec[c.key!] || <span className={tbl.cellSub}>—</span>}</td>
												))}
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
		</Modal>
	);
}
