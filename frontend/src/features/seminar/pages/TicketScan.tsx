import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CalendarSvg, CheckCircleSvg, ChevLSvg, ChevRSvg, ClockSvg, QrSvg, XCircleSvg } from '@/assets/icons';
import { InlineLoading } from '../../../shared/components/Loading';
import { formatTimeVN } from '@/shared/utils/formatDate';
import { seminarWhen } from '../../public/utils/seminarWhen';
import { checkInTicket, getSeminars, type TicketCheckIn } from '../api/seminarApi';
import { useSeminarDetail } from '../hooks/useSeminarDetail';
import { TicketCamera } from '../components/ticket-scan/TicketCamera';
import {
	beep,
	primeAudio,
	readSoundPref,
	vibrate,
	writeSoundPref,
	type ScanTone,
} from '../components/ticket-scan/feedback';
import type { Seminar } from '../types/seminar.type';
import styles from './TicketScan.module.css';

// Trang quét vé đại biểu (không sidebar), dùng được trên điện thoại, máy tính bảng
// và máy tính: /admin/quet-ve → chọn hội nghị, /admin/quet-ve/:id → camera + bộ đếm.

type Result = { ok: true; row: TicketCheckIn } | { ok: false; msg: string };
type Entry = Result & { key: number; at: Date };

// Vé QR chứa link .../hoi-nghi/ve/<32 hex> — lấy mã ở cuối link.
const codeOf = (text: string) => text.trim().match(/([a-f0-9]{32})\/?$/i)?.[1]?.toLowerCase() ?? null;

const holderOf = (r: { title_prefix: string | null; full_name: string }) =>
	`${r.title_prefix ? `${r.title_prefix} ` : ''}${r.full_name}`;

// hợp lệ (xanh) · đã điểm danh trước (vàng) · không hợp lệ (đỏ)
const toneOf = (r: Result): ScanTone => (!r.ok ? 'bad' : r.row.already ? 'warn' : 'ok');

const clock = (d: Date) => d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export default function TicketScan() {
	const { id } = useParams();
	return id ? <Scanner id={id} /> : <Picker />;
}

// Ngày hôm nay theo giờ VN dạng 'YYYY-MM-DD' (so chuỗi được với start_date/end_date).
const todayVN = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
const day = (d: string | null) => d?.slice(0, 10) ?? null;

type Avail = 'ongoing' | 'upcoming' | 'undated';

/** Hội nghị còn quét vé được — cùng quy tắc nhận đăng ký ở backend (REG_OPEN_SQL):
 * ngày kết thúc (thiếu thì ngày bắt đầu) chưa qua; chưa có ngày thì coi như còn. */
function availability(s: Seminar, today: string): Avail | null {
	const start = day(s.start_date);
	const end = day(s.end_date) ?? start;
	if (!end) return 'undated';
	if (end < today) return null;
	return start && start > today ? 'upcoming' : 'ongoing';
}

const AVAIL_LABEL: Record<Avail, string> = {
	ongoing: 'Đang diễn ra',
	upcoming: 'Sắp diễn ra',
	undated: 'Chưa có ngày',
};
const AVAIL_ORDER: Record<Avail, number> = { ongoing: 0, upcoming: 1, undated: 2 };

