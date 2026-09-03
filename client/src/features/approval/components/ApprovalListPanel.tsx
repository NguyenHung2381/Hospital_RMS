import type { Dispatch, SetStateAction } from 'react';
import {
	CheckCircleSvg,
	CheckSmSvg,
	CheckSvg,
	SearchSvg,
	UsersSvg,
	XCircleSvg,
	XSvg,
} from '@/assets/icons';
import { Badge } from '@/shared/components';
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
	isSelectableTab,
	checkedCount,
	allChecked,
	someChecked,
	TABS,
	toggleAll,
	setBulkModal,
	setBulkComment,
}: ApprovalListPanelProps) {
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
							className={styles.btnSelApprove}
							onClick={() => {
								setBulkComment('');
								setBulkModal('bulkApprove');
							}}
						>
							<CheckCircleSvg /> Phê duyệt ({checkedCount})
						</button>
						<button
							className={styles.btnSelReject}
							onClick={() => {
								setBulkComment('');
								setBulkModal('bulkReject');
							}}
						>
							<XCircleSvg /> Không phê duyệt ({checkedCount})
						</button>
						<button
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
						placeholder='Tìm mã, tên đề tài, người nộp...'
						value={search}
						onChange={(e) => setSearch(e.target.value)}
					/>
				</div>
			</div>

			{/* Tabs */}
			<div className={styles.listTabs}>
				{TABS.map((t) => (
					<div
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
						<span className={styles.tabCount}>{t.count}</span>
					</div>
				))}
			</div>

			{/* Items */}
			<div className={styles.listBody}>
				{listLoading ? (
					<div
						style={{
							padding: '48px 24px',
							textAlign: 'center',
							color: 'var(--color-gray-400)',
						}}
					>
						<div style={{ fontSize: 13, fontWeight: 600 }}>Đang tải...</div>
					</div>
				) : error ? (
					<div
						style={{
							padding: '48px 24px',
							textAlign: 'center',
							color: '#A32D2D',
						}}
					>
						<div style={{ fontSize: 13, fontWeight: 600 }}>{error}</div>
					</div>
				) : filtered.length === 0 ? (
					<div
						style={{
							padding: '48px 24px',
							textAlign: 'center',
							color: 'var(--color-gray-400)',
						}}
					>
						<div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
							Không có hồ sơ phê duyệt nào
						</div>
						<div style={{ fontSize: 12 }}>Vui lòng thử thay đổi bộ lọc tìm kiếm</div>
					</div>
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
									<div
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
									</div>
								) : (
									<div
										className={`${styles.urgencyDot} ${r.is_urgent ? styles.dotUrgent : styles.dotNormal}`}
									/>
								)}
								<div className={styles.listItemContent}>
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
								</div>
								<div className={styles.listItemRight}>
									<Badge
										tone={sc.tone}
										dot
									>
										{sc.label}
									</Badge>
									<span className={styles.listItemDate}>{r.created_at}</span>
									{r.is_urgent && (
										<span
											style={{
												fontSize: 10,
												color: '#E24B4A',
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
