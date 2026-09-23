import { useEffect, useRef, useState } from 'react';
import { CheckSvg, ClockSvg } from '@/assets/icons';
import { InlineLoading } from '@/shared/components';
import UserLayout from '../../../layouts/UserLayout';
import { examApi } from '../api/examApi';
import type { AnswerPayload } from '../api/examApi';
import type { AttemptQuestion, AvailablePaper, StartAttemptResult } from '../types/exam.type';
import styles from './UserExams.module.css';

const ATTEMPT_STATUS_LABEL: Record<string, string> = {
	in_progress: 'Đang làm dở — bấm để tiếp tục',
	submitted: 'Đã nộp — chờ chấm tự luận',
	graded: 'Đã có điểm',
};

function fmtClock(ms: number) {
	const total = Math.max(0, Math.floor(ms / 1000));
	const m = String(Math.floor(total / 60)).padStart(2, '0');
	const s = String(total % 60).padStart(2, '0');
	return `${m}:${s}`;
}

function ExamTaking({
	paperId,
	data,
	onDone,
	onCancel,
}: {
	paperId: string;
	data: StartAttemptResult;
	onDone: () => void;
	onCancel: () => void;
}) {
	const [deadline] = useState(() => new Date(data.attempt.started_at).getTime() + data.duration_minutes * 60_000);
	const [remainingMs, setRemainingMs] = useState(data.duration_minutes * 60_000);
	const [answers, setAnswers] = useState<Record<string, AnswerPayload>>({});
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState('');
	const submittedRef = useRef(false);

	const doSubmit = async () => {
		if (submittedRef.current) return;
		submittedRef.current = true;
		setSubmitting(true);
		try {
			await examApi.submitAttempt(paperId, Object.values(answers));
			onDone();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Nộp bài thất bại');
			submittedRef.current = false;
		} finally {
			setSubmitting(false);
		}
	};

	useEffect(() => {
		const tick = () => {
			const left = deadline - Date.now();
			setRemainingMs(left);
			if (left <= 0) {
				clearInterval(interval);
				void doSubmit();
			}
		};
		tick();
		const interval = setInterval(tick, 1000);
		return () => clearInterval(interval);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [deadline]);

	const setSingle = (q: AttemptQuestion, option: string) =>
		setAnswers((prev) => ({ ...prev, [q.id]: { question_id: q.id, selected_option: option } }));
	const setEssay = (q: AttemptQuestion, text: string) =>
		setAnswers((prev) => ({ ...prev, [q.id]: { question_id: q.id, essay_text: text } }));

	return (
		<div className={styles.examWrap}>
			<div className={styles.examHeader}>
				<div
					className={styles.timer}
					style={{ color: remainingMs < 60_000 ? '#e24b4a' : undefined }}
				>
					<ClockSvg /> {fmtClock(remainingMs)}
				</div>
			</div>

			{error && <div className={styles.errorBanner}>{error}</div>}

			{data.questions.map((q, qi) => (
				<div
					key={q.id}
					className={styles.questionBlock}
				>
					<div className={styles.questionLabel}>
						{qi + 1}. {q.question_text} ({q.points} điểm)
					</div>
					{q.question_type === 'essay' ? (
						<textarea
							className={styles.formTextarea}
							rows={4}
							value={answers[q.id]?.essay_text ?? ''}
							onChange={(e) => setEssay(q, e.target.value)}
							placeholder='Nhập câu trả lời...'
						/>
					) : (
						q.options.map((opt) => (
							<label
								key={opt}
								className={styles.optionChoice}
							>
								<input
									type='radio'
									name={q.id}
									checked={answers[q.id]?.selected_option === opt}
									onChange={() => setSingle(q, opt)}
								/>
								{opt}
							</label>
						))
					)}
				</div>
			))}

			<div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
				<button
					className={styles.btnCancel}
					onClick={onCancel}
					disabled={submitting}
				>
					Tạm thoát (làm tiếp sau)
				</button>
				<button
					className={styles.btnConfirm}
					onClick={() => void doSubmit()}
					disabled={submitting}
				>
					{submitting ? <span className={styles.spinner} /> : <CheckSvg />}
					Nộp bài
				</button>
			</div>
		</div>
	);
}

export default function UserExams() {
	const [papers, setPapers] = useState<AvailablePaper[] | null>(null);
	const [error, setError] = useState('');
	const [taking, setTaking] = useState<{ paperId: string; data: StartAttemptResult } | null>(null);
	const [doneMsg, setDoneMsg] = useState('');

	const load = () => {
		examApi
			.listAvailable()
			.then(setPapers)
			.catch(() => setError('Không thể tải danh sách đề thi'));
	};

	useEffect(() => {
		load();
	}, []);

	const start = async (paperId: string) => {
		setError('');
		try {
			const data = await examApi.startAttempt(paperId);
			setTaking({ paperId, data });
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Không thể bắt đầu làm bài');
		}
	};

	if (taking) {
		return (
			<UserLayout
				pageTitle='Bài thi'
				pageSubtitle='Làm bài trong thời gian quy định'
			>
				<ExamTaking
					paperId={taking.paperId}
					data={taking.data}
					onCancel={() => setTaking(null)}
					onDone={() => {
						setTaking(null);
						setDoneMsg('Đã nộp bài thi thành công.');
						load();
					}}
				/>
			</UserLayout>
		);
	}

	return (
		<UserLayout
			pageTitle='Thi online'
			pageSubtitle='Danh sách đề thi thuộc các khóa học bạn đang tham gia'
		>
			{doneMsg && (
				<div className={`${styles.toast} ${styles.toastSuccess}`}>
					<CheckSvg /> {doneMsg}
				</div>
			)}
			{error && <div className={styles.errorBanner}>{error}</div>}
			{!papers && !error && <InlineLoading />}
			{papers && papers.length === 0 && (
				<div className={styles.emptyState}>
					<div className={styles.emptyTitle}>Chưa có đề thi nào</div>
					<div className={styles.emptyDesc}>Khi giảng viên mở đề thi cho khóa học của bạn, đề sẽ hiện ở đây.</div>
				</div>
			)}
			{papers && papers.length > 0 && (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
					{papers.map((p) => (
						<div
							key={p.id}
							className={styles.paperCard}
						>
							<div>
								<div className={styles.paperTitle}>{p.title}</div>
								<div className={styles.paperMeta}>
									{p.course_name} · {p.duration_minutes} phút
									{p.attempt_status && ` · ${ATTEMPT_STATUS_LABEL[p.attempt_status]}`}
								</div>
							</div>
							{(!p.attempt_status || p.attempt_status === 'in_progress') && (
								<button
									className={styles.btnConfirm}
									onClick={() => void start(p.id)}
								>
									{p.attempt_status === 'in_progress' ? 'Tiếp tục làm bài' : 'Bắt đầu làm bài'}
								</button>
							)}
						</div>
					))}
				</div>
			)}
		</UserLayout>
	);
}
