import { Modal } from '@/shared/components';
import { showToast } from '@/shared/utils/feedback';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { EditSvg, LayersSvg, PlusSvg, SearchSvg, TrashSvg, XSvg } from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { Badge } from '../../../shared/components';
import { SkeletonTable } from '../../../shared/components/Loading';
import { usePermission } from '../../../shared/hooks/usePermission';
import base from '@/shared/components/Table/CrudPage.module.css';
import { cmeCatalogApi } from '../api/cmeCatalogApi';
import { CmeCategoryFormModal } from '../components/CmeCategoryFormModal';
import { CmeGroupFormModal } from '../components/CmeGroupFormModal';
import type {
	CmeCategoryFormData,
	CmeCreditCategoryItem,
	CmeCreditGroup,
	CmeGroupFormData,
} from '../types/cmeCatalog.type';
import { CONVERSION_METHOD, formatConversion } from '../utils/cmeConversion';
import styles from './CmeCreditCatalog.module.css';
import tbl from '@/shared/components/Table/Table.module.css';
import { useClientPaging } from '@/shared/hooks/useClientPaging';
import { Pagination } from '@/shared/components/Table/Pagination';

const UNGROUPED = '__none__';

type Deleting =
	| { kind: 'group'; item: CmeCreditGroup }
	| { kind: 'category'; item: CmeCreditCategoryItem };

/** Mỗi nhóm là một bảng riêng → mỗi bảng tự phân trang (render-prop để giữ nguyên closure của trang). */
function PagedGroup<T>({ items, children }: { items: T[]; children: (pg: ReturnType<typeof useClientPaging<T>>) => ReactNode }) {
	const pg = useClientPaging(items);
	return <>{children(pg)}</>;
}

