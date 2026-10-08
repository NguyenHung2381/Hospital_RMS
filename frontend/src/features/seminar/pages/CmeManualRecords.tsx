import { formatDateVN } from '../../../shared/utils/formatDate';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
	CheckSvg,
	ChevLSvg,
	ChevRSvg,
	DownloadSvg,
	EditSvg,
	InfoSvg,
	PaperclipSvg,
	PlusSvg,
	SearchSvg,
	TrashSvg,
	UploadSvg,
	XSvg,
} from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { Badge, FileDropzone, Modal, Pagination, SearchableSelect } from '@/shared/components';
import { InlineLoading } from '../../../shared/components/Loading';
import { apiClient } from '../../../shared/api/axios';
import {
	addCmeRecordEvidence,
	createCmeRecord,
	deleteCmeRecord,
	downloadCmeRecordImportTemplate,
	exportCmeRecordsExcel,
	getCmeCreditCategories,
	getCmeRecords,
	importCmeRecordsExcel,
	updateCmeRecord,
} from '../api/cmeRecordApi';
import { useSeminarPerms } from '../utils/perms';
import { saveBlob } from '../utils/saveBlob';
import {
	EMPTY_CME_RECORD_FORM,
	type CmeCreditCategory,
	type CmeRecord,
	type CmeRecordFormData,
	type CmeRecordImportResult,
} from '../types/cmeRecord.type';
import styles from './Seminar.module.css';

const THIS_YEAR = new Date().getFullYear();
const MIN_YEAR = 2000;
const MAX_YEAR = THIS_YEAR + 1;
const NO_CATEGORY = '__none__';
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

/** Chọn năm dạng ‹ 2026 › — bấm mũi tên, phím ↑/↓ hoặc gõ thẳng năm, thay cho dropdown dài. */
function YearStepper({ value, onChange }: { value: number; onChange: (y: number) => void }) {
	// null = không đang gõ → hiển thị theo value
	const [draft, setDraft] = useState<string | null>(null);

	const go = (y: number) => {
		setDraft(null);
		onChange(Math.min(MAX_YEAR, Math.max(MIN_YEAR, y)));
	};
	const commit = () => {
		const y = Number(draft);
		if (draft?.length === 4 && y >= MIN_YEAR && y <= MAX_YEAR) onChange(y);
		setDraft(null);
	};

	return (
		<div className={styles.yearStepper}>
			<button type='button' title='Năm trước' disabled={value <= MIN_YEAR} onClick={() => go(value - 1)}>
				<ChevLSvg />
			</button>
			<label className={styles.yearStepperValue} title='Gõ năm rồi nhấn Enter'>
				<span>Năm</span>
				<input
					inputMode='numeric'
					maxLength={4}
					value={draft ?? String(value)}
					onChange={(e) => setDraft(e.target.value.replace(/\D/g, ''))}
					onBlur={commit}
					onKeyDown={(e) => {
						if (e.key === 'Enter') commit();
						else if (e.key === 'ArrowUp') { e.preventDefault(); go(value + 1); }
						else if (e.key === 'ArrowDown') { e.preventDefault(); go(value - 1); }
					}}
				/>
			</label>
			<button type='button' title='Năm sau' disabled={value >= MAX_YEAR} onClick={() => go(value + 1)}>
				<ChevRSvg />
			</button>
			{value !== THIS_YEAR && (
				<button type='button' className={styles.yearStepperToday} onClick={() => onChange(THIS_YEAR)}>
					Năm nay
				</button>
			)}
		</div>
	);
}

/** Lọc năm: "Tất cả" (null) hoặc "Theo năm" + YearStepper. Nhớ năm đã chọn gần nhất khi bật lại. */
function YearFilter({ value, onChange }: { value: number | null; onChange: (y: number | null) => void }) {
	const [lastYear, setLastYear] = useState(value ?? THIS_YEAR);
	const pickYear = (y: number) => {
		setLastYear(y);
		onChange(y);
	};

	return (
		<div className={styles.yearFilter}>
			<div className={styles.yearMode} role='group' aria-label='Phạm vi năm'>
				<button type='button' className={value === null ? styles.yearModeActive : ''} onClick={() => onChange(null)}>
					Tất cả năm
				</button>
				<button type='button' className={value !== null ? styles.yearModeActive : ''} onClick={() => onChange(lastYear)}>
					Theo năm
				</button>
			</div>
			{value !== null && <YearStepper value={value} onChange={pickYear} />}
		</div>
	);
}

