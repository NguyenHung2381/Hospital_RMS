import { useEffect, useRef, useState } from 'react';
import { AlertSvg, CheckSvg } from '@/assets/icons';
import { confirmDialog } from '@/shared/components';
import { QuestionImageView } from '@/shared/components/QuestionImage';
import { QuestionText } from '@/shared/components/QuestionImage/QuestionText';
import { formatDateOr } from '../../../shared/utils/formatDate';
import type { SeminarTicketTest } from '../api/publicApi';
import { testWindowText } from '../utils/seminarWhen';
import styles from '../pages/PublicPortal.module.css';

const mmss = (sec: number) => {
	const h = Math.floor(sec / 3600);
	const m = Math.floor((sec % 3600) / 60);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${h ? `${h}:${pad(m)}` : m}:${pad(sec % 60)}`;
};

// Bài làm dở lưu trong máy để tải lại trang / mất mạng không mất (thứ tự đề cố định theo vé + đề)
const draftKey = (code: string, testId: string) => `seminar-test:${code}:${testId}`;
const loadDraft = (key: string): (number | undefined)[] => {
	try {
		const v = JSON.parse(localStorage.getItem(key) || '[]');
		return Array.isArray(v) ? v.map((x) => (Number.isInteger(x) ? x : undefined)) : [];
	} catch {
		return [];
	}
};

/**
 * 1 đề kiểm tra hội nghị: giới thiệu / bắt đầu / làm bài (đồng hồ, bài làm dở lưu máy) / kết quả.
 * Dùng trên vé QR cá nhân (SeminarTicket) và trang QR chung của đề (SeminarTestQrPublic) —
 * trang cha lo gọi API bắt đầu / nộp bài và tính hạn nộp khi tải dữ liệu.
 */
export function SeminarTestSection({
	draftId,
	test,
	blockedReason,
	cmeWarn,
	deadline,
	loadedAt,
	loading,
	onStart,
	onSubmit,
	onReload,
}: {
	/** Khoá bài làm dở trong máy (mã vé / mã lượt QR chung) — thứ tự đề cố định theo người làm */
	draftId: string;
	test: SeminarTicketTest;
	/** Lý do chưa làm được bài ngoài trạng thái đề (vd chưa điểm danh) — null = không có */
	blockedReason?: string | null;
	/** Báo "chưa đạt điểm tối thiểu để được cấp CME" khi nộp mà chưa đạt */
	cmeWarn: boolean;
	/** Hạn nộp (ms, đồng hồ máy này) khi đang làm bài — null = không giới hạn / chưa làm */
	deadline: number | null;
	loadedAt: number;
	loading: boolean;
	/** Bấm "Bắt đầu làm bài" (đề có giới hạn thời gian) — trang cha tải lại dữ liệu */
	onStart: () => Promise<void>;
	/** Nộp bài: answers theo thứ tự hiển thị, null = bỏ trống */
	onSubmit: (answers: (number | null)[]) => Promise<void>;
	onReload: () => void;
}) {
	const key = draftKey(draftId, test.id);
	const [answers, setAnswers] = useState<(number | undefined)[]>(() => loadDraft(key));
	const [submitting, setSubmitting] = useState(false);
	const [starting, setStarting] = useState(false);
	const [autoSubmitted, setAutoSubmitted] = useState(false);
	const [error, setError] = useState('');
	const questions = test.questions;
	const [now, setNow] = useState(() => Date.now());

	useEffect(() => {
		if (deadline == null) return;
		const id = window.setInterval(() => setNow(Date.now()), 1000);
		return () => window.clearInterval(id);
	}, [deadline]);

	useEffect(() => {
		try {
			localStorage.setItem(key, JSON.stringify(answers));
		} catch {
			/* chế độ ẩn danh / bị chặn lưu trữ — vẫn làm bài bình thường */
		}
	}, [answers, key]);

	const remaining = deadline == null ? null : Math.max(0, Math.ceil((deadline - Math.max(now, loadedAt)) / 1000));

	const submit = async (auto: boolean) => {
		if (!questions || submitting) return;
		setSubmitting(true);
		try {
			// Câu bỏ trống gửi null (0 điểm)
			await onSubmit(questions.map((_, i) => answers[i] ?? null));
			try {
				localStorage.removeItem(key);
			} catch {
				/* bỏ qua */
			}
			setAutoSubmitted(auto);
			setError('');
			onReload();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Nộp bài thất bại');
		} finally {
			setSubmitting(false);
		}
	};

	// Hết giờ → tự nộp đúng 1 lần (kể cả các câu chưa chọn)
	const submitRef = useRef(submit);
	useEffect(() => {
		submitRef.current = submit;
	});
	const autoFired = useRef(false);
	useEffect(() => {
		if (remaining !== 0 || autoFired.current) return;
		autoFired.current = true;
		void submitRef.current(true);
	}, [remaining]);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!questions) return;
		const missing = questions.filter((_, i) => answers[i] === undefined).length;
		const ok = await confirmDialog({
			title: `Nộp bài "${test.title}"?`,
			message: missing
				? `Bạn còn ${missing} câu chưa trả lời (tính 0 điểm). Vẫn nộp bài? Mỗi đề chỉ được nộp 1 lần.`
				: 'Mỗi đề chỉ được nộp 1 lần.',
			confirmLabel: 'Nộp bài',
		});
		if (!ok) return;
		void submit(false);
	};

	const handleStart = async () => {
		const ok = await confirmDialog({
			title: `Bắt đầu làm "${test.title}"?`,
			message: `Bạn có ${test.duration_minutes} phút, hết giờ bài sẽ tự nộp.`,
			confirmLabel: 'Bắt đầu',
		});
		if (!ok) return;
		setStarting(true);
		try {
			await onStart();
			setError('');
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Không bắt đầu được bài kiểm tra');
		} finally {
			setStarting(false);
		}
	};

	const done = !!test.submitted_at;
	const heading = test.title;

	return (
		<>
			{error && (
				<div
					className={`${styles.alertBox} ${styles.alertError}`}
					role='alert'
				>
					<AlertSvg /> {heading}: {error}
				</div>
			)}
			{autoSubmitted && (
				<div
					className={`${styles.alertBox} ${styles.alertSuccess}`}
					role='status'
				>
					<CheckSvg /> {heading}: đã hết giờ — bài làm đã được tự động nộp.
				</div>
			)}
			{done && cmeWarn && test.pass_score != null && test.passed === false && (
				<div
					className={`${styles.alertBox} ${styles.alertError}`}
					role='alert'
				>
					<AlertSvg /> {heading}: chưa đạt điểm tối thiểu ({test.pass_score} điểm) để được cấp chứng nhận CME.
				</div>
			)}

			{!done && (
				<section className={styles.section}>
					<header className={styles.sectionHead}>
						<h2 className={styles.sectionHeading}>{heading}</h2>
					</header>
					<div className={styles.sectionBody}>
						{questions ? (
							<form onSubmit={handleSubmit}>
								{remaining != null && (
									<div className={`${styles.testTimer} ${remaining <= 60 ? styles.testTimerUrgent : ''}`}>
										<span>
											{test.duration_minutes ? 'Thời gian làm bài còn' : 'Dừng nhận bài sau'}
											{remaining === 0 && ' — đang tự nộp bài...'}
										</span>
										<span className={styles.testTimerClock}>{mmss(remaining)}</span>
									</div>
								)}
								<p className={styles.sectionDesc}>
									{questions.length} câu · tổng {test.max_score ?? questions.length} điểm
									{test.pass_score != null ? ` · điểm đạt ${test.pass_score}` : ''}
								</p>
								{questions.map((q, i) => (
									<fieldset
										key={i}
										className={styles.subGroup}
										style={{ border: 0, padding: 0, margin: '0 0 16px' }}
									>
										<legend className={styles.label}>
											Câu {i + 1}
											{q.points != null ? ` (${q.points} điểm)` : ''}. <QuestionText text={q.q} />
										</legend>
										{q.image && (
											<div style={{ margin: '4px 0 8px' }}>
												<QuestionImageView url={q.image} />
											</div>
										)}
										{q.options.map((o, j) => (
											<label
												key={j}
												style={{
													display: 'flex',
													gap: 8,
													alignItems: 'flex-start',
													padding: '4px 0',
												}}
											>
												<input
													type='radio'
													name={`${test.id}-q${i}`}
													checked={answers[i] === j}
													disabled={submitting}
													onChange={() =>
														setAnswers((a) => {
															const next = [...a];
															next[i] = j;
															return next;
														})
													}
												/>
												<span>{o}</span>
											</label>
										))}
									</fieldset>
								))}
								<button
									type='submit'
									className={styles.submitBtn}
									disabled={submitting}
								>
									{submitting ? 'Đang nộp...' : 'Nộp bài'}
								</button>
							</form>
						) : test.can_start ? (
							<div className={styles.testIntro}>
								<div className={styles.testFacts}>
									<span>
										<b>{test.question_count}</b> câu
									</span>
									<span>
										<b>{test.max_score}</b> điểm
									</span>
									<span>
										<b>{test.duration_minutes}</b> phút
									</span>
									{test.pass_score != null && (
										<span>
											<b>≥ {test.pass_score}</b> để đạt
										</span>
									)}
								</div>
								<span className={styles.ticketHint}>
									Đồng hồ chạy ngay khi bấm bắt đầu, hết giờ bài tự nộp
									{test.window?.end_time
										? ` · dừng nhận bài ${test.window.end_time} ${formatDateOr(test.window.end_date || test.window.date)}`
										: ''}
								</span>
								<button
									type='button'
									className={styles.submitBtn}
									onClick={() => void handleStart()}
									disabled={starting}
								>
									{starting ? 'Đang mở đề...' : 'Bắt đầu làm bài'}
								</button>
							</div>
						) : (
							<div
								style={{
									display: 'flex',
									flexDirection: 'column',
									gap: 8,
									alignItems: 'flex-start',
								}}
							>
								<span className={styles.sectionDesc}>
									{blockedReason
										? blockedReason
										: test.expired
											? 'Đã hết thời gian làm bài nhưng bài chưa được nộp — vui lòng liên hệ ban tổ chức.'
											: test.state === 'closed'
												? 'Đã hết thời gian nhận bài kiểm tra.'
												: test.window
													? `Bài kiểm tra chưa mở — thời gian làm bài: ${testWindowText(test.window)}.`
													: 'Bài kiểm tra chưa mở — ban tổ chức sẽ mở khi tới giờ.'}
								</span>
								<button
									type='button'
									className={styles.searchBtn}
									onClick={onReload}
									disabled={loading}
								>
									{loading ? 'Đang tải...' : 'Tải lại'}
								</button>
							</div>
						)}
					</div>
				</section>
			)}
		</>
	);
}
