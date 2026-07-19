import {
	PROGRESS_RATING_LABELS,
	uploadCommentImage,
	type ProgressRating,
	type ProgressTopic,
} from '../../council/api/councilApi';
import RichTextEditor from '../../../shared/components/RichTextEditor';
import type { Draft } from '../types/councilProgress.type';
import styles from '../pages/CouncilProgress.module.css';

interface ProgressMyReviewTabProps {
	topic: ProgressTopic;
	draft: Draft;
	setDraft: (id: string, patch: Partial<Draft>) => void;
	savingId: string | null;
	savedId: string | null;
	onSave: (t: ProgressTopic) => void;
}

export function ProgressMyReviewTab({
	topic: t,
	draft: d,
	setDraft,
	savingId,
	savedId,
	onSave,
}: ProgressMyReviewTabProps) {
	return (
		<div className={styles.cardSection}>
			<h3 className={styles.cardSectionTitle}>📝 Ý kiến đánh giá cá nhân</h3>

			<div className={styles.evaluationFormGrid}>
				<div className={styles.evaluationFormLeft}>
					<div className={styles.formGroup}>
						<label className={styles.formLabel}>Tiến độ hoàn thành</label>
						<div className={styles.inputGroupPercent}>
							<input
								type='number'
								min={0}
								max={100}
								step={5}
								value={d.percent}
								onChange={(e) => setDraft(t.id, { percent: e.target.value })}
								className={styles.percentInput}
								placeholder='0'
							/>
							<span className={styles.inputGroupAddon}>%</span>
						</div>
					</div>

					<div className={styles.formGroup}>
						<label className={styles.formLabel}>Xếp loại tiến độ</label>
						<div className={styles.customSelectWrapper}>
							<select
								value={d.rating}
								onChange={(e) =>
									setDraft(t.id, {
										rating: e.target.value as Draft['rating'],
									})
								}
								className={`${styles.ratingSelect} ${d.rating ? styles['select_' + d.rating] : ''}`}
							>
								<option value=''>— Chọn kết quả xếp loại —</option>
								{(Object.keys(PROGRESS_RATING_LABELS) as ProgressRating[]).map(
									(r) => (
										<option
											key={r}
											value={r}
										>
											{PROGRESS_RATING_LABELS[r]}
										</option>
									),
								)}
							</select>
						</div>
					</div>
				</div>

				<div className={styles.evaluationFormRight}>
					<div className={styles.formGroup}>
						<label className={styles.formLabel}>Nhận xét chi tiết</label>
						<RichTextEditor
							value={d.comment}
							onChange={(html) => setDraft(t.id, { comment: html })}
							onUploadImage={(file) =>
								uploadCommentImage(t.id, file).then((r) => r.url)
							}
							maxTextLength={2000}
							placeholder='Nhận xét chi tiết về tiến độ, khối lượng đã thực hiện, kiến nghị điều chỉnh...'
						/>
					</div>
				</div>
			</div>

			<div className={styles.cardSectionActions}>
				<button
					className={styles.saveBtn}
					disabled={savingId === t.id}
					onClick={() => onSave(t)}
				>
					{savingId === t.id ? (
						<span className={styles.loadingSpinnerBtn}>
							<span className={styles.spinner}></span>
							Đang lưu…
						</span>
					) : savedId === t.id ? (
						'✓ Đã lưu đánh giá'
					) : (
						'Lưu đánh giá'
					)}
				</button>
			</div>
		</div>
	);
}
