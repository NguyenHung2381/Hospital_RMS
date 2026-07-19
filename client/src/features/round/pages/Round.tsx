import {
	CalendarSvg,
	CheckCircleSvg,
	CheckSvg,
	ClockSvg,
	PlusSvg,
} from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import { RoundCard } from '../components/RoundCard';
import { RoundDeleteModal } from '../components/RoundDeleteModal';
import { RoundModal } from '../components/RoundModal';
import { useRound } from '../hooks/useRound';
import styles from './Round.module.css';

export default function Round() {
	const d = useRound();

	const headerActions = (
		<button
			className={styles.btnPrimary}
			onClick={() => d.setShowCreate(true)}
		>
			<PlusSvg style={{ width: 14, height: 14 }} /> Tạo đợt nghiên cứu
		</button>
	);

	return (
		<AdminLayout
			pageTitle='Quản lý Đợt Nghiên cứu'
			pageSubtitle='Thiết lập và theo dõi các đợt đăng ký đề tài NCKH'
			headerActions={headerActions}
		>
			{/* ── STATS ── */}
			<div className={styles.statsRow}>
				{[
					{
						value: d.stats.total,
						label: 'Tổng đợt nghiên cứu',
						sub: `${d.years.length} năm ghi nhận`,
						icon: <CalendarSvg />,
						cls: 'green',
						iconCls: 'iconGreen',
					},
					{
						value: d.stats.active,
						label: 'Đợt đang mở',
						sub: 'Nhận đề tài đăng ký',
						icon: <ClockSvg />,
						cls: 'blue',
						iconCls: 'iconBlue',
					},
					{
						value: d.stats.closed,
						label: 'Đợt đã đóng',
						sub: 'Kết thúc hoàn toàn',
						icon: <CheckCircleSvg />,
						cls: 'gray',
						iconCls: 'iconGray',
					},
					{
						value: d.stats.draft,
						label: 'Đợt lên lịch',
						sub: 'Chưa mở đăng ký',
						icon: <CalendarSvg />,
						cls: 'amber',
						iconCls: 'iconAmber',
					},
				].map((s) => (
					<div
						key={s.label}
						className={`${styles.statCard} ${styles[s.cls as keyof typeof styles]}`}
					>
						<div
							className={`${styles.statIcon} ${styles[s.iconCls as keyof typeof styles]}`}
						>
							{s.icon}
						</div>
						<div className={styles.statBody}>
							<div className={styles.statValue}>{s.value}</div>
							<div className={styles.statLabel}>{s.label}</div>
							<div className={styles.statSub}>{s.sub}</div>
						</div>
					</div>
				))}
			</div>

			{/* ── ROUNDS GRID ── */}
			<div>
				<div className={styles.modalTabs} style={{ padding: 0, marginBottom: 'var(--space-4)' }}>
					<button
						className={`${styles.modalTab} ${d.viewTab === 'current' ? styles.modalTabActive : ''}`}
						onClick={() => d.setViewTab('current')}
					>
						Đợt nghiên cứu
					</button>
					<button
						className={`${styles.modalTab} ${d.viewTab === 'scheduled' ? styles.modalTabActive : ''}`}
						onClick={() => d.setViewTab('scheduled')}
					>
						Đang lên lịch ({d.stats.draft})
					</button>
				</div>

				<div
					className={styles.sectionHeading}
					style={{ marginBottom: 'var(--space-4)' }}
				>
					<div>
						<div className={styles.sectionTitle}>
							{d.viewTab === 'scheduled' ? 'Đợt đang lên lịch' : 'Tất cả đợt nghiên cứu'}
						</div>
						<div className={styles.sectionSub}>
							{d.filtered.length} đợt
							{d.viewTab === 'current' && d.yearFilter !== 'all' ? ` — Năm ${d.yearFilter}` : ''}
							{' · '}
							{d.stats.topicSum} đề tài
						</div>
					</div>
					{d.viewTab === 'current' && (
						<div className={styles.sectionRight}>
							<select
								className={styles.formSelect}
								style={{ width: 'auto' }}
								value={d.statusFilter}
								onChange={(e) =>
									d.setStatusFilter(e.target.value as typeof d.statusFilter)
								}
							>
								<option value='all'>Tất cả trạng thái</option>
								<option value='active'>Đang mở</option>
								<option value='closed'>Đã đóng</option>
							</select>
						</div>
					)}
				</div>

				{d.viewTab === 'current' && (
					<div
						className={styles.yearBar}
						style={{ marginBottom: 'var(--space-5)' }}
					>
						<button
							className={`${styles.yearChip} ${d.yearFilter === 'all' ? styles.yearChipActive : ''}`}
							onClick={() => d.setYearFilter('all')}
						>
							Tất cả năm
						</button>
						{d.years.map((y) => (
							<button
								key={y}
								className={`${styles.yearChip} ${d.yearFilter === y ? styles.yearChipActive : ''}`}
								onClick={() => d.setYearFilter(y)}
							>
								{y}
							</button>
						))}
					</div>
				)}

				{d.isLoadingData ? (
					<div className={styles.emptyState}>
						<p className={styles.emptyTitle}>Đang tải...</p>
					</div>
				) : d.loadError ? (
					<div className={styles.emptyState}>
						<p
							className={styles.emptyTitle}
							style={{ color: '#A32D2D' }}
						>
							{d.loadError}
						</p>
					</div>
				) : d.filtered.length === 0 ? (
					<div className={styles.emptyState}>
						<CalendarSvg className={styles.emptyIcon} />
						<p className={styles.emptyTitle}>Không có đợt nghiên cứu nào</p>
						<p className={styles.emptyDesc}>
							Thử thay đổi bộ lọc hoặc tạo đợt mới
						</p>
					</div>
				) : d.viewTab === 'current' && d.yearFilter === 'all' ? (
					d.years.map((y) => {
						const group = d.filtered.filter((r) => r.year === y);
						if (group.length === 0) return null;
						return (
							<div key={y} className={styles.yearGroup}>
								<div className={styles.yearGroupTitle}>Năm {y}</div>
								<div className={styles.roundsGrid}>
									{group.map((r) => (
										<RoundCard
											key={r.id}
											round={r}
											onEdit={() => d.setEditRound(r)}
											onDelete={() => d.setDeleteRound(r)}
											onCopyLink={d.handleCopyLink}
										/>
									))}
								</div>
							</div>
						);
					})
				) : (
					<div className={styles.roundsGrid}>
						{d.filtered.map((r) => (
							<RoundCard
								key={r.id}
								round={r}
								onEdit={() => d.setEditRound(r)}
								onDelete={() => d.setDeleteRound(r)}
								onCopyLink={d.handleCopyLink}
							/>
						))}
					</div>
				)}
			</div>

			{/* ── MODALS ── */}
			{d.showCreate && (
				<RoundModal
					mode='create'
					rounds={d.rounds}
					onClose={() => d.setShowCreate(false)}
					onSave={d.handleCreate}
				/>
			)}
			{d.editRound && (
				<RoundModal
					mode='edit'
					round={d.editRound}
					rounds={d.rounds}
					onClose={() => d.setEditRound(null)}
					onSave={d.handleEdit}
				/>
			)}
			{d.deleteRound && (
				<RoundDeleteModal
					round={d.deleteRound}
					onClose={() => d.setDeleteRound(null)}
					onConfirm={d.handleDelete}
				/>
			)}

			{/* ── TOAST ── */}
			{d.toast && (
				<div className={styles.toast}>
					<CheckSvg style={{ width: 14, height: 14 }} />
					{d.toast}
				</div>
			)}
		</AdminLayout>
	);
}
