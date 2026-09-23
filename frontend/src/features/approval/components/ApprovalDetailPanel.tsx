import {
	CheckCircleSvg,
	DownloadSvg,
	EyeSvg,
	FileTextSvg,
	MessageSvg,
	WarnSvg,
	XCircleSvg,
} from '@/assets/icons';
import { Badge } from '@/shared/components';
import { formatDate } from '../../../shared/utils/formatDate';
import { getInitials } from '../../../shared/utils/helper';
import { formatFileSize } from '../../topics/utils/topicHelpers';
import type { TopicFile } from '../../topics/types/topic.type';
import type { ApprovalRecord, ModalType } from '../types/approval.type';
import {
	APV_HISTORY_CFG,
	getLevelStyle,
	getFileTypeMeta,
	getFileViewerUrl,
	STATUS_CFG,
} from '../utils/approvalHelpers';
import styles from '../pages/Approval.module.css';

interface ApprovalDetailPanelProps {
	selected: ApprovalRecord | null;
	detailLoading: boolean;
	filesByTopic: Record<string, TopicFile[]>;
	setFileViewer: (
		v: { url: string; name: string; isWord: boolean } | null,
	) => void;
	openModal: (type: ModalType) => void;
}

export function ApprovalDetailPanel({
	selected,
	detailLoading,
	filesByTopic,
	setFileViewer,
	openModal,
}: ApprovalDetailPanelProps) {
	return (
		<div className={styles.detailPanel}>
			{!selected ? (
				<div className={styles.detailEmpty}>
					<CheckCircleSvg className={styles.detailEmptyIcon} />
					<p className={styles.detailEmptyTitle}>
						Chọn một hồ sơ để xem chi tiết
					</p>
					<p className={styles.detailEmptyDesc}>
						Nhấn vào một đề tài ở danh sách bên trái
					</p>
				</div>
			) : (
				<>
					<div className={styles.detailHeader}>
						<div className={styles.detailTopicId}>
							{selected.topic_id} · {selected.id}
						</div>
						<div className={styles.detailTitle}>{selected.topic_title}</div>
						<div className={styles.detailBadges}>
							<Badge
								tone={STATUS_CFG[selected.status].tone}
								dot
							>
								{STATUS_CFG[selected.status].label}
							</Badge>
							<Badge tone={getLevelStyle(selected.topic_level).tone}>
								{getLevelStyle(selected.topic_level).label}
							</Badge>
							<Badge tone='gray'>{selected.topic_category}</Badge>
							{selected.is_urgent && (
								<Badge tone='red'>
									<WarnSvg style={{ width: 11, height: 11, flexShrink: 0 }} />
									Cần xử lý khẩn
								</Badge>
							)}
						</div>
					</div>

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
							{[
								{ label: 'Người đăng ký', value: selected.created_by },
								{ label: 'Phòng ban / Khoa', value: selected.topic_dept },
								{ label: 'Đợt nghiên cứu', value: selected.topic_round },
								{
									label: 'Số thành viên',
									value: `${selected.topic_member_count} người`,
								},
								{ label: 'Ngày nộp hồ sơ', value: selected.created_at },
							].map((item) => (
								<div
									key={item.label}
									className={styles.infoItem}
								>
									<div className={styles.infoLabel}>{item.label}</div>
									<div className={styles.infoValue}>{item.value}</div>
								</div>
							))}
							{selected.updated_at && (
								<div className={styles.infoItem}>
									<div className={styles.infoLabel}>Cập nhật lần cuối</div>
									<div className={styles.infoValue}>
										{selected.updated_at} · {selected.updated_by}
									</div>
								</div>
							)}
						</div>

						{/* Members */}
						{(selected.members?.length ?? 0) > 0 && (
							<div className={styles.descSection}>
								<div className={styles.sectionLabel}>
									Thành viên nhóm nghiên cứu ({selected.members?.length ?? 0}{' '}
									người)
								</div>
								<div className={styles.membersGrid}>
									{(selected.members ?? []).map((m, i) => {
										const isLead = m.role === 'Chủ nhiệm';
										const isSec = m.role === 'Thư ký';
										const isAdv = m.role === 'Cố vấn';

										const avatarCls = isLead
											? styles.memberRoleLead
											: isSec
												? styles.memberRoleSecretary
												: isAdv
													? styles.memberRoleAdvisor
													: styles.memberRoleMember;

										const badgeCls = isLead
											? styles.roleBadgeLead
											: isSec
												? styles.roleBadgeSecretary
												: isAdv
													? styles.roleBadgeAdvisor
													: styles.roleBadgeMember;

										const initials = getInitials(m.name || 'TV');

										return (
											<div
												key={i}
												className={styles.memberCard}
											>
												<div className={`${styles.memberAvatar} ${avatarCls}`}>
													{initials}
												</div>
												<div className={styles.memberInfo}>
													<div className={styles.memberName}>{m.name}</div>
													<div className={styles.memberMeta}>
														<span className={badgeCls}>{m.role}</span>
														{m.dept && (
															<span className={styles.memberDept}>
																{m.dept}
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

						{/* Tài chính & Quyết định */}
						{(selected.budget_estimated != null ||
							selected.budget_actual != null ||
							selected.approval_decision_no ||
							selected.recognition_decision_no) && (
							<div className={styles.descSection}>
								<div className={styles.sectionLabel}>Tài chính & Quyết định</div>
								<div className={styles.infoGrid}>
									{selected.budget_estimated != null && (
										<div className={styles.infoItem}>
											<div className={styles.infoLabel}>Kinh phí dự toán</div>
											<div className={styles.infoValue}>
												{selected.budget_estimated.toLocaleString('vi-VN')} đ
											</div>
										</div>
									)}
									{selected.budget_actual != null && (
										<div className={styles.infoItem}>
											<div className={styles.infoLabel}>Kinh phí thực tế</div>
											<div className={styles.infoValue}>
												{selected.budget_actual.toLocaleString('vi-VN')} đ
											</div>
										</div>
									)}
									{selected.approval_decision_no && (
										<div className={styles.infoItem}>
											<div className={styles.infoLabel}>QĐ phê duyệt</div>
											<div className={styles.infoValue}>
												{selected.approval_decision_no}
												{selected.approval_decision_date
													? ` · ${selected.approval_decision_date}`
													: ''}
											</div>
										</div>
									)}
									{selected.recognition_decision_no && (
										<div className={styles.infoItem}>
											<div className={styles.infoLabel}>QĐ công nhận</div>
											<div className={styles.infoValue}>
												{selected.recognition_decision_no}
												{selected.recognition_decision_date
													? ` · ${selected.recognition_decision_date}`
													: ''}
											</div>
										</div>
									)}
								</div>
							</div>
						)}

						{/* Description */}
						<div className={styles.descSection}>
							<div className={styles.sectionLabel}>Mô tả / Tóm tắt đề tài</div>
							<div className={styles.descBox}>{selected.topic_description}</div>
						</div>

						{/* Comment */}
						{selected.comment && (
							<div>
								<div className={styles.sectionLabel}>Nhận xét của hội đồng</div>
								<div
									className={styles.descBox}
									style={{
										fontStyle: 'italic',
										color: 'var(--color-gray-600)',
									}}
								>
									"{selected.comment}"
								</div>
							</div>
						)}

						{/* History */}
						{selected.history.length > 0 && (
							<div>
								<div className={styles.sectionLabel}>
									Lịch sử xử lý ({selected.history.length} lần)
								</div>
								<div className={styles.historyList}>
									{[...selected.history].reverse().map((h, i) => {
										const hcfg = STATUS_CFG[h.action];
										return (
											<div
												key={i}
												className={styles.historyItem}
											>
												<div className={styles.historyTop}>
													<span className={styles.historyReviewer}>
														{h.actor} — {APV_HISTORY_CFG[h.action]}
													</span>
													<div
														style={{
															display: 'flex',
															alignItems: 'center',
															gap: 8,
														}}
													>
														<Badge
															tone={hcfg.tone}
															dot
														>
															{hcfg.label}
														</Badge>
														<span className={styles.historyDate}>{h.at}</span>
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
						{(() => {
							const files = filesByTopic[selected.id] ?? null;
							if (files === null) return null;
							return (
								<div>
									<div className={styles.sectionLabel}>
										Tài liệu đính kèm ({files.length} tệp)
									</div>
									{files.length === 0 ? (
										<div className={styles.filesEmpty}>
											Chưa có tài liệu nào được đính kèm
										</div>
									) : (
										<div className={styles.filesList}>
											{files.map((f) => {
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
																href={f.file_url}
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
							);
						})()}
					</div>

					{/* Action panel */}
					<div className={styles.actionPanel}>
						{selected.status === 'pending' ||
						selected.status === 'info_requested' ? (
							<>
								<div>
									<div className={styles.actionLabel}>Quyết định phê duyệt</div>
									<div className={styles.actionHint}>
										Sau khi xác nhận, trạng thái đề tài sẽ được cập nhật và chủ
										nhiệm nhận thông báo.
									</div>
								</div>
								<div className={styles.actionBtns}>
									<button
										className={styles.btnApprove}
										onClick={() => openModal('approve')}
									>
										<CheckCircleSvg />
										Phê duyệt
									</button>
									<button
										className={styles.btnReject}
										onClick={() => openModal('reject')}
									>
										<XCircleSvg />
										Không phê duyệt
									</button>
									<button
										className={styles.btnRequest}
										onClick={() => openModal('request')}
									>
										<MessageSvg />
										Yêu cầu bổ sung
									</button>
								</div>
							</>
						) : selected.status === 'approved' ? (
							<div
								className={`${styles.processedNotice} ${styles.processedApproved}`}
							>
								<CheckCircleSvg />
								<div>
									<div style={{ fontWeight: 700, fontSize: 13 }}>
										Đề tài đã được phê duyệt
									</div>
									<div style={{ fontSize: 12, marginTop: 2 }}>
										Phê duyệt bởi {selected.updated_by} · {selected.updated_at}
									</div>
								</div>
							</div>
						) : (
							<div
								className={`${styles.processedNotice} ${styles.processedRejected}`}
							>
								<XCircleSvg />
								<div>
									<div style={{ fontWeight: 700, fontSize: 13 }}>
										Đề tài không được phê duyệt
									</div>
									<div style={{ fontSize: 12, marginTop: 2 }}>
										Bởi {selected.updated_by} · {selected.updated_at}
									</div>
								</div>
							</div>
						)}
					</div>
				</>
			)}
		</div>
	);
}
