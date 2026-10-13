import { RowAction, RowActions } from '@/shared/components/Table/TableToolbar';
import { showToast } from '@/shared/utils/feedback';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertSvg, CheckSvg, DownloadSvg, EditSvg, PlusSvg, SearchSvg, TrashSvg, XSvg } from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import { apiClient } from '../../../shared/api/axios';
import {
	Badge,
	Button,
	Modal,
	Pagination,
	SearchableSelect,
	SkeletonTable,
} from '@/shared/components';
import {
	createCmeRequirement,
	deleteCmeRequirement,
	exportPersonalCmeExcel,
	getCmeCompliance,
	getCmeRequirements,
	updateCmeRequirement,
	type CmeComplianceRow,
	type CmeRequirement,
} from '../api/cmeRequirementApi';
import { fileSlug, saveBlob } from '../utils/saveBlob';
import styles from './Seminar.module.css';
import tbl from '@/shared/components/Table/Table.module.css';
import { DEFAULT_PAGE_SIZE } from '@/shared/utils/constants';

interface SimpleItem {
	id: string;
	name: string;
}

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = [CURRENT_YEAR + 1, CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2];

type TabKey = 'compliance' | 'requirements';

const EMPTY_FORM = { department_id: '', required_credits: '', note: '' };

const norm = (s: string | null | undefined) =>
	(s ?? '')
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/đ/gi, 'd')
		.toLowerCase();

/** Lọc theo từ khoá + cắt trang phía client (API trả về toàn bộ danh sách theo năm). */
function usePagedList<T>(
	items: T[],
	getText: (item: T) => string,
	resetKey: unknown,
	extraFilter?: (item: T) => boolean,
) {
	const [search, setSearch] = useState('');
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);

	const filtered = useMemo(() => {
		const q = norm(search.trim());
		return items.filter(
			(i) => (!extraFilter || extraFilter(i)) && (!q || norm(getText(i)).includes(q)),
		);
	}, [items, search, getText, extraFilter]);

	// Đổi từ khoá / năm thì quay về trang đầu (điều chỉnh khi render, không dùng effect)
	const key = `${search}|${String(resetKey)}`;
	const [prevKey, setPrevKey] = useState(key);
	if (prevKey !== key) {
		setPrevKey(key);
		setPage(1);
	}

	const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
	const safePage = Math.min(page, totalPages);
	const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

	return {
		search,
		setSearch,
		paged,
		total: filtered.length,
		pagination: {
			page: safePage,
			totalPages,
			total: filtered.length,
			rowsPerPage: pageSize,
			onPageChange: setPage,
			onRowsPerPageChange: (n: number) => {
				setPageSize(n);
				setPage(1);
			},
		},
	};
}

const complianceText = (r: CmeComplianceRow) => `${r.full_name} ${r.department_name ?? ''}`;
const requirementText = (r: CmeRequirement) => `${r.department_name ?? 'Toàn viện'} ${r.note ?? ''}`;

