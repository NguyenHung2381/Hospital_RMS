import {
	CONCLUSION_LABELS,
	PROGRESS_RATING_LABELS,
	uploadCommentImage,
	type Conclusion,
	type ProgressReview,
	type ProgressTopic,
} from '../../council/api/councilApi';
import { SEAT_ROLE_LABELS } from '../../council/types/council.type';
import RichTextEditor from '../../../shared/components/RichTextEditor';
import { htmlToPlainText, sanitizeCommentHtml } from '../../../shared/utils/sanitizeHtml';
import type { ResultDraft } from '../types/councilProgress.type';
import { CONCLUSION_CLASS, RATING_CLASS } from '../utils/councilProgressHelpers';
import styles from '../pages/CouncilProgress.module.css';

interface ProgressConclusionTabProps {
	topic: ProgressTopic;
	others: ProgressReview[];
	reviewedCount: number;
	isChairman: boolean;
	resultDraft: ResultDraft;
	setResultDraft: (id: string, patch: Partial<ResultDraft>) => void;
	savingResultId: string | null;
	savedResultId: string | null;
	onSaveResult: (t: ProgressTopic) => void;
}

export function ProgressConclusionTab({
	topic: t,
	others,
	reviewedCount,
	isChairman,
	resultDraft: rd,
	setResultDraft,
	savingResultId,
	savedResultId,
	onSaveResult,
}: ProgressConclusionTabProps) {
	return (
		<div className={styles.conclusionTabWrapper}>
			{/* Table of other members' reviews */}
			<div className={styles.cardSection}>
				<div className={styles.othersTitleRow}>
					<h3 className={styles.cardSectionTitle}>👥 Ý kiến từ Hội đồng</h3>
					<span className={styles.avgBadge}>
						{reviewedCount}/5 thành viên đã đánh giá
					</span>
				</div>
				{others.length > 0 ? (
					<div className={styles.othersTableContainer}>
						<table className={styles.othersTable}>
							<thead>
								<tr>
									<th>Thành viên</th>
									<th>Vai trò</th>
									<th>Tiến độ</th>
									<th>Xếp loại</th>
									<th>Nhận xét</th>
								</tr>
							</thead>
							<tbody>
								{others.map((r) => (
									<tr key={r.user_id}>
										<td className={styles.othersTableName}>{r.full_name}</td>
										<td className={styles.othersTableRole}>
											{SEAT_ROLE_LABELS[r.role]}
										</td>
										<td className={styles.othersTablePercent}>
											{r.progress_percent != null
												? `${r.progress_percent}%`
												: '—'}
										</td>
										<td>
											{r.rating ? (
												<span
													className={`${styles.ratingBadge} ${styles[RATING_CLASS[r.rating]]}`}
												>
													{PROGRESS_RATING_LABELS[r.rating]}
												</span>
											) : (
												'—'
											)}
										</td>
										<td
											className={styles.othersTableComment}
											title={r.comment ? htmlToPlainText(r.comment) : undefined}
										>
											{r.comment ? (
												<span
													dangerouslySetInnerHTML={{
														__html: sanitizeCommentHtml(r.comment),
													}}
												/>
											) : (
												'—'
											)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				) : (
					<div className={styles.emptyTableState}>
						Chưa có ý kiến đánh giá từ các thành viên khác.
					</div>
				)}
			</div>

			{/* Conclusion Section */}
			<div
				className={`${styles.conclusionPanel} ${isChairman ? styles.isChairmanPanel : ''}`}
			>
				<div className={styles.conclusionHeader}>
					<span className={styles.conclusionTitle}>
						⚖️ Kết luận &amp; Nhận xét chung của Hội đồng
					</span>
					{!isChairman && (
						<span className={styles.conclusionHint}>
							Do Chủ tịch Hội đồng quyết định
						</span>
					)}
				</div>

				{isChairman ? (
					<div className={styles.conclusionForm}>
						<div className={styles.conclusionChairmanBadge}>
							👑 Vai trò: Chủ tịch Hội đồng
						</div>
						<div className={styles.conclusionFormGrid}>
							<div className={styles.conclusionSelectField}>
								<label className={styles.formLabel}>Kết luận cuối cùng</label>
								<div className={styles.customSelectWrapper}>
									<select
										value={rd.conclusion}
										onChange={(e) =>
											setResultDraft(t.id, {
												conclusion: e.target.value as ResultDraft['conclusion'],
											})
										}
										className={`${styles.conclusionSelect} ${rd.conclusion ? styles['select_' + rd.conclusion] : ''}`}
									>
										<option value=''>— Chọn kết luận —</option>
										{(Object.keys(CONCLUSION_LABELS) as Conclusion[]).map(
											(c) => (
												<option
													key={c}
													value={c}
												>
													{CONCLUSION_LABELS[c]}
												</option>
											),
										)}
									</select>
								</div>
							</div>
							<div className={styles.conclusionTextField}>
								<label className={styles.formLabel}>
									Nhận xét chung đại diện Hội đồng
								</label>
								<RichTextEditor
									value={rd.general_comment}
									onChange={(html) =>
										setResultDraft(t.id, { general_comment: html })
									}
									onUploadImage={(file) =>
										uploadCommentImage(t.id, file).then((r) => r.url)
									}
									maxTextLength={2000}
									placeholder='Tóm tắt ý kiến nhận xét chung của toàn hội đồng, các đề nghị chỉnh sửa chi tiết (nếu có)...'
								/>
							</div>
						</div>
						<div className={styles.conclusionActions}>
							<button
								className={styles.saveBtn}
								disabled={savingResultId === t.id}
								onClick={() => onSaveResult(t)}
							>
								{savingResultId === t.id ? (
									<span className={styles.loadingSpinnerBtn}>
										<span className={styles.spinner}></span>
										Đang lưu…
									</span>
								) : savedResultId === t.id ? (
									'✓ Đã lưu kết luận'
								) : (
									<>💾 Lưu kết luận</>
								)}
							</button>
						</div>
					</div>
				) : t.result?.conclusion ? (
					<div className={styles.conclusionDisplay}>
						<div className={styles.conclusionDisplayHeader}>
							<span
								className={`${styles.ratingBadge} ${styles[CONCLUSION_CLASS[t.result.conclusion]]}`}
							>
								{CONCLUSION_LABELS[t.result.conclusion]}
							</span>
							<span className={styles.conclusionMeta}>
								Chốt bởi: {t.result.decided_by_name} · {t.result.updated_at}
							</span>
						</div>
						{t.result.general_comment && (
							<div
								className={styles.conclusionComment}
								dangerouslySetInnerHTML={{
									__html: sanitizeCommentHtml(t.result.general_comment),
								}}
							/>
						)}
					</div>
				) : (
					<div className={styles.conclusionEmpty}>
						Chủ tịch hội đồng chưa chốt kết luận.
					</div>
				)}
			</div>
		</div>
	);
}
