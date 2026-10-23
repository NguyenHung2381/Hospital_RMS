import { Modal, TableEmpty } from '@/shared/components';
import { showToast } from '@/shared/utils/feedback';
import { useEffect, useMemo, useState } from 'react';
import { BuildingSvg, EditSvg, PlusSvg, SearchSvg, TrashSvg, XSvg } from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import { ExcelActions, type ExcelColumn } from '@/shared/components/Excel';
import { isYes, matchLabel, numText } from '@/shared/components/Excel/excelHelpers';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { Badge } from '../../../shared/components';
import { SkeletonTable } from '../../../shared/components/Loading';
import { Pagination } from '../../../shared/components/Table/Pagination';
import { usePermission } from '../../../shared/hooks/usePermission';
import base from '@/shared/components/Table/CrudPage.module.css';
import { venueApi } from '../api/venueApi';
import { VenueFormModal } from '../components/VenueFormModal';
import type { Venue, VenueFormData, VenueScope } from '../types/venue.type';
import { SCOPE_LABEL } from '../utils/venueScope';
import styles from './Venues.module.css';
import tbl from '@/shared/components/Table/Table.module.css';
import { DEFAULT_PAGE_SIZE } from '@/shared/utils/constants';

const SCOPE_TEXT = Object.fromEntries(
	Object.entries(SCOPE_LABEL).map(([k, v]) => [k, v.label]),
) as Record<VenueScope, string>;

const EXCEL_COLS: ExcelColumn<Venue>[] = [
	{ header: 'Tên địa điểm', key: 'name', required: true, value: (x) => x.name },
	{ header: 'Địa chỉ', key: 'address', value: (x) => x.address },
	{ header: 'Sức chứa', key: 'capacity', value: (x) => x.capacity },
	{ header: 'Phạm vi dùng', key: 'usage_scope', value: (x) => SCOPE_TEXT[x.usage_scope] },
	{ header: 'Đang dùng', key: 'is_active', value: (x) => (x.is_active ? 'Có' : 'Không') },
	{ header: 'Mô tả', key: 'description', value: (x) => x.description },
];

