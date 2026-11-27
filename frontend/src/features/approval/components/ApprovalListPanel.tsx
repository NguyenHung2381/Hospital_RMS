import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { EmptyState } from '@/shared/components/EmptyState';
import {
	CheckCircleSvg,
	CheckSmSvg,
	CheckSvg,
	SearchSvg,
	UsersSvg,
	XCircleSvg,
	XSvg,
} from '@/assets/icons';
import { Badge, ErrorState, InlineLoading } from '@/shared/components';
import type { ApprovalRecord, TabKey } from '../types/approval.type';
import { STATUS_CFG } from '../utils/approvalHelpers';
import styles from '../pages/Approval.module.css';

interface ApprovalListPanelProps {
	filtered: ApprovalRecord[];
	selected: ApprovalRecord | null;
	checkedIds: Set<string>;
	setCheckedIds: Dispatch<SetStateAction<Set<string>>>;
	activeTab: TabKey;
	setActiveTab: (tab: TabKey) => void;
	setSelectedId: (id: string | null) => void;
	search: string;
	setSearch: (s: string) => void;
	listLoading: boolean;
	error: string | null;
	onRetry: () => void;
	isSelectableTab: boolean;
	checkedCount: number;
	allChecked: boolean;
	someChecked: boolean;
	TABS: { key: TabKey; label: string; count: number }[];
	toggleAll: () => void;
	setBulkModal: (m: 'bulkApprove' | 'bulkReject' | null) => void;
	setBulkComment: (v: string) => void;
}

