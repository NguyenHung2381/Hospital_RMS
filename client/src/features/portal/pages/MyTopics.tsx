import { useNavigate } from 'react-router-dom';
import {
	BuildingSvg,
	CheckCircleSvg,
	ClockSvg,
	MessageSvg,
	PlusSvg,
	UserCheckSvg,
	XCircleSvg,
} from '@/assets/icons';
import UserLayout from '../../../layouts/UserLayout';
import { EditTopicModal } from '../components/EditTopicModal';
import { FileViewerModal } from '@/shared/components/FileViewerModal';
import { MyTopicsDetailPanel } from '../components/MyTopicsDetailPanel';
import { MyTopicsListPanel } from '../components/MyTopicsListPanel';
import { useMyTopics } from '../hooks/useMyTopics';
import { STATUS_CFG, type FilterTab } from '../utils/myTopicsHelpers';
import styles from './MyTopics.module.css';

export default function MyTopics() {
	const navigate = useNavigate();
	const d = useMyTopics();

	const headerActions = d.canRegister ? (
		<button
			className={styles.btnPrimary}
			onClick={() => navigate('/user/register-topic')}
		>
			<PlusSvg />
			Đăng ký đề tài mới
		</button>
	) : null;

	return (
		<UserLayout
			pageTitle='Đề tài nghiên cứu'
			pageSubtitle={
				d.canSeeDept
					? 'Quản lý đề tài theo khoa và cá nhân'
					: 'Đề tài bạn tham gia hoặc đăng ký'
			}
			breadcrumbs={[{ label: 'Đề tài nghiên cứu' }]}
			headerActions={headerActions}
			userName={d.fullName}
			userRole={d.userRole}
			userInitials={d.initials}
		>
			{d.loading ? (
				<div className={styles.stateBox}>
					<div className={styles.spinner} />
					<span>Đang tải...</span>
				</div>
			) : d.error ? (
				<div
					className={styles.stateBox}
					style={{ color: '#ef4444' }}
				>
					{d.error}
				</div>
			) : (
				<>
					{/* Category toggle (dept accounts only) */}
					{d.canSeeDept && (
						<div className={styles.categoryRow}>
							<button
								className={`${styles.categoryCard} ${d.category === 'department' ? styles.categoryCardActive : ''}`}
								onClick={() => {
									d.setCategory('department');
									d.setSearch('');
								}}
							>
								<div
									className={`${styles.categoryIcon} ${d.category === 'department' ? styles.categoryIconActive : ''}`}
								>
									<BuildingSvg />
								</div>
								<div className={styles.categoryText}>
									<div className={styles.categoryLabel}>Đề tài của khoa</div>
									<div className={styles.categoryDesc}>
										Toàn bộ đề tài thuộc khoa/phòng
									</div>
								</div>
								<div
									className={`${styles.categoryCount} ${d.category === 'department' ? styles.categoryCountActive : ''}`}
								>
									{d.deptTopics.length}
								</div>
							</button>
							<button
								className={`${styles.categoryCard} ${d.category === 'mine' ? styles.categoryCardActive : ''}`}
								onClick={() => {
									d.setCategory('mine');
									d.setSearch('');
								}}
							>
								<div
									className={`${styles.categoryIcon} ${d.category === 'mine' ? styles.categoryIconActive : ''}`}
								>
									<UserCheckSvg />
								</div>
								<div className={styles.categoryText}>
									<div className={styles.categoryLabel}>
										Đề tài tôi tham gia
									</div>
									<div className={styles.categoryDesc}>
										Đề tài tôi đăng ký hoặc là thành viên
									</div>
								</div>
								<div
									className={`${styles.categoryCount} ${d.category === 'mine' ? styles.categoryCountActive : ''}`}
								>
									{d.myTopics.length}
								</div>
							</button>
						</div>
					)}

					{/* Stats row */}
					<div className={styles.statsRow}>
						{(
							[
								{
									key: 'submitted' as FilterTab,
									iconCls: 'iconAmber',
									cardCls: 'amber',
									hintCls: 'hintAmber',
									hint: 'Cần xử lý sớm',
									Icon: ClockSvg,
								},
								{
									key: 'approved' as FilterTab,
									iconCls: 'iconGreen',
									cardCls: 'green',
									hintCls: 'hintGreen',
									hint: 'Hoàn tất',
									Icon: CheckCircleSvg,
								},
								{
									key: 'rejected' as FilterTab,
									iconCls: 'iconRed',
									cardCls: 'red',
									hintCls: 'hintRed',
									hint: 'Không đạt yêu cầu',
									Icon: XCircleSvg,
								},
								{
									key: 'supplement' as FilterTab,
									iconCls: 'iconBlue',
									cardCls: 'blue',
									hintCls: 'hintBlue',
									hint: 'Cần bổ sung hồ sơ',
									Icon: MessageSvg,
								},
							] as const
						).map((s) => {
							const cfg = STATUS_CFG[s.key];
							return (
								<div
									key={s.key}
									className={`${styles.statCard} ${styles[s.cardCls as keyof typeof styles]} ${d.activeTab === s.key ? styles.statActive : ''}`}
									onClick={() => d.setActiveTab(s.key)}
								>
									<div
										className={`${styles.statIcon} ${styles[s.iconCls as keyof typeof styles]}`}
									>
										<s.Icon />
									</div>
									<div className={styles.statBody}>
										<div className={styles.statValue}>{d.stats[s.key]}</div>
										<div className={styles.statLabel}>{cfg.label}</div>
										<div
											className={`${styles.statHint} ${styles[s.hintCls as keyof typeof styles]}`}
										>
											{s.hint}
										</div>
									</div>
								</div>
							);
						})}
					</div>

					{/* Split layout */}
					<div className={styles.splitLayout}>
						<MyTopicsListPanel
							filtered={d.filtered}
							selectedId={d.selectedId}
							setSelectedId={d.setSelectedId}
							search={d.search}
							setSearch={d.setSearch}
							activeTab={d.activeTab}
							setActiveTab={d.setActiveTab}
							stats={d.stats}
						/>
						<MyTopicsDetailPanel
							selectedId={d.selectedId}
							detailLoading={d.detailLoading}
							detailTopic={d.detailTopic}
							detailFiles={d.detailFiles}
							detailHistory={d.detailHistory}
							latestApproval={d.latestApproval}
							canUploadFiles={d.canUploadFiles}
							setFileViewer={d.setFileViewer}
							fileInputRef={d.fileInputRef}
							pendingFiles={d.pendingFiles}
							setPendingFiles={d.setPendingFiles}
							batchNote={d.batchNote}
							setBatchNote={d.setBatchNote}
							uploadLoading={d.uploadLoading}
							uploadError={d.uploadError}
							handleUpload={d.handleUpload}
							openEdit={d.openEdit}
							formatFileSize={d.formatFileSize}
						/>
					</div>
				</>
			)}

			{d.editOpen && (
				<EditTopicModal
					editLoading={d.editLoading}
					editError={d.editError}
					editForm={d.editForm}
					setEditForm={d.setEditForm}
					refData={d.refData}
					refDataLoading={d.refDataLoading}
					onClose={() => d.setEditOpen(false)}
					onSave={() => void d.handleSaveEdit()}
				/>
			)}

			{d.fileViewer && (
				<FileViewerModal
					file={d.fileViewer}
					onClose={() => d.setFileViewer(null)}
				/>
			)}
		</UserLayout>
	);
}