export default function CmeCompliance() {
	const [year, setYear] = useState(CURRENT_YEAR);
	const [tab, setTab] = useState<TabKey>('compliance');
	const [requirements, setRequirements] = useState<CmeRequirement[]>([]);
	const [compliance, setCompliance] = useState<CmeComplianceRow[]>([]);
	const [departments, setDepartments] = useState<SimpleItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState('');

	// Modal thêm / sửa ngưỡng: null = đóng, 'new' = thêm mới, còn lại = đang sửa
	const [editing, setEditing] = useState<CmeRequirement | 'new' | null>(null);
	const [form, setForm] = useState(EMPTY_FORM);
	const [formError, setFormError] = useState('');

	// Xuất phiếu CME cá nhân: exportingId = user đang xuất; modal chọn nhân sự bất kỳ
	const [exportingId, setExportingId] = useState<string | null>(null);
	const [personModal, setPersonModal] = useState(false);
	const [personForm, setPersonForm] = useState({ user_id: '', year: CURRENT_YEAR });
	const [users, setUsers] = useState<SimpleItem[]>([]);

	const load = useCallback(() => {
		Promise.all([getCmeRequirements(year), getCmeCompliance(year)])
			.then(([req, comp]) => {
				setRequirements(req);
				setCompliance(comp);
				setError('');
			})
			.catch((err) => setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu'))
			.finally(() => setLoading(false));
	}, [year]);

	useEffect(load, [load]);
	useEffect(() => {
		apiClient
			.get<{ data: SimpleItem[] }>('/departments?limit=0')
			.then((r) => setDepartments(r.data))
			.catch(() => {});
	}, []);

	// Bộ lọc bảng: khoa (tab nhân sự) và phạm vi áp dụng (tab ngưỡng)
	const [compDept, setCompDept] = useState('');
	const [reqScope, setReqScope] = useState<'' | 'hospital' | 'department'>('');

	const compFilter = useCallback(
		(r: CmeComplianceRow) => !compDept || r.department_id === compDept,
		[compDept],
	);
	const reqFilter = useCallback(
		(r: CmeRequirement) =>
			!reqScope || (reqScope === 'hospital' ? !r.department_id : !!r.department_id),
		[reqScope],
	);

	const compList = usePagedList(compliance, complianceText, `${year}|${compDept}`, compFilter);
	const reqList = usePagedList(requirements, requirementText, `${year}|${reqScope}`, reqFilter);

	// Chỉ đưa vào bộ lọc những khoa thực sự có nhân sự chưa đạt
	const compDeptOptions = useMemo(() => {
		const map = new Map<string, string>();
		compliance.forEach((r) => {
			if (r.department_id) map.set(r.department_id, r.department_name ?? r.department_id);
		});
		return [...map.entries()]
			.map(([id, name]) => ({ id, name }))
			.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
	}, [compliance]);

	const changeYear = (y: number) => {
		setLoading(true);
		setYear(y);
		setCompDept('');
	};

	const yearSelect = (
		<select
			className={styles.filterSelect}
			value={year}
			onChange={(e) => changeYear(Number(e.target.value))}
			title='Năm'
		>
			{YEAR_OPTIONS.map((y) => (
				<option
					key={y}
					value={y}
				>
					Năm {y}
				</option>
			))}
		</select>
	);

	const exportPerson = async (userId: string, fullName: string, y: number) => {
		setExportingId(userId);
		try {
			saveBlob(await exportPersonalCmeExcel(userId, y), `cme-${y}-${fileSlug(fullName) || userId}.xlsx`);
			return true;
		} catch (err) {
			showToast('error', err instanceof Error ? err.message : 'Xuất Excel thất bại');
			return false;
		} finally {
			setExportingId(null);
		}
	};

	const openPersonModal = () => {
		setPersonForm({ user_id: '', year });
		setPersonModal(true);
		if (users.length === 0) {
			apiClient
				.get<{ data: { id: string; full_name: string }[] }>('/users?limit=0')
				.then((r) => setUsers(r.data.map((u) => ({ id: u.id, name: u.full_name }))))
				.catch(() => showToast('error', 'Không tải được danh sách nhân sự'));
		}
	};

	const handlePersonExport = async () => {
		const u = users.find((x) => x.id === personForm.user_id);
		if (!u) return;
		if (await exportPerson(u.id, u.name, personForm.year)) setPersonModal(false);
	};

	const openCreate = () => {
		setForm(EMPTY_FORM);
		setFormError('');
		setEditing('new');
	};

	const openEdit = (r: CmeRequirement) => {
		setForm({
			department_id: r.department_id ?? '',
			required_credits: String(r.required_credits),
			note: r.note ?? '',
		});
		setFormError('');
		setEditing(r);
	};

	const handleSave = async () => {
		const credits = Number(form.required_credits);
		if (!form.required_credits.trim() || !Number.isFinite(credits) || credits <= 0) {
			setFormError('Số tín chỉ yêu cầu phải là số lớn hơn 0');
			return;
		}
		setSaving(true);
		try {
			if (editing === 'new') {
				await createCmeRequirement({
					year,
					required_credits: credits,
					department_id: form.department_id || undefined,
					note: form.note.trim() || undefined,
				});
				showToast('success', 'Đã thêm ngưỡng CME');
			} else if (editing) {
				await updateCmeRequirement(editing.id, {
					required_credits: credits,
					note: form.note.trim(),
				});
				showToast('success', 'Đã cập nhật ngưỡng CME');
			}
			setEditing(null);
			load();
		} catch (err) {
			setFormError(err instanceof Error ? err.message : 'Lưu thất bại');
		} finally {
			setSaving(false);
		}
	};

	const handleDelete = async (r: CmeRequirement) => {
		if (!window.confirm(`Xoá ngưỡng CME của "${r.department_name ?? 'Toàn viện'}" năm ${year}?`))
			return;
		setSaving(true);
		try {
			await deleteCmeRequirement(r.id);
			showToast('success', 'Đã xoá ngưỡng CME');
			load();
		} catch (err) {
			showToast('error', err instanceof Error ? err.message : 'Xoá thất bại');
		} finally {
			setSaving(false);
		}
	};

	const renderSearch = (value: string, onChange: (v: string) => void, placeholder: string) => (
		<div className={styles.searchBox}>
			<SearchSvg className={styles.searchIcon} />
			<input
				className={styles.searchInput}
				placeholder={placeholder}
				value={value}
				onChange={(e) => onChange(e.target.value)}
			/>
			{value && (
				<button
					className={styles.searchClear}
					onClick={() => onChange('')}
				>
					<XSvg />
				</button>
			)}
		</div>
	);

	const emptyRow = (colSpan: number, title: string, desc?: string, icon?: boolean) => (
		<tr>
			<td colSpan={colSpan}>
				<div className={styles.emptyState}>
					{icon && (
						<CheckSvg
							style={{ width: 32, height: 32, color: 'var(--color-primary)', marginBottom: 8 }}
						/>
					)}
					<div className={styles.emptyTitle}>{title}</div>
					{desc && <div className={styles.emptyDesc}>{desc}</div>}
				</div>
			</td>
		</tr>
	);

	return (
		<AdminLayout
			pageTitle='Cảnh báo tín chỉ CME'
			pageSubtitle='Ngưỡng tín chỉ đào tạo y khoa liên tục theo năm và danh sách nhân sự chưa đạt'
			breadcrumbs={[{ label: 'Hội nghị & CME' }]}
			headerActions={
				<Button
					variant='secondary'
					icon={<DownloadSvg />}
					onClick={openPersonModal}
					title='Xuất phiếu theo dõi CME (Excel) của một nhân sự bất kỳ'
				>
					Xuất CME cá nhân
				</Button>
			}
		>
			{error && (
				<div className={`${styles.noticeBox} ${styles.noticeWarn}`}>
					<AlertSvg /> {error}
				</div>
			)}

			<div className={styles.tabs}>
				{(
					[
						{ key: 'compliance', label: `Nhân sự chưa đạt (${compliance.length})` },
						{ key: 'requirements', label: `Cấu hình ngưỡng (${requirements.length})` },
					] as { key: TabKey; label: string }[]
				).map((t) => (
					<button
						key={t.key}
						type='button'
						className={`${styles.tab} ${tab === t.key ? styles.tabActive : ''}`}
						onClick={() => setTab(t.key)}
					>
						{t.label}
					</button>
				))}
			</div>

			{tab === 'compliance' && (
				<div className={styles.tableCard}>
					<div className={styles.tableHeader}>
						<div className={styles.tableHeaderLeft}>
							<span className={styles.tableTitle}>Nhân sự chưa đạt ngưỡng năm {year}</span>
							<span className={styles.tableCount}>{compList.total} người</span>
						</div>
						<div className={styles.tableControls}>
							{renderSearch(compList.search, compList.setSearch, 'Tìm theo họ tên, khoa/phòng...')}
							{yearSelect}
							<select
								className={styles.filterSelect}
								value={compDept}
								onChange={(e) => setCompDept(e.target.value)}
								title='Khoa / Phòng'
							>
								<option value=''>Tất cả khoa/phòng</option>
								{compDeptOptions.map((d) => (
									<option
										key={d.id}
										value={d.id}
									>
										{d.name}
									</option>
								))}
							</select>
						</div>
					</div>

					<div className={styles.tableWrap}>
						<table className={styles.table}>
							<thead>
								<tr>
									<th className={tbl.thIdx}>STT</th>
									<th>Họ tên</th>
									<th>Khoa / Phòng</th>
									<th>Đã đạt</th>
									<th>Yêu cầu</th>
									<th>Còn thiếu</th>
									<th className={styles.thRight}>Thao tác</th>
								</tr>
							</thead>
							<tbody>
								{loading ? (
									<SkeletonTable
										rows={6}
										cols={7}
									/>
								) : compList.total === 0 ? (
									compList.search || compDept ? (
										emptyRow(7, 'Không tìm thấy nhân sự phù hợp', 'Thử đổi từ khoá hoặc bộ lọc')
									) : requirements.length === 0 ? (
										emptyRow(
											7,
											`Chưa cấu hình ngưỡng CME cho năm ${year}`,
											'Thêm ngưỡng ở tab "Cấu hình ngưỡng" để hệ thống đối chiếu',
										)
									) : (
										emptyRow(7, 'Tất cả nhân sự đã đạt ngưỡng CME', undefined, true)
									)
								) : (
									compList.paged.map((row, i) => (
										<tr key={row.id}>
											<td className={tbl.tdIdx}>{(compList.pagination.page - 1) * compList.pagination.rowsPerPage + i + 1}</td>
											<td><span className={tbl.cellTitle}>{row.full_name}</span></td>
											<td className={styles.muted}>{row.department_name ?? '—'}</td>
											<td>{row.earned_credits}</td>
											<td>{row.required_credits}</td>
											<td>
												<Badge tone='red'>
													{(row.required_credits - row.earned_credits).toFixed(1)} tín chỉ
												</Badge>
											</td>
											<td className={styles.tdRight}>
												<div className={styles.actionBtns}>
													<button
														className={styles.actionBtn}
														title='Xuất phiếu CME cá nhân (Excel)'
														disabled={exportingId !== null}
														onClick={() => exportPerson(row.id, row.full_name, year)}
													>
														{exportingId === row.id ? <span className={styles.spinner} /> : <DownloadSvg />}
													</button>
												</div>
											</td>
										</tr>
									))
								)}
							</tbody>
						</table>
					</div>

										<Pagination
						{...compList.pagination}
						itemLabel='nhân sự'
					/>
				</div>
			)}

			{tab === 'requirements' && (
				<div className={styles.tableCard}>
					<div className={styles.tableHeader}>
						<div className={styles.tableHeaderLeft}>
							<span className={styles.tableTitle}>Ngưỡng tín chỉ CME năm {year}</span>
							<span className={styles.tableCount}>{reqList.total} ngưỡng</span>
						</div>
						<div className={styles.tableControls}>
							{renderSearch(reqList.search, reqList.setSearch, 'Tìm theo khoa/phòng, ghi chú...')}
							{yearSelect}
							<select
								className={styles.filterSelect}
								value={reqScope}
								onChange={(e) => setReqScope(e.target.value as typeof reqScope)}
								title='Phạm vi áp dụng'
							>
								<option value=''>Mọi phạm vi</option>
								<option value='hospital'>Toàn viện</option>
								<option value='department'>Theo khoa/phòng</option>
							</select>
							<Button
								size='sm'
								icon={<PlusSvg />}
								onClick={openCreate}
							>
								Thêm ngưỡng
							</Button>
						</div>
					</div>

					<div className={styles.tableWrap}>
						<table className={styles.table}>
							<thead>
								<tr>
									<th className={tbl.thIdx}>STT</th>
									<th>Phạm vi</th>
									<th>Tín chỉ yêu cầu</th>
									<th>Ghi chú</th>
									<th className={styles.thRight}>Thao tác</th>
								</tr>
							</thead>
							<tbody>
								{loading ? (
									<SkeletonTable
										rows={4}
										cols={5}
									/>
								) : reqList.total === 0 ? (
									reqList.search || reqScope ? (
										emptyRow(5, 'Không tìm thấy ngưỡng phù hợp', 'Thử đổi từ khoá hoặc bộ lọc')
									) : (
										emptyRow(
											5,
											`Chưa cấu hình ngưỡng CME cho năm ${year}`,
											'Bấm "Thêm ngưỡng" để đặt số tín chỉ tối thiểu cho toàn viện hoặc từng khoa',
										)
									)
								) : (
									reqList.paged.map((r, i) => (
										<tr key={r.id}>
											<td className={tbl.tdIdx}>{(reqList.pagination.page - 1) * reqList.pagination.rowsPerPage + i + 1}</td>
											<td>{r.department_name ?? <Badge tone='blue'>Toàn viện</Badge>}</td>
											<td>
												<strong>{r.required_credits}</strong> tín chỉ
											</td>
											<td className={styles.muted}>{r.note || '—'}</td>
											<td className={styles.tdRight}>
												<RowActions>
													<RowAction
														title='Sửa ngưỡng'
														disabled={saving}
														onClick={() => openEdit(r)}
													>
														<EditSvg />
													</RowAction>
													<RowAction
														title='Xoá ngưỡng'
														danger
														disabled={saving}
														onClick={() => handleDelete(r)}
													>
														<TrashSvg />
													</RowAction>
												</RowActions>
											</td>
										</tr>
									))
								)}
							</tbody>
						</table>
					</div>

										<Pagination
						{...reqList.pagination}
						itemLabel='ngưỡng'
					/>
				</div>
			)}

			<Modal
				open={editing !== null}
				onClose={() => !saving && setEditing(null)}
				title={editing === 'new' ? `Thêm ngưỡng CME năm ${year}` : `Sửa ngưỡng CME năm ${year}`}
				size='sm'
				closeOnBackdrop={!saving}
				footer={
					<>
						<Button
							variant='ghost'
							onClick={() => setEditing(null)}
							disabled={saving}
						>
							Huỷ
						</Button>
						<Button
							icon={<CheckSvg />}
							onClick={handleSave}
							loading={saving}
						>
							{editing === 'new' ? 'Thêm ngưỡng' : 'Lưu thay đổi'}
						</Button>
					</>
				}
			>
				<div className={styles.formGrid}>
					<div className={`${styles.formGroup} ${styles.full}`}>
						<label className={styles.formLabel}>Khoa / Phòng</label>
						{editing === 'new' ? (
							<SearchableSelect
								options={[{ id: '', name: 'Toàn viện' }, ...departments]}
								value={form.department_id}
								onChange={(id) => setForm((f) => ({ ...f, department_id: id }))}
								placeholder='Toàn viện'
							/>
						) : (
							<input
								className={styles.formInput}
								value={editing?.department_name ?? 'Toàn viện'}
								disabled
							/>
						)}
					</div>
					<div className={`${styles.formGroup} ${styles.full}`}>
						<label className={styles.formLabel}>
							Số tín chỉ yêu cầu <span className={styles.required}>*</span>
						</label>
						<input
							type='number'
							step='0.1'
							min='0'
							className={styles.formInput}
							value={form.required_credits}
							onChange={(e) => {
								setForm((f) => ({ ...f, required_credits: e.target.value }));
								setFormError('');
							}}
							placeholder='VD: 48'
							autoFocus
						/>
					</div>
					<div className={`${styles.formGroup} ${styles.full}`}>
						<label className={styles.formLabel}>Ghi chú</label>
						<textarea
							className={styles.formTextarea}
							rows={2}
							value={form.note}
							onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
							placeholder='Căn cứ văn bản, phạm vi áp dụng...'
						/>
					</div>
				</div>
				{formError && (
					<div
						className={`${styles.noticeBox} ${styles.noticeWarn}`}
						style={{ marginTop: 12 }}
					>
						<AlertSvg /> {formError}
					</div>
				)}
			</Modal>

			<Modal
				open={personModal}
				onClose={() => !exportingId && setPersonModal(false)}
				title='Xuất phiếu CME cá nhân'
				size='sm'
				closeOnBackdrop={!exportingId}
				footer={
					<>
						<Button
							variant='ghost'
							onClick={() => setPersonModal(false)}
							disabled={!!exportingId}
						>
							Huỷ
						</Button>
						<Button
							icon={<DownloadSvg />}
							onClick={handlePersonExport}
							loading={!!exportingId}
							disabled={!personForm.user_id}
						>
							Xuất Excel
						</Button>
					</>
				}
			>
				<div className={styles.formGrid}>
					<div className={`${styles.formGroup} ${styles.full}`}>
						<label className={styles.formLabel}>
							Nhân sự <span className={styles.required}>*</span>
						</label>
						<SearchableSelect
							options={users}
							value={personForm.user_id}
							onChange={(id) => setPersonForm((f) => ({ ...f, user_id: id }))}
							placeholder={users.length ? 'Chọn nhân sự' : 'Đang tải danh sách...'}
						/>
					</div>
					<div className={`${styles.formGroup} ${styles.full}`}>
						<label className={styles.formLabel}>Năm</label>
						<select
							className={styles.formInput}
							value={personForm.year}
							onChange={(e) => setPersonForm((f) => ({ ...f, year: Number(e.target.value) }))}
						>
							{YEAR_OPTIONS.map((y) => (
								<option
									key={y}
									value={y}
								>
									Năm {y}
								</option>
							))}
						</select>
					</div>
				</div>
				<div
					className={styles.muted}
					style={{ marginTop: 12, fontSize: 13 }}
				>
					File gồm phiếu theo dõi tín chỉ của năm đã chọn (hội thảo, hội nghị, ghi nhận khác, so với ngưỡng) và
					bảng tổng hợp 5 năm gần nhất.
				</div>
			</Modal>

		</AdminLayout>
	);
}
