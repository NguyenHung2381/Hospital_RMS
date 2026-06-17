import type React from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import {
	CheckCircleSvg,
	ClockSvg,
	DocSvg,
	DownloadSvg,
	EditSvg,
	EyeSvg,
	FileTextSvg,
	MessageSvg,
	UploadSvg,
	XCircleSvg,
	XSvg,
} from '@/assets/icons';
import { BASE_URL } from '../../../shared/api/axios';
import type {
	Approval as ApprovalHistory,
	TopicApprovalDetail,
} from '../../approval/api/approval';
import type { TopicFile, TopicStatus } from '../../topics/types/topic.type';
import {
	APV_STATUS_CFG,
	STATUS_CFG,
	formatDate,
	getFileTypeMeta,
	getFileViewerUrl,
} from '../utils/myTopicsHelpers';
import styles from '../pages/MyTopics.module.css';

function Badge({
	cls,
	dot,
	children,
}: {
	cls: string;
	dot?: boolean;
	children: React.ReactNode;
}) {
	return (
		<span className={`${styles.badge} ${styles[cls as keyof typeof styles]}`}>
			{dot && <span className={styles.badgeDot} />}
			{children}
		</span>
	);
}

interface MyTopicsDetailPanelProps {
	selectedId: string | null;
	detailLoading: boolean;
	detailTopic: TopicApprovalDetail | null;
	detailFiles: TopicFile[];
	detailHistory: ApprovalHistory[];
	latestApproval: ApprovalHistory | null;
	canUploadFiles: boolean;
	setFileViewer: (
		v: { url: string; name: string; isWord: boolean } | null,
	) => void;
	fileInputRef: RefObject<HTMLInputElement | null>;
	pendingFiles: File[];
	setPendingFiles: Dispatch<SetStateAction<File[]>>;
	batchNote: string;
	setBatchNote: (v: string) => void;
	uploadLoading: boolean;
	uploadError: string;
	handleUpload: () => void;
	openEdit: () => void;
	formatFileSize: (size: number) => string;
}

