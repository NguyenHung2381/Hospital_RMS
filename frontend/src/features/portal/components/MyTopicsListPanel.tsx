import { DocSvg, SearchSvg, UsersSvg } from '@/assets/icons';
import type { Topic } from '../../topics/types/topic.type';
import { formatDate } from '../../../shared/utils/formatDate';
import { Badge } from '@/shared/components';
import {
	type FilterTab,
	STATUS_CFG,
	TABS,
} from '../utils/myTopicsHelpers';
import styles from '../pages/MyTopics.module.css';

interface MyTopicsListPanelProps {
	filtered: Topic[];
	selectedId: string | null;
	setSelectedId: (id: string) => void;
	search: string;
	setSearch: (v: string) => void;
	activeTab: FilterTab;
	setActiveTab: (tab: FilterTab) => void;
	stats: Record<FilterTab, number>;
}

export function MyTopicsListPanel({
	filtered,
	selectedId,
	setSelectedId,
	search,
	setSearch,
	activeTab,
	setActiveTab,
	stats,
}: MyTopicsListPanelProps) {
	return (
		<div className={styles.listPanel}>
			<div className={styles.listHeader}>
				<div className={styles.listHeaderTop}>
					<span className={styles.listTitle}>Danh sách đề tài</span>
					<span className={styles.listCount}>{filtered.length} đề tài</span>
				</div>
				<div className={styles.listSearch}>
					<SearchSvg className={styles.listSearchIcon} />
					<input
						className={styles.listSearchInput}
						aria-label='Tìm đề tài theo mã hoặc tên'
						placeholder='Tìm mã, tên đề tài...'
						value={search}
						onChange={(e) => setSearch(e.target.value)}
					/>
				</div>
			</div>

			<div
				className={styles.listTabs}
				role='tablist'
				aria-label='Lọc đề tài theo trạng thái'
			>
				{TABS.map((t) => (
					<button
						key={t.key}
						type='button'
						role='tab'
						aria-selected={activeTab === t.key}
						className={`${styles.listTab} ${activeTab === t.key ? styles.listTabActive : ''}`}
						onClick={() => {
							setActiveTab(t.key);
							setSearch('');
						}}
					>
						{t.label}
						{/* "Cần bổ sung" là việc của chính người nộp → hồng khi > 0 */}
						<span
							className={`${styles.tabCount} ${t.key === 'supplement' && stats[t.key] > 0 ? styles.tabCountAttention : ''}`}
						>
							{stats[t.key]}
						</span>
					</button>
				))}
			</div>

			<div className={styles.listBody}>
				{filtered.length === 0 ? (
					<div className={styles.listEmpty}>
						<div className={styles.listEmptyIcon}>
							<DocSvg />
						</div>
						<div className={styles.listEmptyTitle}>
							{search ? 'Không tìm thấy đề tài phù hợp' : 'Chưa có đề tài nào'}
						</div>
						<div className={styles.listEmptyDesc}>
							{search
								? 'Thử từ khóa khác hoặc đổi bộ lọc.'
								: 'Không có đề tài ở trạng thái này.'}
						</div>
					</div>
				) : (
					filtered.map((t) => {
						const cfg = STATUS_CFG[t.status];
						return (
							<button
								key={t.id}
								type='button'
								aria-current={selectedId === t.id ? 'true' : undefined}
								className={`${styles.listItem} ${selectedId === t.id ? styles.listItemSelected : ''}`}
								onClick={() => setSelectedId(t.id)}
							>
								<div
									className={styles.urgencyDot}
									style={{ background: cfg.dot }}
								/>
								<div className={styles.listItemContent}>
									<div className={styles.listItemTopicId}>{t.id}</div>
									<div
										className={styles.listItemTitle}
										title={t.title}
									>
										{t.title}
									</div>
									<div className={styles.listItemMeta}>
										<span
											style={{ display: 'flex', alignItems: 'center', gap: 3 }}
										>
											<UsersSvg />
											{t.member_count ?? 0} thành viên
										</span>
										<span>·</span>
										<span>{formatDate(t.created_at)}</span>
									</div>
								</div>
								<div className={styles.listItemRight}>
									<Badge
										tone={cfg.tone}
										dot
									>
										{cfg.label}
									</Badge>
								</div>
							</button>
						);
					})
				)}
			</div>
		</div>
	);
}
