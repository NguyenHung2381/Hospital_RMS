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
import { BulkButton, BulkDeleteModal, DeleteAllButton, SelectCheckbox, SelectionBar } from '@/shared/components/Table/RowSelect';
import { useRowSelection } from '@/shared/hooks/useRowSelection';
import { apiClient } from '../../../shared/api/axios';
import {
	addCmeRecordEvidence,
	approveCmeRecord,
	rejectCmeRecord,
	createCmeImportStaff,
	createCmeRecord,
	createCmeRecordFromImportRow,
	deleteCmeRecord,
	deleteCmeRecords,
	downloadCmeRecordImportTemplate,
	exportCmeRecordsExcel,
	getCmeCreditCategories,
	getCmeCreditGroups,
	getCmeRecords,
	importCmeRecordsExcel,
	updateCmeRecord,
} from '../api/cmeRecordApi';
import { useSeminarPerms } from '../utils/perms';
import { usePermission } from '@/shared/hooks/usePermission';
import { updateUser } from '@/features/user/api/userApi';
import { saveBlob } from '@/shared/utils/saveBlob';
import {
	EMPTY_CME_RECORD_FORM,
	type CmeCreditCategory,
	type CmeRecord,
	type CmeRecordFormData,
	type CmeImportCreatedStaff,
	type CmeRecordImportResult,
	type CmeRecordImportRow,
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

const MAX_REPORT_YEARS = 20;
const REPORT_PRESETS = [
	{ label: 'Năm nay', years: 1 },
	{ label: '3 năm gần nhất', years: 3 },
	{ label: '5 năm gần nhất', years: 5 },
] as const;

/**
 * Xuất báo cáo CME theo khoảng năm: chọn "Từ năm – Đến năm" (hoặc tất cả các năm).
 * Nhiều năm thì file có thêm cột từng năm ở BC tổng / Theo khoa / Chưa đạt, sheet "Theo năm"
 * và mỗi năm một sheet riêng "Năm <yyyy>".
 */
function ExportReportModal({
	initialYear,
	search,
	department,
	onClose,
}: {
	initialYear: number | null;
	search: string;
	department: string;
	onClose: () => void;
}) {
	const [allYears, setAllYears] = useState(false);
	const [from, setFrom] = useState(initialYear ?? THIS_YEAR);
	const [to, setTo] = useState(initialYear ?? THIS_YEAR);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');

	// Giữ Từ ≤ Đến và không quá MAX_REPORT_YEARS năm: chỉnh đầu kia theo đầu vừa đổi
	const pickFrom = (y: number) => {
		setFrom(y);
		if (y > to) setTo(y);
		else if (to - y + 1 > MAX_REPORT_YEARS) setTo(y + MAX_REPORT_YEARS - 1);
	};
	const pickTo = (y: number) => {
		setTo(y);
		if (y < from) setFrom(y);
		else if (y - from + 1 > MAX_REPORT_YEARS) setFrom(y - MAX_REPORT_YEARS + 1);
	};
	const span = to - from + 1;

	const run = async () => {
		setBusy(true);
		setError('');
		try {
			const blob = await exportCmeRecordsExcel({
				from_year: allYears ? undefined : from,
				to_year: allYears ? undefined : to,
				search: search.trim() || undefined,
				department: department || undefined,
			});
			const suffix = allYears ? '' : from === to ? `-${from}` : `-${from}-${to}`;
			saveBlob(blob, `bao-cao-cme${suffix}.xlsx`);
			onClose();
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Xuất Excel thất bại');
		} finally {
			setBusy(false);
		}
	};

	return (
		<Modal
			open
			onClose={() => !busy && onClose()}
			title='Xuất báo cáo tín chỉ CME'
			subtitle='BC tổng + BC chi tiết theo hình thức, gồm cả hội thảo đã cấp CME'
			size='md'
			footer={
				<>
					<button className={styles.btnCancel} onClick={onClose} disabled={busy}>
						Huỷ
					</button>
					<button className={styles.btnPrimary} onClick={run} disabled={busy}>
						{busy ? <span className={styles.spinner} /> : <DownloadSvg />} Xuất Excel
					</button>
				</>
			}
		>
			{error && <div className={styles.fieldError}>{error}</div>}
			<div className={styles.formGroup}>
				<label className={styles.formLabel}>Phạm vi năm</label>
				<div className={styles.yearMode} role='group' aria-label='Phạm vi năm'>
					{REPORT_PRESETS.map((p) => {
						const active = !allYears && to === THIS_YEAR && span === p.years;
						return (
							<button
								key={p.label}
								type='button'
								className={active ? styles.yearModeActive : ''}
								onClick={() => {
									setAllYears(false);
									setTo(THIS_YEAR);
									setFrom(THIS_YEAR - p.years + 1);
								}}
							>
								{p.label}
							</button>
						);
					})}
					<button
						type='button'
						className={allYears ? styles.yearModeActive : ''}
						onClick={() => setAllYears(true)}
					>
						Tất cả năm
					</button>
				</div>
			</div>
			{!allYears && (
				<div className={styles.formGrid} style={{ marginTop: 12 }}>
					<div className={styles.formGroup}>
						<label className={styles.formLabel}>Từ năm</label>
						<YearStepper value={from} onChange={pickFrom} />
					</div>
					<div className={styles.formGroup}>
						<label className={styles.formLabel}>Đến năm</label>
						<YearStepper value={to} onChange={pickTo} />
					</div>
				</div>
			)}
			<div className={styles.hint} style={{ marginTop: 12 }}>
				{allYears
					? 'Cộng dồn tín chỉ của mọi năm; mỗi năm có dữ liệu là một cột riêng.'
					: span === 1
						? `Báo cáo năm ${from}.`
						: `Giai đoạn ${from} – ${to} (${span} năm): BC tổng, Theo khoa, Chưa đạt có cột số tiết từng năm; thêm sheet "Theo năm" và mỗi năm một sheet riêng "Năm …". Ngưỡng đánh giá = cộng dồn ngưỡng các năm (tối đa ${MAX_REPORT_YEARS} năm).`}
				{(department || search.trim()) && (
					<>
						<br />
						Áp dụng bộ lọc đang chọn:{' '}
						{[department && `khoa/phòng "${department}"`, search.trim() && `từ khoá "${search.trim()}"`]
							.filter(Boolean)
							.join(', ')}
						.
					</>
				)}
			</div>
		</Modal>
	);
}

function formatCredits(n: number): string {
	return Number(n).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
}

interface SimpleUser {
	id: string;
	full_name: string;
	staff_number?: string | number | null;
	/** Tài khoản dùng chung của khoa/phòng — không phải nhân sự, không ghi nhận CME */
	is_dept_account?: boolean;
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
		() =>
			users
				// Bỏ tài khoản khoa/phòng (tài khoản dùng chung, không phải nhân sự)
				.filter((u) => !u.is_dept_account)
				.map((u) => ({
					id: u.id,
					name: u.staff_number ? `${u.full_name} (${u.staff_number})` : u.full_name,
				})),
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
			return {
				...f,
				category_id,
				quantity,
				credits: calcCredits(cat, quantity) ?? f.credits,
			};
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
							setForm((f) => ({
								...f,
								activity_date: e.target.value,
								year: e.target.value.slice(0, 4) || f.year,
							}))
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

/** Nút "Thêm NV" trong hộp thoại nhập: thêm nhân viên cho Mã NV chưa có trong hệ thống. */
function AddStaffModal({
	staffNumber,
	fullName,
	departments,
	onClose,
	onCreated,
}: {
	staffNumber: number;
	fullName: string;
	departments: { id: string; name: string }[];
	onClose: () => void;
	onCreated: (staff: CmeImportCreatedStaff) => Promise<void> | void;
}) {
	const [name, setName] = useState(fullName);
	const [deptId, setDeptId] = useState('');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');

	const save = async () => {
		if (!name.trim() || !deptId) {
			setError('Vui lòng nhập họ tên và chọn khoa/phòng');
			return;
		}
		setBusy(true);
		setError('');
		try {
			const staff = await createCmeImportStaff({ staff_number: staffNumber, full_name: name.trim(), department_id: deptId });
			await onCreated(staff);
			onClose();
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Thêm nhân viên thất bại');
		} finally {
			setBusy(false);
		}
	};

	return (
		<Modal
			open
			onClose={() => !busy && onClose()}
			title={`Thêm nhân viên Mã NV ${staffNumber}`}
			size='sm'
			footer={
				<>
					<button className={styles.btnCancel} onClick={onClose} disabled={busy}>
						Huỷ
					</button>
					<button className={styles.btnPrimary} onClick={save} disabled={busy}>
						{busy ? <span className={styles.spinner} /> : <PlusSvg />} Thêm nhân viên
					</button>
				</>
			}
		>
			{error && <div className={styles.fieldError}>{error}</div>}
			<div className={styles.formGroup}>
				<label className={styles.formLabel}>Mã NV</label>
				<input className={styles.formInput} value={staffNumber} disabled />
			</div>
			<div className={styles.formGroup}>
				<label className={styles.formLabel}>
					Họ và tên <span className={styles.required}>*</span>
				</label>
				<input className={styles.formInput} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
			</div>
			<div className={styles.formGroup}>
				<label className={styles.formLabel}>
					Khoa / Phòng <span className={styles.required}>*</span>
				</label>
				<SearchableSelect
					options={departments}
					value={deptId}
					onChange={setDeptId}
					placeholder={departments.length ? 'Chọn khoa/phòng' : 'Đang tải danh sách...'}
				/>
			</div>
			<div className={styles.hint}>
				Tạo luôn tài khoản vai trò Thành viên: mật khẩu ban đầu là <b>tên đăng nhập</b>, bắt đổi ở lần đăng nhập
				đầu.
			</div>
		</Modal>
	);
}

/** Bổ sung họ tên / khoa cho nhân viên vừa tạo khi nhập Excel mà file không có đủ thông tin. */
function CompleteStaffModal({
	staff,
	departments,
	onClose,
	onSaved,
}: {
	staff: CmeImportCreatedStaff[];
	departments: { id: string; name: string }[];
	onClose: () => void;
	onSaved: (updated: CmeImportCreatedStaff[]) => void;
}) {
	// Ô để trống = giữ nguyên (tên tạm "Chưa cập nhật tên…" không đưa vào ô nhập)
	const [form, setForm] = useState<Record<string, { name: string; deptId: string }>>(() =>
		Object.fromEntries(staff.map((u) => [u.id, { name: u.missing_name ? '' : u.full_name, deptId: '' }])),
	);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const set = (id: string, patch: Partial<{ name: string; deptId: string }>) =>
		setForm((f) => ({ ...f, [id]: { ...f[id], ...patch } }));

	const save = async () => {
		const changes = staff
			.map((u) => {
				const f = form[u.id];
				const name = f.name.trim();
				return {
					u,
					payload: {
						...(name && name !== u.full_name ? { full_name: name } : {}),
						...(f.deptId ? { department_id: f.deptId } : {}),
					},
				};
			})
			.filter((c) => Object.keys(c.payload).length > 0);
		if (!changes.length) {
			onClose();
			return;
		}
		setBusy(true);
		setError('');
		const results = await Promise.allSettled(changes.map((c) => updateUser(c.u.id, c.payload)));
		setBusy(false);
		const updated = changes
			.filter((_, i) => results[i].status === 'fulfilled')
			.map(({ u, payload }) => ({
				...u,
				full_name: payload.full_name ?? u.full_name,
				missing_name: u.missing_name && !payload.full_name,
				department_name: payload.department_id
					? (departments.find((d) => d.id === payload.department_id)?.name ?? u.department_name)
					: u.department_name,
				missing_department: u.missing_department && !payload.department_id,
			}));
		if (updated.length) onSaved(updated);
		const failed = results.length - updated.length;
		if (failed) setError(`${failed}/${results.length} nhân viên cập nhật thất bại, vui lòng thử lại`);
		else onClose();
	};

	return (
		<Modal
			open
			onClose={() => !busy && onClose()}
			title='Bổ sung thông tin nhân viên mới'
			size='lg'
			footer={
				<>
					<button className={styles.btnCancel} onClick={onClose} disabled={busy}>
						Để sau
					</button>
					<button className={styles.btnPrimary} onClick={save} disabled={busy}>
						{busy ? <span className={styles.spinner} /> : <CheckSvg />} Lưu thông tin
					</button>
				</>
			}
		>
			<div className={styles.noticeBox}>
				<InfoSvg />
				<span>
					File chưa có đủ họ tên / khoa của <b>{staff.length}</b> nhân viên vừa tạo. Nhập luôn tại đây, ô để trống sẽ
					giữ nguyên (có thể bổ sung sau ở <b>Hệ thống → Người dùng</b>).
				</span>
			</div>
			{error && <div className={styles.fieldError}>{error}</div>}
			<div className={styles.importPreview}>
				<table className={styles.table}>
					<thead>
						<tr>
							<th>Mã NV</th>
							<th>Họ và tên</th>
							<th>Khoa/Phòng</th>
						</tr>
					</thead>
					<tbody>
						{staff.map((u, i) => (
							<tr key={u.id}>
								<td>{u.staff_number}</td>
								<td>
									<input
										className={styles.formInput}
										value={form[u.id].name}
										onChange={(e) => set(u.id, { name: e.target.value })}
										placeholder={u.missing_name ? 'Nhập họ và tên' : u.full_name}
										autoFocus={i === 0}
										disabled={busy}
									/>
								</td>
								<td style={{ minWidth: 240 }}>
									{u.missing_department ? (
										<SearchableSelect
											options={departments}
											value={form[u.id].deptId}
											onChange={(id) => set(u.id, { deptId: id })}
											placeholder={departments.length ? 'Chọn khoa/phòng' : 'Đang tải danh sách...'}
										/>
									) : (
										u.department_name
									)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
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
	const [quantity, setQuantity] = useState('');
	// Mã NV chưa có trong hệ thống → tạo nhân viên mới (tạo tài khoản ⇒ cần users:create)
	const perm = usePermission();
	const canCreateStaff = perm.has('users:create');
	// Bổ sung tên/khoa cho NV vừa tạo (PUT /users/:id ⇒ cần users:update)
	const canUpdateStaff = perm.has('users:update');
	// Mặc định bật: file thường chỉ có Mã NV, người chưa có trong hệ thống được tạo luôn
	const [createMissing, setCreateMissing] = useState(canCreateStaff);
	// Tài khoản tạo bằng nút "Thêm NV" (gộp với result.created_staff để hiển thị chung)
	const [manualAccounts, setManualAccounts] = useState<CmeImportCreatedStaff[]>([]);
	// Khoa chọn riêng cho nhân viên mới chưa có khoa (bước xem trước): Mã NV → department_id
	const [staffDepts, setStaffDepts] = useState<Record<number, string>>({});
	// Họ tên nhập cho nhân viên mới mà file và hệ thống chưa có (bắt buộc mới tạo tài khoản): Mã NV → họ tên
	const [staffNames, setStaffNames] = useState<Record<number, string>>({});
	const staffNamesFilled = useMemo(
		() => Object.fromEntries(Object.entries(staffNames).filter(([, v]) => v.trim())) as Record<number, string>,
		[staffNames],
	);
	const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
	// Nút "Thêm NV": phase 'preview' → đọc lại file; 'result' → nhập tiếp các dòng đã bỏ qua
	const [adding, setAdding] = useState<{
		staffNumber: number;
		fullName: string;
		phase: 'preview' | 'result';
	} | null>(null);
	const [previewKey, setPreviewKey] = useState(0);
	const [addedAfter, setAddedAfter] = useState<
		Record<number, { staff: CmeImportCreatedStaff; imported: number; failed: number }>
	>({});
	// Thông tin đã bổ sung sau khi tạo (ghi đè lên bản ghi trong result/manualAccounts)
	const [patchedStaff, setPatchedStaff] = useState<Record<string, CmeImportCreatedStaff>>({});
	const [completing, setCompleting] = useState(false);
	useEffect(() => {
		if ((!createMissing && !adding && !completing) || departments.length) return;
		apiClient
			.get<{ data: { id: string; name: string }[] }>('/departments?limit=0')
			.then((r) => setDepartments(r.data))
			.catch(() => setError('Không tải được danh sách khoa/phòng'));
	}, [createMissing, adding, completing, departments.length]);
	const inGroup = group ? categories.filter((c) => c.group_id === group) : categories;
	const category = categories.find((c) => c.id === categoryId);
	const yearOk = /^\d{4}$/.test(year);
	const quantityNum = quantity.trim() === '' ? undefined : Number(quantity);
	const quantityOk = quantityNum === undefined || (Number.isFinite(quantityNum) && quantityNum > 0);
	const defaults = useMemo(
		() => ({
			year: Number(year),
			group_id: group,
			category_id: categoryId,
			title: title.trim(),
			quantity: quantityOk ? quantityNum : undefined,
			create_missing: createMissing,
			staff_departments: createMissing && Object.keys(staffDepts).length ? staffDepts : undefined,
			staff_names: createMissing && Object.keys(staffNamesFilled).length ? staffNamesFilled : undefined,
		}),
		[year, group, categoryId, title, quantityOk, quantityNum, createMissing, staffDepts, staffNamesFilled],
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
	}, [file, yearOk, defaults, previewKey]);

	const commit = async () => {
		if (!file || !yearOk || !quantityOk) return;
		setLoading(true);
		setError('');
		try {
			const res = await importCmeRecordsExcel(file, false, defaults);
			setResult(res);
			onDone();
			// File thiếu họ tên / khoa → mở luôn hộp thoại bổ sung
			if (canUpdateStaff && res.created_staff?.some((u) => u.missing_name || u.missing_department)) setCompleting(true);
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Nhập thất bại');
		} finally {
			setLoading(false);
		}
	};

	// Dòng đã bỏ qua vì chưa có nhân viên, gom theo Mã NV (màn kết quả)
	const missingGroups = useMemo(() => {
		const map = new Map<
			number,
			{
				staffNumber: number;
				fullName: string;
				rows: NonNullable<CmeRecordImportResult['skipped_rows']>;
			}
		>();
		for (const r of result?.skipped_rows ?? []) {
			if (!r.missing_user || r.staff_number == null) continue;
			const g = map.get(r.staff_number) ?? {
				staffNumber: r.staff_number,
				fullName: r.full_name_raw ?? '',
				rows: [],
			};
			if (!g.fullName && r.full_name_raw) g.fullName = r.full_name_raw;
			g.rows.push(r);
			map.set(r.staff_number, g);
		}
		return [...map.values()];
	}, [result]);

	const onStaffCreated = async (staff: CmeImportCreatedStaff) => {
		setManualAccounts((a) => [...a, staff]);
		if (adding?.phase === 'preview') {
			setPreviewKey((k) => k + 1); // đọc lại file → dòng của Mã NV này khớp nhân viên vừa thêm
			return;
		}
		// Màn kết quả: nhập tiếp các dòng của Mã NV này (dòng thiếu năm/tín chỉ vẫn bỏ qua)
		const group = missingGroups.find((g) => g.staffNumber === staff.staff_number);
		let imported = 0;
		let failed = 0;
		for (const r of group?.rows ?? []) {
			if (!r.year || r.credits == null) {
				failed++;
				continue;
			}
			try {
				await createCmeRecordFromImportRow(r, staff.id);
				imported++;
			} catch {
				failed++;
			}
		}
		setAddedAfter((m) => ({
			...m,
			[staff.staff_number]: { staff, imported, failed },
		}));
		onDone();
	};

	const accounts = [...(result?.created_staff ?? []), ...manualAccounts].map((u) => patchedStaff[u.id] ?? u);
	const incomplete = accounts.filter((u) => u.missing_name || u.missing_department);
	// Danh sách tài khoản để phát cho nhân viên — CSV có BOM để Excel đọc đúng tiếng Việt
	const downloadAccounts = () => {
		const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
		const lines = [
			['Mã NV', 'Họ và tên', 'Khoa/Phòng', 'Tên đăng nhập', 'Mật khẩu ban đầu', 'Ghi chú'],
			...accounts.map((u) => [
				u.staff_number,
				u.full_name,
				u.department_name ?? '',
				u.username,
				u.username,
				[u.missing_name && 'Cần bổ sung tên', u.missing_department && 'Cần bổ sung khoa'].filter(Boolean).join('; '),
			]),
		].map((r) => r.map(esc).join(','));
		saveBlob(
			new Blob(['\uFEFF' + lines.join('\r\n')], {
				type: 'text/csv;charset=utf-8',
			}),
			`tai-khoan-nhan-vien-moi-${new Date().toISOString().slice(0, 10)}.csv`,
		);
	};

	const rows = preview?.rows ?? [];
	const pg = useClientPaging(rows);
	// Nhân viên mới chưa tìm được họ tên / khoa — nhập luôn ở đây (họ tên bắt buộc mới tạo tài khoản).
	// Giữ cả người đã nhập ở đây (để sửa lại được), mỗi Mã NV 1 dòng.
	const nameEditable = (st: NonNullable<CmeRecordImportRow['new_staff']>) =>
		st.missing_name || staffNames[st.staff_number] !== undefined;
	const deptEditable = (st: NonNullable<CmeRecordImportRow['new_staff']>) =>
		!st.department_id || !!staffDepts[st.staff_number];
	const staffNeedInfo = useMemo(() => {
		const map = new Map<number, NonNullable<CmeRecordImportRow['new_staff']>>();
		for (const r of rows) {
			const st = r.new_staff;
			if (st && (nameEditable(st) || deptEditable(st)) && !map.has(st.staff_number)) map.set(st.staff_number, st);
		}
		return [...map.values()];
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [rows, staffDepts, staffNames]);
	const missingNames = staffNeedInfo.filter((st) => !staffNames[st.staff_number]?.trim() && st.missing_name).length;

	return (
		<>
			<Modal
				open
				onClose={() => !adding && !completing && onClose()}
				title='Nhập ghi nhận CME từ Excel'
				size='lg'
				footer={
					<>
						<button className={styles.btnCancel} onClick={onClose} disabled={loading}>
							{result ? 'Đóng' : 'Huỷ'}
						</button>
						{!result && (
							<button className={styles.btnPrimary} onClick={commit} disabled={loading || !yearOk || !quantityOk || !preview || rows.length === 0}>
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
								Nhân viên khớp theo <b>Mã NV</b>. Năm, Nhóm/Loại hình thức chọn dưới đây áp cho cả file. Số lượng
								và Tên hoạt động mặc định dùng cho dòng để trống cột tương ứng.
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
									? `Giờ tín chỉ = Số lượng × ${category.conversion_value} giờ/${category.unit_label || 'lần'} — bắt buộc có Số lượng (ô trống lấy Số lượng mặc định, không có thì bỏ qua dòng), cột Giờ tín chỉ trong file không dùng.`
									: 'Không có giờ quy đổi (loại "Khác" hoặc không chọn loại): không cần Số lượng, lấy cột Giờ tín chỉ trong file.'}
							</div>
							<div className={`${styles.full} ${styles.importDefaultsRow}`}>
								<div className={styles.formGroup}>
									<label className={styles.formLabel}>
										Số lượng mặc định
										{category?.unit_label ? ` (${category.unit_label})` : ''}
									</label>
									<input
										type='number'
										min='0'
										step='0.5'
										className={`${styles.formInput} ${quantityOk ? '' : styles.inputError}`}
										value={quantity}
										onChange={(e) => setQuantity(e.target.value)}
										placeholder='VD: 1'
									/>
								</div>
								<div className={styles.formGroup}>
									<label className={styles.formLabel}>Tên hoạt động mặc định</label>
									<input
										className={styles.formInput}
										value={title}
										onChange={(e) => setTitle(e.target.value)}
										placeholder="Dùng khi cột 'Hoạt động' trong file để trống"
									/>
								</div>
							</div>
							{canCreateStaff && (
								<div className={`${styles.full} ${styles.newStaffBox}`}>
									<label className={styles.checkFilter}>
										<input
											type='checkbox'
											checked={createMissing}
											onChange={(e) => setCreateMissing(e.target.checked)}
										/>
										Tự tạo nhân viên + tài khoản cho Mã NV chưa có trong hệ thống
									</label>
								</div>
							)}
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
									setStaffDepts({});
									setStaffNames({});
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
									{preview.summary.valid} hợp lệ để nhập
									{preview.summary.new_staff > 0 && (
										<>
											{' '}
											· sẽ tạo <b>{preview.summary.new_staff}</b> nhân viên mới
										</>
									)}
									.
								</span>
							</div>
						)}
						{staffNeedInfo.length > 0 && (
							<>
								<div className={`${styles.noticeBox} ${styles.noticeWarn}`}>
									<InfoSvg />
									<span>
										Nhân viên mới mà file và hệ thống chưa có đủ thông tin — nhập dưới đây. <b>Họ và tên bắt buộc</b>{' '}
										(tên đăng nhập sinh từ họ tên; chưa nhập thì không tạo tài khoản, các dòng của người đó bị bỏ qua).
										Khoa/phòng để trống thì bổ sung sau.
										{missingNames > 0 && (
											<>
												{' '}
												Còn <b>{missingNames}</b> người chưa có họ tên.
											</>
										)}
									</span>
								</div>
								<div className={styles.importPreview}>
									<table className={styles.table}>
										<thead>
											<tr>
												<th>Mã NV</th>
												<th>Họ và tên</th>
												<th>Khoa/Phòng</th>
											</tr>
										</thead>
										<tbody>
											{staffNeedInfo.map((st) => (
												<tr key={st.staff_number}>
													<td>{st.staff_number}</td>
													<td>
														{nameEditable(st) ? (
															<input
																className={`${styles.formInput} ${staffNames[st.staff_number]?.trim() ? '' : styles.inputError}`}
																value={staffNames[st.staff_number] ?? ''}
																onChange={(e) =>
																	setStaffNames((m) => ({
																		...m,
																		[st.staff_number]: e.target.value,
																	}))
																}
																placeholder='Nhập họ và tên *'
															/>
														) : (
															st.full_name
														)}
													</td>
													<td style={{ minWidth: 240 }}>
														{deptEditable(st) ? (
															<SearchableSelect
																size='sm'
																options={[{ id: '', name: 'Để trống, bổ sung sau' }, ...departments]}
																value={staffDepts[st.staff_number] ?? ''}
																onChange={(id) =>
																	setStaffDepts((m) => {
																		const next = { ...m };
																		if (id) next[st.staff_number] = id;
																		else delete next[st.staff_number];
																		return next;
																	})
																}
																placeholder={departments.length ? 'Chọn khoa/phòng' : 'Đang tải danh sách...'}
															/>
														) : (
															st.department_name
														)}
													</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							</>
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
													{r.new_staff && (
														<div>
															<Badge tone='blue'>NV mới</Badge>{' '}
															<span className={styles.muted}>
																MNV {r.new_staff.staff_number} · {r.new_staff.department_name ?? 'chưa có khoa'}
															</span>
															{r.new_staff.missing_name && (
																<>
																	{' '}
																	<Badge tone='amber'>Chưa có tên</Badge>
																</>
															)}
														</div>
													)}
													{!r.valid && <div className={styles.rowWarn}>Sẽ bị bỏ qua</div>}
													{canCreateStaff && !r.user_id && !r.new_staff && r.staff_number != null && (
														<button
															type='button'
															className={styles.btnGhost}
															style={{
																marginTop: 4,
																padding: '2px 8px',
																fontSize: 12,
															}}
															onClick={() =>
																setAdding({ staffNumber: r.staff_number!, fullName: r.full_name_raw ?? '', phase: 'preview' })
															}
														>
															<PlusSvg /> Thêm NV
														</button>
													)}
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
							Đã nhập <b>{result.inserted}</b> ghi nhận
							{!!result.created_staff?.length && (
								<>
									{' '}
									và tạo <b>{result.created_staff.length}</b> nhân viên mới
								</>
							)}
							.
						</span>
					</div>
				)}
				{accounts.length > 0 && (
					<>
						<div className={styles.accountsHeader}>
							<span className={styles.formLabel}>
								Tài khoản vừa tạo ({accounts.length}) — mật khẩu ban đầu là tên đăng nhập, bắt đổi khi đăng nhập
								lần đầu. Đã gửi thông báo tới từng tài khoản mới; danh sách cũng lưu trong mục Thông báo của bạn.
							</span>
							<div style={{ display: 'flex', gap: 6 }}>
								{canUpdateStaff && incomplete.length > 0 && (
									<button
										type='button'
										className={styles.btnGhost}
										onClick={() => setCompleting(true)}
									>
										<EditSvg /> Bổ sung thông tin ({incomplete.length})
									</button>
								)}
								<button
									type='button'
									className={styles.btnGhost}
									onClick={downloadAccounts}
								>
									<DownloadSvg /> Tải danh sách (.csv)
								</button>
							</div>
						</div>
						<div className={styles.importPreview}>
							<table className={styles.table}>
								<thead>
									<tr>
										<th>Mã NV</th>
										<th>Họ và tên</th>
										<th>Khoa/Phòng</th>
										<th>Tên đăng nhập</th>
										<th>Mật khẩu ban đầu</th>
									</tr>
								</thead>
								<tbody>
									{accounts.map((u) => (
										<tr key={u.id}>
											<td>{u.staff_number}</td>
											<td>
												{u.full_name}
												{u.missing_name && (
													<>
														{' '}
														<Badge tone='amber'>Cần bổ sung tên</Badge>
													</>
												)}
											</td>
											<td>{u.department_name ?? <Badge tone='amber'>Cần bổ sung khoa</Badge>}</td>
											<td>{u.username}</td>
											<td>{u.username}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</>
				)}
				{result && missingGroups.length > 0 && (
					<>
						<div className={`${styles.noticeBox} ${styles.noticeWarn}`}>
							<InfoSvg />
							<span>
								<b>{missingGroups.length}</b> Mã NV chưa có trong hệ thống nên các dòng của họ chưa được nhập.{' '}
								{canCreateStaff
									? 'Bấm "Thêm NV & nhập" để thêm nhân viên rồi nhập tiếp đúng các dòng đó (không cần nhập lại file).'
									: 'Cần quyền "Thêm người dùng" để thêm nhân viên — liên hệ quản trị hệ thống.'}
							</span>
						</div>
						<div className={styles.importPreview}>
							<table className={styles.table}>
								<thead>
									<tr>
										<th>Mã NV</th>
										<th>Họ tên trong file</th>
										<th>Số dòng</th>
										<th>Tín chỉ</th>
										<th className={styles.thRight}>Thao tác</th>
									</tr>
								</thead>
								<tbody>
									{missingGroups.map((g) => {
										const done = addedAfter[g.staffNumber];
										return (
											<tr key={g.staffNumber}>
												<td>{g.staffNumber}</td>
												<td>{done ? done.staff.full_name : g.fullName || '—'}</td>
												<td>{g.rows.length}</td>
												<td>{formatCredits(g.rows.reduce((t, r) => t + Number(r.credits || 0), 0))}</td>
												<td className={styles.tdRight}>
													{done ? (
														<Badge tone={done.failed ? 'amber' : 'green'}>
															Đã thêm · nhập {done.imported} dòng
															{done.failed ? `, lỗi ${done.failed}` : ''}
														</Badge>
													) : (
														canCreateStaff && (
															<button
																type='button'
																className={styles.btnGhost}
																onClick={() =>
																	setAdding({
																		staffNumber: g.staffNumber,
																		fullName: g.fullName,
																		phase: 'result',
																	})
																}
															>
																<PlusSvg /> Thêm NV & nhập
															</button>
														)
													)}
												</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						</div>
					</>
				)}
				{result && result.warnings.length > 0 && (
					<ul className={styles.warnList}>
						{result.warnings.slice(0, 50).map((w, i) => (
							<li key={i}>{w}</li>
						))}
					</ul>
				)}
			</Modal>
			{adding && (
				<AddStaffModal
					staffNumber={adding.staffNumber}
					fullName={adding.fullName}
					departments={departments}
					onClose={() => setAdding(null)}
					onCreated={onStaffCreated}
				/>
			)}
			{completing && incomplete.length > 0 && (
				<CompleteStaffModal
					staff={incomplete}
					departments={departments}
					onClose={() => setCompleting(false)}
					onSaved={(updated) => {
						setPatchedStaff((m) => ({
							...m,
							...Object.fromEntries(updated.map((u) => [u.id, u])),
						}));
						onDone();
					}}
				/>
			)}
		</>
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
	const [tab, setTab] = useState<'open' | 'approved'>('approved');
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

	// Báo cáo tổng hợp theo nhân sự — chọn khoảng năm trong hộp thoại, lọc khoa/từ khoá theo trang
	const [showExport, setShowExport] = useState(false);

	// Duyệt / từ chối đồng loạt: chọn theo id (giữ khi đổi trang), bỏ qua bản ghi
	// đã ở trạng thái đích. Bản ghi lỗi được giữ lại trong lựa chọn để thử lại.
	const rowSel = useRowSelection(useMemo(() => paged.map((r) => r.id), [paged]));
	const selectedRecs = records.filter((r) => rowSel.selectedIds.has(r.id));
	const toApprove = selectedRecs.filter((r) => r.approval_status !== 'approved');
	const toReject = selectedRecs.filter((r) => r.approval_status !== 'rejected');
	const [bulkRejecting, setBulkRejecting] = useState(false);
	const [bulkBusy, setBulkBusy] = useState(false);
	const [bulkDeleting, setBulkDeleting] = useState(false);

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
	const handleBulkDelete = async () => {
		await runBulk(selectedRecs, deleteCmeRecord);
		setBulkDeleting(false);
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
			pageTitle='Ghi nhận độc lập'
			pageSubtitle='Ghi nhận tín chỉ CME không qua sự kiện hội thảo (tự học, học online, minh chứng đính kèm)'
			breadcrumbs={[{ label: 'Đào tạo liên tục' }]}
			headerActions={
				perms.canCme ? (
					<div style={{ display: 'flex', gap: 8 }}>
						<button
							className={styles.btnGhost}
							onClick={() => setShowExport(true)}
							title='Báo cáo tín chỉ CME theo nhân sự, chọn từ năm – đến năm: BC tổng + BC chi tiết theo hình thức (gồm cả hội thảo đã cấp CME)'
						>
							<DownloadSvg /> Xuất báo cáo
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
							{filtered.length} bản ghi
							{tab === 'approved' && ` · ${formatCredits(totalCredits)} tín chỉ`}
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
						{perms.canCme && (
							<DeleteAllButton
								count={filtered.length}
								itemLabel='ghi nhận CME'
								getIds={() => filtered.map((r) => r.id)}
								// Một request duy nhất (API bulk-delete) thay vì gọi lần lượt
								onDelete={deleteCmeRecords}
								onDone={() => {
									rowSel.clearSelection();
									refresh();
								}}
								disabled={bulkBusy}
								note={
									<>
										Áp dụng cho tab {tab === 'approved' ? '"Đã phê duyệt"' : '"Chưa phê duyệt"'}
										{year !== null && `, năm ${year}`}. File minh chứng đính kèm cũng bị gỡ.
									</>
								}
							/>
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
									<BulkButton danger disabled={bulkBusy} onClick={() => setBulkDeleting(true)}>
										<TrashSvg /> Xoá đã chọn ({selectedRecs.length})
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
			{showExport && (
				<ExportReportModal
					initialYear={year}
					search={search}
					department={deptFilter}
					onClose={() => setShowExport(false)}
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

			<BulkDeleteModal
				open={bulkDeleting}
				count={selectedRecs.length}
				itemLabel='ghi nhận CME'
				loading={bulkBusy}
				onClose={() => setBulkDeleting(false)}
				onConfirm={handleBulkDelete}
			/>

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
