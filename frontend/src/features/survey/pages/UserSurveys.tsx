import { useEffect, useState } from 'react';
import { CheckSvg, ClipboardCheckSvg } from '@/assets/icons';
import { InlineLoading } from '@/shared/components';
import UserLayout from '../../../layouts/UserLayout';
import { surveyApi } from '../api/surveyApi';
import type { ActiveSurvey, AnswerPayload, SurveyToRespond } from '../types/survey.type';
import styles from './Survey.module.css';

function RespondForm({
	survey,
	onDone,
	onCancel,
}: {
	survey: SurveyToRespond;
	onDone: () => void;
	onCancel: () => void;
}) {
	const [answers, setAnswers] = useState<Record<string, AnswerPayload>>({});
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState('');

	const setText = (questionId: string, text: string) =>
		setAnswers((prev) => ({ ...prev, [questionId]: { question_id: questionId, answer_text: text } }));

	const setSingle = (questionId: string, option: string) =>
		setAnswers((prev) => ({ ...prev, [questionId]: { question_id: questionId, answer_options: [option] } }));

	const toggleMulti = (questionId: string, option: string) =>
		setAnswers((prev) => {
			const current = prev[questionId]?.answer_options ?? [];
			const next = current.includes(option)
				? current.filter((o) => o !== option)
				: [...current, option];
			return { ...prev, [questionId]: { question_id: questionId, answer_options: next } };
		});

	const handleSubmit = async () => {
		setSubmitting(true);
		setError('');
		try {
			await surveyApi.submit(survey.id, Object.values(answers));
			onDone();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Nộp khảo sát thất bại');
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<div className={styles.respondWrap}>
			<div className={styles.tableCard} style={{ padding: 24 }}>
				<div className={styles.tableTitle}>{survey.title}</div>
				{survey.description && (
					<div className={styles.descText} style={{ marginTop: 4 }}>
						{survey.description}
					</div>
				)}

				{survey.questions.map((q, qi) => (
					<div
						key={q.id}
						className={styles.questionBlock}
					>
						<div className={styles.questionLabel}>
							{qi + 1}. {q.question_text}
						</div>
						{q.question_type === 'text' && (
							<textarea
								className={styles.formTextarea}
								rows={3}
								value={answers[q.id]?.answer_text ?? ''}
								onChange={(e) => setText(q.id, e.target.value)}
								placeholder='Nhập câu trả lời...'
							/>
						)}
						{q.question_type === 'single_choice' &&
							q.options.map((opt) => (
								<label
									key={opt}
									className={styles.optionChoice}
								>
									<input
										type='radio'
										name={q.id}
										checked={(answers[q.id]?.answer_options ?? [])[0] === opt}
										onChange={() => setSingle(q.id, opt)}
									/>
									{opt}
								</label>
							))}
						{q.question_type === 'multi_choice' &&
							q.options.map((opt) => (
								<label
									key={opt}
									className={styles.optionChoice}
								>
									<input
										type='checkbox'
										checked={(answers[q.id]?.answer_options ?? []).includes(opt)}
										onChange={() => toggleMulti(q.id, opt)}
									/>
									{opt}
								</label>
							))}
					</div>
				))}

				{error && (
					<div style={{ color: '#e24b4a', fontSize: 13, marginTop: 8 }}>{error}</div>
				)}

				<div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
					<button
						className={styles.btnCancel}
						onClick={onCancel}
						disabled={submitting}
					>
						Huỷ
					</button>
					<button
						className={styles.btnConfirm}
						onClick={handleSubmit}
						disabled={submitting}
					>
						{submitting ? <span className={styles.spinner} /> : <CheckSvg />}
						Nộp khảo sát
					</button>
				</div>
			</div>
		</div>
	);
}

export default function UserSurveys() {
	const [surveys, setSurveys] = useState<ActiveSurvey[] | null>(null);
	const [selected, setSelected] = useState<SurveyToRespond | null>(null);
	const [error, setError] = useState('');
	const [doneMsg, setDoneMsg] = useState('');

	const load = () => {
		surveyApi
			.listActive()
			.then(setSurveys)
			.catch(() => setError('Không thể tải danh sách khảo sát'));
	};

	useEffect(() => {
		load();
	}, []);

	const openSurvey = async (id: string) => {
		setError('');
		try {
			setSelected(await surveyApi.getForRespond(id));
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Không thể mở khảo sát');
		}
	};

	if (selected) {
		return (
			<UserLayout
				pageTitle='Khảo sát'
				pageSubtitle='Trả lời khảo sát'
			>
				<RespondForm
					survey={selected}
					onCancel={() => setSelected(null)}
					onDone={() => {
						setSelected(null);
						setDoneMsg('Đã nộp khảo sát, cảm ơn bạn đã phản hồi.');
						load();
					}}
				/>
			</UserLayout>
		);
	}

	return (
		<UserLayout
			pageTitle='Khảo sát'
			pageSubtitle='Các khảo sát đang mở dành cho bạn'
		>
			{doneMsg && (
				<div className={`${styles.toast} ${styles.toastSuccess}`}>
					<CheckSvg /> {doneMsg}
				</div>
			)}
			{error && <div className={styles.emptyState}>{error}</div>}

			{!surveys && !error && <InlineLoading />}

			{surveys && surveys.length === 0 && (
				<div className={styles.emptyState}>
					<div className={styles.emptyTitle}>Không có khảo sát nào đang mở</div>
					<div className={styles.emptyDesc}>Quay lại sau khi có khảo sát mới dành cho bạn.</div>
				</div>
			)}

			{surveys && surveys.length > 0 && (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
					{surveys.map((s) => (
						<div
							key={s.id}
							className={styles.questionCard}
							style={{ cursor: 'pointer' }}
							onClick={() => openSurvey(s.id)}
						>
							<div className={styles.itemName}>
								<ClipboardCheckSvg style={{ width: 16, height: 16, marginRight: 6 }} />
								{s.title}
							</div>
							{s.description && <div className={styles.descText}>{s.description}</div>}
						</div>
					))}
				</div>
			)}
		</UserLayout>
	);
}