function Picker() {
	const [list, setList] = useState<{ s: Seminar; avail: Avail }[] | null>(null);
	const [error, setError] = useState('');

	useEffect(() => {
		// API xếp theo ngày bắt đầu giảm dần → hội nghị sắp/đang diễn ra nằm đầu danh sách
		getSeminars({ scope: 'hosted', limit: 100 })
			.then((r) => {
				const today = todayVN();
				setList(
					r.data
						.map((s) => ({ s, avail: availability(s, today) }))
						.filter((x): x is { s: Seminar; avail: Avail } => x.avail !== null)
						// Đang diễn ra trước, rồi sắp diễn ra gần nhất, cuối cùng là chưa có ngày
						.sort(
							(a, b) =>
								AVAIL_ORDER[a.avail] - AVAIL_ORDER[b.avail] ||
								(day(a.s.start_date) ?? '').localeCompare(day(b.s.start_date) ?? ''),
						),
				);
			})
			.catch((e) => setError(e instanceof Error ? e.message : 'Không tải được danh sách hội nghị'));
	}, []);

	return (
		<div className={styles.page}>
			<header className={styles.header}>
				<div className={styles.headerInner}>
					<Link to='/admin/seminars' className={styles.iconBtn} aria-label='Về danh sách hội thảo'>
						<ChevLSvg />
					</Link>
					<div className={styles.headerText}>
						<div className={styles.title}>Quét vé điểm danh</div>
						<div className={styles.sub}>Chọn hội nghị đang hoặc sắp diễn ra</div>
					</div>
				</div>
			</header>
			<main className={styles.pickerMain}>
				{error && (
					<div className={`${styles.result} ${styles.bad}`} role='alert'>
						<XCircleSvg className={styles.resultIcon} />
						<div className={styles.resultBody}>{error}</div>
					</div>
				)}
				{!list && !error && <InlineLoading />}
				{list?.length === 0 && (
					<div className={styles.emptyBox}>
						<CalendarSvg />
						<p className={styles.emptyTitle}>Không có hội nghị nào đang hoặc sắp diễn ra</p>
						<p className={styles.empty}>
							Chỉ hội nghị do bệnh viện tổ chức và chưa kết thúc mới quét vé được ở đây.
						</p>
					</div>
				)}
				<div className={styles.list}>
					{list?.map(({ s, avail }) => (
						<Link key={s.id} to={`/admin/quet-ve/${s.id}`} className={styles.item}>
							<span className={styles.itemIcon}>
								<QrSvg />
							</span>
							<span className={styles.itemText}>
								<span className={`${styles.badge} ${styles[`badge_${avail}`]}`}>{AVAIL_LABEL[avail]}</span>
								<span className={styles.itemTitle}>{s.title}</span>
								{(avail !== 'undated' || s.date_text || s.location) && (
									<span className={styles.itemSub}>
										<CalendarSvg />
										{[avail !== 'undated' || s.date_text ? seminarWhen(s) : null, s.location]
											.filter(Boolean)
											.join(' · ')}
									</span>
								)}
							</span>
							<ChevRSvg className={styles.itemChev} />
						</Link>
					))}
				</div>
			</main>
		</div>
	);
}

function SoundSvg({ on }: { on: boolean }) {
	return (
		<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
			<path d='M11 5 6 9H3v6h3l5 4V5Z' />
			{on ? <path d='M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13' /> : <path d='m16 9 6 6M22 9l-6 6' />}
		</svg>
	);
}

function ResultCard({ entry }: { entry: Entry | undefined }) {
	if (!entry)
		return (
			<div className={`${styles.result} ${styles.idle}`}>
				<QrSvg className={styles.resultIcon} />
				<div className={styles.resultBody}>
					<div className={styles.resultStatus}>Chưa quét vé nào</div>
					<div className={styles.resultMeta}>Kết quả từng lượt quét sẽ hiện ở đây.</div>
				</div>
			</div>
		);
	const tone = toneOf(entry);
	return (
		<div className={`${styles.result} ${styles[tone]}`} role='status' aria-live='assertive' key={entry.key}>
			{tone === 'ok' ? (
				<CheckCircleSvg className={styles.resultIcon} />
			) : tone === 'warn' ? (
				<ClockSvg className={styles.resultIcon} />
			) : (
				<XCircleSvg className={styles.resultIcon} />
			)}
			<div className={styles.resultBody}>
				<div className={styles.resultHead}>
					<span className={styles.resultStatus}>
						{tone === 'ok'
							? 'Điểm danh thành công'
							: entry.ok
								? `Đã điểm danh lúc ${formatTimeVN(entry.row.checked_in_at)}`
								: 'Vé không hợp lệ'}
					</span>
					<time className={styles.resultTime}>{clock(entry.at)}</time>
				</div>
				{entry.ok ? (
					<>
						<div className={styles.resultName}>{holderOf(entry.row)}</div>
						{entry.row.organization && <div className={styles.resultOrg}>{entry.row.organization}</div>}
					</>
				) : (
					<div className={styles.resultMeta}>{entry.msg}</div>
				)}
			</div>
		</div>
	);
}

