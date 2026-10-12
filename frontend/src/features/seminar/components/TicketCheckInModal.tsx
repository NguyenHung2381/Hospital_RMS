import { Modal } from '@/shared/components';
import { useState } from 'react';
import { QrScanner } from '@/shared/components/QrScanner';
import { checkInTicket, type TicketCheckIn } from '../api/seminarApi';
import styles from '../pages/Seminar.module.css';

type Result = { ok: true; row: TicketCheckIn } | { ok: false; msg: string };

// Vé QR chứa link .../hoi-nghi/ve/<32 hex> — lấy mã ở cuối link.
const codeOf = (text: string) => text.trim().match(/([a-f0-9]{32})\/?$/i)?.[1]?.toLowerCase() ?? null;

// Ban tổ chức quét vé QR cá nhân của người tham dự (đăng ký qua link công khai).
export function TicketCheckInModal({ seminarId, onClose }: { seminarId: string; onClose: () => void }) {
	const [busy, setBusy] = useState(false);
	const [results, setResults] = useState<Result[]>([]);
	const [lastCode, setLastCode] = useState('');

	const handleScan = async (text: string) => {
		const code = codeOf(text);
		// Camera đọc liên tục cùng 1 mã — bỏ qua mã vừa quét
		if (busy || (code && code === lastCode)) return;
		setLastCode(code ?? text);
		if (!code) {
			setResults((r) => [{ ok: false as const, msg: 'Mã QR không phải vé hội nghị.' }, ...r].slice(0, 20));
			return;
		}
		setBusy(true);
		try {
			const row = await checkInTicket(seminarId, code);
			setResults((r) => [{ ok: true as const, row }, ...r].slice(0, 20));
		} catch (e) {
			const msg = e instanceof Error ? e.message : 'Điểm danh thất bại';
			setResults((r) => [{ ok: false as const, msg }, ...r].slice(0, 20));
		} finally {
			setBusy(false);
		}
	};

	return (
		<Modal
			open
			onClose={onClose}
			title='Quét vé điểm danh'
			subtitle='Quét mã QR cá nhân người tham dự đưa ra'
			className={`${styles.modal} ${styles.modalSm}`}
			bodyClassName={styles.modalBody}
		>
			<QrScanner
				onScan={(t) => void handleScan(t)}
				paused={busy}
			/>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
				{results.map((r, i) =>
					r.ok ? (
						<div
							key={i}
							className={`${styles.noticeBox} ${r.row.already ? styles.noticeWarn : styles.noticeOk}`}
						>
							<strong>
								{r.row.title_prefix ? `${r.row.title_prefix} ` : ''}
								{r.row.full_name}
							</strong>
							{r.row.organization ? ` · ${r.row.organization}` : ''} —{' '}
							{r.row.already
								? `đã điểm danh trước đó (${new Date(r.row.checked_in_at).toLocaleTimeString('vi-VN')})`
								: 'điểm danh thành công'}
						</div>
					) : (
						<div
							key={i}
							className={`${styles.noticeBox} ${styles.noticeWarn}`}
						>
							{r.msg}
						</div>
					),
				)}
			</div>
		</Modal>
	);
}
