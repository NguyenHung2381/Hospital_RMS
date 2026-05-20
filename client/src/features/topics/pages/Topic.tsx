import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AdminLayout from '../../../layouts/AdminLayout';
import {
	addTopicMember,
	createTopic,
	deleteTopic as deleteTopicApi,
	getCategories,
	getDepts,
	getLevels,
	getRounds,
	getTopics,
	updateTopic as updateTopicApi,
	type SimpleItem,
} from '../api/topicApi';
import type { Topic, TopicForm, TopicStatus } from '../types/topic.type';
import styles from './Topic.module.css';
import { STATUS_CFG, lookup } from '../utils/topicHelpers';
import { Ic } from '../utils/topicIcons';
import { Badge } from '../components/shared/Badge';
import { TopicModal, type PendingMember } from '../components/TopicModal';
import { DeleteModal } from '../components/DeleteModal';
import { TopicDrawer } from '../components/TopicDrawer';
import { ExportExcelModal } from '../components/ExportExcelModal';
import { useRealtimeUpdate } from '../../../hooks/useRealtime';

type TabKey = 'all' | TopicStatus;
const PAGE_SIZE_OPTIONS = [9, 20, 50, 100] as const;

// ─── Multi-select dropdown ────────────────────────────────────────────────────
function MultiSelect({
	options,
	selected,
	onChange,
	placeholder,
	searchable,
}: {
	options: { id: string; label: string }[];
	selected: Set<string>;
	onChange: (next: Set<string>) => void;
	placeholder: string;
	searchable?: boolean;
}) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState('');
	const [alignRight, setAlignRight] = useState(false);
	const ref = useRef<HTMLDivElement>(null);
	const searchRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (!open) return;

		// Auto-detect: nếu space bên phải không đủ 220px thì căn phải
		if (ref.current) {
			const rect = ref.current.getBoundingClientRect();
			setAlignRight(rect.left + 220 > window.innerWidth);
		}

		const handler = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
		};
		document.addEventListener('mousedown', handler);
		if (searchable) setTimeout(() => searchRef.current?.focus(), 0);
		return () => {
			document.removeEventListener('mousedown', handler);
			setQuery('');
		};
	}, [open, searchable]);

	const toggle = (id: string) => {
		const next = new Set(selected);
		if (next.has(id)) next.delete(id); else next.add(id);
		onChange(next);
	};

	const buttonLabel =
		selected.size === 0 ? placeholder
		: selected.size === 1 ? (options.find((o) => selected.has(o.id))?.label ?? placeholder)
		: `${selected.size} đã chọn`;

	const filtered = searchable && query.trim()
		? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()))
		: options;

	return (
		<div ref={ref} style={{ position: 'relative' }}>
			<button
				type='button'
				className={`${styles.filterSelect} ${selected.size > 0 ? styles.filterActive : ''}`}
				onClick={() => setOpen((o) => !o)}
			>
				<span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
					{buttonLabel}
				</span>
				{selected.size > 0 && (
					<span
						className={styles.msClear}
						onClick={(e) => { e.stopPropagation(); onChange(new Set()); }}
						title='Bỏ chọn tất cả'
					>✕</span>
				)}
			</button>
			{open && (
				<div
					className={styles.msMenu}
					style={alignRight ? { left: 'auto', right: 0 } : undefined}
				>
					{searchable && (
						<div className={styles.msSearchWrap}>
							<input
								ref={searchRef}
								type='text'
								className={styles.msSearch}
								placeholder='Tìm kiếm...'
								value={query}
								onChange={(e) => setQuery(e.target.value)}
								onClick={(e) => e.stopPropagation()}
							/>
						</div>
					)}
					{filtered.length === 0 ? (
						<div className={styles.msEmpty}>Không tìm thấy kết quả</div>
					) : filtered.map((opt) => {
						const on = selected.has(opt.id);
						return (
							<label
								key={opt.id}
								className={`${styles.msItem} ${on ? styles.msItemOn : ''}`}
							>
								<div className={`${styles.msCheck} ${on ? styles.msCheckOn : ''}`}>
									{on && (
										<svg viewBox='0 0 10 8' fill='none' stroke='#fff' strokeWidth='2.2' strokeLinecap='round' strokeLinejoin='round' style={{ width: 9, height: 7 }}>
											<polyline points='1 4 3.5 7 9 1' />
										</svg>
									)}
								</div>
								<input
									type='checkbox'
									checked={on}
									onChange={() => toggle(opt.id)}
									style={{ display: 'none' }}
								/>
								{opt.label}
							</label>
						);
					})}
				</div>
			)}
		</div>
	);
}

