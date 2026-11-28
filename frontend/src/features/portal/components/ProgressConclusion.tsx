import { useId } from 'react';
import { formatDateTimeVN } from '../../../shared/utils/formatDate';
import {
	CONCLUSION_LABELS,
	uploadCommentImage,
	type ProgressTopic,
} from '../../council/api/councilApi';
import RichTextEditor from '../../../shared/components/RichTextEditor';
import { sanitizeCommentHtml } from '../../../shared/utils/sanitizeHtml';
import type { ResultDraft } from '../types/councilProgress.type';
import { CONCLUSION_ORDER, CONCLUSION_TONE } from '../utils/councilProgressHelpers';
import styles from '../pages/CouncilProgress.module.css';

interface ProgressConclusionProps {
	topic: ProgressTopic;
	isChairman: boolean;
	resultDraft: ResultDraft;
	setResultDraft: (id: string, patch: Partial<ResultDraft>) => void;
	savingResultId: string | null;
	savedResultId: string | null;
	onSaveResult: (t: ProgressTopic) => void;
}

export function ProgressConclusion({
	topic: t,
	isChairman,
	resultDraft: rd,
	setResultDraft,
	savingResultId,
	savedResultId,
	onSaveResult,
}: ProgressConclusionProps) {
	const uid = useId();
	const saving = savingResultId === t.id;
	const decided = t.result?.conclusion ? t.result : null;

	return (
		<section className={styles.panel}>
			<header className={styles.panelHead}>
				<h3 className={styles.panelTitle}>Kết luận của hội đồng</h3>
				<span className={styles.panelHint}>
					{isChairman ? 'Bạn là Chủ tịch — kết luận do bạn chốt' : 'Do Chủ tịch hội đồng chốt'}
				</span>
			</header>

			{isChairman ? (
				<>
					<fieldset className={styles.field}>
						<legend className={styles.fieldLabel}>Kết luận cuối cùng</legend>
						<div className={styles.choiceGroup}>
							{CONCLUSION_ORDER.map((c) => {
								const checked = rd.conclusion === c;
								return (
									<label
										key={c}
										className={`${styles.choice} ${checked ? styles['choice_' + CONCLUSION_TONE[c]] : ''}`}
									>
										<input
											type='radio'
											name={`${uid}-conclusion`}
											value={c}
											checked={checked}
											className={styles.srOnly}
											onChange={() => setResultDraft(t.id, { conclusion: c })}
											onClick={() => checked && setResultDraft(t.id, { conclusion: '' })}
										/>
										<span
											className={`${styles.dot} ${styles['dot_' + CONCLUSION_TONE[c]]}`}
											aria-hidden
										/>
										{CONCLUSION_LABELS[c]}
									</label>
								);
							})}
						</div>
					</fieldset>

					<div className={styles.field}>
						<span className={styles.fieldLabel}>Nhận xét chung của hội đồng</span>
						<RichTextEditor
							aria-label='Nhận xét chung của hội đồng'
							value={rd.general_comment}
							onChange={(html) => setResultDraft(t.id, { general_comment: html })}
							onUploadImage={(file) => uploadCommentImage(t.id, file).then((r) => r.url)}
							maxTextLength={2000}
							placeholder='Tóm tắt ý kiến chung của hội đồng, các đề nghị chỉnh sửa (nếu có)…'
						/>
					</div>

					<footer className={styles.stickyActions}>
						<span className={styles.saveState}>
							{decided
								? `Đã chốt lúc ${formatDateTimeVN(decided.updated_at)}`
								: 'Chưa chốt kết luận'}
						</span>
						<button
							type='button'
							className={styles.saveBtn}
							disabled={saving}
							onClick={() => onSaveResult(t)}
						>
							{saving ? 'Đang lưu…' : savedResultId === t.id ? 'Đã lưu kết luận' : 'Lưu kết luận'}
						</button>
					</footer>
				</>
			) : decided?.conclusion ? (
				<div className={styles.verdict}>
					<div className={styles.verdictHead}>
						<span className={`${styles.verdictLabel} ${styles['tag_' + CONCLUSION_TONE[decided.conclusion]]}`}>
							{CONCLUSION_LABELS[decided.conclusion]}
						</span>
						<span className={styles.verdictMeta}>
							{decided.decided_by_name} · {formatDateTimeVN(decided.updated_at)}
						</span>
					</div>
					{decided.general_comment && (
						<div
							className={styles.richText}
							dangerouslySetInnerHTML={{ __html: sanitizeCommentHtml(decided.general_comment) }}
						/>
					)}
				</div>
			) : (
				<p className={styles.mutedNote}>Chủ tịch hội đồng chưa chốt kết luận.</p>
			)}
		</section>
	);
}
