import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { AlertSvg, CalendarSvg, CheckSvg, DownloadSvg, XSvg } from '@/assets/icons';
import { BrandedQrCode, isInAppBrowser, isIOS, useBrandedQrImage } from '@/shared/components/BrandedQr';
import PublicLayout from '../../../layouts/PublicLayout';
import { publicUrl } from '../../../shared/utils/publicUrl';
import { formatDateTimeVN } from '../../../shared/utils/formatDate';
import {
	getSeminarTicket,
	seminarTicketBadgeUrl,
	seminarTicketCalendarUrl,
	startSeminarTest,
	submitSeminarTest,
	type SeminarTicket as Ticket,
	type SeminarTicketTest,
} from '../api/publicApi';
import { seminarWhen } from '../utils/seminarWhen';
import { SeminarTestSection } from '../components/SeminarTestSection';
import styles from './PublicPortal.module.css';

// Đã nộp và đạt (hoặc đề không đặt điểm đạt), và bài nộp được tính điều kiện CME
const cleared = (t: SeminarTicketTest) => !!t.submitted_at && t.passed !== false && !t.cme_excluded;

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
	const navState = location.state as { justRegistered?: boolean; recovered?: boolean } | null;
	// Vừa đăng ký xong, hoặc vừa tra lại vé bằng họ tên + ngày sinh (trang đăng ký) ⇒ tự lưu QR
	const autoSave = !!(navState?.justRegistered || navState?.recovered);
	// Giữ thông báo sau khi state bị xóa (tự tải QR xong)
	const [welcome] = useState<'registered' | 'recovered' | null>(() =>
		navState?.justRegistered ? 'registered' : navState?.recovered ? 'recovered' : null,
	);
	// Tự lưu QR: Android / máy tính tải thẳng file (kể cả trong Zalo qua link server);
	// Safari iOS mở bảng chia sẻ để "Lưu hình ảnh" vào app Ảnh; trong app trên iOS chỉ hiện ảnh
	const [autoDownload] = useState(() => (isIOS() ? (isInAppBrowser() ? null : 'ios') : 'file'));
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
		// Ảnh thẻ do server vẽ: trình duyệt trong Zalo/Facebook (Android) tải được link http, không tải được blob
		{ downloadUrl: seminarTicketBadgeUrl(code) },
	);

	// Vừa đăng ký / tra lại vé: tự lưu ảnh QR về máy 1 lần (xóa state để tải lại trang không lưu nữa).
	// iOS / trình duyệt trong Zalo, Facebook không tự tải được — hiện ảnh kèm nút lưu / nhấn giữ.
	const { ready: qrReady, save: saveQr } = qrImage;
	useEffect(() => {
		if (!autoSave || !qrReady) return;
		saveQr(true);
		navigate(location.pathname, { replace: true, state: null });
	}, [autoSave, qrReady, saveQr, navigate, location.pathname]);

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
	// Chỉ có ngày tổ chức mới thêm vào lịch được (date_text tự do thì không)
	const hasCalendar = !!ticket.seminar.start_date;
	const calendarHint = hasCalendar ? ' Bấm "Thêm vào Lịch" để điện thoại nhắc trước ngày hội nghị.' : '';

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
					<CheckSvg /> {welcome === 'registered' ? 'Đăng ký thành công!' : 'Đã tìm thấy vé của bạn.'}{' '}
					{autoDownload === 'file'
						? 'Mã QR đã được tải về máy (thư mục Tải xuống) — không thấy thì bấm "Tải mã QR" hoặc chụp màn hình.'
						: autoDownload === 'ios'
							? 'Chọn "Lưu hình ảnh" để lưu mã QR vào ứng dụng Ảnh — chưa lưu được thì bấm "Tải mã QR" hoặc chụp màn hình.'
							: 'Hãy lưu mã QR về máy (bấm "Tải mã QR" hoặc chụp màn hình).'}
					{calendarHint}
					{welcome === 'registered' &&
						' Mất mã QR: quét lại mã QR đăng ký, bấm "Xem lại mã QR đã đăng ký" rồi nhập họ tên và ngày sinh.'}
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
				<div className={styles.ticketActions}>
					<button
						type='button'
						className={styles.searchBtn}
						onClick={() => qrImage.save()}
						disabled={!qrImage.ready}
					>
						<DownloadSvg /> Tải mã QR
					</button>
					{hasCalendar && (
						// Link thường (không fetch): iOS mở bảng "Thêm vào Lịch", Android tải .ics rồi mở bằng app Lịch
						<a
							className={styles.ticketCalendarBtn}
							href={seminarTicketCalendarUrl(code)}
						>
							<CalendarSvg /> Thêm vào Lịch
						</a>
					)}
				</div>
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
				<SeminarTestSection
					key={t.id}
					draftId={code}
					test={t}
					blockedReason={ticket.checked_in_at ? null : 'Cần điểm danh trước khi làm bài kiểm tra.'}
					cmeWarn={ticket.seminar.grants_cme && t.counts_for_cme}
					deadline={deadlines[t.id] ?? null}
					loadedAt={loadedAt}
					loading={loading}
					onStart={async () => applyTicket(await startSeminarTest(code, t.id))}
					onSubmit={async (answers) => {
						await submitSeminarTest(code, t.id, answers);
					}}
					onReload={load}
				/>
			))}
			{qrImage.sheet}
		</PublicLayout>
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
