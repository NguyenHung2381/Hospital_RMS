import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { AlertSvg, CheckSvg, DownloadSvg, XSvg } from '@/assets/icons';
import { confirmDialog } from '@/shared/components';
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
	type SeminarTicketTest,
} from '../api/publicApi';
import { seminarWhen, testWindowText } from '../utils/seminarWhen';
import styles from './PublicPortal.module.css';

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

// Đã nộp và đạt (hoặc đề không đặt điểm đạt)
const cleared = (t: SeminarTicketTest) => !!t.submitted_at && t.passed !== false;

// Vé cá nhân của người đã đăng ký hội nghị. QR trên vé chứa chính link trang
// này: ban tổ chức quét bằng màn "Quét vé điểm danh" để điểm danh, người tham
// dự quét/mở lại link để làm các đề kiểm tra của hội nghị (mỗi đề một mục).
export default function SeminarTicket() {
	const { code = '' } = useParams();
	const location = useLocation();
	const navigate = useNavigate();
	const [ticket, setTicket] = useState<Ticket | null>(null);
	const [error, setError] = useState('');
	const [loading, setLoading] = useState(false);
	const justRegistered = !!(location.state as { justRegistered?: boolean } | null)?.justRegistered;
	// Giữ thông báo sau khi state bị xóa (tự tải QR xong)
	const [welcome] = useState(justRegistered);
	// Hạn nộp của từng đề đang làm, theo đồng hồ máy này (server trả số giây còn lại → không lệch giờ máy)
	const [deadlines, setDeadlines] = useState<Record<string, number | null>>({});
	// Lúc tính các hạn nộp — đồng hồ đếm ngược không lấy mốc sớm hơn (tránh khung đầu dư giây)
	const [loadedAt, setLoadedAt] = useState(0);

	const applyTicket = useCallback((t: Ticket) => {
		setTicket(t);
		const at = Date.now();
		setLoadedAt(at);
		setDeadlines(
			Object.fromEntries(
				t.tests.map((x) => [
					x.id,
					x.questions && x.remaining_seconds != null ? at + x.remaining_seconds * 1000 : null,
				]),
			),
		);
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

	const load = useCallback(() => {
		setLoading(true);
		void fetchTicket().finally(() => setLoading(false));
	}, [fetchTicket]);

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

	// Vừa đăng ký xong: tự lưu ảnh QR về máy 1 lần (xóa state để tải lại trang không lưu nữa).
	// iOS không tự tải được — hiện ảnh để nhấn giữ lưu.
	const { ready: qrReady, save: saveQr } = qrImage;
	useEffect(() => {
		if (!justRegistered || !qrReady) return;
		saveQr(true);
		navigate(location.pathname, { replace: true, state: null });
	}, [justRegistered, qrReady, saveQr, navigate, location.pathname]);

	if (!ticket) {
		return (
			<PublicLayout
				bare
				title='Vé tham dự hội nghị'>
				{error ? (
					<div
					className={`${styles.alertBox} ${styles.alertError}`}
					role='alert'
				>
						<AlertSvg /> {error}
					</div>
				) : (
					<div className={styles.emptyNotice}>Đang tải vé...</div>
				)}
			</PublicLayout>
		);
	}

	const { tests } = ticket;
	const cmeTests = tests.filter((t) => t.counts_for_cme);
	const cmeReady = !!ticket.checked_in_at && cmeTests.every(cleared);

	return (
		<PublicLayout
			bare
			title='Vé tham dự hội nghị'
			subtitle={ticket.seminar.title}
		>
			{welcome && (
				<div
					className={`${styles.alertBox} ${styles.alertSuccess}`}
					role='status'
				>
					<CheckSvg /> Đăng ký thành công! Hãy lưu mã QR về máy (bấm "Tải mã QR" hoặc chụp màn hình).
				</div>
			)}
			{error && (
				<div
					className={`${styles.alertBox} ${styles.alertError}`}
					role='alert'
				>
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
				{tests.map((t) => {
					const done = !!t.submitted_at;
					// Bài nộp trước khi có điểm từng câu: mỗi câu đúng 1 điểm
					const score = t.score ?? t.correct;
					const max = t.max_score ?? t.total;
					return (
						<TicketStep
							key={t.id}
							state={!done ? 'todo' : t.passed === false ? 'fail' : 'done'}
							title={t.title}
							text={
								done
									? `${score}/${max} điểm${t.pass_score != null ? (t.passed ? ' · Đạt' : ' · Chưa đạt') : ''}`
									: 'Chưa làm'
							}
						/>
					);
				})}
				{ticket.seminar.grants_cme && (
					<TicketStep
						state={ticket.cme ? 'done' : 'todo'}
						title='Chứng nhận CME'
						text={
							ticket.cme
								? `Số ${ticket.cme.certificate_no}/${ticket.cme.year}`
								: cmeReady
									? 'Chờ ban tổ chức cấp'
									: 'Chưa đủ điều kiện'
						}
					/>
				)}
			</ol>

			{tests.map((t) => (
				<TicketTestSection
					key={t.id}
					code={code}
					test={t}
					checkedIn={!!ticket.checked_in_at}
					grantsCme={ticket.seminar.grants_cme}
					deadline={deadlines[t.id] ?? null}
					loadedAt={loadedAt}
					loading={loading}
					onTicket={applyTicket}
					onReload={load}
				/>
			))}
			{qrImage.sheet}
		</PublicLayout>
	);
}

// 1 đề kiểm tra trên vé: giới thiệu / bắt đầu / làm bài (đồng hồ, bài làm dở lưu máy) / kết quả.
// Mỗi đề có hạn nộp (tính ở trang cha khi tải vé) và bài làm dở riêng.
function TicketTestSection({
	code,
	test,
	checkedIn,
	grantsCme,
	deadline,
	loadedAt,
	loading,
	onTicket,
	onReload,
}: {
	code: string;
	test: SeminarTicketTest;
	checkedIn: boolean;
	grantsCme: boolean;
	/** Hạn nộp (ms, đồng hồ máy này) khi đang làm bài — null = không giới hạn / chưa làm */
	deadline: number | null;
	loadedAt: number;
	loading: boolean;
	onTicket: (t: Ticket) => void;
	onReload: () => void;
}) {
	const key = draftKey(code, test.id);
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
			await submitSeminarTest(
				code,
				test.id,
				questions.map((_, i) => answers[i] ?? null),
			);
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
			onTicket(await startSeminarTest(code, test.id));
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
			{done && grantsCme && test.counts_for_cme && test.pass_score != null && test.passed === false && (
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
												style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '4px 0' }}
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
							<div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
								<span className={styles.sectionDesc}>
									{!checkedIn
										? 'Cần điểm danh trước khi làm bài kiểm tra.'
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

// 1 bước trong tiến trình của vé: điểm danh → từng đề kiểm tra → CME
function TicketStep({ state, title, text }: { state: 'done' | 'todo' | 'fail'; title: string; text: string }) {
	return (
		<li className={`${styles.ticketStep} ${styles[`ticketStep_${state}`]}`}>
			<span className={styles.ticketStepIcon}>{state === 'done' ? <CheckSvg /> : state === 'fail' ? <XSvg /> : null}</span>
			<span className={styles.ticketStepTitle}>{title}</span>
			<span className={styles.ticketStepText}>{text}</span>
		</li>
	);
}
