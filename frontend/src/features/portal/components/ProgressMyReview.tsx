import { useId, type CSSProperties } from 'react';
import { LockSvg } from '@/assets/icons';
import {
	PROGRESS_RATING_LABELS,
	uploadCommentImage,
	type ProgressRating,
	type ProgressReview,
	type ProgressTopic,
} from '../../council/api/councilApi';
import RichTextEditor from '../../../shared/components/RichTextEditor';
import { formatDateVN } from '../../../shared/utils/formatDate';
import { sanitizeCommentHtml } from '../../../shared/utils/sanitizeHtml';
import type { Draft } from '../types/councilProgress.type';
import { RATING_TONE, type ReviewWindow } from '../utils/councilProgressHelpers';
import styles from '../pages/CouncilProgress.module.css';

interface ProgressMyReviewProps {
	topic: ProgressTopic;
	draft: Draft;
	setDraft: (id: string, patch: Partial<Draft>) => void;
	savingId: string | null;
	savedId: string | null;
	onSave: (t: ProgressTopic) => void;
	window: ReviewWindow;
	/** Phiếu đã lưu của chính người dùng (nếu có). */
	mine: ProgressReview | undefined;
	dirty: boolean;
}

const RATINGS = Object.keys(PROGRESS_RATING_LABELS) as ProgressRating[];

function lockedText(w: ReviewWindow, date: string | null) {
	if (w === 'before') return `Phiếu chấm mở vào ngày họp ${formatDateVN(date)}.`;
	if (w === 'after') return `Ngày họp ${formatDateVN(date)} đã qua — phiếu chấm đã khoá.`;
	return 'Hội đồng chưa có ngày họp — phiếu chấm mở vào ngày họp.';
}

export function ProgressMyReview({
	topic: t,
	draft: d,
	setDraft,
	savingId,
	savedId,
	onSave,
	window: w,
	mine,
	dirty,
}: ProgressMyReviewProps) {
	const uid = useId();
	const saving = savingId === t.id;
	const percentNum = d.percent.trim() === '' ? null : Number(d.percent);
	const sliderValue = percentNum != null && Number.isFinite(percentNum) ? Math.min(100, Math.max(0, percentNum)) : 0;

	if (w !== 'open') {
		return (
			<section className={styles.panel}>
				<header className={styles.panelHead}>
					<h3 className={styles.panelTitle}>Phiếu chấm của bạn</h3>
				</header>
				<p className={styles.lockedNote}>
					<LockSvg aria-hidden />
					{lockedText(w, t.defense_date)}
				</p>
				{mine && (mine.rating || mine.progress_percent != null || mine.comment) ? (
					<div className={styles.readonlyReview}>
						<div className={styles.readonlyScore}>
							{mine.progress_percent != null && (
								<span className={`${styles.bigNum} ${styles.num}`}>{mine.progress_percent}%</span>
							)}
							{mine.rating && (
								<span className={`${styles.tag} ${styles['tag_' + RATING_TONE[mine.rating]]}`}>
									{PROGRESS_RATING_LABELS[mine.rating]}
								</span>
							)}
						</div>
						{mine.comment && (
							<div
								className={styles.richText}
								dangerouslySetInnerHTML={{ __html: sanitizeCommentHtml(mine.comment) }}
							/>
						)}
					</div>
				) : null}
			</section>
		);
	}

	return (
		<section className={styles.panel}>
			<header className={styles.panelHead}>
				<h3 className={styles.panelTitle}>Phiếu chấm của bạn</h3>
				<span className={styles.panelHint}>Mở trong ngày họp hôm nay</span>
			</header>

			<fieldset className={styles.field}>
				<legend className={styles.fieldLabel}>Xếp loại tiến độ</legend>
				<div className={styles.choiceGroup}>
					{RATINGS.map((r) => {
						const checked = d.rating === r;
						return (
							<label
								key={r}
								className={`${styles.choice} ${checked ? styles['choice_' + RATING_TONE[r]] : ''}`}
							>
								<input
									type='radio'
									name={`${uid}-rating`}
									value={r}
									checked={checked}
									className={styles.srOnly}
									onChange={() => setDraft(t.id, { rating: r })}
									// Bấm lại mức đang chọn để bỏ chọn
									onClick={() => checked && setDraft(t.id, { rating: '' })}
								/>
								<span
									className={`${styles.dot} ${styles['dot_' + RATING_TONE[r]]}`}
									aria-hidden
								/>
								{PROGRESS_RATING_LABELS[r]}
							</label>
						);
					})}
				</div>
			</fieldset>

			<div className={styles.field}>
				<label
					htmlFor={`${uid}-pct`}
					className={styles.fieldLabel}
				>
					Tiến độ hoàn thành
				</label>
				<div className={styles.percentRow}>
					<div className={styles.percentBox}>
						<input
							id={`${uid}-pct`}
							type='number'
							inputMode='numeric'
							min={0}
							max={100}
							step={5}
							value={d.percent}
							onChange={(e) => setDraft(t.id, { percent: e.target.value })}
							className={`${styles.percentInput} ${styles.num}`}
							placeholder='—'
						/>
						<span
							className={styles.percentAddon}
							aria-hidden
						>
							%
						</span>
					</div>
					<input
						type='range'
						min={0}
						max={100}
						step={5}
						value={sliderValue}
						aria-label='Kéo để chọn tiến độ hoàn thành'
						className={`${styles.percentRange} ${percentNum == null ? styles.percentRangeEmpty : ''}`}
						style={{ '--pct': `${sliderValue}%` } as CSSProperties}
						onChange={(e) => setDraft(t.id, { percent: e.target.value })}
					/>
				</div>
			</div>

			<div className={styles.field}>
				<span className={styles.fieldLabel}>Nhận xét chi tiết</span>
				<RichTextEditor
					aria-label='Nhận xét chi tiết'
					value={d.comment}
					onChange={(html) => setDraft(t.id, { comment: html })}
					onUploadImage={(file) => uploadCommentImage(t.id, file).then((r) => r.url)}
					maxTextLength={2000}
					placeholder='Khối lượng đã thực hiện, điểm còn chậm, kiến nghị điều chỉnh…'
				/>
			</div>

			<footer className={styles.stickyActions}>
				<span
					className={`${styles.saveState} ${dirty ? styles.saveStateDirty : ''}`}
					aria-live='polite'
				>
					{dirty ? 'Có thay đổi chưa lưu' : mine ? 'Đã lưu' : 'Chưa chấm'}
				</span>
				<button
					type='button'
					className={styles.saveBtn}
					disabled={saving}
					onClick={() => onSave(t)}
				>
					{saving ? 'Đang lưu…' : savedId === t.id ? 'Đã lưu phiếu chấm' : 'Lưu phiếu chấm'}
				</button>
			</footer>
		</section>
	);
}
