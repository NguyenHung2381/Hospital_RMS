import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { CheckSvg, ClipboardCheckSvg } from '@/assets/icons';
import { InlineLoading } from '@/shared/components';
import { notify } from '@/shared/utils/feedback';
import UserLayout from '../../../layouts/UserLayout';
import { isTraineeAccount, isTraineePath, TRAINEE_HOME } from '../../../app/router/authHelpers';
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
			<div className={styles.respondCard}>
				<div className={styles.respondHeader}>
					<h2 className={styles.respondTitle}>{survey.title}</h2>
					{survey.description && <p className={styles.respondDesc}>{survey.description}</p>}
					<span className={styles.respondMeta}>
						<ClipboardCheckSvg /> {survey.questions.length} câu hỏi
					</span>
				</div>

				<div className={styles.respondBody}>
					{survey.questions.map((q, qi) => (
						<fieldset
							key={q.id}
							className={styles.questionBlock}
						>
							<legend className={styles.questionLabel}>
								<span className={styles.questionIndex}>{qi + 1}</span>
								<span>{q.question_text}</span>
							</legend>
							{q.question_type === 'text' && (
								<textarea
									className={styles.formTextarea}
									rows={3}
									value={answers[q.id]?.answer_text ?? ''}
									onChange={(e) => setText(q.id, e.target.value)}
									placeholder='Nhập câu trả lời...'
								/>
							)}
							{q.question_type !== 'text' && (
								<div className={styles.optionList}>
									{q.options.map((opt) => {
										const picked = answers[q.id]?.answer_options ?? [];
										const single = q.question_type === 'single_choice';
										return (
											<label
												key={opt}
												className={styles.optionChoice}
											>
												<input
													type={single ? 'radio' : 'checkbox'}
													name={q.id}
													checked={single ? picked[0] === opt : picked.includes(opt)}
													onChange={() => (single ? setSingle(q.id, opt) : toggleMulti(q.id, opt))}
												/>
												<span>{opt}</span>
											</label>
										);
									})}
								</div>
							)}
							{q.question_type === 'multi_choice' && (
								<div className={styles.questionHint}>Có thể chọn nhiều đáp án</div>
							)}
						</fieldset>
					))}

					{error && <div className={styles.respondError}>{error}</div>}
				</div>

				<div className={styles.respondFooter}>
					<button
						type='button'
						className={styles.btnCancel}
						onClick={onCancel}
						disabled={submitting}
					>
						Huỷ
					</button>
					<button
						type='button'
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
	// Mỗi khảo sát có URL riêng /user/khao-sat/:id — có thể chia sẻ link trực tiếp
	// (chưa đăng nhập sẽ được RequireAuth chuyển tới /login?from=... rồi quay lại).
	const { id } = useParams<{ id: string }>();
	const navigate = useNavigate();
	// Ở cổng học viên thì link khảo sát giữ trong /hoc-vien (không nhảy sang khung /user).
	const { pathname } = useLocation();
	const basePath = isTraineeAccount() || isTraineePath(pathname) ? `${TRAINEE_HOME}/khao-sat` : '/user/khao-sat';
	const [surveys, setSurveys] = useState<ActiveSurvey[] | null>(null);
	// Kết quả mở khảo sát, gắn với id đã tải để khi URL đổi không hiện nhầm dữ liệu cũ.
	const [opened, setOpened] = useState<{ id: string; survey?: SurveyToRespond; error?: string } | null>(null);
	const [listError, setListError] = useState('');

	const current = id && opened?.id === id ? opened : null;
	const selected = current?.survey ?? null;
	const error = current?.error || listError;

	const load = () => {
		surveyApi
			.listActive()
			.then(setSurveys)
			.catch(() => setListError('Không thể tải danh sách khảo sát'));
	};

	useEffect(() => {
		if (!id) {
			load();
			return;
		}
		let cancelled = false;
		surveyApi
			.getForRespond(id)
			.then((survey) => {
				if (!cancelled) setOpened({ id, survey });
			})
			.catch((err) => {
				if (cancelled) return;
				setOpened({ id, error: err instanceof Error ? err.message : 'Không thể mở khảo sát' });
				load();
			});
		return () => {
			cancelled = true;
		};
	}, [id]);

	// Đang mở 1 khảo sát theo URL thì chưa hiện danh sách (tránh nháy); lỗi thì hiện lại.
	const showList = !id || !!current;

	const openSurvey = (surveyId: string) => {
		navigate(`${basePath}/${surveyId}`);
	};

	if (selected) {
		return (
			<UserLayout
				pageTitle='Khảo sát'
				pageSubtitle='Trả lời khảo sát'
			>
				<RespondForm
					survey={selected}
					onCancel={() => navigate(basePath)}
					onDone={() => {
						notify.success('Đã nộp khảo sát, cảm ơn bạn đã phản hồi.');
						navigate(basePath);
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
			{error && <div className={styles.emptyState}>{error}</div>}

			{!surveys && !error && !id && <InlineLoading />}
			{id && !current && <InlineLoading />}

			{showList && surveys && surveys.length === 0 && (
				<div className={styles.emptyState}>
					<div className={styles.emptyTitle}>Không có khảo sát nào đang mở</div>
					<div className={styles.emptyDesc}>Quay lại sau khi có khảo sát mới dành cho bạn.</div>
				</div>
			)}

			{showList && surveys && surveys.length > 0 && (
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
