import { Modal } from '@/shared/components';
import type { SurveyResults } from '../types/survey.type';
import styles from '../pages/Survey.module.css';

export function SurveyResultsModal({
	results,
	onClose,
}: {
	results: SurveyResults | null;
	onClose: () => void;
}) {
	return (
		<Modal
			open
			onClose={onClose}
			title='Kết quả khảo sát'
			subtitle={results ? `${results.title} — ${results.response_count} lượt phản hồi` : 'Đang tải...'}
			className={`${styles.modal} ${styles.modalLg}`}
			bodyClassName={styles.modalBody}
			footer={
				<>
					<button
						className={styles.btnCancel}
						onClick={onClose}
					>
						Đóng
					</button>
				</>
			}
		>
			{!results && <div className={styles.emptyItems}>Đang tải kết quả...</div>}

			{results && results.response_count === 0 && (
				<div className={styles.emptyItems}>Chưa có ai phản hồi khảo sát này.</div>
			)}

			{results &&
				results.response_count > 0 &&
				results.questions.map((q, qi) => {
					const maxCount = q.counts ? Math.max(1, ...q.counts.map((c) => c.count)) : 1;
					return (
						<div
							key={q.id}
							className={styles.resultQuestion}
						>
							<div className={styles.formLabel}>
								{qi + 1}. {q.question_text}
							</div>
							{q.question_type === 'text' ? (
								<div style={{ marginTop: 8 }}>
									{q.texts && q.texts.length > 0 ? (
										q.texts.map((t, ti) => (
											<div
												key={ti}
												className={styles.resultTextItem}
											>
												{t}
											</div>
										))
									) : (
										<div className={styles.emptyItems}>Chưa có câu trả lời</div>
									)}
								</div>
							) : (
								<div style={{ marginTop: 8 }}>
									{(q.counts ?? []).map((c) => (
										<div
											key={c.option}
											className={styles.resultBarRow}
										>
											<span>{c.option}</span>
											<div className={styles.resultBarTrack}>
												<div
													className={styles.resultBarFill}
													style={{ width: `${(c.count / maxCount) * 100}%` }}
												/>
											</div>
											<span>{c.count}</span>
										</div>
									))}
								</div>
							)}
						</div>
					);
				})}
		</Modal>
	);
}
