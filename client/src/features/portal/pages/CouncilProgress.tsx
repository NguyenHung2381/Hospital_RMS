import UserLayout from '../../../layouts/UserLayout';
import { SEAT_ROLE_LABELS } from '../../council/types/council.type';
import { ProgressConclusionTab } from '../components/ProgressConclusionTab';
import { ProgressFilesSection } from '../components/ProgressFilesSection';
import { ProgressMyReviewTab } from '../components/ProgressMyReviewTab';
import { ProgressSidebar } from '../components/ProgressSidebar';
import { useCouncilProgress } from '../hooks/useCouncilProgress';
import { SESSION_LABELS } from '../utils/councilProgressHelpers';
import styles from './CouncilProgress.module.css';

export default function CouncilProgress() {
	const {
		user,
		loading,
		error,
		stats,
		councils,
		selectedTopicId,
		setSelectedTopicId,
		selectedTopic,
		activeTab,
		setActiveTab,
		drafts,
		setDraft,
		savingId,
		savedId,
		handleSave,
		uploadingId,
		setFileInputRef,
		clickFileInput,
		handleUpload,
		handleDeleteFile,
		resultDrafts,
		setResultDraft,
		savingResultId,
		savedResultId,
		handleSaveResult,
		uploadingMinutesId,
		setMinutesInputRef,
		clickMinutesInput,
		handleUploadMinutes,
		handleDeleteMinutes,
	} = useCouncilProgress();

	return (
		<UserLayout
			pageTitle='Đánh giá tiến độ đề tài'
			pageSubtitle='Hội đồng đánh giá tiến độ các đề tài được phân công; thư ký upload file đánh giá'
			userName={user?.full_name ?? 'Người dùng'}
			userRole={user?.role_name ?? 'Thành viên'}
			hideSidebar
		>
			{loading ? (
				<div className={styles.stateBox}>Đang tải…</div>
			) : error ? (
				<div className={`${styles.stateBox} ${styles.stateError}`}>{error}</div>
			) : councils.length === 0 ? (
				<div className={styles.stateBox}>
					<div className={styles.emptyTitle}>
						Bạn chưa có ghế trong hội đồng nào
					</div>
					<div className={styles.emptyDesc}>
						Khi được phân công vào hội đồng, đề tài cần đánh giá tiến độ sẽ
						hiển thị tại đây.
					</div>
				</div>
			) : (
				<>
					<div className={styles.pageWatermark} />
					<div className={styles.splitWrapper}>
						<ProgressSidebar
							councils={councils}
							stats={stats}
							selectedTopicId={selectedTopicId}
							setSelectedTopicId={setSelectedTopicId}
							userId={user?.id}
						/>

						{/* Right pane: selected topic details */}
						<main className={styles.detailsPane}>
							{selectedTopic ? (
								(() => {
									const t = selectedTopic;
									const d = drafts[t.id] ?? {
										percent: '',
										rating: '' as const,
										comment: '',
									};
									const isSecretary = t.my_role === 'secretary';
									const isChairman = t.my_role === 'chairman';
									const rd = resultDrafts[t.id] ?? {
										conclusion: '' as const,
										general_comment: '',
									};
									const others = t.reviews.filter((r) => r.user_id !== user?.id);
									const reviewed = t.reviews.filter((r) => r.rating != null || r.progress_percent != null);

									return (
										<div className={styles.detailsContent}>
											{/* Details Header */}
											<div className={styles.detailsHeader}>
												<div className={styles.detailsHeaderMain}>
													<div className={styles.detailsTitleRow}>
														<span className={styles.detailsHeaderRoleBadge}>
															{SEAT_ROLE_LABELS[t.my_role]}
														</span>
														{t.department_name && (
															<span className={styles.detailsMetaTag}>{t.department_name}</span>
														)}
														{t.category_name && (
															<span className={styles.detailsMetaTag}>{t.category_name}</span>
														)}
													</div>
													<h2 className={styles.detailsTopicTitle}>{t.title}</h2>
												</div>

												<div className={styles.detailsHeaderMetaGrid}>
													<div className={styles.detailsMetaCell}>
														<span className={styles.detailsMetaLabel}>Hội đồng</span>
														<span className={styles.detailsMetaVal}>{t.council_name}</span>
													</div>
													{t.round_name && (
														<div className={styles.detailsMetaCell}>
															<span className={styles.detailsMetaLabel}>Đợt nghiên cứu</span>
															<span className={styles.detailsMetaVal}>{t.round_name}</span>
														</div>
													)}
													{t.defense_date && (
														<div className={styles.detailsMetaCell}>
															<span className={styles.detailsMetaLabel}>Ngày họp</span>
															<span className={styles.detailsMetaVal}>{t.defense_date}</span>
														</div>
													)}
													{t.location && (
														<div className={styles.detailsMetaCell}>
															<span className={styles.detailsMetaLabel}>Địa điểm</span>
															<span className={styles.detailsMetaVal}>{t.location}</span>
														</div>
													)}
													{t.session && (
														<div className={styles.detailsMetaCell}>
															<span className={styles.detailsMetaLabel}>Phiên họp</span>
															<span className={styles.detailsMetaVal}>
																{SESSION_LABELS[t.session] || t.session}
															</span>
														</div>
													)}
												</div>
											</div>

											{/* Tab Navigation */}
											<div className={styles.tabsContainer}>
												<button
													className={`${styles.tabBtn} ${activeTab === 'my-review' ? styles.activeTab : ''}`}
													onClick={() => setActiveTab('my-review')}
												>
													<span className={styles.tabIcon}>📝</span>
													<span className={styles.tabLabel}>Đánh giá cá nhân</span>
												</button>
												<button
													className={`${styles.tabBtn} ${activeTab === 'council-conclusion' ? styles.activeTab : ''}`}
													onClick={() => setActiveTab('council-conclusion')}
												>
													<span className={styles.tabIcon}>👥</span>
													<span className={styles.tabLabel}>Hội đồng &amp; Kết luận</span>
												</button>
											</div>

											{/* Tab Contents */}
											<div className={styles.tabPanel}>
												{activeTab === 'my-review' && (
													<ProgressMyReviewTab
														topic={t}
														draft={d}
														setDraft={setDraft}
														savingId={savingId}
														savedId={savedId}
														onSave={handleSave}
													/>
												)}

												{activeTab === 'council-conclusion' && (
													<ProgressConclusionTab
														topic={t}
														others={others}
														reviewedCount={reviewed.length}
														isChairman={isChairman}
														resultDraft={rd}
														setResultDraft={setResultDraft}
														savingResultId={savingResultId}
														savedResultId={savedResultId}
														onSaveResult={handleSaveResult}
													/>
												)}
											</div>

											<ProgressFilesSection
												topic={t}
												isSecretary={isSecretary}
												setFileInputRef={setFileInputRef}
												clickFileInput={clickFileInput}
												uploadingId={uploadingId}
												onUpload={handleUpload}
												onDeleteFile={handleDeleteFile}
												setMinutesInputRef={setMinutesInputRef}
												clickMinutesInput={clickMinutesInput}
												uploadingMinutesId={uploadingMinutesId}
												onUploadMinutes={handleUploadMinutes}
												onDeleteMinutes={handleDeleteMinutes}
											/>
										</div>
									);
								})()
							) : (
								<div className={styles.emptyDetailsState}>
									<div className={styles.emptyDetailsTitle}>Vui lòng chọn một đề tài</div>
									<div className={styles.emptyDetailsDesc}>Chọn đề tài từ danh sách bên trái để xem đầy đủ thông tin và nhập kết quả đánh giá.</div>
								</div>
							)}
						</main>
					</div>
				</>
			)}
		</UserLayout>
	);
}
