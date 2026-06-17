import { CheckSvg, ChevDSvg, ChevRSvg, EditSvg, InfoSvg, KeySvg, MailSvg, PhoneSvg, PlusSvg, SearchSvg, TrashSvg, UsersSvg, XSvg } from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import { Avatar } from '../components/Avatar';
import { MemberBulkModal } from '../components/MemberBulkModal';
import { MemberDeleteModal } from '../components/MemberDeleteModal';
import { MemberFormModal } from '../components/MemberFormModal';
import { MemberGrantModal } from '../components/MemberGrantModal';
import { useTopicMembers } from '../hooks/useTopicMembers';
import { ROLE_CFG, TOPIC_STATUS_CFG } from '../utils/memberHelpers';
import styles from './TopicMembers.module.css';

function Badge({
	cls,
	children,
	dot,
}: {
	cls: string;
	children: React.ReactNode;
	dot?: boolean;
}) {
	return (
		<span className={`${styles.badge} ${styles[cls as keyof typeof styles]}`}>
			{dot && <span className={styles.badgeDot} />}
			{children}
		</span>
	);
}

export default function TopicMembers() {
	const state = useTopicMembers();
	const {
		topics,
		selectedTopicId,
		selectedTopic,
		filteredMembers,
		groupedTopics,
		search,
		roleFilter,
		modal,
		editingMember,
		deletingMember,
		loading,
		listLoading,
		memberLoading,
		error,
		toast,
		expandedRounds,
		roundSearch,
		bulkTargetRound,
		stats,
		canGrant,
		topicMembers,
		setSearch,
		setRoleFilter,
		setModal,
		setEditingMember,
		setDeletingMember,
		setSelectedTopicId,
		setBulkTargetRound,
		setRoundSearch,
		toggleRound,
		getFilteredTopics,
		handleAdd,
		handleEdit,
		handleDelete,
		handleGrant,
		handleBulkAction,
	} = state;

	const headerActions = (
		<div
			style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}
		>
			{canGrant && stats.pending > 0 && (
				<button
					className={styles.btnGrantHeader}
					onClick={() => setModal('grant')}
				>
					<KeySvg /> Cấp tài khoản ({stats.pending})
				</button>
			)}
			<button
				className={styles.btnAddHeader}
				onClick={() => {
					setEditingMember(null);
					setModal('add');
				}}
			>
				<PlusSvg /> Thêm thành viên
			</button>
		</div>
	);

	if (listLoading) {
		return (
			<AdminLayout
				pageTitle='Quản lý Thành viên'
				pageSubtitle='Quản lý danh sách thành viên theo đề tài NCKH'
				headerActions={headerActions}
			>
				<div className={styles.emptyState}>
					<div className={styles.emptyIcon}>
						<UsersSvg />
					</div>
					<div className={styles.emptyTitle}>Đang tải danh sách đề tài...</div>
				</div>
			</AdminLayout>
		);
	}

	if (error) {
		return (
			<AdminLayout
				pageTitle='Quản lý Thành viên'
				pageSubtitle='Quản lý danh sách thành viên theo đề tài NCKH'
				headerActions={headerActions}
			>
				<div className={styles.emptyState}>
					<div className={styles.emptyIcon}>
						<InfoSvg />
					</div>
					<div className={styles.emptyTitle}>Không tải được dữ liệu</div>
					<div className={styles.emptyDesc}>{error}</div>
				</div>
			</AdminLayout>
		);
	}

	if (!groupedTopics.length) {
		return (
			<AdminLayout
				pageTitle='Quản lý Thành viên'
				pageSubtitle='Quản lý danh sách thành viên theo đề tài NCKH'
				headerActions={headerActions}
			>
				<div className={styles.emptyState}>
					<div className={styles.emptyIcon}>
						<UsersSvg />
					</div>
					<div className={styles.emptyTitle}>Chưa có đề tài</div>
					<div className={styles.emptyDesc}>
						Danh sách đề tài đang trống, nên chưa thể quản lý thành viên.
					</div>
				</div>
			</AdminLayout>
		);
	}

	return (
		<AdminLayout
			pageTitle='Quản lý Thành viên'
			pageSubtitle='Quản lý danh sách thành viên theo đề tài NCKH'
			headerActions={headerActions}
		>
			{/* ── TOPIC ACCORDION ── */}
			<div className={styles.topicAccordion}>
				{groupedTopics.map(({ round, topics: roundTopics }) => {
					const isRoundOpen = expandedRounds.has(round);
					const filteredTopics = getFilteredTopics(roundTopics, round);
					const submittedCount = roundTopics.filter(
						(t) => t.status === 'submitted',
					).length;
					const hasSearch = roundTopics.length > 5;

					return (
						<div
							key={round}
							className={styles.roundGroup}
						>
							{/* Round header */}
							<div
								className={`${styles.roundHeader} ${isRoundOpen ? styles.roundHeaderOpen : ''}`}
							>
								<div
									className={styles.roundHeaderLeft}
									style={{ flex: 1, cursor: 'pointer' }}
									onClick={() => toggleRound(round)}
									role='button'
									tabIndex={0}
									onKeyDown={(e) => e.key === 'Enter' && toggleRound(round)}
								>
									<span
										className={`${styles.roundChevron} ${isRoundOpen ? styles.roundChevronOpen : ''}`}
									>
										<ChevDSvg />
									</span>
									<span className={styles.roundName}>{round}</span>
									<span className={styles.roundTopicCount}>
										{roundSearch[round]
											? `${filteredTopics.length} / ${roundTopics.length} đề tài`
											: `${roundTopics.length} đề tài`}
									</span>
								</div>
								{submittedCount > 0 && (
									<div className={styles.roundHeaderRight}>
										<button
											className={styles.btnBulkApprove}
											onClick={() => {
												setBulkTargetRound(round);
												setModal('bulkApprove');
											}}
										>
											<CheckSvg /> Duyệt tất cả ({submittedCount})
										</button>
										<button
											className={styles.btnBulkReject}
											onClick={() => {
												setBulkTargetRound(round);
												setModal('bulkReject');
											}}
										>
											<XSvg /> Từ chối tất cả ({submittedCount})
										</button>
									</div>
								)}
							</div>

							{/* Topics list */}
							{isRoundOpen && (
								<div className={styles.roundTopics}>
									{hasSearch && (
										<div className={styles.roundSearchBar}>
											<div className={styles.roundSearchWrap}>
												<SearchSvg />
												<input
													className={styles.roundSearchInput}
													placeholder='Tìm đề tài, mã, khoa...'
													value={roundSearch[round] ?? ''}
													onChange={(e) =>
														setRoundSearch((prev) => ({
															...prev,
															[round]: e.target.value,
														}))
													}
												/>
												{roundSearch[round] && (
													<button
														className={styles.roundSearchClear}
														onClick={() =>
															setRoundSearch((prev) => ({
																...prev,
																[round]: '',
															}))
														}
													>
														<XSvg />
													</button>
												)}
											</div>
										</div>
									)}

									<div
										className={`${styles.roundTopicsList} ${roundTopics.length > 5 ? styles.roundTopicsScrollable : ''}`}
									>
										{filteredTopics.length === 0 ? (
											<div className={styles.roundSearchEmpty}>
												Không tìm thấy đề tài phù hợp
											</div>
										) : (
											filteredTopics.map((t) => {
												const sc = TOPIC_STATUS_CFG[t.status];
												const isActive = t.id === selectedTopicId;
												return (
													<div key={t.id}>
														<button
															className={`${styles.topicRow} ${isActive ? styles.topicRowActive : ''}`}
															onClick={() => {
																setSelectedTopicId(t.id);
																setSearch('');
																setRoleFilter('all');
															}}
														>
															<div className={styles.topicRowLeft}>
																<span className={styles.topicRowIndicator} />
																<div className={styles.topicRowInfo}>
																	<div className={styles.topicRowTop}>
																		<span className={styles.topicRowId}>
																			{t.id}
																		</span>
																		<Badge cls={sc.cls}>{sc.label}</Badge>
																		<span className={styles.topicRowDept}>
																			{t.department_name}
																		</span>
																	</div>
																	<div className={styles.topicRowTitle}>
																		{t.title}
																	</div>
																</div>
															</div>
															<div className={styles.topicRowRight}>
																<span className={styles.topicMemberCount}>
																	<UsersSvg />
																	{t.member_count} TV
																</span>
																<span
																	className={`${styles.topicArrow} ${isActive ? styles.topicArrowActive : ''}`}
																>
																	<ChevRSvg />
																</span>
															</div>
														</button>

														{/* Inline member panel */}
														{isActive && selectedTopic && (
															<div className={styles.memberPanel}>
																{/* TOPIC INFO BANNER */}
																<div className={styles.topicBanner}>
																	<div className={styles.topicBannerMain}>
																		<div className={styles.topicBannerTitle}>
																			{selectedTopic.title}
																		</div>
																		<div className={styles.topicBannerMeta}>
																			<Badge
																				cls={
																					TOPIC_STATUS_CFG[selectedTopic.status]
																						.cls
																				}
																			>
																				{
																					TOPIC_STATUS_CFG[selectedTopic.status]
																						.label
																				}
																			</Badge>
																			<span className={styles.metaDot} />
																			<span>
																				{selectedTopic.department_name}
																			</span>
																			<span className={styles.metaDot} />
																			<span>{selectedTopic.round_name}</span>
																		</div>
																	</div>
																	<div className={styles.topicBannerStats}>
																		<div className={styles.bannerStat}>
																			<span className={styles.bannerStatValue}>
																				{stats.total}
																			</span>
																			<span className={styles.bannerStatLabel}>
																				Thành viên
																			</span>
																		</div>
																		<div className={styles.bannerStatDivider} />
																		<div className={styles.bannerStat}>
																			<span
																				className={`${styles.bannerStatValue} ${styles.valueGreen}`}
																			>
																				{stats.granted}
																			</span>
																			<span className={styles.bannerStatLabel}>
																				Có tài khoản
																			</span>
																		</div>
																		<div className={styles.bannerStatDivider} />
																		<div className={styles.bannerStat}>
																			<span
																				className={`${styles.bannerStatValue} ${styles.valueAmber}`}
																			>
																				{stats.pending}
																			</span>
																			<span className={styles.bannerStatLabel}>
																				Chưa cấp
																			</span>
																		</div>
																	</div>
																</div>

																{/* TOOLBAR */}
																<div className={styles.toolbar}>
																	<div className={styles.toolbarLeft}>
																		<div className={styles.searchBox}>
																			<SearchSvg />
																			<input
																				className={styles.searchInput}
																				placeholder='Tìm theo tên, email, chức vụ...'
																				value={search}
																				onChange={(e) =>
																					setSearch(e.target.value)
																				}
																			/>
																			{search && (
																				<button
																					className={styles.searchClear}
																					onClick={() => setSearch('')}
																				>
																					<XSvg />
																				</button>
																			)}
																		</div>
																		<div className={styles.roleFilters}>
																			{(
																				[
																					'all',
																					'chu_nhiem',
																					'thu_ky',
																					'thanh_vien',
																					'co_van',
																				] as const
																			).map((r) => (
																				<button
																					key={r}
																					className={`${styles.roleFilterBtn} ${roleFilter === r ? styles.roleFilterActive : ''}`}
																					onClick={() => setRoleFilter(r)}
																				>
																					{r === 'all'
																						? 'Tất cả'
																						: ROLE_CFG[r].label}
																					<span
																						className={styles.roleFilterCount}
																					>
																						{r === 'all'
																							? topicMembers.length
																							: topicMembers.filter(
																									(m) => m.role === r,
																								).length}
																					</span>
																				</button>
																			))}
																		</div>
																	</div>
																	<div className={styles.toolbarRight}>
																		<span className={styles.resultCount}>
																			{filteredMembers.length} thành viên
																		</span>
																	</div>
																</div>

																{/* MEMBERS TABLE */}
																<div className={styles.tableWrap}>
																	{memberLoading ? (
																		<div className={styles.emptyState}>
																			<div className={styles.emptyIcon}>
																				<UsersSvg />
																			</div>
																			<div className={styles.emptyTitle}>
																				Dang tai thanh vien...
																			</div>
																		</div>
																	) : filteredMembers.length === 0 ? (
																		<div className={styles.emptyState}>
																			<div className={styles.emptyIcon}>
																				<UsersSvg />
																			</div>
																			<div className={styles.emptyTitle}>
																				{search || roleFilter !== 'all'
																					? 'Không tìm thấy kết quả'
																					: 'Chưa có thành viên'}
																			</div>
																			<div className={styles.emptyDesc}>
																				{search || roleFilter !== 'all'
																					? 'Thử thay đổi bộ lọc hoặc từ khoá tìm kiếm'
																					: 'Thêm thành viên đầu tiên vào nhóm nghiên cứu'}
																			</div>
																			{!search && roleFilter === 'all' && (
																				<button
																					className={styles.btnAddHeader}
																					onClick={() => setModal('add')}
																					style={{ marginTop: 16 }}
																				>
																					<PlusSvg /> Thêm thành viên
																				</button>
																			)}
																		</div>
																	) : (
																		<table className={styles.table}>
																			<thead>
																				<tr>
																					<th className={styles.th}>#</th>
																					<th className={styles.th}>
																						Thành viên
																					</th>
																					<th className={styles.th}>Chức vụ</th>
																					<th className={styles.th}>Vai trò</th>
																					<th className={styles.th}>Liên hệ</th>
																					<th className={styles.th}>
																						Tài khoản
																					</th>
																					<th
																						className={`${styles.th} ${styles.thRight}`}
																					>
																						Thao tác
																					</th>
																				</tr>
																			</thead>
																			<tbody>
																				{filteredMembers.map((m, i) => {
																					const rc = ROLE_CFG[m.role];
																					return (
																						<tr
																							key={m.id}
																							className={styles.tr}
																						>
																							<td
																								className={`${styles.td} ${styles.tdIdx}`}
																							>
																								{i + 1}
																							</td>
																							<td className={styles.td}>
																								<div
																									className={styles.memberCell}
																								>
																									<Avatar
																										name={m.ho_ten}
																										cls={rc.avatarCls}
																										size='md'
																									/>
																									<div>
																										<div
																											className={
																												styles.memberName
																											}
																										>
																											{m.ho_ten}
																										</div>
																										<div
																											className={
																												styles.memberId
																											}
																										>
																											{m.id}
																											{m.staff_number && (
																												<span
																													style={{
																														marginLeft: 6,
																														color:
																															'var(--color-gray-400)',
																													}}
																												>
																													· MNV:{' '}
																													{m.staff_number}
																												</span>
																											)}
																										</div>
																									</div>
																								</div>
																							</td>
																							<td className={styles.td}>
																								<span className={styles.chucVu}>
																									{m.chuc_vu ?? (
																										<span
																											className={styles.naText}
																										>
																											—
																										</span>
																									)}
																								</span>
																							</td>
																							<td className={styles.td}>
																								<Badge cls={rc.cls}>
																									{rc.label}
																								</Badge>
																							</td>
																							<td className={styles.td}>
																								<div
																									className={styles.contactCell}
																								>
																									<div
																										className={
																											styles.contactEmail
																										}
																									>
																										<MailSvg />
																										{m.email}
																									</div>
																									{m.so_dien_thoai && (
																										<div
																											className={
																												styles.contactPhone
																											}
																										>
																											<PhoneSvg />
																											{m.so_dien_thoai}
																										</div>
																									)}
																								</div>
																							</td>
																							<td className={styles.td}>
																								{m.account_granted ? (
																									<div
																										className={
																											styles.accountGranted
																										}
																									>
																										<CheckSvg />
																										<div>
																											<div
																												className={
																													styles.accountUser
																												}
																											>
																												{m.user_id}
																											</div>
																											<div
																												className={
																													styles.accountDate
																												}
																											>
																												{m.account_granted_at}
																											</div>
																										</div>
																									</div>
																								) : m.has_existing_account ? (
																									<span
																										style={{
																											fontSize: 11,
																											color: '#d97706',
																											fontWeight: 600,
																										}}
																									>
																										Đã có TK
																									</span>
																								) : (
																									<span
																										className={
																											styles.accountPending
																										}
																									>
																										Chưa cấp
																									</span>
																								)}
																							</td>
																							<td
																								className={`${styles.td} ${styles.tdActions}`}
																							>
																								<button
																									className={`${styles.actionBtn} ${styles.actionEdit}`}
																									title='Chỉnh sửa'
																									onClick={() => {
																										setEditingMember(m);
																										setModal('edit');
																									}}
																								>
																									<EditSvg />
																								</button>
																								<button
																									className={`${styles.actionBtn} ${styles.actionDelete}`}
																									title='Xoá'
																									onClick={() => {
																										setDeletingMember(m);
																										setModal('delete');
																									}}
																								>
																									<TrashSvg />
																								</button>
																							</td>
																						</tr>
																					);
																				})}
																			</tbody>
																		</table>
																	)}
																</div>

																{/* GRANT WARNING */}
																{!canGrant && stats.pending > 0 && (
																	<div className={styles.grantWarning}>
																		<InfoSvg />
																		<span>
																			Đề tài chưa được phê duyệt. Có thể cấp tài
																			khoản sau khi đề tài đạt trạng thái{' '}
																			<strong>Đã phê duyệt</strong> hoặc{' '}
																			<strong>Đang thực hiện</strong>.
																		</span>
																	</div>
																)}
															</div>
														)}
													</div>
												);
											})
										)}
									</div>

									{roundTopics.length > 5 && !roundSearch[round] && (
										<div className={styles.roundScrollHint}>
											<ChevDSvg /> Cuộn để xem thêm
										</div>
									)}
								</div>
							)}
						</div>
					);
				})}
			</div>

			{/* ── MODALS ── */}
			{modal === 'add' && (
				<MemberFormModal
					mode='add'
					onClose={() => setModal(null)}
					onSave={(d) => void handleAdd(d)}
					loading={loading}
				/>
			)}
			{modal === 'edit' && editingMember && (
				<MemberFormModal
					mode='edit'
					member={editingMember}
					onClose={() => {
						setModal(null);
						setEditingMember(null);
					}}
					onSave={(d) => void handleEdit(d)}
					loading={loading}
				/>
			)}
			{modal === 'delete' && deletingMember && (
				<MemberDeleteModal
					member={deletingMember}
					onClose={() => {
						setModal(null);
						setDeletingMember(null);
					}}
					onConfirm={() => void handleDelete()}
					loading={loading}
				/>
			)}
			{modal === 'grant' && selectedTopic && (
				<MemberGrantModal
					topic={selectedTopic}
					pendingCount={stats.pending}
					onClose={() => setModal(null)}
					onConfirm={() => void handleGrant()}
					loading={loading}
				/>
			)}
			{(modal === 'bulkApprove' || modal === 'bulkReject') && (
				<MemberBulkModal
					action={modal === 'bulkApprove' ? 'approve' : 'reject'}
					round={bulkTargetRound}
					count={
						topics.filter(
							(t) =>
								t.round_name === bulkTargetRound && t.status === 'submitted',
						).length
					}
					onClose={() => setModal(null)}
					onConfirm={() =>
						void handleBulkAction(
							modal === 'bulkApprove' ? 'approve' : 'reject',
						)
					}
					loading={loading}
				/>
			)}

			{/* ── TOAST ── */}
			{toast && (
				<div
					className={`${styles.toast} ${styles[`toast${toast.type.charAt(0).toUpperCase() + toast.type.slice(1)}` as keyof typeof styles]}`}
				>
					{toast.type === 'success' && <CheckSvg />}
					{toast.type === 'error' && <XSvg />}
					{toast.type === 'info' && <InfoSvg />}
					{toast.msg}
				</div>
			)}
		</AdminLayout>
	);
}