export default function CmeCreditCatalog() {
	const { has } = usePermission();
	const canCreate = has('training_catalog:create');
	const canUpdate = has('training_catalog:update');
	const canDelete = has('training_catalog:delete');

	const [groups, setGroups] = useState<CmeCreditGroup[]>([]);
	const [categories, setCategories] = useState<CmeCreditCategoryItem[]>([]);
	const [isLoadingData, setIsLoadingData] = useState(true);
	const [search, setSearch] = useState('');
	const [groupFilter, setGroupFilter] = useState('');
	const [editingGroup, setEditingGroup] = useState<CmeCreditGroup | 'new' | null>(null);
	const [editingCategory, setEditingCategory] = useState<
		CmeCreditCategoryItem | { newIn: string } | null
	>(null);
	const [deleting, setDeleting] = useState<Deleting | null>(null);
	const [loading, setLoading] = useState(false);
	const [refreshKey, setRefreshKey] = useState(0);

	useRealtimeUpdate(['cme_credit_group', 'cme_credit_categorie'], () => setRefreshKey((k) => k + 1));

	useEffect(() => {
		Promise.all([cmeCatalogApi.listGroups(), cmeCatalogApi.listCategories()])
			.then(([g, c]) => {
				setGroups(g.data);
				setCategories(c.data);
			})
			.catch(() => showToast('error', 'Không thể tải danh mục quy đổi CME'))
			.finally(() => setIsLoadingData(false));
	}, [refreshKey]);

	const sortedGroups = useMemo(
		() =>
			[...groups].sort(
				(a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name, 'vi'),
			),
		[groups],
	);

	// Mỗi nhóm = 1 khối; loại hình không thuộc nhóm nào (group_id NULL hoặc trỏ
	// tới nhóm đã xoá) gom vào khối "Chưa phân nhóm" cuối trang.
	const sections = useMemo(() => {
		const q = search.trim().toLowerCase();
		const known = new Set(groups.map((g) => g.id));
		const match = (c: CmeCreditCategoryItem) =>
			!q ||
			c.name.toLowerCase().includes(q) ||
			c.id.toLowerCase().includes(q) ||
			(c.description ?? '').toLowerCase().includes(q);
		const byName = (a: CmeCreditCategoryItem, b: CmeCreditCategoryItem) =>
			a.id.localeCompare(b.id);

		const list: { group: CmeCreditGroup | null; key: string; items: CmeCreditCategoryItem[] }[] =
			sortedGroups.map((g) => ({
				group: g,
				key: g.id,
				items: categories.filter((c) => c.group_id === g.id && match(c)).sort(byName),
			}));
		const orphans = categories.filter((c) => (!c.group_id || !known.has(c.group_id)) && match(c));
		if (orphans.length) list.push({ group: null, key: UNGROUPED, items: orphans.sort(byName) });

		return list
			.filter((s) => !groupFilter || s.key === groupFilter)
			// Đang tìm kiếm thì ẩn nhóm không có kết quả cho gọn.
			.filter((s) => !q || s.items.length > 0);
	}, [sortedGroups, groups, categories, search, groupFilter]);

	const shownCount = sections.reduce((n, s) => n + s.items.length, 0);

	const handleSaveGroup = async (form: CmeGroupFormData) => {
		setLoading(true);
		try {
			if (editingGroup && editingGroup !== 'new') {
				const updated = await cmeCatalogApi.updateGroup(editingGroup.id, form);
				setGroups((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
				showToast('success', `Đã cập nhật nhóm "${updated.name}"`);
			} else {
				const created = await cmeCatalogApi.createGroup(form);
				setGroups((prev) => [...prev, created]);
				showToast('success', `Đã thêm nhóm "${created.name}"`);
			}
			setEditingGroup(null);
		} catch (err) {
			showToast('error', err instanceof Error ? err.message : 'Lưu thất bại');
		} finally {
			setLoading(false);
		}
	};

	const handleSaveCategory = async (form: CmeCategoryFormData) => {
		setLoading(true);
		try {
			if (editingCategory && 'id' in editingCategory) {
				const updated = await cmeCatalogApi.updateCategory(editingCategory.id, form);
				setCategories((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
				showToast('success', `Đã cập nhật "${updated.name}"`);
			} else {
				const created = await cmeCatalogApi.createCategory(form);
				setCategories((prev) => [...prev, created]);
				showToast('success', `Đã thêm "${created.name}"`);
			}
			setEditingCategory(null);
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
			if (deleting.kind === 'group') {
				await cmeCatalogApi.removeGroup(deleting.item.id);
				setGroups((prev) => prev.filter((g) => g.id !== deleting.item.id));
			} else {
				await cmeCatalogApi.removeCategory(deleting.item.id);
				setCategories((prev) => prev.filter((c) => c.id !== deleting.item.id));
			}
			showToast('success', `Đã xoá "${deleting.item.name}"`);
			setDeleting(null);
		} catch (err) {
			showToast('error', err instanceof Error ? err.message : 'Xoá thất bại');
		} finally {
			setLoading(false);
		}
	};

	const showActions = canUpdate || canDelete;
	const colCount = showActions ? 6 : 5;
	const nextSortOrder = groups.reduce((m, g) => Math.max(m, g.sort_order ?? 0), 0) + 1;

	return (
		<AdminLayout
			pageTitle='Danh mục quy đổi tín chỉ'
			pageSubtitle='Nhóm hoạt động, loại hình và công thức quy đổi ra giờ tín chỉ CME'
			breadcrumbs={[{ label: 'Đào tạo liên tục' }]}
			headerActions={
				canCreate && (
					<div className={styles.headerActions}>
						<button
							className={styles.btnOutline}
							onClick={() => setEditingGroup('new')}
						>
							<LayersSvg /> Thêm nhóm
						</button>
						<button
							className={base.btnAddHeader}
							onClick={() => setEditingCategory({ newIn: groupFilter === UNGROUPED ? '' : groupFilter })}
						>
							<PlusSvg /> Thêm loại hình
						</button>
					</div>
				)
			}
		>
			<div className={`${base.tableCard} ${styles.toolbarCard}`}>
				<div className={base.tableHeader}>
					<div className={base.tableHeaderLeft}>
						<span className={base.tableTitle}>Danh mục</span>
						<span className={base.tableCount}>
							{groups.length} nhóm · {search || groupFilter ? `${shownCount}/` : ''}
							{categories.length} loại hình
						</span>
					</div>
					<div className={base.tableControls}>
						<div className={base.searchBox}>
							<SearchSvg className={base.searchIcon} />
							<input
								className={base.searchInput}
								placeholder='Tìm theo mã, tên loại hình...'
								value={search}
								onChange={(e) => setSearch(e.target.value)}
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
							value={groupFilter}
							onChange={(e) => setGroupFilter(e.target.value)}
						>
							<option value=''>Tất cả nhóm</option>
							{sortedGroups.map((g) => (
								<option
									key={g.id}
									value={g.id}
								>
									{g.name}
								</option>
							))}
							<option value={UNGROUPED}>Chưa phân nhóm</option>
						</select>
					</div>
				</div>
			</div>

			{isLoadingData ? (
				<div className={base.tableCard}>
					<table className={base.table}>
						<tbody>
							<SkeletonTable
								rows={8}
								cols={colCount}
							/>
						</tbody>
					</table>
				</div>
			) : sections.length === 0 ? (
				<div className={base.tableCard}>
					<div className={base.emptyState}>
						<div className={base.emptyTitle}>Không tìm thấy loại hình nào</div>
						<div className={base.emptyDesc}>
							{search || groupFilter
								? 'Thử thay đổi từ khoá hoặc bộ lọc'
								: 'Chưa có nhóm hoạt động — bấm "Thêm nhóm" để bắt đầu'}
						</div>
					</div>
				</div>
			) : (
				sections.map(({ group, key, items }, gi) => (
					<div
						key={key}
						className={`${base.tableCard} ${styles.groupCard}`}
					>
						<div className={styles.groupHeader}>
							<div className={styles.groupIdx}>{group ? gi + 1 : '?'}</div>
							<div className={styles.groupInfo}>
								<div className={styles.groupName}>{group ? group.name : 'Chưa phân nhóm'}</div>
								<div className={styles.groupMeta}>
									{group && <span className={styles.code}>{group.id}</span>}
									<span>{items.length} loại hình</span>
									{group?.description && <span className={styles.groupDesc}>{group.description}</span>}
								</div>
							</div>
							<div className={base.actionBtns}>
								{canCreate && group && (
									<button
										className={styles.btnAddInline}
										onClick={() => setEditingCategory({ newIn: group.id })}
									>
										<PlusSvg /> Loại hình
									</button>
								)}
								{canUpdate && group && (
									<div
										className={base.actionBtn}
										title='Sửa nhóm'
										onClick={() => setEditingGroup(group)}
									>
										<EditSvg />
									</div>
								)}
								{canDelete && group && (
									<div
										className={`${base.actionBtn} ${base.danger}`}
										title='Xoá nhóm'
										onClick={() => setDeleting({ kind: 'group', item: group })}
									>
										<TrashSvg />
									</div>
								)}
							</div>
						</div>

						<PagedGroup items={items}>
						{(pg) => (
						<>
						<div className={base.tableWrap}>
							<table className={base.table}>
								<thead>
									<tr>
										<th className={`${base.th} ${tbl.thIdx}`}>STT</th>
										<th className={`${base.th} ${styles.colCode}`}>Mã</th>
										<th className={base.th}>Loại hình hoạt động</th>
										<th className={`${base.th} ${styles.colMethod}`}>Cách quy đổi</th>
										<th className={`${base.th} ${base.thRight} ${styles.colValue}`}>Quy đổi</th>
										{showActions && <th className={`${base.th} ${base.thRight}`}>Thao tác</th>}
									</tr>
								</thead>
								<tbody>
									{items.length === 0 ? (
										<tr>
											<td
												colSpan={colCount}
												className={`${base.td} ${styles.emptyRow}`}
											>
												Chưa có loại hình nào trong nhóm này
											</td>
										</tr>
									) : (
										pg.paged.map((c, i) => {
											const m = CONVERSION_METHOD[c.conversion_method] ?? CONVERSION_METHOD.fixed;
											const direct = !Number(c.conversion_value);
											return (
												<tr
													key={c.id}
													className={base.tr}
												>
													<td className={`${base.td} ${tbl.tdIdx}`}>{pg.offset + i + 1}</td>
													<td className={base.td}>
														<span className={styles.code}>{c.id}</span>
													</td>
													<td className={base.td}>
														<div className={base.itemName}>{c.name}</div>
														{c.description && <div className={styles.subText}>{c.description}</div>}
													</td>
													<td className={base.td}>
														<Badge tone={m.tone}>{m.label}</Badge>
													</td>
													<td className={`${base.td} ${styles.tdValue} ${direct ? styles.muted : ''}`}>
														{formatConversion(c)}
													</td>
													{showActions && (
														<td className={`${base.td} ${base.tdActions}`}>
															<div className={base.actionBtns}>
																{canUpdate && (
																	<div
																		className={base.actionBtn}
																		title='Chỉnh sửa'
																		onClick={() => setEditingCategory(c)}
																	>
																		<EditSvg />
																	</div>
																)}
																{canDelete && (
																	<div
																		className={`${base.actionBtn} ${base.danger}`}
																		title='Xoá'
																		onClick={() => setDeleting({ kind: 'category', item: c })}
																	>
																		<TrashSvg />
																	</div>
																)}
															</div>
														</td>
													)}
												</tr>
											);
										})
									)}
								</tbody>
							</table>
						</div>
						<Pagination
							{...pg.pagination}
							itemLabel='loại hình'
						/>
						</>
						)}
						</PagedGroup>
					</div>
				))
			)}

			{editingGroup && (
				<CmeGroupFormModal
					item={editingGroup === 'new' ? undefined : editingGroup}
					nextSortOrder={nextSortOrder}
					onClose={() => setEditingGroup(null)}
					onSave={handleSaveGroup}
					loading={loading}
				/>
			)}

			{editingCategory && (
				<CmeCategoryFormModal
					item={'id' in editingCategory ? editingCategory : undefined}
					defaultGroupId={'newIn' in editingCategory ? editingCategory.newIn : undefined}
					groups={sortedGroups}
					onClose={() => setEditingCategory(null)}
					onSave={handleSaveCategory}
					loading={loading}
				/>
			)}

			{deleting && (
				<Modal
					open
					onClose={() => setDeleting(null)}
					icon={<TrashSvg />}
					tone='danger'
					title={deleting.kind === 'group' ? 'Xoá nhóm hoạt động' : 'Xoá loại hình quy đổi'}
					subtitle={deleting.item.name}
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
						{deleting.kind === 'group' ? (
							<>
								Xoá nhóm <strong>{deleting.item.name}</strong>? Chỉ xoá được khi nhóm không còn
								loại hình nào — hãy chuyển hoặc xoá các loại hình trong nhóm trước.
							</>
						) : (
							<>
								Xoá <strong>{deleting.item.name}</strong> khỏi danh mục? Không xoá được nếu đã có
								bản ghi CME dùng loại hình này.
							</>
						)}
					</p>
				</Modal>
			)}

		</AdminLayout>
	);
}