export default function Venues() {
	const { has } = usePermission();
	const canCreate = has('venues:create');
	const canUpdate = has('venues:update');
	const canDelete = has('venues:delete');

	const [items, setItems] = useState<Venue[]>([]);
	const [isLoadingData, setIsLoadingData] = useState(true);
	const [search, setSearch] = useState('');
	const [scopeFilter, setScopeFilter] = useState<VenueScope | ''>('');
	const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
	const [page, setPage] = useState(1);
	const [editing, setEditing] = useState<Venue | 'new' | null>(null);
	const [deleting, setDeleting] = useState<Venue | null>(null);
	const [loading, setLoading] = useState(false);
	const [refreshKey, setRefreshKey] = useState(0);

	useRealtimeUpdate('venue', () => setRefreshKey((k) => k + 1));

	useEffect(() => {
		venueApi
			.list()
			.then((res) => setItems(res.data))
			.catch(() => showToast('error', 'Không thể tải danh sách địa điểm'))
			.finally(() => setIsLoadingData(false));
	}, [refreshKey]);

	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		return items
			.filter((v) => !scopeFilter || v.usage_scope === scopeFilter)
			.filter(
				(v) =>
					!q ||
					v.name.toLowerCase().includes(q) ||
					(v.address ?? '').toLowerCase().includes(q) ||
					(v.description ?? '').toLowerCase().includes(q),
			)
			.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
	}, [items, search, scopeFilter]);

	const totalPages = pageSize === 0 ? 1 : Math.max(1, Math.ceil(filtered.length / pageSize));
	const safePage = Math.min(page, totalPages);
	const paged = pageSize === 0 ? filtered : filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

	const handleSave = async (form: VenueFormData) => {
		setLoading(true);
		try {
			if (editing && editing !== 'new') {
				const updated = await venueApi.update(editing.id, form);
				setItems((prev) => prev.map((v) => (v.id === updated.id ? updated : v)));
				showToast('success', `Đã cập nhật "${updated.name}"`);
			} else {
				const created = await venueApi.create(form);
				setItems((prev) => [created, ...prev]);
				showToast('success', `Đã thêm "${created.name}"`);
			}
			setEditing(null);
		} catch (err) {
			showToast('error', err instanceof Error ? err.message : 'Lưu thất bại');
		} finally {
			setLoading(false);
		}
	};

	const handleDelete = async () => {
		if (!deleting) return;
		setLoading(true);
		try {
			await venueApi.remove(deleting.id);
			setItems((prev) => prev.filter((v) => v.id !== deleting.id));
			showToast('success', `Đã xoá "${deleting.name}"`);
			setDeleting(null);
		} catch (err) {
			showToast('error', err instanceof Error ? err.message : 'Xoá thất bại');
		} finally {
			setLoading(false);
		}
	};

	const showActions = canUpdate || canDelete;
	const colCount = showActions ? 7 : 6;

	return (
		<AdminLayout
			pageTitle='Địa điểm'
			pageSubtitle='Phòng họp bảo vệ đề cương, hội trường và phòng học dùng khi xếp lịch'
			breadcrumbs={[{ label: 'Hệ thống' }]}
			headerActions={
				<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
					<ExcelActions
						fileName='dia-diem'
						itemLabel='địa điểm'
						columns={EXCEL_COLS}
						getRows={() => filtered}
						importRow={
							canCreate
								? (r) =>
										venueApi.create({
											name: r.name,
											address: r.address,
											capacity: numText(r.capacity),
											usage_scope: matchLabel(SCOPE_TEXT, r.usage_scope, 'Phạm vi dùng') ?? 'both',
											is_active: isYes(r.is_active, true),
											description: r.description,
										})
								: undefined
						}
						onImported={() => setRefreshKey((k) => k + 1)}
					/>
					{canCreate && (
						<button
							className={base.btnAddHeader}
							onClick={() => setEditing('new')}
						>
							<PlusSvg /> Thêm địa điểm
						</button>
					)}
				</div>
			}
		>
			<div className={base.tableCard}>
				<div className={base.tableHeader}>
					<div className={base.tableHeaderLeft}>
						<span className={base.tableTitle}>Danh sách địa điểm</span>
						<span className={base.tableCount}>{filtered.length} địa điểm</span>
					</div>
					<div className={base.tableControls}>
						<div className={base.searchBox}>
							<SearchSvg className={base.searchIcon} />
							<input
								className={base.searchInput}
								placeholder='Tìm theo tên, vị trí...'
								value={search}
								onChange={(e) => {
									setSearch(e.target.value);
									setPage(1);
								}}
							/>
							{search && (
								<button
									className={base.searchClear}
									onClick={() => setSearch('')}
								>
									<XSvg />
								</button>
							)}
						</div>
						<select
							className={base.pageSizeSelect}
							value={scopeFilter}
							onChange={(e) => {
								setScopeFilter(e.target.value as VenueScope | '');
								setPage(1);
							}}
						>
							<option value=''>Tất cả mục đích</option>
							{(Object.keys(SCOPE_LABEL) as VenueScope[]).map((s) => (
								<option
									key={s}
									value={s}
								>
									{SCOPE_LABEL[s].label}
								</option>
							))}
						</select>
					</div>
				</div>

				<div className={base.tableWrap}>
					<table className={base.table}>
						<thead>
							<tr>
								<th className={`${base.th} ${tbl.thIdx}`}>STT</th>
								<th className={base.th}>Địa điểm</th>
								<th className={base.th}>Vị trí</th>
								<th className={`${base.th} ${base.thRight}`}>Sức chứa</th>
								<th className={base.th}>Dùng cho</th>
								<th className={base.th}>Trạng thái</th>
								{showActions && <th className={`${base.th} ${base.thRight}`}>Thao tác</th>}
							</tr>
						</thead>
						<tbody>
							{isLoadingData ? (
								<SkeletonTable
									rows={pageSize || 8}
									cols={colCount}
								/>
							) : filtered.length === 0 ? (
								<TableEmpty
									colSpan={colCount}
									title='Không tìm thấy địa điểm'
									desc={search || scopeFilter ? 'Thử thay đổi từ khoá hoặc bộ lọc' : 'Chưa có địa điểm nào'}
								/>
							) : (
								paged.map((v, i) => (
									<tr
										key={v.id}
										className={base.tr}
									>
										<td className={`${base.td} ${base.tdIdx}`}>
											{(safePage - 1) * (pageSize || filtered.length) + i + 1}
										</td>
										<td className={base.td}>
											<div className={base.itemCell}>
												<div className={`${base.itemAvatar} ${styles.venueIcon}`}>
													<BuildingSvg />
												</div>
												<div>
													<div className={base.itemName}>{v.name}</div>
													{v.description && <div className={styles.subText}>{v.description}</div>}
												</div>
											</div>
										</td>
										<td className={base.td}>
											<span className={base.descText}>{v.address ?? '—'}</span>
										</td>
										<td className={`${base.td} ${styles.tdNum}`}>{v.capacity ?? '—'}</td>
										<td className={base.td}>
											<Badge tone={SCOPE_LABEL[v.usage_scope].tone}>
												{SCOPE_LABEL[v.usage_scope].label}
											</Badge>
										</td>
										<td className={base.td}>
											<Badge
												tone={v.is_active ? 'green' : 'gray'}
												dot
											>
												{v.is_active ? 'Đang sử dụng' : 'Ngưng sử dụng'}
											</Badge>
										</td>
										{showActions && (
											<td className={`${base.td} ${base.tdActions}`}>
												<div className={base.actionBtns}>
													{canUpdate && (
														<div
															className={base.actionBtn}
															title='Chỉnh sửa'
															onClick={() => setEditing(v)}
														>
															<EditSvg />
														</div>
													)}
													{canDelete && (
														<div
															className={`${base.actionBtn} ${base.danger}`}
															title='Xoá'
															onClick={() => setDeleting(v)}
														>
															<TrashSvg />
														</div>
													)}
												</div>
											</td>
										)}
									</tr>
								))
							)}
						</tbody>
					</table>
				</div>

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
					itemLabel='địa điểm'
				/>
			</div>

			{editing && (
				<VenueFormModal
					item={editing === 'new' ? undefined : editing}
					onClose={() => setEditing(null)}
					onSave={handleSave}
					loading={loading}
				/>
			)}

			{deleting && (
				<Modal
					open
					onClose={() => setDeleting(null)}
					icon={<TrashSvg />}
					tone='danger'
					title='Xoá địa điểm'
					subtitle={deleting.name}
					className={`${base.modal} ${base.modalSm}`}
					bodyClassName={base.modalBody}
					footer={
						<>
							<button
								className={base.btnCancel}
								onClick={() => setDeleting(null)}
								disabled={loading}
							>
								Huỷ
							</button>
							<button
								className={base.btnDanger}
								onClick={handleDelete}
								disabled={loading}
							>
								{loading ? <span className={`${base.spinner} ${base.spinnerDark}`} /> : <TrashSvg />}
								Xác nhận xoá
							</button>
						</>
					}
				>
					<p className={base.deleteDesc}>
						Xoá <strong>{deleting.name}</strong> khỏi danh mục? Hội đồng / buổi học đã xếp ở
						địa điểm này vẫn giữ nguyên tên địa điểm. Nếu chỉ tạm không dùng, hãy chuyển
						sang <strong>Ngưng sử dụng</strong> thay vì xoá.
					</p>
				</Modal>
			)}

		</AdminLayout>
	);
}