function Scanner({ id }: { id: string }) {
	// Hook dùng chung với trang chi tiết: tự tải lại khi có SSE 'seminar' →
	// bộ đếm cập nhật cả khi nhiều máy cùng quét.
	const { seminar, notFound, participants, refresh } = useSeminarDetail(id);
	const [busy, setBusy] = useState(false);
	const [results, setResults] = useState<Entry[]>([]);
	const [lastCode, setLastCode] = useState('');
	const [sound, setSound] = useState(readSoundPref);
	const seqRef = useRef(0);

	const total = participants.length;
	const checked = participants.filter((p) => p.checked_in_at).length;
	const pct = total ? Math.round((checked / total) * 100) : 0;

	const push = (r: Result) => {
		const tone = toneOf(r);
		vibrate(tone);
		if (sound) beep(tone);
		setResults((prev) => [{ ...r, key: ++seqRef.current, at: new Date() }, ...prev].slice(0, 20));
	};

	const handleScan = async (text: string) => {
		const code = codeOf(text);
		// Camera đọc liên tục cùng 1 mã — bỏ qua mã vừa quét
		if (busy || (code && code === lastCode)) return;
		setLastCode(code ?? text);
		if (!code) {
			push({ ok: false, msg: 'Mã QR không phải vé hội nghị.' });
			return;
		}
		setBusy(true);
		try {
			const row = await checkInTicket(id, code);
			push({ ok: true, row });
			if (!row.already) refresh();
		} catch (e) {
			push({ ok: false, msg: e instanceof Error ? e.message : 'Điểm danh thất bại' });
		} finally {
			setBusy(false);
		}
	};

	const toggleSound = () => {
		const next = !sound;
		if (next) primeAudio();
		setSound(next);
		writeSoundPref(next);
	};

	if (notFound)
		return (
			<div className={styles.page}>
				<div className={styles.notFound}>
					<XCircleSvg />
					<p>Không tìm thấy hội nghị.</p>
					<Link to='/admin/quet-ve' className={styles.btnPrimary}>
						Chọn hội nghị khác
					</Link>
				</div>
			</div>
		);

	const latest = results[0];
	const earlier = results.slice(1);
	return (
		<div className={`${styles.page} ${styles.scanPage}`}>
			<header className={styles.header}>
				<div className={styles.headerInner}>
					<Link to='/admin/quet-ve' className={styles.iconBtn} aria-label='Chọn hội nghị khác'>
						<ChevLSvg />
					</Link>
					<div className={styles.headerText}>
						<div className={styles.title}>{seminar?.title ?? 'Đang tải…'}</div>
						{seminar && <div className={styles.sub}>{seminarWhen(seminar)}</div>}
					</div>
					<button
						type='button'
						className={styles.iconBtn}
						onClick={toggleSound}
						aria-pressed={sound}
						aria-label={sound ? 'Tắt âm báo' : 'Bật âm báo'}
						title={sound ? 'Tắt âm báo' : 'Bật âm báo'}
					>
						<SoundSvg on={sound} />
					</button>
				</div>
			</header>

			<main className={styles.scanMain}>
				<section className={styles.counter} aria-live='polite' aria-label='Tiến độ điểm danh'>
					<div className={styles.counterRow}>
						<div className={styles.count}>
							<strong>{seminar ? checked : '—'}</strong>
							<span>/{seminar ? total : '—'}</span>
						</div>
						<div className={styles.countLabel}>
							đã điểm danh
							<span>
								còn {seminar ? total - checked : '—'} · {pct}%
							</span>
						</div>
					</div>
					<div className={styles.bar}>
						<div className={styles.barFill} style={{ width: `${pct}%` }} />
					</div>
				</section>

				<div className={styles.camera}>
					<TicketCamera
						onScan={(t) => void handleScan(t)}
						paused={busy}
						flash={latest ? { id: latest.key, tone: toneOf(latest) } : null}
					/>
				</div>

				<div className={styles.latest}>
					<ResultCard entry={latest} />
				</div>

				<section className={`${styles.history} ${earlier.length ? '' : styles.historyEmpty}`}>
					<h2 className={styles.historyTitle}>
						Lượt quét trước
						{earlier.length > 0 && <span>{earlier.length}</span>}
					</h2>
					{earlier.length === 0 ? (
						<p className={styles.historyNone}>Chưa có lượt quét nào khác.</p>
					) : (
						<ul className={styles.historyList}>
							{earlier.map((r) => {
								const tone = toneOf(r);
								return (
									<li key={r.key} className={styles[`h_${tone}`]}>
										<span className={styles.hDot} aria-hidden='true' />
										<span className={styles.hText}>
											<span className={styles.hName}>{r.ok ? holderOf(r.row) : 'Vé không hợp lệ'}</span>
											<span className={styles.hMeta}>
												{r.ok ? (r.row.already ? 'Đã điểm danh trước' : 'Điểm danh thành công') : r.msg}
											</span>
										</span>
										<time className={styles.hTime}>{clock(r.at)}</time>
									</li>
								);
							})}
						</ul>
					)}
				</section>
			</main>
		</div>
	);
}