function formatCredits(n: number): string {
	return Number(n).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
}

interface SimpleUser {
	id: string;
	full_name: string;
	staff_number?: string | number | null;
}

function suggestCredits(category: CmeCreditCategory | undefined): string {
	if (!category || category.conversion_value == null) return '';
	if (category.conversion_method === 'fixed' || category.conversion_method === 'per_year') {
		return String(category.conversion_value);
	}
	return '';
}

function RecordFormModal({
	record,
	users,
	categories,
	onClose,
	onSaved,
}: {
	record: CmeRecord | null;
	users: SimpleUser[];
	categories: CmeCreditCategory[];
	onClose: () => void;
	onSaved: () => void;
}) {
	const [form, setForm] = useState<CmeRecordFormData>(
		record
			? {
					user_id: record.user_id,
					category_id: record.category_id ?? '',
					title: record.title,
					activity_date: record.activity_date?.slice(0, 10) ?? '',
					end_date: record.end_date?.slice(0, 10) ?? '',
					year: String(record.year),
					role: record.role ?? '',
					quantity: record.quantity == null ? '' : String(record.quantity),
					credits: String(record.credits),
					note: record.note ?? '',
				}
			: EMPTY_CME_RECORD_FORM,
	);
	const userOptions = useMemo(
		() => users.map((u) => ({ id: u.id, name: u.staff_number ? `${u.full_name} (${u.staff_number})` : u.full_name })),
		[users],
	);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const [evidence, setEvidence] = useState<File | null>(null);

	const save = async () => {
		if (!form.user_id || !form.title.trim() || !form.year || !form.credits) return;
		setBusy(true);
		setError('');
		try {
			const saved = record ? await updateCmeRecord(record.id, form) : await createCmeRecord(form);
			if (evidence) await addCmeRecordEvidence(saved.id, evidence);
			onSaved();
			onClose();
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Lưu thất bại');
		} finally {
			setBusy(false);
		}
	};

	return (
		<Modal
			open
			onClose={onClose}
			title={record ? 'Chỉnh sửa ghi nhận CME' : 'Ghi nhận CME độc lập'}
			size='md'
			footer={
				<>
					<button className={styles.btnCancel} onClick={onClose} disabled={busy}>
						Huỷ
					</button>
					<button className={styles.btnPrimary} onClick={save} disabled={busy}>
						{busy ? <span className={styles.spinner} /> : <CheckSvg />} Lưu
					</button>
				</>
			}
		>
			{error && <div className={styles.fieldError}>{error}</div>}
			<div className={styles.formGrid}>
				<div className={`${styles.formGroup} ${styles.full}`}>
					<label className={styles.formLabel}>Nhân viên *</label>
					<SearchableSelect
						options={userOptions}
						value={form.user_id}
						onChange={(id) => setForm((f) => ({ ...f, user_id: id }))}
						placeholder='Gõ tên hoặc MNV để tìm nhân viên'
					/>
				</div>
				<div className={`${styles.formGroup} ${styles.full}`}>
					<label className={styles.formLabel}>Danh mục quy đổi</label>
					<select
						className={styles.formInput}
						value={form.category_id}
						onChange={(e) => {
							const catId = e.target.value;
							const cat = categories.find((c) => c.id === catId);
							setForm((f) => ({
								...f,
								category_id: catId,
								credits: f.credits || suggestCredits(cat),
							}));
						}}
					>
						<option value=''>-- Không thuộc danh mục --</option>
						{categories.map((c) => (
							<option key={c.id} value={c.id}>
								{c.name}
							</option>
						))}
					</select>
				</div>
				<div className={`${styles.formGroup} ${styles.full}`}>
					<label className={styles.formLabel}>Nội dung hoạt động *</label>
					<input
						className={styles.formInput}
						value={form.title}
						onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
						placeholder='VD: Tự học chuyên đề X'
					/>
				</div>
				<div className={styles.formGroup}>
					<label className={styles.formLabel}>Năm *</label>
					<input
						type='number'
						className={styles.formInput}
						value={form.year}
						onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))}
					/>
				</div>
				<div className={styles.formGroup}>
					<label className={styles.formLabel}>Số tín chỉ *</label>
					<input
						type='number'
						step='0.1'
						className={styles.formInput}
						value={form.credits}
						onChange={(e) => setForm((f) => ({ ...f, credits: e.target.value }))}
					/>
				</div>
				<div className={styles.formGroup}>
					<label className={styles.formLabel}>Từ ngày</label>
					<input
						type='date'
						className={styles.formInput}
						value={form.activity_date}
						onChange={(e) =>
							setForm((f) => ({ ...f, activity_date: e.target.value, year: e.target.value.slice(0, 4) || f.year }))
						}
					/>
				</div>
				<div className={styles.formGroup}>
					<label className={styles.formLabel}>Đến ngày</label>
					<input
						type='date'
						className={styles.formInput}
						value={form.end_date}
						onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
					/>
				</div>
				<div className={styles.formGroup}>
					<label className={styles.formLabel}>Vai trò</label>
					<input
						className={styles.formInput}
						value={form.role}
						onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
						placeholder='VD: Đại biểu, Báo cáo viên'
					/>
				</div>
				<div className={styles.formGroup}>
					<label className={styles.formLabel}>Số lượng</label>
					<input
						type='number'
						step='0.1'
						className={styles.formInput}
						value={form.quantity}
						onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
					/>
				</div>
				<div className={`${styles.formGroup} ${styles.full}`}>
					<label className={styles.formLabel}>Ghi chú</label>
					<input
						className={styles.formInput}
						value={form.note}
						onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
					/>
				</div>
				<div className={`${styles.formGroup} ${styles.full}`}>
					<label className={styles.formLabel}>Minh chứng đính kèm</label>
					<FileDropzone
						value={evidence}
						onChange={setEvidence}
						hint={record?.evidence_file_url ? 'Chọn file mới để thay minh chứng hiện có' : 'PDF, Word, Excel, ảnh…'}
						disabled={busy}
					/>
					{record?.evidence_file_url && (
						<div className={styles.modalSub}>
							Hiện có: <a href={record.evidence_file_url} target='_blank' rel='noreferrer'>{record.evidence_file_name}</a>
						</div>
					)}
				</div>
			</div>
		</Modal>
	);
}

