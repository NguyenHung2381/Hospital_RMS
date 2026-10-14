import { SearchInput } from '@/shared/components/Table/TableToolbar';
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
	TrashSvg,
	UploadSvg,
	XSvg,
} from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { Badge, FileDropzone, Modal, Pagination, SearchableSelect } from '@/shared/components';
import { InlineLoading } from '../../../shared/components/Loading';
import sel from '@/shared/components/Table/RowSelect.module.css';
import { BulkButton, SelectCheckbox, SelectionBar } from '@/shared/components/Table/RowSelect';
import { useRowSelection } from '@/shared/hooks/useRowSelection';
import { apiClient } from '../../../shared/api/axios';
import {
	addCmeRecordEvidence,
	approveCmeRecord,
	rejectCmeRecord,
	createCmeRecord,
	deleteCmeRecord,
	downloadCmeRecordImportTemplate,
	exportCmeRecordsExcel,
	getCmeCreditCategories,
	getCmeCreditGroups,
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
import tbl from '@/shared/components/Table/Table.module.css';
import { DEFAULT_PAGE_SIZE } from '@/shared/utils/constants';
import { useClientPaging } from '@/shared/hooks/useClientPaging';

const THIS_YEAR = new Date().getFullYear();
const MIN_YEAR = 2000;
const MAX_YEAR = THIS_YEAR + 1;
const NO_CATEGORY = '__none__';

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

const NO_GROUP = '__none__';

// Tín chỉ = định mức của danh mục × số lượng (định mức 0 = "Khác" → nhập tay)
function calcCredits(category: CmeCreditCategory | undefined, quantity: string): string | null {
	if (!category?.conversion_value) return null;
	return String(+(category.conversion_value * (quantity === '' ? 1 : Number(quantity))).toFixed(2));
}

function RecordFormModal({
	record,
	users,
	categories,
	groups,
	onClose,
	onSaved,
}: {
	record: CmeRecord | null;
	users: SimpleUser[];
	categories: CmeCreditCategory[];
	groups: { id: string; name: string }[];
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
	const groupOf = (id: string) => categories.find((c) => c.id === id)?.group_id ?? NO_GROUP;
	const [group, setGroup] = useState(() => (record?.category_id ? groupOf(record.category_id) : ''));
	const groupIds = Array.from(new Set(categories.map((c) => c.group_id ?? NO_GROUP)));
	const inGroup = categories.filter((c) => (c.group_id ?? NO_GROUP) === group);
	const unit = categories.find((c) => c.id === form.category_id)?.unit_label;
	const pickCategory = (category_id: string) =>
		setForm((f) => {
			const quantity = category_id && f.quantity === '' ? '1' : f.quantity;
			const cat = categories.find((c) => c.id === category_id);
			return { ...f, category_id, quantity, credits: calcCredits(cat, quantity) ?? f.credits };
		});
	const pickQuantity = (quantity: string) =>
		setForm((f) => ({
			...f,
			quantity,
			credits: calcCredits(categories.find((c) => c.id === f.category_id), quantity) ?? f.credits,
		}));
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
				<div className={styles.formGroup}>
					<label className={styles.formLabel}>Nhóm hoạt động</label>
					<select
						className={styles.formInput}
						value={group}
						onChange={(e) => {
							setGroup(e.target.value);
							pickCategory('');
						}}
					>
						<option value=''>-- Không thuộc danh mục --</option>
						{groupIds.map((g) => (
							<option key={g} value={g}>
								{g === NO_GROUP ? 'Khác' : (groups.find((x) => x.id === g)?.name ?? g)}
							</option>
						))}
					</select>
				</div>
				<div className={styles.formGroup}>
					<label className={styles.formLabel}>Hình thức / danh mục</label>
					<select
						className={styles.formInput}
						value={form.category_id}
						onChange={(e) => pickCategory(e.target.value)}
						disabled={!group}
					>
						<option value=''>-- Chọn --</option>
						{inGroup.map((c) => (
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
					<label className={styles.formLabel}>Vai trò</label>
					<input
						className={styles.formInput}
						value={form.role}
						onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
						placeholder='VD: Đại biểu, Báo cáo viên'
					/>
				</div>
				<div className={styles.formGroup}>
					<label className={styles.formLabel}>Số lượng{unit ? ` (${unit})` : ''}</label>
					<input
						type='number'
						step='0.1'
						className={styles.formInput}
						value={form.quantity}
						onChange={(e) => pickQuantity(e.target.value)}
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

function ImportModal({
	categories,
	groups,
	onClose,
	onDone,
}: {
	categories: CmeCreditCategory[];
	groups: { id: string; name: string }[];
	onClose: () => void;
	onDone: () => void;
}) {
	const [file, setFile] = useState<File | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const [preview, setPreview] = useState<CmeRecordImportResult | null>(null);
	const [result, setResult] = useState<CmeRecordImportResult | null>(null);
	const [downloading, setDownloading] = useState(false);
	// Mặc định áp cho dòng để trống ô tương ứng trong file
	const [year, setYear] = useState(String(THIS_YEAR));
	const [group, setGroup] = useState('');
	const [categoryId, setCategoryId] = useState('');
	const [title, setTitle] = useState('');
	const inGroup = group ? categories.filter((c) => c.group_id === group) : categories;
	const category = categories.find((c) => c.id === categoryId);
	const yearOk = /^\d{4}$/.test(year);
	const defaults = useMemo(
		() => ({ year: Number(year), group_id: group, category_id: categoryId, title: title.trim() }),
		[year, group, categoryId, title],
	);

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

	// Đọc thử lại mỗi khi đổi file hoặc giá trị mặc định (trễ 400ms khi đang gõ tên hoạt động)
	useEffect(() => {
		if (!file || !yearOk) return;
		let stale = false;
		const t = setTimeout(async () => {
			setLoading(true);
			setError('');
			try {
				const res = await importCmeRecordsExcel(file, true, defaults);
				if (!stale) setPreview(res);
			} catch (e) {
				if (!stale) {
					setPreview(null);
					setError(e instanceof Error ? e.message : 'Đọc file thất bại');
				}
			} finally {
				setLoading(false);
			}
		}, 400);
		return () => {
			stale = true;
			clearTimeout(t);
		};
	}, [file, yearOk, defaults]);

	const commit = async () => {
		if (!file || !yearOk) return;
		setLoading(true);
		setError('');
		try {
			const res = await importCmeRecordsExcel(file, false, defaults);
			setResult(res);
			onDone();
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Nhập thất bại');
		} finally {
			setLoading(false);
		}
	};

	const rows = preview?.rows ?? [];
	const pg = useClientPaging(rows);

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
						<button className={styles.btnPrimary} onClick={commit} disabled={loading || !yearOk || !preview || rows.length === 0}>
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
							Nhân viên khớp theo <b>Mã NV</b>. Năm, Nhóm/Loại hình thức chọn dưới đây áp cho cả file. Tên hoạt
							động mặc định dùng cho dòng để trống cột Hoạt động.
						</span>
					</div>
					<div className={styles.importDefaults}>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>
								Năm <span className={styles.required}>*</span>
							</label>
							<input
								type='number'
								className={`${styles.formInput} ${yearOk ? '' : styles.inputError}`}
								value={year}
								onChange={(e) => setYear(e.target.value)}
							/>
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Nhóm hình thức (tùy chọn)</label>
							<select
								className={styles.formInput}
								value={group}
								onChange={(e) => {
									setGroup(e.target.value);
									setCategoryId('');
								}}
							>
								<option value=''>-- Không chọn --</option>
								{groups.map((g) => (
									<option key={g.id} value={g.id}>
										{g.name}
									</option>
								))}
							</select>
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Loại hình thức (tùy chọn)</label>
							<select className={styles.formInput} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
								<option value=''>-- Không chọn --</option>
								{inGroup.map((c) => (
									<option key={c.id} value={c.id}>
										{c.name}
									</option>
								))}
							</select>
						</div>
						<div className={`${styles.hint} ${styles.full}`}>
							{category?.conversion_value
								? `Giờ tín chỉ = Số lượng × ${category.conversion_value} giờ/${category.unit_label || 'lần'} — bắt buộc cột Số lượng (trống thì bỏ qua dòng), cột Giờ tín chỉ trong file không dùng.`
								: 'Không có giờ quy đổi (loại "Khác" hoặc không chọn loại): không cần Số lượng, lấy cột Giờ tín chỉ trong file.'}
						</div>
						<div className={`${styles.formGroup} ${styles.full}`}>
							<label className={styles.formLabel}>Tên hoạt động mặc định</label>
							<input
								className={styles.formInput}
								value={title}
								onChange={(e) => setTitle(e.target.value)}
								placeholder="Dùng khi cột 'Hoạt động' trong file để trống"
							/>
						</div>
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
								setPreview(null);
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
										<th className={tbl.thIdx}>STT</th>
										<th>Nhân viên</th>
										<th>Nội dung</th>
										<th>Năm</th>
										<th>Vai trò</th>
										<th>Ngày</th>
										<th>Số lượng</th>
										<th>Tín chỉ</th>
									</tr>
								</thead>
								<tbody>
									{pg.paged.map((r, i) => (
										<tr key={r.row}>
											<td className={styles.tdIdx}>{pg.offset + i + 1}</td>
											<td>
												{r.matched_user_name || r.full_name_raw || '—'}
												{!r.valid && <div className={styles.rowWarn}>Sẽ bị bỏ qua</div>}
											</td>
											<td>{r.title}</td>
											<td>{r.year ?? '—'}</td>
											<td>{r.role || '—'}</td>
											<td>{r.activity_date ? `${r.activity_date}${r.end_date ? ` → ${r.end_date}` : ''}` : '—'}</td>
											<td>{r.quantity ?? '—'}</td>
											<td>{r.credits ?? '—'}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
					{rows.length > 0 && (
						<Pagination
							{...pg.pagination}
							itemLabel='dòng'
						/>
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
	const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
	const [search, setSearch] = useState('');
	const [deptFilter, setDeptFilter] = useState('');
	const [categoryFilter, setCategoryFilter] = useState('');
	const [evidenceFilter, setEvidenceFilter] = useState<'' | 'yes' | 'no'>('');
	const [statusFilter, setStatusFilter] = useState<'' | CmeRecord['approval_status']>('');
	const [tab, setTab] = useState<'open' | 'approved'>('open');
	const [rejecting, setRejecting] = useState<CmeRecord | null>(null);
	const [rejectReason, setRejectReason] = useState('');
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
		getCmeCreditGroups().then((r) => setGroups(r.data)).catch(() => {});
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
			if ((r.approval_status === 'approved') !== (tab === 'approved')) return false;
			if (q && !r.user_name.toLowerCase().includes(q) && !r.title.toLowerCase().includes(q)) return false;
			if (deptFilter && r.department_name !== deptFilter) return false;
			if (categoryFilter === NO_CATEGORY && r.category_id) return false;
			if (categoryFilter && categoryFilter !== NO_CATEGORY && r.category_id !== categoryFilter) return false;
			if (evidenceFilter === 'yes' && !r.evidence_file_url) return false;
			if (evidenceFilter === 'no' && r.evidence_file_url) return false;
			if (statusFilter && r.approval_status !== statusFilter) return false;
			return true;
		});
	}, [records, tab, search, deptFilter, categoryFilter, evidenceFilter, statusFilter]);

	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
	// Đổi bộ lọc / năm thì quay về trang đầu (điều chỉnh khi render, không dùng effect)
	const filterKey = `${search}|${deptFilter}|${categoryFilter}|${evidenceFilter}|${statusFilter}|${year}|${tab}`;
	const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
	if (prevFilterKey !== filterKey) {
		setPrevFilterKey(filterKey);
		setPage(1);
	}
	const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
	const safePage = Math.min(page, totalPages);
	const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

	const totalCredits = filtered.reduce((sum, r) => sum + (r.approval_status === 'approved' ? Number(r.credits || 0) : 0), 0);
	const approvedCount = records.filter((r) => r.approval_status === 'approved').length;
	const openCount = records.length - approvedCount;
	const hasFilter = !!(search || deptFilter || categoryFilter || evidenceFilter || statusFilter);
	const clearFilters = () => {
		setSearch('');
		setDeptFilter('');
		setCategoryFilter('');
		setEvidenceFilter('');
		setStatusFilter('');
	};

	const [exporting, setExporting] = useState(false);
	const handleExport = async () => {
		setExporting(true);
		try {
			// Báo cáo tổng hợp theo nhân sự (BC tổng + BC chi tiết theo hình thức), lọc theo năm/khoa/từ khoá
			const blob = await exportCmeRecordsExcel({
				year: year ?? undefined,
				search: search.trim() || undefined,
				department: deptFilter || undefined,
			});
			saveBlob(blob, `bao-cao-cme${year ? `-${year}` : ''}.xlsx`);
		} catch (e) {
			alert(e instanceof Error ? e.message : 'Xuất Excel thất bại');
		} finally {
			setExporting(false);
		}
	};

	// Duyệt / từ chối đồng loạt: chọn theo id (giữ khi đổi trang), bỏ qua bản ghi
	// đã ở trạng thái đích. Bản ghi lỗi được giữ lại trong lựa chọn để thử lại.
	const rowSel = useRowSelection(useMemo(() => paged.map((r) => r.id), [paged]));
	const selectedRecs = records.filter((r) => rowSel.selectedIds.has(r.id));
	const toApprove = selectedRecs.filter((r) => r.approval_status !== 'approved');
	const toReject = selectedRecs.filter((r) => r.approval_status !== 'rejected');
	const [bulkRejecting, setBulkRejecting] = useState(false);
	const [bulkBusy, setBulkBusy] = useState(false);

	const runBulk = async (recs: CmeRecord[], fn: (id: string) => Promise<unknown>) => {
		setBulkBusy(true);
		const results = await Promise.allSettled(recs.map((r) => fn(r.id)));
		setBulkBusy(false);
		rowSel.clearSelection();
		const failed = recs.filter((_, i) => results[i].status === 'rejected');
		failed.forEach((r) => rowSel.toggleSelect(r.id));
		if (failed.length) alert(`${failed.length}/${recs.length} bản ghi xử lý thất bại, đã giữ lại trong danh sách chọn.`);
		refresh();
	};
	const handleBulkApprove = () => {
		if (window.confirm(`Duyệt ${toApprove.length} ghi nhận đã chọn?`)) runBulk(toApprove, approveCmeRecord);
	};
	const handleBulkReject = async () => {
		await runBulk(toReject, (id) => rejectCmeRecord(id, rejectReason));
		setBulkRejecting(false);
		setRejectReason('');
	};

	const handleApprove = async (id: string) => {
		try {
			await approveCmeRecord(id);
			refresh();
		} catch (e) {
			alert(e instanceof Error ? e.message : 'Duyệt thất bại');
		}
	};
	const handleReject = async () => {
		if (!rejecting) return;
		try {
			await rejectCmeRecord(rejecting.id, rejectReason);
			setRejecting(null);
			setRejectReason('');
			refresh();
		} catch (e) {
			alert(e instanceof Error ? e.message : 'Từ chối thất bại');
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
						<button
							className={styles.btnGhost}
							onClick={handleExport}
							disabled={exporting}
							title='Báo cáo tín chỉ CME theo nhân sự: BC tổng + BC chi tiết theo hình thức (gồm cả hội thảo đã cấp CME)'
						>
							{exporting ? <span className={styles.spinner} /> : <DownloadSvg />} Xuất báo cáo
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
				<div className={styles.tabs}>
					{(
						[
							{ key: 'approved', label: `Đã phê duyệt (${approvedCount})` },
							{ key: 'open', label: `Chưa phê duyệt (${openCount})` },
						] as const
					).map((t) => (
						<button
							key={t.key}
							type='button'
							className={`${styles.tab} ${tab === t.key ? styles.tabActive : ''}`}
							onClick={() => {
								setTab(t.key);
								setStatusFilter('');
							}}
						>
							{t.label}
						</button>
					))}
				</div>

				<div className={styles.tableCard}>
				<div className={styles.tableHeader}>
					<div className={styles.tableHeaderLeft}>
						<span className={styles.tableTitle}>Danh sách ghi nhận CME</span>
						<span className={styles.tableCount}>
							{filtered.length} bản ghi{tab === 'approved' && ` · ${formatCredits(totalCredits)} tín chỉ`}
						</span>
					</div>
					<div className={styles.tableControls}>
						<SearchInput
							value={search}
							onChange={setSearch}
							placeholder='Tìm nhân viên, nội dung...'
						/>
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
							{tab === 'open' && (
								<select
									className={styles.filterSelect}
									value={statusFilter}
									onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
								>
									<option value=''>Chờ duyệt + từ chối</option>
									<option value='pending'>Chờ duyệt</option>
									<option value='rejected'>Bị từ chối</option>
								</select>
							)}
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
					<>
					{perms.canCme && (
						<SelectionBar
							count={selectedRecs.length}
							onClear={rowSel.clearSelection}
							itemLabel='ghi nhận'
							actions={
								<>
									<BulkButton disabled={bulkBusy || toApprove.length === 0} onClick={handleBulkApprove}>
										<CheckSvg /> Duyệt đã chọn ({toApprove.length})
									</BulkButton>
									<BulkButton
										danger
										disabled={bulkBusy || toReject.length === 0}
										onClick={() => {
											setRejectReason('');
											setBulkRejecting(true);
										}}
									>
										<XSvg /> Từ chối đã chọn ({toReject.length})
									</BulkButton>
								</>
							}
						/>
					)}
					<div className={styles.tableWrap}>
						<table className={styles.table}>
							<thead>
								<tr>
									{perms.canCme && (
										<th className={sel.checkCol}>
											<SelectCheckbox
												title='Chọn tất cả bản ghi đang hiển thị'
												checked={rowSel.allPageSelected}
												indeterminate={rowSel.somePageSelected}
												onChange={rowSel.toggleSelectAll}
											/>
										</th>
									)}
									<th>STT</th>
									<th>Nhân viên</th>
									<th>Nội dung hoạt động</th>
									<th>Nhóm / Hình thức · Vai trò</th>
									<th>Thời gian</th>
									<th className={styles.thRight}>Tín chỉ</th>
									<th className={styles.thCenter}>Minh chứng</th>
									<th>Duyệt</th>
									<th />
								</tr>
							</thead>
							<tbody>
								{paged.map((r, i) => (
									<tr key={r.id} className={styles.tr}>
										{perms.canCme && (
											<td className={sel.checkCol}>
												<SelectCheckbox
													title={`Chọn ${r.user_name}`}
													checked={rowSel.isSelected(r.id)}
													onChange={() => rowSel.toggleSelect(r.id)}
												/>
											</td>
										)}
										<td className={styles.tdIdx}>{(safePage - 1) * pageSize + i + 1}</td>
										<td>
											<div className={styles.cmeCellMain}>{r.user_name}</div>
											<div className={styles.cmeCellSub}>{[r.staff_number, r.department_name].filter(Boolean).join(' · ') || '—'}</div>
										</td>
										<td>
											<div className={styles.cmeCellMain}>{r.title}</div>
											{r.note && <div className={styles.cmeCellSub}>{r.note}</div>}
										</td>
										<td>
											{r.group_name && <div className={styles.cmeCellSub}>{r.group_name}</div>}
											{r.category_name ? (
												<Badge tone='blue' className={styles.cmeCategory} title={r.category_name}>
													{r.category_name}
												</Badge>
											) : (
												<span className={styles.muted}>—</span>
											)}
												{(r.role || r.quantity != null) && (
													<div className={styles.cmeCellSub}>
														{[r.role, r.quantity != null && `SL: ${r.quantity}`].filter(Boolean).join(' · ')}
													</div>
												)}
											</td>
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
										<td>
		<Badge tone={r.approval_status === 'approved' ? 'green' : r.approval_status === 'rejected' ? 'red' : 'amber'}>
			{r.approval_status === 'approved' ? 'Đã duyệt' : r.approval_status === 'rejected' ? 'Từ chối' : 'Chờ duyệt'}
		</Badge>
		{r.approval_status === 'rejected' && r.reject_reason && <div className={styles.cmeCellSub}>{r.reject_reason}</div>}
</td>
										<td className={styles.tdActions}>
											{perms.canCme && (
												<div className={styles.actionBtns}>
		{r.approval_status !== 'approved' && (
			<div className={styles.actionBtn} title='Duyệt' onClick={() => handleApprove(r.id)}>
				<CheckSvg />
			</div>
		)}
		{r.approval_status !== 'rejected' && (
			<div
				className={`${styles.actionBtn} ${styles.danger}`}
				title='Từ chối'
				onClick={() => {
					setRejecting(r);
					setRejectReason('');
				}}
			>
				<XSvg />
			</div>
		)}
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
					</div>
					</>
				)}

				{!loading && (
					<Pagination
						page={safePage}
						totalPages={totalPages}
						total={filtered.length}
						rowsPerPage={pageSize}
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
					groups={groups}
					onClose={() => setEditing(null)}
					onSaved={refresh}
				/>
			)}
			{showImport && <ImportModal categories={categories} groups={groups} onClose={() => setShowImport(false)} onDone={refresh} />}

			<Modal
	open={!!rejecting || bulkRejecting}
	onClose={() => {
		setRejecting(null);
		setBulkRejecting(false);
	}}
	title={bulkRejecting ? `Từ chối ${toReject.length} ghi nhận CME` : 'Từ chối ghi nhận CME'}
	footer={
		<>
			<button
				className={styles.btnCancel}
				onClick={() => {
					setRejecting(null);
					setBulkRejecting(false);
				}}
			>
				Huỷ
			</button>
			<button
				className={styles.btnDanger}
				onClick={bulkRejecting ? handleBulkReject : handleReject}
				disabled={!rejectReason.trim() || bulkBusy}
			>
				Từ chối
			</button>
		</>
	}
>
	<label className={styles.formLabel}>Lý do từ chối * (người dùng sẽ thấy để sửa và gửi lại)</label>
	<input className={styles.formInput} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} autoFocus />
</Modal>

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
