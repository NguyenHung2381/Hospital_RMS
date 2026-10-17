import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { AlertSvg, CheckSvg, DownloadSvg, XSvg } from '@/assets/icons';
import { BrandedQrCode, useBrandedQrImage } from '@/shared/components/BrandedQr';
import { QuestionImageView } from '@/shared/components/QuestionImage';
import { QuestionText } from '@/shared/components/QuestionImage/QuestionText';
import PublicLayout from '../../../layouts/PublicLayout';
import { publicUrl } from '../../../shared/utils/publicUrl';
import { formatDateOr, formatDateTimeVN } from '../../../shared/utils/formatDate';
import {
	getSeminarTicket,
	startSeminarTest,
	submitSeminarTest,
	type SeminarTicket as Ticket,
} from '../api/publicApi';
import { seminarWhen, testWindowText } from '../utils/seminarWhen';
import styles from './PublicPortal.module.css';

const mmss = (sec: number) => {
	const h = Math.floor(sec / 3600);
	const m = Math.floor((sec % 3600) / 60);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${h ? `${h}:${pad(m)}` : m}:${pad(sec % 60)}`;
};

// Bài làm dở lưu trong máy để tải lại trang / mất mạng không mất (thứ tự đề cố định theo vé)
const draftKey = (code: string) => `seminar-test:${code}`;
const loadDraft = (code: string): (number | undefined)[] => {
	try {
		const v = JSON.parse(localStorage.getItem(draftKey(code)) || '[]');
		return Array.isArray(v) ? v.map((x) => (Number.isInteger(x) ? x : undefined)) : [];
	} catch {
		return [];
	}
};

// Vé cá nhân của người đã đăng ký hội nghị. QR trên vé chứa chính link trang
// này: ban tổ chức quét bằng màn "Quét vé điểm danh" để điểm danh, người tham
// dự quét/mở lại link để làm bài test cuối buổi.
export default function SeminarTicket() {
	const { code = '' } = useParams();
	const location = useLocation();
	const navigate = useNavigate();
	const [ticket, setTicket] = useState<Ticket | null>(null);
	const [error, setError] = useState('');
	const [loading, setLoading] = useState(false);
	const [answers, setAnswers] = useState<(number | undefined)[]>(() => loadDraft(code));
	const [submitting, setSubmitting] = useState(false);
	const [starting, setStarting] = useState(false);
	const [autoSubmitted, setAutoSubmitted] = useState(false);
	// Hạn nộp theo đồng hồ máy này (server trả số giây còn lại → không lệch giờ máy)
	const [deadline, setDeadline] = useState<number | null>(null);
	const [now, setNow] = useState(() => Date.now());
	const justRegistered = !!(location.state as { justRegistered?: boolean } | null)?.justRegistered;
	// Giữ thông báo sau khi state bị xoá (tự tải QR xong)
	const [welcome] = useState(justRegistered);

	const applyTicket = useCallback((t: Ticket) => {
		setTicket(t);
		const left = t.test.remaining_seconds;
		setDeadline(t.test.questions && left != null ? Date.now() + left * 1000 : null);
	}, []);

	const fetchTicket = useCallback(
		() =>
			getSeminarTicket(code)
				.then((t) => {
					applyTicket(t);
					setError('');
				})
				.catch((e) => setError(e instanceof Error ? e.message : 'Không tải được vé')),
		[code, applyTicket],
	);

	useEffect(() => {
		void fetchTicket();
	}, [fetchTicket]);

	const load = () => {
		setLoading(true);
		void fetchTicket().finally(() => setLoading(false));
	};

	const ticketUrl = publicUrl(`/hoi-nghi/ve/${code}`);
	const holder = ticket ? `${ticket.title_prefix ? `${ticket.title_prefix} ` : ''}${ticket.full_name}` : '';
	const qrImage = useBrandedQrImage(
		ticket
			? {
					value: ticketUrl,
					title: holder,
					lines: [ticket.seminar.title, seminarWhen(ticket.seminar)],
					caption: 'Vé tham dự hội nghị — đưa mã này cho ban tổ chức quét để điểm danh',
					filename: `ve-hoi-nghi-${ticket.full_name}`,
				}
			: null,
	);

	// Vừa đăng ký xong: tự lưu ảnh QR về máy 1 lần (xoá state để tải lại trang không lưu nữa).
	// iOS không tự tải được — hiện ảnh để nhấn giữ lưu.
	const { ready: qrReady, save: saveQr } = qrImage;
	useEffect(() => {
		if (!justRegistered || !qrReady) return;
		saveQr(true);
		navigate(location.pathname, { replace: true, state: null });
	}, [justRegistered, qrReady, saveQr, navigate, location.pathname]);

	const questions = ticket?.test.questions ?? null;

	useEffect(() => {
		if (deadline == null) return;
		const id = window.setInterval(() => setNow(Date.now()), 1000);
		return () => window.clearInterval(id);
	}, [deadline]);

	useEffect(() => {
		try {
			localStorage.setItem(draftKey(code), JSON.stringify(answers));
		} catch {
			/* chế độ ẩn danh / bị chặn lưu trữ — vẫn làm bài bình thường */
		}
	}, [answers, code]);

	const remaining = deadline == null ? null : Math.max(0, Math.ceil((deadline - now) / 1000));

	const submit = async (auto: boolean) => {
		if (!questions || submitting) return;
		setSubmitting(true);
		try {
			// Câu bỏ trống gửi null (0 điểm)
			await submitSeminarTest(
				code,
				questions.map((_, i) => answers[i] ?? null),
			);
			try {
				localStorage.removeItem(draftKey(code));
			} catch {
				/* bỏ qua */
			}
			setAutoSubmitted(auto);
			setError('');
			load();
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

	const handleSubmitTest = (e: React.FormEvent) => {
		e.preventDefault();
		if (!questions) return;
		const missing = questions.filter((_, i) => answers[i] === undefined).length;
		const msg = missing
			? `Bạn còn ${missing} câu chưa trả lời (tính 0 điểm). Vẫn nộp bài? Mỗi người chỉ được nộp 1 lần.`
			: 'Nộp bài? Mỗi người chỉ được nộp 1 lần.';
		if (!window.confirm(msg)) return;
		void submit(false);
	};

	const handleStart = async () => {
		const minutes = ticket?.test.duration_minutes;
		if (!window.confirm(`Bắt đầu làm bài? Bạn có ${minutes} phút, hết giờ bài sẽ tự nộp.`)) return;
		setStarting(true);
		try {
			applyTicket(await startSeminarTest(code));
			setError('');
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Không bắt đầu được bài test');
		} finally {
			setStarting(false);
		}
	};

	if (!ticket) {
		return (
			<PublicLayout title='Vé tham dự hội nghị'>
				{error ? (
					<div className={`${styles.alertBox} ${styles.alertError}`}>
						<AlertSvg /> {error}
					</div>
				) : (
					<div className={styles.emptyNotice}>Đang tải vé...</div>
				)}
			</PublicLayout>
		);
	}

	const { test } = ticket;
	const testDone = !!test.submitted_at;
	// Bài nộp trước khi có điểm từng câu: mỗi câu đúng 1 điểm
	const score = test.score ?? test.correct;
	const maxScore = test.max_score ?? test.total;
	const testPassed = testDone && test.passed !== false;

	return (
		<PublicLayout
			title='Vé tham dự hội nghị'
			subtitle={ticket.seminar.title}
		>
			{welcome && (
				<div className={`${styles.alertBox} ${styles.alertSuccess}`}>
					<CheckSvg /> Đăng ký thành công! Hãy lưu mã QR về máy (bấm "Tải mã QR" hoặc chụp màn hình).
				</div>
			)}
			{error && (
				<div className={`${styles.alertBox} ${styles.alertError}`}>
					<AlertSvg /> {error}
				</div>
			)}

			<div className={`${styles.section} ${styles.ticketCard}`}>
				<BrandedQrCode
					value={ticketUrl}
					size={220}
				/>
				<div className={styles.courseName}>{holder}</div>
				<div className={styles.courseMeta}>
					{seminarWhen(ticket.seminar)}
					{ticket.seminar.location ? ` · ${ticket.seminar.location}` : ''}
				</div>
				<button
					type='button'
					className={styles.searchBtn}
					onClick={() => qrImage.save()}
					disabled={!qrImage.ready}
				>
					<DownloadSvg /> Tải mã QR
				</button>
				<span className={styles.ticketHint}>Đưa mã này cho ban tổ chức quét khi đến hội nghị</span>
			</div>

			<ol className={styles.ticketSteps}>
				<TicketStep
					state={ticket.checked_in_at ? 'done' : 'todo'}
					title='Điểm danh'
					text={ticket.checked_in_at ? formatDateTimeVN(ticket.checked_in_at) : 'Chưa điểm danh'}
				/>
				{test.has_test && (
					<TicketStep
						state={!testDone ? 'todo' : test.passed === false ? 'fail' : 'done'}
						title='Bài test'
						text={
							testDone
								? `${score}/${maxScore} điểm${test.pass_score != null ? (test.passed ? ' · Đạt' : ' · Chưa đạt') : ''}`
								: 'Chưa làm'
						}
					/>
				)}
				{ticket.seminar.grants_cme && (
					<TicketStep
						state={ticket.cme ? 'done' : 'todo'}
						title='Chứng nhận CME'
						text={
							ticket.cme
								? `Số ${ticket.cme.certificate_no}/${ticket.cme.year}`
								: ticket.checked_in_at && (testPassed || !test.has_test)
									? 'Chờ ban tổ chức cấp'
									: 'Chưa đủ điều kiện'
						}
					/>
				)}
			</ol>

			{autoSubmitted && (
				<div className={`${styles.alertBox} ${styles.alertSuccess}`}>
					<CheckSvg /> Đã hết giờ — bài làm đã được tự động nộp.
				</div>
			)}
			{testDone && test.pass_score != null && test.passed === false && (
				<div className={`${styles.alertBox} ${styles.alertError}`}>
					<AlertSvg /> Chưa đạt điểm tối thiểu ({test.pass_score} điểm) để được cấp chứng nhận CME.
				</div>
			)}

			{test.has_test && !testDone && (
				<section className={styles.section}>
					<header className={styles.sectionHead}>
						<h2 className={styles.sectionHeading}>Bài test cuối buổi</h2>
					</header>
					<div className={styles.sectionBody}>
					{questions ? (
						<form onSubmit={handleSubmitTest}>
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
											style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '4px 0' }}
										>
											<input
												type='radio'
												name={`q${i}`}
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
						<div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
							<span className={styles.sectionDesc}>
								{!ticket.checked_in_at
									? 'Cần điểm danh trước khi làm bài test.'
									: test.expired
										? 'Đã hết thời gian làm bài nhưng bài chưa được nộp — vui lòng liên hệ ban tổ chức.'
										: test.state === 'closed'
											? 'Đã hết thời gian nhận bài test.'
											: test.window
												? `Bài test chưa mở — thời gian làm bài: ${testWindowText(test.window)}.`
												: 'Bài test chưa mở — ban tổ chức sẽ mở vào cuối buổi.'}
							</span>
							<button
								type='button'
								className={styles.searchBtn}
								onClick={load}
								disabled={loading}
							>
								{loading ? 'Đang tải...' : 'Tải lại'}
							</button>
						</div>
					)}
					</div>
				</section>
			)}
			{qrImage.sheet}
		</PublicLayout>
	);
}

// 1 bước trong tiến trình của vé: điểm danh → bài test → CME
function TicketStep({ state, title, text }: { state: 'done' | 'todo' | 'fail'; title: string; text: string }) {
	return (
		<li className={`${styles.ticketStep} ${styles[`ticketStep_${state}`]}`}>
			<span className={styles.ticketStepIcon}>{state === 'done' ? <CheckSvg /> : state === 'fail' ? <XSvg /> : null}</span>
			<span className={styles.ticketStepTitle}>{title}</span>
			<span className={styles.ticketStepText}>{text}</span>
		</li>
	);
}