export function MyTopicsDetailPanel({
	selectedId,
	detailLoading,
	detailTopic,
	detailFiles,
	detailHistory,
	latestApproval,
	canUploadFiles,
	setFileViewer,
	fileInputRef,
	pendingFiles,
	setPendingFiles,
	batchNote,
	setBatchNote,
	uploadLoading,
	uploadError,
	handleUpload,
	openEdit,
	formatFileSize,
}: MyTopicsDetailPanelProps) {
	return (
		<div className={styles.detailPanel}>
			{!selectedId ? (
				<div className={styles.detailEmpty}>
					<DocSvg className={styles.detailEmptyIcon} />
					<p className={styles.detailEmptyTitle}>
						Chọn một đề tài để xem chi tiết
					</p>
					<p className={styles.detailEmptyDesc}>
						Nhấn vào một đề tài ở danh sách bên trái
					</p>
				</div>
			) : (
				<>
					{detailLoading && !detailTopic ? (
						<div className={styles.detailEmpty}>
							<div className={styles.detailSpinner} />
							<p className={styles.detailEmptyDesc}>Đang tải chi tiết...</p>
						</div>
					) : detailTopic ? (
						<>
							{/* Header */}
							<div className={styles.detailHeader}>
								<div className={styles.detailTopicId}>{detailTopic.id}</div>
								<div className={styles.detailTitle}>{detailTopic.title}</div>
								<div className={styles.detailBadges}>
									<Badge
										cls={
											STATUS_CFG[detailTopic.status as TopicStatus]?.badgeCls ??
											'badgeGray'
										}
										dot
									>
										{STATUS_CFG[detailTopic.status as TopicStatus]?.label ??
											detailTopic.status}
									</Badge>
									{detailTopic.category_id && (
										<Badge cls='badgeGray'>
											{detailTopic.category_name ?? detailTopic.category_id}
										</Badge>
									)}
									{detailTopic.level_id && (
										<Badge cls='badgeGray'>
											{detailTopic.level_name ?? detailTopic.level_id}
										</Badge>
									)}
								</div>
							</div>

							{/* Body */}
							<div
								className={styles.detailBody}
								style={
									detailLoading
										? { opacity: 0.5, pointerEvents: 'none' }
										: undefined
								}
							>
								{/* Info grid */}
								<div className={styles.infoGrid}>
									<div className={styles.infoItem}>
										<div className={styles.infoLabel}>Người đăng ký</div>
										<div className={styles.infoValue}>
											{detailTopic.created_by_name ?? detailTopic.created_by}
										</div>
									</div>
									<div className={styles.infoItem}>
										<div className={styles.infoLabel}>Phòng ban / Khoa</div>
										<div className={styles.infoValue}>
											{detailTopic.department_name ??
												detailTopic.department_id ??
												'—'}
										</div>
									</div>
									<div className={styles.infoItem}>
										<div className={styles.infoLabel}>Đợt nghiên cứu</div>
										<div className={styles.infoValue}>
											{detailTopic.round_name ?? detailTopic.round_id ?? '—'}
										</div>
									</div>
									<div className={styles.infoItem}>
										<div className={styles.infoLabel}>Số thành viên</div>
										<div className={styles.infoValue}>
											{detailTopic.members?.length ??
												detailTopic.member_count ??
												0}{' '}
											người
										</div>
									</div>
									<div className={styles.infoItem}>
										<div className={styles.infoLabel}>Ngày nộp hồ sơ</div>
										<div className={styles.infoValue}>
											{formatDate(detailTopic.created_at)}
										</div>
									</div>
									{(latestApproval ?? detailTopic.updated_at) && (
										<div className={styles.infoItem}>
											<div className={styles.infoLabel}>Cập nhật lần cuối</div>
											<div className={styles.infoValue}>
												{formatDate(
													latestApproval?.created_at ?? detailTopic.updated_at,
												)}
												{latestApproval &&
													` · ${latestApproval.approver_name ?? latestApproval.created_by}`}
											</div>
										</div>
									)}
								</div>

								{/* Members */}
								{(detailTopic.members?.length ?? 0) > 0 && (
									<div className={styles.descSection}>
										<div className={styles.sectionLabel}>
											Thành viên nhóm nghiên cứu ({detailTopic.members.length}{' '}
											người)
										</div>
										<div className={styles.membersGrid}>
											{detailTopic.members.map((m, i) => {
												const avatarCls =
													m.role === 'leader'
														? styles.memberRoleLead
														: styles.memberRoleMember;
												const roleLabel =
													m.role === 'leader'
														? 'Chủ nhiệm'
														: m.role === 'secretary'
															? 'Thư ký'
															: 'Thành viên';
												const initial =
													m.ho_ten.split(' ').slice(-1)[0]?.[0] ?? '?';
												return (
													<div
														key={i}
														className={styles.memberCard}
													>
														<div
															className={`${styles.memberAvatar} ${avatarCls}`}
														>
															{initial}
														</div>
														<div className={styles.memberInfo}>
															<div className={styles.memberName}>
																{m.ho_ten}
															</div>
															<div className={styles.memberMeta}>
																<span className={styles.memberRoleBadge}>
																	{roleLabel}
																</span>
																{detailTopic.department_name && (
																	<span className={styles.memberDept}>
																		{detailTopic.department_name}
																	</span>
																)}
															</div>
														</div>
													</div>
												);
											})}
										</div>
									</div>
								)}

								{/* Description */}
								<div className={styles.descSection}>
									<div className={styles.sectionLabel}>
										Mô tả / Tóm tắt đề tài
									</div>
									<div className={styles.descBox}>
										{detailTopic.description || 'Chưa có mô tả.'}
									</div>
								</div>

								{/* History */}
								{detailHistory.length > 0 && (
									<div>
										<div className={styles.sectionLabel}>
											Lịch sử xử lý ({detailHistory.length} lần)
										</div>
										<div className={styles.historyList}>
											{[...detailHistory].reverse().map((h, i) => {
												const hcfg = APV_STATUS_CFG[h.status] ?? {
													label: h.status,
													badgeCls: 'badgeGray',
												};
												return (
													<div
														key={i}
														className={styles.historyItem}
													>
														<div className={styles.historyTop}>
															<span className={styles.historyReviewer}>
																{h.approver_name ?? h.created_by} — {hcfg.label}
															</span>
															<div
																style={{
																	display: 'flex',
																	alignItems: 'center',
																	gap: 8,
																}}
															>
																<Badge
																	cls={hcfg.badgeCls}
																	dot
																>
																	{hcfg.label}
																</Badge>
																<span className={styles.historyDate}>
																	{formatDate(h.created_at)}
																</span>
															</div>
														</div>
														{h.comment && (
															<div className={styles.historyComment}>
																"{h.comment}"
															</div>
														)}
													</div>
												);
											})}
										</div>
									</div>
								)}

								{/* Files */}
								<div>
									<div className={styles.sectionLabel}>
										Tài liệu đính kèm ({detailFiles.length} tệp)
									</div>

									{canUploadFiles && (
										<div className={styles.uploadArea}>
											<div
												className={styles.uploadDropzone}
												onClick={() => fileInputRef.current?.click()}
												onDragOver={(e) => e.preventDefault()}
												onDrop={(e) => {
													e.preventDefault();
													setPendingFiles((prev) => [
														...prev,
														...Array.from(e.dataTransfer.files),
													]);
												}}
											>
												<input
													ref={fileInputRef}
													type='file'
													multiple
													style={{ display: 'none' }}
													onChange={(e) => {
														setPendingFiles((prev) => [
															...prev,
															...Array.from(e.target.files ?? []),
														]);
														e.target.value = '';
													}}
												/>
												<UploadSvg />
												<span>Nhấn hoặc kéo tệp vào đây để tải lên</span>
											</div>
											{pendingFiles.length > 0 && (
												<>
													<div className={styles.pendingList}>
														{pendingFiles.map((f, i) => (
															<div
																key={i}
																className={styles.pendingItem}
															>
																<FileTextSvg />
																<span className={styles.pendingName}>
																	{f.name}
																</span>
																<span className={styles.pendingSize}>
																	{formatFileSize(f.size)}
																</span>
																<button
																	className={styles.pendingRemove}
																	onClick={() =>
																		setPendingFiles((prev) =>
																			prev.filter((_, j) => j !== i),
																		)
																	}
																>
																	<XSvg />
																</button>
															</div>
														))}
													</div>
													<div className={styles.uploadFooter}>
														<input
															className={styles.batchNoteInput}
															placeholder='Ghi chú lô tài liệu (tuỳ chọn)'
															value={batchNote}
															onChange={(e) => setBatchNote(e.target.value)}
															disabled={uploadLoading}
														/>
														<button
															className={styles.btnUpload}
															onClick={() => void handleUpload()}
															disabled={uploadLoading}
														>
															{uploadLoading ? (
																<>
																	<span className={styles.spinnerSm} />
																	Đang tải...
																</>
															) : (
																<>
																	<UploadSvg />
																	Tải lên {pendingFiles.length} tệp
																</>
															)}
														</button>
													</div>
													{uploadError && (
														<div className={styles.uploadError}>
															{uploadError}
														</div>
													)}
												</>
											)}
										</div>
									)}

									{detailFiles.length === 0 ? (
										<div className={styles.filesEmpty}>
											Chưa có tài liệu nào được đính kèm
										</div>
									) : (
										<div className={styles.filesList}>
											{detailFiles.map((f) => {
												const meta = getFileTypeMeta(f);
												const viewerUrl = getFileViewerUrl(f);
												return (
													<div
														key={f.id}
														className={styles.fileItem}
													>
														<div
															className={`${styles.fileIcon} ${styles[meta.cls as keyof typeof styles]}`}
														>
															<FileTextSvg />
														</div>
														<div className={styles.fileInfo}>
															<div
																className={styles.fileName}
																title={f.file_name}
															>
																{f.file_name}
															</div>
															<div className={styles.fileMeta}>
																<span
																	className={`${styles.fileTypeBadge} ${styles[meta.cls as keyof typeof styles]}`}
																>
																	{meta.label}
																</span>
																· {formatFileSize(f.file_size)} ·{' '}
																{f.uploaded_by_name} ·{' '}
																{formatDate(f.created_at)}
															</div>
														</div>
														<div className={styles.fileActions}>
															{viewerUrl && (
																<button
																	className={styles.btnFileView}
																	onClick={() =>
																		setFileViewer({
																			url: viewerUrl,
																			name: f.file_name,
																			isWord: meta.label !== 'PDF',
																		})
																	}
																>
																	<EyeSvg /> Xem
																</button>
															)}
															<a
																className={styles.btnFileDownload}
																href={`${BASE_URL}${f.file_url}`}
																download={f.file_name}
																target='_blank'
																rel='noreferrer'
															>
																<DownloadSvg />
															</a>
														</div>
													</div>
												);
											})}
										</div>
									)}
								</div>
							</div>

							{/* Action panel */}
							<div className={styles.actionPanel}>
								{detailTopic.status === 'submitted' && (
									<div
										className={`${styles.processedNotice} ${styles.processedAmber}`}
									>
										<ClockSvg />
										<div>
											<div style={{ fontWeight: 700, fontSize: 13 }}>
												Đề tài đang chờ phê duyệt
											</div>
											<div style={{ fontSize: 12, marginTop: 2 }}>
												Hồ sơ đã được nộp và đang chờ hội đồng xem xét.
											</div>
										</div>
									</div>
								)}
								{detailTopic.status === 'approved' && (
									<div
										className={`${styles.processedNotice} ${styles.processedApproved}`}
									>
										<CheckCircleSvg />
										<div>
											<div style={{ fontWeight: 700, fontSize: 13 }}>
												Đề tài đã được phê duyệt
											</div>
											<div style={{ fontSize: 12, marginTop: 2 }}>
												Phê duyệt bởi{' '}
												{latestApproval?.approver_name ??
													latestApproval?.created_by ??
													'—'}{' '}
												·{' '}
												{formatDate(
													latestApproval?.created_at ?? detailTopic.updated_at,
												)}
											</div>
										</div>
									</div>
								)}
								{detailTopic.status === 'rejected' && (
									<div
										className={`${styles.processedNotice} ${styles.processedRejected}`}
									>
										<XCircleSvg />
										<div>
											<div style={{ fontWeight: 700, fontSize: 13 }}>
												Đề tài đã bị từ chối
											</div>
											<div style={{ fontSize: 12, marginTop: 2 }}>
												Bởi{' '}
												{latestApproval?.approver_name ??
													latestApproval?.created_by ??
													'—'}{' '}
												·{' '}
												{formatDate(
													latestApproval?.created_at ?? detailTopic.updated_at,
												)}
											</div>
										</div>
									</div>
								)}
								{detailTopic.status === 'supplement' && (
									<div className={styles.supplementActions}>
										<div
											className={`${styles.processedNotice} ${styles.processedBlue}`}
											style={{ flex: 1 }}
										>
											<MessageSvg />
											<div>
												<div style={{ fontWeight: 700, fontSize: 13 }}>
													Cần bổ sung hồ sơ
												</div>
												<div style={{ fontSize: 12, marginTop: 2 }}>
													Hội đồng yêu cầu bổ sung thêm thông tin. Vui lòng cập
													nhật thông tin và tài liệu.
												</div>
											</div>
										</div>
										<button
											className={styles.btnEdit}
											onClick={openEdit}
										>
											<EditSvg />
											Chỉnh sửa đề tài
										</button>
									</div>
								)}
							</div>
						</>
					) : null}
				</>
			)}
		</div>
	);
}
