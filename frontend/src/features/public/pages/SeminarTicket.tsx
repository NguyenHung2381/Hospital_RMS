import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { QRCode } from 'antd';
import { AlertSvg, CheckSvg } from '@/assets/icons';
import PublicLayout from '../../../layouts/PublicLayout';
import { downloadQrPng } from '../../../shared/utils/qrPng';
import { formatDateTimeVN } from '../../../shared/utils/formatDate';
import { getSeminarTicket, submitSeminarTest, type SeminarTicket as Ticket } from '../api/publicApi';
import { FormSection } from '../components/FormSection';
import { seminarWhen } from '../utils/seminarWhen';
import styles from './PublicPortal.module.css';

// Vé cá nhân của người đã đăng ký hội nghị. QR trên vé chứa chính link trang
// này: ban tổ chức quét bằng màn "Quét vé điểm danh" để điểm danh, người tham
// dự quét/mở lại link để làm bài test cuối buổi.
export default function SeminarTicket() {
	const { code = '' } = useParams();
	const location = useLocation();
	const navigate = useNavigate();
	const qrRef = useRef<HTMLDivElement>(null);
	const [ticket, setTicket] = useState<Ticket | null>(null);
	const [error, setError] = useState('');
	const [loading, setLoading] = useState(false);
	const [answers, setAnswers] = useState<(number | undefined)[]>([]);
	const [submitting, setSubmitting] = useState(false);
	const justRegistered = !!(location.state as { justRegistered?: boolean } | null)?.justRegistered;
	// Giữ thông báo sau khi state bị xoá (tự tải QR xong)
	const [welcome] = useState(justRegistered);

	const fetchTicket = useCallback(
		() =>
			getSeminarTicket(code)
				.then((t) => {
					setTicket(t);
					setError('');
				})
				.catch((e) => setError(e instanceof Error ? e.message : 'Không tải được vé')),
		[code],
	);

	useEffect(() => {
		void fetchTicket();
	}, [fetchTicket]);

	const load = () => {
		setLoading(true);
		void fetchTicket().finally(() => setLoading(false));
	};

	const download = useCallback(() => {
		if (!ticket) return;
		downloadQrPng(
			qrRef.current,
			[`${ticket.title_prefix ? `${ticket.title_prefix} ` : ''}${ticket.full_name}`, ticket.seminar.title],
			`ve-hoi-nghi-${ticket.full_name}`,
		);
	}, [ticket]);

	// Vừa đăng ký xong: tự lưu ảnh QR về máy 1 lần (xoá state để tải lại trang không lưu nữa)
	useEffect(() => {
		if (!ticket || !justRegistered) return;
		const t = window.setTimeout(() => {
			download();
			navigate(location.pathname, { replace: true, state: null });
		}, 300); // chờ antd vẽ xong canvas QR
		return () => window.clearTimeout(t);
	}, [ticket, justRegistered, download, navigate, location.pathname]);

	const questions = ticket?.test.questions ?? null;

	const handleSubmitTest = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!questions) return;
		const missing = questions.findIndex((_, i) => answers[i] === undefined);
		if (missing >= 0) return setError(`Bạn chưa trả lời câu ${missing + 1}`);
		if (!window.confirm('Nộp bài? Mỗi người chỉ được nộp 1 lần.')) return;
		setSubmitting(true);
		try {
			await submitSeminarTest(code, answers as number[]);
			setError('');
			load();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Nộp bài thất bại');
		} finally {
			setSubmitting(false);
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

	return (
		<PublicLayout
			title='Vé tham dự hội nghị'
			subtitle={ticket.seminar.title}
		>
			{welcome && (
				<div className={`${styles.alertBox} ${styles.alertSuccess}`}>
					<CheckSvg /> Đăng ký thành công! Ảnh mã QR đã được lưu về máy — nếu chưa thấy, bấm "Tải mã QR" hoặc chụp
					màn hình.
				</div>
			)}
			{error && (
				<div className={`${styles.alertBox} ${styles.alertError}`}>
					<AlertSvg /> {error}
				</div>
			)}

			<div className={styles.section}>
				<div
					className={styles.sectionBody}
					style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}
				>
					<div ref={qrRef}>
						<QRCode
							type='canvas'
							value={`${window.location.origin}/hoi-nghi/ve/${code}`}
							size={240}
							bgColor='#fff'
						/>
					</div>
					<div className={styles.courseName}>
						{ticket.title_prefix ? `${ticket.title_prefix} ` : ''}
						{ticket.full_name}
					</div>
					<div className={styles.courseMeta}>
						{ticket.seminar.title}
						<br />
						{seminarWhen(ticket.seminar)}
						{ticket.seminar.location ? ` · ${ticket.seminar.location}` : ''}
					</div>
					<button
						type='button'
						className={styles.submitBtn}
						onClick={download}
					>
						Tải mã QR
					</button>
					<p className={styles.sectionDesc}>
						Khi đến hội nghị, đưa mã QR này cho ban tổ chức quét để điểm danh. Cuối buổi, mở lại trang này (quét
						chính mã QR trên) để làm bài test.
					</p>
				</div>
			</div>

			<FormSection
				step={1}
				title='Điểm danh'
			>
				{ticket.checked_in_at ? (
					<span>
						<CheckSvg /> Đã điểm danh lúc {formatDateTimeVN(ticket.checked_in_at)}
					</span>
				) : (
					<span className={styles.sectionDesc}>Chưa điểm danh — đưa mã QR cho ban tổ chức quét khi đến hội nghị.</span>
				)}
			</FormSection>

			{test.has_test && (
				<FormSection
					step={2}
					title='Bài test cuối buổi'
				>
					{testDone ? (
						<span>
							<CheckSvg /> Đã nộp bài lúc {formatDateTimeVN(test.submitted_at!)} — đúng {test.correct}/{test.total} câu.
						</span>
					) : questions ? (
						<form onSubmit={handleSubmitTest}>
							{questions.map((q, i) => (
								<fieldset
									key={i}
									className={styles.subGroup}
									style={{ border: 0, padding: 0, margin: '0 0 16px' }}
								>
									<legend className={styles.label}>
										Câu {i + 1}. {q.q}
									</legend>
									{q.options.map((o, j) => (
										<label
											key={j}
											style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '4px 0' }}
										>
											<input
												type='radio'
												name={`q${i}`}
												checked={answers[i] === j}
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
					) : (
						<div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
							<span className={styles.sectionDesc}>
								{!ticket.checked_in_at
									? 'Cần điểm danh trước khi làm bài test.'
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
				</FormSection>
			)}

			{ticket.seminar.grants_cme && (
				<FormSection
					step={test.has_test ? 3 : 2}
					title='Chứng nhận CME'
				>
					{ticket.cme ? (
						<span>
							<CheckSvg /> Đã cấp — số {ticket.cme.certificate_no}/{ticket.cme.year}
							{ticket.cme.credits ? ` · ${ticket.cme.credits} tín chỉ` : ''}
						</span>
					) : ticket.checked_in_at && (testDone || !test.has_test) ? (
						<span className={styles.sectionDesc}>Đã đủ điều kiện — chờ ban tổ chức cấp chứng nhận.</span>
					) : (
						<span className={styles.sectionDesc}>
							Chỉ được cấp khi đã điểm danh{test.has_test ? ' và làm bài test cuối buổi' : ''}.
						</span>
					)}
				</FormSection>
			)}
		</PublicLayout>
	);
}
