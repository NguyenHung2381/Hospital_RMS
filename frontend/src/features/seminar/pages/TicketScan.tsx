import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckSvg, ChevLSvg, XSvg } from '@/assets/icons';
import { QrScanner } from '@/shared/components/QrScanner';
import { InlineLoading } from '../../../shared/components/Loading';
import { formatTimeVN } from '@/shared/utils/formatDate';
import { seminarWhen } from '../../public/utils/seminarWhen';
import { checkInTicket, getSeminars, type TicketCheckIn } from '../api/seminarApi';
import { useSeminarDetail } from '../hooks/useSeminarDetail';
import type { Seminar } from '../types/seminar.type';
import styles from './TicketScan.module.css';

// Trang quét vé đại biểu dành cho điện thoại của ban tổ chức (không sidebar):
// /admin/quet-ve → chọn hội nghị, /admin/quet-ve/:id → camera + bộ đếm điểm danh.

type Result = { ok: true; row: TicketCheckIn } | { ok: false; msg: string };

// Vé QR chứa link .../hoi-nghi/ve/<32 hex> — lấy mã ở cuối link.
const codeOf = (text: string) => text.trim().match(/([a-f0-9]{32})\/?$/i)?.[1]?.toLowerCase() ?? null;

const holderOf = (r: { title_prefix: string | null; full_name: string }) =>
	`${r.title_prefix ? `${r.title_prefix} ` : ''}${r.full_name}`;

export default function TicketScan() {
	const { id } = useParams();
	return id ? <Scanner id={id} /> : <Picker />;
}

function Picker() {
	const [list, setList] = useState<Seminar[] | null>(null);
	const [error, setError] = useState('');

	useEffect(() => {
		getSeminars({ scope: 'hosted', limit: 30 })
			.then((r) => setList(r.data))
			.catch((e) => setError(e instanceof Error ? e.message : 'Không tải được danh sách hội nghị'));
	}, []);

	return (
		<div className={styles.page}>
			<header className={styles.header}>
				<Link to='/admin/seminars' className={styles.back} aria-label='Về danh sách hội thảo'>
					<ChevLSvg />
				</Link>
				<div className={styles.headerText}>
					<div className={styles.title}>Quét vé điểm danh</div>
					<div className={styles.sub}>Chọn hội nghị đang diễn ra</div>
				</div>
			</header>
			{error && <div className={`${styles.result} ${styles.warn}`}>{error}</div>}
			{!list && !error && <InlineLoading />}
			{list?.length === 0 && <p className={styles.empty}>Chưa có hội nghị do bệnh viện tổ chức.</p>}
			<div className={styles.list}>
				{list?.map((s) => (
					<Link key={s.id} to={`/admin/quet-ve/${s.id}`} className={styles.item}>
						<div className={styles.itemTitle}>{s.title}</div>
						<div className={styles.sub}>
							{seminarWhen(s)}
							{s.location ? ` · ${s.location}` : ''}
						</div>
					</Link>
				))}
			</div>
		</div>
	);
}

function Scanner({ id }: { id: string }) {
	// Hook dùng chung với trang chi tiết: tự tải lại khi có SSE 'seminar' →
	// bộ đếm cập nhật cả khi nhiều máy cùng quét.
	const { seminar, notFound, participants, refresh } = useSeminarDetail(id);
	const [busy, setBusy] = useState(false);
	const [results, setResults] = useState<Result[]>([]);
	const [lastCode, setLastCode] = useState('');

	const total = participants.length;
	const checked = participants.filter((p) => p.checked_in_at).length;
	const push = (r: Result) => setResults((prev) => [r, ...prev].slice(0, 20));

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
			navigator.vibrate?.(row.already ? [80, 60, 80] : 120);
			if (!row.already) refresh();
		} catch (e) {
			push({ ok: false, msg: e instanceof Error ? e.message : 'Điểm danh thất bại' });
			navigator.vibrate?.([80, 60, 80]);
		} finally {
			setBusy(false);
		}
	};

	if (notFound)
		return (
			<div className={styles.page}>
				<p className={styles.empty}>Không tìm thấy hội nghị.</p>
				<Link to='/admin/quet-ve' className={styles.item}>
					← Chọn hội nghị khác
				</Link>
			</div>
		);

	const latest = results[0];
	return (
		<div className={styles.page}>
			<header className={styles.header}>
				<Link to='/admin/quet-ve' className={styles.back} aria-label='Chọn hội nghị khác'>
					<ChevLSvg />
				</Link>
				<div className={styles.headerText}>
					<div className={styles.title}>{seminar?.title ?? 'Đang tải…'}</div>
					{seminar && <div className={styles.sub}>{seminarWhen(seminar)}</div>}
				</div>
			</header>

			<section className={styles.counter} aria-live='polite'>
				<div className={styles.count}>
					<strong>{seminar ? checked : '—'}</strong>
					<span> / {seminar ? total : '—'}</span>
				</div>
				<div className={styles.countLabel}>đại biểu đã điểm danh · còn {seminar ? total - checked : '—'}</div>
				<div className={styles.bar}>
					<div className={styles.barFill} style={{ width: `${total ? (checked / total) * 100 : 0}%` }} />
				</div>
			</section>

			<QrScanner onScan={(t) => void handleScan(t)} paused={busy} />

			{latest && (
				<div
					className={`${styles.result} ${latest.ok && !latest.row.already ? styles.ok : styles.warn}`}
					aria-live='assertive'
				>
					{latest.ok && !latest.row.already ? <CheckSvg /> : <XSvg />}
					<div>
						{latest.ok ? (
							<>
								<strong>{holderOf(latest.row)}</strong>
								{latest.row.organization && <div>{latest.row.organization}</div>}
								<div>
									{latest.row.already
										? `Đã điểm danh trước đó lúc ${formatTimeVN(latest.row.checked_in_at)}`
										: 'Điểm danh thành công'}
								</div>
							</>
						) : (
							latest.msg
						)}
					</div>
				</div>
			)}

			{results.length > 1 && (
				<ul className={styles.history}>
					{results.slice(1).map((r, i) => (
						<li key={i} className={r.ok && !r.row.already ? styles.histOk : styles.histWarn}>
							{r.ok ? `${holderOf(r.row)}${r.row.already ? ' — đã điểm danh trước' : ''}` : r.msg}
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