export default function TopicPage() {
	const [topics, setTopics] = useState<Topic[]>([]);
	const [categories, setCategories] = useState<SimpleItem[]>([]);
	const [levels, setLevels] = useState<SimpleItem[]>([]);
	const [rounds, setRounds] = useState<SimpleItem[]>([]);
	const [departments, setDepartments] = useState<SimpleItem[]>([]);
	const [isLoadingData, setIsLoadingData] = useState(true);
	const [loadError, setLoadError] = useState('');

	const [search, setSearch] = useState('');
	const [yearFilters, setYearFilters] = useState<Set<string>>(new Set());
	const [roundFilters, setRoundFilters] = useState<Set<string>>(new Set());
	const [levelFilters, setLevelFilters] = useState<Set<string>>(new Set());
	const [catFilters, setCatFilters] = useState<Set<string>>(new Set());
	const [deptFilters, setDeptFilters] = useState<Set<string>>(new Set());
	const [activeTab, setActiveTab] = useState<TabKey>('all');
	const [page, setPage] = useState(1);
	const [rowsPerPage, setRowsPerPage] = useState<number>(PAGE_SIZE_OPTIONS[0]);

	const [showCreate, setShowCreate] = useState(false);
	const [showExport, setShowExport] = useState(false);
	const [editTopic, setEditTopic] = useState<Topic | null>(null);
	const [deleteTopic, setDeleteTopic] = useState<Topic | null>(null);
	const [viewTopic, setViewTopic] = useState<Topic | null>(null);
	const [refreshKey, setRefreshKey] = useState(0);

	const refreshData = useCallback(() => {
		setRefreshKey((prev) => prev + 1);
	}, []);

	useRealtimeUpdate('topic', refreshData);

	useEffect(() => {
		Promise.all([
			getTopics({ limit: 500 }),
			getCategories(),
			getLevels(),
			getRounds(),
			getDepts(),
		])
			.then(([topicsRes, catsRes, lvlsRes, rdsRes, deptsRes]) => {
				setTopics(topicsRes.data);
				setCategories(catsRes.data);
				setLevels(lvlsRes.data);
				setRounds(rdsRes.data);
				setDepartments(deptsRes.data);
			})
			.catch((err: unknown) =>
				setLoadError(err instanceof Error ? err.message : 'Lỗi tải dữ liệu'),
			)
			.finally(() => setIsLoadingData(false));
	}, [refreshKey]);

	const availableYears = useMemo(() => {
		const years = rounds
			.map((r) => r.year)
			.filter((y): y is number => y !== undefined);
		return Array.from(new Set(years)).sort((a, b) => b - a);
	}, [rounds]);

	// Đợt hiển thị trong dropdown: chỉ đợt thuộc năm đang chọn (nếu có)
	const visibleRounds = useMemo(
		() =>
			yearFilters.size > 0
				? rounds.filter((r) => r.year != null && yearFilters.has(r.year.toString()))
				: rounds,
		[rounds, yearFilters],
	);

	const handleYearChange = useCallback(
		(next: Set<string>) => {
			setYearFilters(next);
			// Bỏ các đợt không thuộc năm mới được chọn
			if (next.size > 0) {
				setRoundFilters((prev) => {
					const kept = new Set<string>();
					for (const id of prev) {
						const r = rounds.find((r) => r.id === id);
						if (r?.year != null && next.has(r.year.toString())) kept.add(id);
					}
					return kept;
				});
			}
			setPage(1);
		},
		[rounds],
	);

	const stats = useMemo(
		() => ({
			total: topics.length,
			submitted: topics.filter((t) => t.status === 'submitted').length,
			approved: topics.filter((t) => t.status === 'approved').length,
			rejected: topics.filter((t) => t.status === 'rejected').length,
			supplement: topics.filter((t) => t.status === 'supplement').length,
		}),
		[topics],
	);

	const TABS: { key: TabKey; label: string; count: number }[] = [
		{ key: 'all', label: 'Tất cả', count: stats.total },
		{ key: 'submitted', label: 'Chờ duyệt', count: stats.submitted },
		{ key: 'approved', label: 'Đã duyệt', count: stats.approved },
		{ key: 'rejected', label: 'Từ chối', count: stats.rejected },
		{ key: 'supplement', label: 'Bổ sung', count: stats.supplement },
	];

	const filtered = useMemo(() => {
		return topics.filter((t) => {
			if (activeTab !== 'all' && t.status !== activeTab) return false;
			if (yearFilters.size > 0) {
				const round = rounds.find((r) => r.id === t.round_id);
				const y = round?.year ?? t.round_year;
				if (!y || !yearFilters.has(y.toString())) return false;
			}
			if (roundFilters.size > 0 && !roundFilters.has(t.round_id ?? '')) return false;
			if (levelFilters.size > 0 && !levelFilters.has(t.level_id ?? '')) return false;
			if (catFilters.size > 0 && !catFilters.has(t.category_id ?? '')) return false;
			if (deptFilters.size > 0 && !deptFilters.has(t.department_id ?? '')) return false;
			if (search) {
				const q = search.toLowerCase();
				if (!t.title.toLowerCase().includes(q) && !t.id.toLowerCase().includes(q))
					return false;
			}
			return true;
		});
	}, [topics, rounds, activeTab, yearFilters, roundFilters, levelFilters, catFilters, deptFilters, search]);

	const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
	const safePage = Math.min(page, totalPages);
	const pageSlice = filtered.slice(
		(safePage - 1) * rowsPerPage,
		safePage * rowsPerPage,
	);
	const resetPage = () => setPage(1);

	const handleCreate = useCallback(
		async (form: TopicForm, pendingMembers: PendingMember[]): Promise<void> => {
			const created = await createTopic({
				title: form.title,
				description: form.description || undefined,
				round_id: form.round_id,
				category_id: form.category_id || undefined,
				level_id: form.level_id || undefined,
				department_id: form.department_id || undefined,
				status: form.status,
			});
			if (pendingMembers.length > 0) {
				await Promise.allSettled(
					pendingMembers.map((m) =>
						addTopicMember(created.id, {
							ho_ten: m.ho_ten,
							staff_number: m.staff_number || null,
							email: m.email || undefined,
							so_dien_thoai: m.so_dien_thoai || null,
							chuc_vu: m.chuc_vu ?? null,
							department_id: m.department_id ?? null,
							role: m.role,
						}),
					),
				);
			}
			setTopics((prev) => [
				{ ...created, member_count: pendingMembers.length },
				...prev,
			]);
			setShowCreate(false);
		},
		[],
	);

	const handleEdit = useCallback(
		async (form: TopicForm): Promise<void> => {
			if (!editTopic) return;
			const updated = await updateTopicApi(editTopic.id, {
				title: form.title,
				description: form.description || undefined,
				round_id: form.round_id,
				category_id: form.category_id || undefined,
				level_id: form.level_id || undefined,
				department_id: form.department_id || undefined,
				status: form.status,
			});
			setTopics((prev) =>
				prev.map((t) => (t.id === editTopic.id ? updated : t)),
			);
			setEditTopic(null);
			setViewTopic(null);
		},
		[editTopic],
	);

	const handleDelete = useCallback(async (): Promise<void> => {
		if (!deleteTopic) return;
		await deleteTopicApi(deleteTopic.id);
		setTopics((prev) => prev.filter((t) => t.id !== deleteTopic.id));
		setDeleteTopic(null);
		setViewTopic(null);
	}, [deleteTopic]);

	const headerActions = (
		<>
			<button
				className={styles.btnSecondary}
				onClick={() => setShowExport(true)}
			>
				<Ic.Download />
				Xuất Excel
			</button>
			<button
				className={styles.btnPrimary}
				onClick={() => setShowCreate(true)}
			>
				<Ic.Plus />
				Đăng ký đề tài
			</button>
		</>
	);

	return (
		<AdminLayout
			pageTitle='Quản lý Đề tài Nghiên cứu'
			pageSubtitle='Danh sách và theo dõi tất cả đề tài NCKH — bảng topics'
			headerActions={headerActions}
		>
			{/* ── STATS ── */}
			<div className={styles.statsRow}>
				<div className={`${styles.statCard} ${styles.green}`}>
					<div className={`${styles.statIcon} ${styles.iconGreen}`}>
						<Ic.Doc />
					</div>
					<div className={styles.statBody}>
						<div className={styles.statValue}>{stats.total}</div>
						<div className={styles.statLabel}>Tổng đề tài</div>
						<div className={`${styles.statDelta} ${styles.deltaUp}`}>
							Đợt 1/2026 + lịch sử
						</div>
					</div>
				</div>
				<div className={`${styles.statCard} ${styles.blue}`}>
					<div className={`${styles.statIcon} ${styles.iconBlue}`}>
						<Ic.Progress />
					</div>
					<div className={styles.statBody}>
						<div className={styles.statValue}>{stats.approved}</div>
						<div className={styles.statLabel}>Đã được duyệt</div>
						<div className={`${styles.statDelta} ${styles.deltaNeutral}`}>
							{stats.total > 0
								? Math.round((stats.approved / stats.total) * 100)
								: 0}
							% tổng đề tài
						</div>
					</div>
				</div>
				<div className={`${styles.statCard} ${styles.amber}`}>
					<div className={`${styles.statIcon} ${styles.iconAmber}`}>
						<Ic.Approve />
					</div>
					<div className={styles.statBody}>
						<div className={styles.statValue}>{stats.submitted}</div>
						<div className={styles.statLabel}>Chờ phê duyệt</div>
						<div className={`${styles.statDelta} ${styles.deltaDown}`}>
							Cần xử lý sớm
						</div>
					</div>
				</div>
				<div className={`${styles.statCard} ${styles.pink}`}>
					<div className={`${styles.statIcon} ${styles.iconPink}`}>
						<Ic.Check />
					</div>
					<div className={styles.statBody}>
						<div className={styles.statValue}>{stats.rejected}</div>
						<div className={styles.statLabel}>Bị từ chối</div>
						<div className={`${styles.statDelta} ${styles.deltaDown}`}>
							{stats.total > 0
								? Math.round((stats.rejected / stats.total) * 100)
								: 0}
							% tổng đề tài
						</div>
					</div>
				</div>
			</div>

			{/* ── TABLE CARD ── */}
			<div className={styles.tableCard}>
				{/* Header */}
				<div className={styles.tableHeader}>
					<div className={styles.tableHeaderLeft}>
						<span className={styles.tableTitle}>Danh sách đề tài</span>
						<span className={styles.tableCount}>{filtered.length} đề tài</span>
					</div>
					<div className={styles.tableControls}>
						<div className={styles.searchWrap}>
							<svg
								className={styles.searchIcon}
								viewBox='0 0 24 24'
								fill='none'
								stroke='currentColor'
								strokeWidth='2'
								strokeLinecap='round'
								strokeLinejoin='round'
							>
								<circle
									cx='11'
									cy='11'
									r='8'
								/>
								<line
									x1='21'
									y1='21'
									x2='16.65'
									y2='16.65'
								/>
							</svg>
							<input
								className={styles.searchInput}
								placeholder='Tìm mã, tên đề tài...'
								value={search}
								onChange={(e) => {
									setSearch(e.target.value);
									resetPage();
								}}
							/>
						</div>
						<MultiSelect
							options={availableYears.map((y) => ({ id: y.toString(), label: String(y) }))}
							selected={yearFilters}
							onChange={handleYearChange}
							placeholder='Tất cả năm'
						/>
						<MultiSelect
							options={visibleRounds.map((r) => ({ id: r.id, label: r.name }))}
							selected={roundFilters}
							onChange={(next) => { setRoundFilters(next); setPage(1); }}
							placeholder='Tất cả đợt'
						/>
						<MultiSelect
							options={levels.map((l) => ({ id: l.id, label: l.name }))}
							selected={levelFilters}
							onChange={(next) => { setLevelFilters(next); setPage(1); }}
							placeholder='Cấp độ'
						/>
						<MultiSelect
							options={categories.map((c) => ({ id: c.id, label: c.name }))}
							selected={catFilters}
							onChange={(next) => { setCatFilters(next); setPage(1); }}
							placeholder='Phân loại'
						/>
						<MultiSelect
							options={departments.map((d) => ({ id: d.id, label: d.name }))}
							selected={deptFilters}
							onChange={(next) => { setDeptFilters(next); setPage(1); }}
							placeholder='Phòng ban'
							searchable
						/>
					</div>
				</div>

				{/* Tabs */}
				<div className={styles.tabsRow}>
					{TABS.map((t) => (
						<div
							key={t.key}
							className={`${styles.tab} ${activeTab === t.key ? styles.tabActive : ''}`}
							onClick={() => {
								setActiveTab(t.key);
								resetPage();
							}}
						>
							{t.label}
							<span className={styles.tabBadge}>{t.count}</span>
						</div>
					))}
				</div>

				{/* Table */}
				<div className={styles.tableWrap}>
					<table className={styles.table}>
						<thead>
							<tr>
								<th className={styles.colId}>Mã đề tài</th>
								<th className={styles.colTitle}>Tên đề tài</th>
								<th className={styles.colRound}>Đợt NC</th>
								<th className={styles.colLevel}>Cấp độ</th>
								<th className={styles.colCategory}>Phân loại</th>
								<th className={styles.colDept}>Phòng ban</th>
								<th className={styles.colStatus}>Trạng thái</th>
								<th className={styles.colDate}>Ngày đăng ký</th>
								<th className={styles.colActions}>Thao tác</th>
							</tr>
						</thead>
						<tbody>
							{isLoadingData ? (
								<tr>
									<td
										colSpan={10}
										style={{
											textAlign: 'center',
											padding: '40px',
											color: 'var(--color-gray-400)',
											fontSize: 13,
										}}
									>
										Đang tải dữ liệu...
									</td>
								</tr>
							) : loadError ? (
								<tr>
									<td
										colSpan={10}
										style={{
											textAlign: 'center',
											padding: '40px',
											color: 'var(--color-red-600)',
											fontSize: 13,
										}}
									>
										{loadError}
									</td>
								</tr>
							) : pageSlice.length === 0 ? (
								<tr>
									<td colSpan={10}>
										<div className={styles.emptyState}>
											<svg
												className={styles.emptyIcon}
												viewBox='0 0 24 24'
												fill='none'
												stroke='currentColor'
												strokeWidth='1.5'
												strokeLinecap='round'
												strokeLinejoin='round'
											>
												<path d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' />
												<polyline points='14 2 14 8 20 8' />
											</svg>
											<p className={styles.emptyTitle}>
												Không tìm thấy đề tài nào
											</p>
											<p className={styles.emptyDesc}>
												Thử thay đổi bộ lọc hoặc từ khoá tìm kiếm
											</p>
										</div>
									</td>
								</tr>
							) : (
								pageSlice.map((t) => {
									const sc = STATUS_CFG[t.status];
									return (
										<tr key={t.id}>
											<td>
												<div className={styles.topicId}>{t.id}</div>
											</td>
											<td>
												<div
													className={styles.topicTitle}
													title={t.title}
													onClick={() => setViewTopic(t)}
												>
													{t.title}
												</div>
												<div className={styles.topicMeta}>
													{lookup(departments, t.department_id)} ·{' '}
													{t.member_count} thành viên
												</div>
											</td>
											<td>
												<span className={styles.dateText}>
													{lookup(rounds, t.round_id)}
												</span>
											</td>
											<td>
												<Badge
													cls={
														t.level_id === 'CD04'
															? 'badgePink'
															: t.level_id === 'CD03'
																? 'badgePurple'
																: 'badgeTeal'
													}
												>
													{lookup(levels, t.level_id)}
												</Badge>
											</td>
											<td>
												<span
													style={{
														fontSize: 12,
														color: 'var(--color-gray-600)',
													}}
												>
													{lookup(categories, t.category_id)}
												</span>
											</td>
											<td>
												<span style={{ fontSize: 12 }}>
													{lookup(departments, t.department_id)}
												</span>
											</td>
											<td>
												<Badge
													cls={sc.cls}
													dot
												>
													{sc.label}
												</Badge>
											</td>
											<td>
												<span className={styles.dateText}>
													{new Date(t.created_at).toLocaleDateString('vi-VN', {
														day: '2-digit',
														month: '2-digit',
														year: 'numeric',
													})}
												</span>
											</td>
											<td>
												<div className={styles.actionBtns}>
													<div
														className={styles.actionBtn}
														title='Xem chi tiết'
														onClick={() => setViewTopic(t)}
													>
														<Ic.Eye />
													</div>
													<div
														className={styles.actionBtn}
														title='Chỉnh sửa'
														onClick={() => {
															setEditTopic(t);
															setViewTopic(null);
														}}
													>
														<Ic.Edit />
													</div>
													<div
														className={`${styles.actionBtn} ${styles.danger}`}
														title='Xoá'
														onClick={() => setDeleteTopic(t)}
													>
														<Ic.Trash />
													</div>
												</div>
											</td>
										</tr>
									);
								})
							)}
						</tbody>
					</table>
				</div>

				{/* Pagination */}
				<div className={styles.pagination}>
					<span className={styles.pageInfo}>
						{filtered.length === 0
							? 'Không có đề tài nào'
							: `Hiển thị ${(safePage - 1) * rowsPerPage + 1}–${Math.min(safePage * rowsPerPage, filtered.length)} trong ${filtered.length} đề tài`}
					</span>
					<select
						className={styles.filterSelect}
						value={rowsPerPage}
						onChange={(e) => {
							setRowsPerPage(Number(e.target.value));
							setPage(1);
						}}
						style={{ marginLeft: 'auto', marginRight: '0.5rem' }}
					>
						{PAGE_SIZE_OPTIONS.map((n) => (
							<option key={n} value={n}>{n} / trang</option>
						))}
					</select>
					<div className={styles.pageBtns}>
						<button
							className={styles.pageBtn}
							onClick={() => setPage((p) => Math.max(1, p - 1))}
							disabled={safePage === 1}
						>
							<Ic.ChevL />
						</button>
						{Array.from({ length: totalPages }, (_, i) => i + 1)
							.filter(
								(p) =>
									p === 1 || p === totalPages || Math.abs(p - safePage) <= 1,
							)
							.reduce<(number | '…')[]>((acc, p, i, arr) => {
								if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push('…');
								acc.push(p);
								return acc;
							}, [])
							.map((p, i) =>
								p === '…' ? (
									<span
										key={`e${i}`}
										className={styles.pageBtn}
										style={{ border: 'none', cursor: 'default' }}
									>
										…
									</span>
								) : (
									<button
										key={p}
										className={`${styles.pageBtn} ${safePage === p ? styles.pageBtnActive : ''}`}
										onClick={() => setPage(p as number)}
									>
										{p}
									</button>
								),
							)}
						<button
							className={styles.pageBtn}
							onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
							disabled={safePage === totalPages}
						>
							<Ic.ChevR />
						</button>
					</div>
				</div>
			</div>

			{/* ── MODALS & DRAWER ── */}
			{showExport && (
				<ExportExcelModal
					topics={topics}
					filtered={filtered}
					categories={categories}
					levels={levels}
					rounds={rounds}
					departments={departments}
					onClose={() => setShowExport(false)}
				/>
			)}
			{showCreate && (
				<TopicModal
					mode='create'
					categories={categories}
					levels={levels}
					rounds={rounds}
					departments={departments}
					onClose={() => setShowCreate(false)}
					onSave={handleCreate}
				/>
			)}
			{editTopic && (
				<TopicModal
					mode='edit'
					topic={editTopic}
					categories={categories}
					levels={levels}
					rounds={rounds}
					departments={departments}
					onClose={() => setEditTopic(null)}
					onSave={handleEdit}
				/>
			)}
			{deleteTopic && (
				<DeleteModal
					topic={deleteTopic}
					onClose={() => setDeleteTopic(null)}
					onConfirm={handleDelete}
				/>
			)}
			{viewTopic && !editTopic && (
				<TopicDrawer
					topic={viewTopic}
					categories={categories}
					levels={levels}
					rounds={rounds}
					departments={departments}
					onClose={() => setViewTopic(null)}
					onEdit={() => {
						setEditTopic(viewTopic);
						setViewTopic(null);
					}}
				/>
			)}
		</AdminLayout>
	);
}