function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
	const [file, setFile] = useState<File | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const [preview, setPreview] = useState<CmeRecordImportResult | null>(null);
	const [result, setResult] = useState<CmeRecordImportResult | null>(null);
	const [downloading, setDownloading] = useState(false);

	const downloadTemplate = async () => {
		setDownloading(true);
		try {
			saveBlob(await downloadCmeRecordImportTemplate(), 'mau-nhap-ghi-nhan-cme.xlsx');
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Tải file mẫu thất bại');
		} finally {
			setDownloading(false);
		}
	};

	const runDryRun = async (f: File) => {
		setLoading(true);
		setError('');
		setPreview(null);
		try {
			setPreview(await importCmeRecordsExcel(f, true));
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
			const res = await importCmeRecordsExcel(file, false);
			setResult(res);
			onDone();
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Nhập thất bại');
		} finally {
			setLoading(false);
		}
	};

	const rows = preview?.rows ?? [];

	return (
		<Modal
			open
			onClose={onClose}
			title='Nhập ghi nhận CME từ Excel'
			size='lg'
			footer={
				<>
					<button className={styles.btnCancel} onClick={onClose} disabled={loading}>
						{result ? 'Đóng' : 'Huỷ'}
					</button>
					{!result && (
						<button className={styles.btnPrimary} onClick={commit} disabled={loading || !preview || rows.length === 0}>
							{loading ? <span className={styles.spinner} /> : <UploadSvg />} Nhập {preview?.summary?.valid || ''} dòng hợp lệ
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
							Cột nhận diện: MNV hoặc <b>Họ và tên</b>, Danh mục, Nội dung, Ngày hoạt động, Số tín chỉ, Ghi
							chú. Chỉ nhập các dòng khớp được nhân viên và có đủ ngày + số tín chỉ.
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
							onChange={(f) => {
								setFile(f);
								setResult(null);
								if (f) runDryRun(f);
							}}
							accept='.xlsx'
						/>
					</div>
					{loading && <InlineLoading label='Đang đọc file…' />}
					{error && <div className={styles.fieldError}>{error}</div>}
					{preview?.summary && (
						<div className={`${styles.noticeBox} ${styles.noticeOk}`}>
							<CheckSvg />
							<span>
								Đọc được <b>{preview.summary.total}</b> dòng · {preview.summary.matched} khớp nhân viên ·{' '}
								{preview.summary.valid} hợp lệ để nhập.
							</span>
						</div>
					)}
					{preview && preview.warnings.length > 0 && (
						<ul className={styles.warnList}>
							{preview.warnings.slice(0, 50).map((w, i) => (
								<li key={i}>{w}</li>
							))}
						</ul>
					)}
					{rows.length > 0 && (
						<div className={styles.importPreview}>
							<table className={styles.table}>
								<thead>
									<tr>
										<th>#</th>
										<th>Nhân viên</th>
										<th>Nội dung</th>
										<th>Năm</th>
										<th>Vai trò</th>
										<th>Ngày</th>
										<th>Tín chỉ</th>
									</tr>
								</thead>
								<tbody>
									{rows.map((r, i) => (
										<tr key={r.row}>
											<td className={styles.tdIdx}>{i + 1}</td>
											<td>
												{r.matched_user_name || r.full_name_raw || '—'}
												{!r.valid && <div className={styles.rowWarn}>Sẽ bị bỏ qua</div>}
											</td>
											<td>{r.title}</td>
											<td>{r.year ?? '—'}</td>
											<td>{r.role || '—'}</td>
											<td>{r.activity_date ? `${r.activity_date}${r.end_date ? ` → ${r.end_date}` : ''}` : '—'}</td>
											<td>{r.credits ?? '—'}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</>
			)}
			{result && (
				<div className={`${styles.noticeBox} ${styles.noticeOk}`}>
					<CheckSvg />
					<span>
						Đã nhập <b>{result.inserted}</b> ghi nhận.
					</span>
				</div>
			)}
		</Modal>
	);
}

export default function CmeManualRecords() {
	const perms = useSeminarPerms();
	// null = tất cả các năm
	const [year, setYear] = useState<number | null>(THIS_YEAR);
	const [records, setRecords] = useState<CmeRecord[]>([]);
	const [users, setUsers] = useState<SimpleUser[]>([]);
	const [categories, setCategories] = useState<CmeCreditCategory[]>([]);
	const [search, setSearch] = useState('');
	const [deptFilter, setDeptFilter] = useState('');
	const [categoryFilter, setCategoryFilter] = useState('');
	const [evidenceFilter, setEvidenceFilter] = useState<'' | 'yes' | 'no'>('');
	const [loading, setLoading] = useState(true);
	const [editing, setEditing] = useState<CmeRecord | null | 'new'>(null);
	const [showImport, setShowImport] = useState(false);
	const [deletingId, setDeletingId] = useState<string | null>(null);
	const [refreshKey, setRefreshKey] = useState(0);
	const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);
	useRealtimeUpdate('cme_record', refresh);

	useEffect(() => {
		apiClient.get<{ data: SimpleUser[] }>('/users?limit=0').then((r) => setUsers(r.data)).catch(() => {});
		getCmeCreditCategories().then((r) => setCategories(r.data)).catch(() => {});
	}, []);

	useEffect(() => {
		const load = () => {
			setLoading(true);
			getCmeRecords({ year: year ?? undefined })
				.then((r) => setRecords(r.data))
				.finally(() => setLoading(false));
		};
		load();
	}, [year, refreshKey]);

	const departments = useMemo(
		() =>
			Array.from(new Set(records.map((r) => r.department_name).filter((d): d is string => !!d))).sort((a, b) =>
				a.localeCompare(b, 'vi'),
			),
		[records],
	);

	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		return records.filter((r) => {
			if (q && !r.user_name.toLowerCase().includes(q) && !r.title.toLowerCase().includes(q)) return false;
			if (deptFilter && r.department_name !== deptFilter) return false;
			if (categoryFilter === NO_CATEGORY && r.category_id) return false;
			if (categoryFilter && categoryFilter !== NO_CATEGORY && r.category_id !== categoryFilter) return false;
			if (evidenceFilter === 'yes' && !r.evidence_file_url) return false;
			if (evidenceFilter === 'no' && r.evidence_file_url) return false;
			return true;
		});
	}, [records, search, deptFilter, categoryFilter, evidenceFilter]);

	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState<number>(20);
	// Đổi bộ lọc / năm thì quay về trang đầu (điều chỉnh khi render, không dùng effect)
	const filterKey = `${search}|${deptFilter}|${categoryFilter}|${evidenceFilter}|${year}`;
	const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
	if (prevFilterKey !== filterKey) {
		setPrevFilterKey(filterKey);
		setPage(1);
	}
	const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
	const safePage = Math.min(page, totalPages);
	const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

	const totalCredits = filtered.reduce((sum, r) => sum + Number(r.credits || 0), 0);
	const hasFilter = !!(search || deptFilter || categoryFilter || evidenceFilter);
	const clearFilters = () => {
		setSearch('');
		setDeptFilter('');
		setCategoryFilter('');
		setEvidenceFilter('');
	};

	const [exporting, setExporting] = useState(false);
	const handleExport = async () => {
		setExporting(true);
		try {
			const blob = await exportCmeRecordsExcel({
				year: year ?? undefined,
				search: search.trim() || undefined,
				department: deptFilter || undefined,
				category_id: categoryFilter || undefined,
				evidence: evidenceFilter || undefined,
			});
			saveBlob(blob, `ghi-nhan-cme${year ? `-${year}` : ''}.xlsx`);
		} catch (e) {
			alert(e instanceof Error ? e.message : 'Xuất Excel thất bại');
		} finally {
			setExporting(false);
		}
	};

	const handleDelete = async (id: string) => {
		await deleteCmeRecord(id);
		setDeletingId(null);
		refresh();
	};

	return (
		<AdminLayout
			pageTitle='Ghi nhận CME độc lập'
			pageSubtitle='Ghi nhận tín chỉ CME không qua sự kiện hội thảo (tự học, học online, minh chứng đính kèm)'
			breadcrumbs={[{ label: 'Hội nghị & CME' }]}
			headerActions={
				perms.canCme ? (
					<div style={{ display: 'flex', gap: 8 }}>
						<button className={styles.btnGhost} onClick={handleExport} disabled={exporting}>
							{exporting ? <span className={styles.spinner} /> : <DownloadSvg />} Xuất Excel
						</button>
						<button className={styles.btnGhost} onClick={() => setShowImport(true)}>
							<UploadSvg /> Nhập từ Excel
						</button>
						<button className={styles.btnPrimary} onClick={() => setEditing('new')}>
							<PlusSvg /> Ghi nhận mới
						</button>
					</div>
				) : undefined
			}
		>
			<div className={styles.tableCard}>
				<div className={styles.tableHeader}>
					<div className={styles.tableHeaderLeft}>
						<span className={styles.tableTitle}>Danh sách ghi nhận CME</span>
						<span className={styles.tableCount}>
							{filtered.length} bản ghi · {formatCredits(totalCredits)} tín chỉ
						</span>
					</div>
					<div className={styles.tableControls}>
						<div className={styles.searchBox}>
							<SearchSvg className={styles.searchIcon} />
							<input
								className={styles.searchInput}
								placeholder='Tìm nhân viên, nội dung...'
								value={search}
								onChange={(e) => setSearch(e.target.value)}
							/>
							{search && (
								<button className={styles.searchClear} onClick={() => setSearch('')}>
									<XSvg />
								</button>
							)}
						</div>
						<select
							className={`${styles.filterSelect} ${styles.cmeFilterWide}`}
							value={deptFilter}
							onChange={(e) => setDeptFilter(e.target.value)}
						>
							<option value=''>Mọi khoa/phòng</option>
							{departments.map((d) => (
								<option key={d} value={d}>
									{d}
								</option>
							))}
						</select>
						<select
							className={`${styles.filterSelect} ${styles.cmeFilterWide}`}
							value={categoryFilter}
							onChange={(e) => setCategoryFilter(e.target.value)}
						>
							<option value=''>Mọi danh mục</option>
							<option value={NO_CATEGORY}>Không thuộc danh mục</option>
							{categories.map((c) => (
								<option key={c.id} value={c.id}>
									{c.name}
								</option>
							))}
						</select>
						<select
							className={styles.filterSelect}
							value={evidenceFilter}
							onChange={(e) => setEvidenceFilter(e.target.value as '' | 'yes' | 'no')}
						>
							<option value=''>Minh chứng: tất cả</option>
							<option value='yes'>Có minh chứng</option>
							<option value='no'>Chưa có minh chứng</option>
						</select>
						<YearFilter value={year} onChange={setYear} />
						{hasFilter && (
							<button className={styles.clearSelectionBtn} onClick={clearFilters}>
								Xoá lọc
							</button>
						)}
					</div>
				</div>

				{loading ? (
					<InlineLoading />
				) : filtered.length === 0 ? (
					<div className={styles.emptyState}>
						<div className={styles.emptyTitle}>
							{hasFilter
								? 'Không có ghi nhận nào khớp bộ lọc'
								: year === null
									? 'Chưa có ghi nhận CME nào'
									: `Chưa có ghi nhận CME nào trong năm ${year}`}
						</div>
					</div>
				) : (
					<table className={styles.table}>
						<thead>
							<tr>
								<th>STT</th>
								<th>Mã NV</th>
								<th>Nhân viên</th>
								<th>Nội dung hoạt động</th>
								<th>Năm</th>
								<th>Nhóm / Loại hình thức</th>
								<th>Vai trò</th>
								<th className={styles.thRight}>SL</th>
								<th>Thời gian</th>
								<th className={styles.thRight}>Tín chỉ</th>
								<th className={styles.thCenter}>Minh chứng</th>
								<th />
							</tr>
						</thead>
						<tbody>
							{paged.map((r, i) => (
								<tr key={r.id} className={styles.tr}>
									<td className={styles.tdIdx}>{(safePage - 1) * pageSize + i + 1}</td>
									<td>{r.staff_number ?? <span className={styles.muted}>—</span>}</td>
									<td>
										<div className={styles.cmeCellMain}>{r.user_name}</div>
										<div className={styles.cmeCellSub}>{r.department_name ?? '—'}</div>
									</td>
									<td>
										<div className={styles.cmeCellMain}>{r.title}</div>
										{r.note && <div className={styles.cmeCellSub}>{r.note}</div>}
									</td>
									<td>{r.year}</td>
									<td>
										{r.group_name && <div className={styles.cmeCellSub}>{r.group_name}</div>}
										{r.category_name ? (
											<Badge tone='blue' className={styles.cmeCategory} title={r.category_name}>
												{r.category_name}
											</Badge>
										) : (
											<span className={styles.muted}>—</span>
										)}
									</td>
									<td>{r.role || <span className={styles.muted}>—</span>}</td>
									<td className={styles.tdRight}>{r.quantity ?? <span className={styles.muted}>—</span>}</td>
									<td className={styles.cmeNowrap}>
										{r.activity_date ? (
											<>
												{formatDateVN(r.activity_date)}
												{r.end_date && ` → ${formatDateVN(r.end_date)}`}
											</>
										) : (
											`Năm ${r.year}`
										)}
									</td>
									<td className={styles.tdRight}>
										<span className={styles.cmeCredits}>{formatCredits(r.credits)}</span>
									</td>
									<td className={styles.tdCenter}>
										{r.evidence_file_url ? (
											<a
												className={styles.cmeEvidence}
												href={r.evidence_file_url}
												target='_blank'
												rel='noreferrer'
												title={r.evidence_file_name ?? 'Xem minh chứng'}
											>
												<PaperclipSvg />
											</a>
										) : (
											<span className={styles.muted}>—</span>
										)}
									</td>
									<td className={styles.tdActions}>
										{perms.canCme && (
											<div className={styles.actionBtns}>
												<div className={styles.actionBtn} title='Sửa' onClick={() => setEditing(r)}>
													<EditSvg />
												</div>
												<div
													className={`${styles.actionBtn} ${styles.danger}`}
													title='Xoá'
													onClick={() => setDeletingId(r.id)}
												>
													<TrashSvg />
												</div>
											</div>
										)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				)}

				{!loading && filtered.length > 0 && (
					<Pagination
						page={safePage}
						totalPages={totalPages}
						total={filtered.length}
						rowsPerPage={pageSize}
						pageSizeOptions={PAGE_SIZE_OPTIONS}
						onPageChange={setPage}
						onRowsPerPageChange={(n) => {
							setPageSize(n);
							setPage(1);
						}}
						itemLabel='bản ghi'
					/>
				)}
			</div>

			{editing && (
				<RecordFormModal
					record={editing === 'new' ? null : editing}
					users={users}
					categories={categories}
					onClose={() => setEditing(null)}
					onSaved={refresh}
				/>
			)}
			{showImport && <ImportModal onClose={() => setShowImport(false)} onDone={refresh} />}

			<Modal
				open={!!deletingId}
				onClose={() => setDeletingId(null)}
				title='Xoá ghi nhận CME'
				footer={
					<>
						<button className={styles.btnCancel} onClick={() => setDeletingId(null)}>
							Huỷ
						</button>
						<button className={styles.btnDanger} onClick={() => deletingId && handleDelete(deletingId)}>
							<TrashSvg /> Xoá
						</button>
					</>
				}
			>
				Bạn có chắc muốn xoá ghi nhận CME này? Hành động này không thể hoàn tác.
			</Modal>
		</AdminLayout>
	);
}