export function ApprovalListPanel({
	filtered,
	selected,
	checkedIds,
	setCheckedIds,
	activeTab,
	setActiveTab,
	setSelectedId,
	search,
	setSearch,
	listLoading,
	error,
	onRetry,
	isSelectableTab,
	checkedCount,
	allChecked,
	someChecked,
	TABS,
	toggleAll,
	setBulkModal,
	setBulkComment,
}: ApprovalListPanelProps) {
	// Cuộn tab đang chọn vào giữa vùng nhìn thấy khi đổi tab
	const tabsRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const container = tabsRef.current;
		if (!container) return;
		const activeEl = container.querySelector<HTMLElement>(
			`.${styles.listTabActive}`,
		);
		if (!activeEl) return;
		const cRect = container.getBoundingClientRect();
		const aRect = activeEl.getBoundingClientRect();
		const delta =
			aRect.left -
			cRect.left -
			(container.clientWidth - activeEl.clientWidth) / 2;
		container.scrollBy({ left: delta, behavior: 'smooth' });
	}, [activeTab]);

	return (
		<div className={styles.listPanel}>
			<div className={styles.listHeader}>
				<div className={styles.listHeaderTop}>
					<div className={styles.listHeaderLeft}>
						{isSelectableTab && filtered.length > 0 && (
							<label
								className={styles.checkAll}
								title={allChecked ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
							>
								<input
									type='checkbox'
									className={styles.checkbox}
									checked={allChecked}
									ref={(el) => {
										if (el) el.indeterminate = someChecked;
									}}
									onChange={toggleAll}
								/>
							</label>
						)}
						<span className={styles.listTitle}>Danh sách phê duyệt</span>
					</div>
					<div className={styles.listHeaderRight}>
						{isSelectableTab && checkedCount > 0 && (
							<span className={styles.selectionBadge}>
								<CheckSvg />
								{checkedCount} đã chọn
							</span>
						)}
						<span className={styles.listCount}>{filtered.length} hồ sơ</span>
					</div>
				</div>

				{isSelectableTab && checkedCount > 0 && (
					<div className={styles.bulkActions}>
						<button
							type='button'
							className={styles.btnSelApprove}
							onClick={() => {
								setBulkComment('');
								setBulkModal('bulkApprove');
							}}
						>
							<CheckCircleSvg /> Phê duyệt ({checkedCount})
						</button>
						<button
							type='button'
							className={styles.btnSelReject}
							onClick={() => {
								setBulkComment('');
								setBulkModal('bulkReject');
							}}
						>
							<XCircleSvg /> Không phê duyệt ({checkedCount})
						</button>
						<button
							type='button'
							className={styles.btnSelClear}
							onClick={() => setCheckedIds(new Set())}
						>
							<XSvg /> Bỏ chọn
						</button>
					</div>
				)}

				<div className={styles.listSearch}>
					<SearchSvg className={styles.listSearchIcon} />
					<input
						className={styles.listSearchInput}
						aria-label='Tìm hồ sơ theo mã, tên đề tài hoặc người nộp'
						placeholder='Tìm mã, tên đề tài, người nộp...'
						value={search}
						onChange={(e) => setSearch(e.target.value)}
					/>
				</div>
			</div>

			{/* Tabs */}
			<div
				className={styles.listTabs}
				ref={tabsRef}
				role='tablist'
				aria-label='Lọc theo trạng thái'
			>
				{TABS.map((t) => (
					<button
						type='button'
						role='tab'
						aria-selected={activeTab === t.key}
						key={t.key}
						className={`${styles.listTab} ${activeTab === t.key ? styles.listTabActive : ''}`}
						onClick={() => {
							setActiveTab(t.key);
							setSelectedId(null);
							setSearch('');
							setCheckedIds(new Set());
						}}
					>
						{t.label}
						<span
							className={`${styles.tabCount} ${t.key === 'pending' && t.count > 0 ? styles.tabCountAttention : ''}`}
						>
							{t.count}
						</span>
					</button>
				))}
			</div>

			{/* Items */}
			<div className={styles.listBody}>
				{listLoading ? (
					<InlineLoading label='Đang tải…' />
				) : error ? (
					<ErrorState
						desc={error}
						onRetry={onRetry}
					/>
				) : filtered.length === 0 ? (
					// Đang tìm kiếm → gợi ý đổi từ khóa; hàng chờ trống thật → báo đã xử lý xong
					<EmptyState
						title={
							search.trim()
								? 'Không tìm thấy hồ sơ phù hợp'
								: activeTab === 'pending'
									? 'Bạn đã xử lý hết hồ sơ chờ duyệt'
									: 'Chưa có hồ sơ nào ở mục này'
						}
						desc={search.trim() ? 'Thử từ khóa khác hoặc xóa ô tìm kiếm' : undefined}
					/>
				) : (
					filtered.map((r) => {
						const sc = STATUS_CFG[r.status];
						const isChecked = checkedIds.has(r.id);
						return (
							<div
								key={r.id}
								className={`${styles.listItem} ${selected?.id === r.id ? styles.listItemSelected : ''} ${isChecked ? styles.listItemChecked : ''}`}
								onClick={() => setSelectedId(r.id)}
							>
								{isSelectableTab ? (
									<button
										type='button'
										role='checkbox'
										aria-checked={isChecked}
										aria-label={`Chọn hồ sơ ${r.id}`}
										className={styles.checkCol}
										onClick={(e) => {
											e.stopPropagation();
											setCheckedIds((prev) => {
												const next = new Set(prev);
												if (next.has(r.id)) next.delete(r.id);
												else next.add(r.id);
												return next;
											});
										}}
									>
										<div
											className={`${styles.customCheck} ${isChecked ? styles.customCheckOn : ''}`}
										>
											{isChecked && (
												<CheckSmSvg style={{ width: 9, height: 7 }} />
											)}
										</div>
										{r.is_urgent && <span className={styles.urgentPip} />}
									</button>
								) : (
									<div
										className={`${styles.urgencyDot} ${r.is_urgent ? styles.dotUrgent : styles.dotNormal}`}
									/>
								)}
								<button
									type='button'
									className={styles.listItemContent}
									aria-current={selected?.id === r.id ? 'true' : undefined}
									onClick={(e) => {
										e.stopPropagation();
										setSelectedId(r.id);
									}}
								>
									<div className={styles.listItemTopicId}>
										{r.topic_id} · {r.id}
									</div>
									<div
										className={styles.listItemTitle}
										title={r.topic_title}
									>
										{r.topic_title}
									</div>
									<div className={styles.listItemMeta}>
										<span>{r.created_by}</span>
										<span>·</span>
										<span>{r.topic_dept}</span>
										<span>·</span>
										<span
											style={{
												display: 'flex',
												alignItems: 'center',
												gap: 3,
											}}
										>
											<UsersSvg />
											{r.topic_member_count}
										</span>
									</div>
								</button>
								<div className={styles.listItemRight}>
									<Badge
										tone={sc.tone}
										dot
									>
										{sc.label}
									</Badge>
									<span className={styles.listItemDate}>{r.created_at}</span>
									{r.is_legacy && <Badge tone='blue'>Nhập bổ sung</Badge>}
									{r.is_urgent && (
										<span
											style={{
												fontSize: 10,
												color: 'var(--tone-red-fg)',
												fontWeight: 700,
											}}
										>
											⚠ Khẩn
										</span>
									)}
								</div>
							</div>
						);
					})
				)}
			</div>
		</div>
	);
}
