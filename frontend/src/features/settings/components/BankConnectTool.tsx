// Công cụ cuối nhóm "Kết nối ngân hàng" (Cấu hình hệ thống → Đào tạo): đường dẫn webhook để
// khai với ngân hàng, tình trạng nhận giao dịch, và thử đối soát 1 nội dung chuyển khoản
// (không ghi gì) — tất cả theo cấu hình ĐÃ LƯU.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../../shared/components';
import { notify } from '../../../shared/utils/feedback';
import { formatStamp } from '../../signing/utils/formatStamp';
import { bankReconcileApi } from '../../tuition/api/tuitionApi';
import type { BankPreview, BankStatus } from '../../tuition/types/bankReconcile.type';
import { formatVnd } from '../../tuition/types/tuition.type';
import styles from '../pages/SystemSettings.module.css';

const errText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

type Props = {
	/** Bộ kết nối ĐÃ LƯU (rỗng = đang tắt) */
	provider: string;
	/** URL gốc hệ thống (PUBLIC_BASE_URL) — rỗng thì lấy địa chỉ đang mở trang */
	baseUrl: string;
	dirty: boolean;
};

export function BankConnectTool({ provider, baseUrl, dirty }: Props) {
	const [conn, setConn] = useState<BankStatus | null>(null);
	const [content, setContent] = useState('');
	const [amount, setAmount] = useState('');
	const [checking, setChecking] = useState(false);
	const [result, setResult] = useState<BankPreview | null>(null);

	useEffect(() => {
		let alive = true;
		bankReconcileApi
			.status()
			.then((s) => alive && setConn(s))
			.catch(() => alive && setConn(null));
		return () => {
			alive = false;
		};
	}, [provider]);

	const url = `${(baseUrl.trim() || window.location.origin).replace(/\/+$/, '')}/api/v1/bank-webhooks/${provider || '<bo-ket-noi>'}`;

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(url);
			notify.success('Đã chép đường dẫn webhook');
		} catch {
			notify.error('Không chép được — bôi đen đường dẫn để chép tay');
		}
	};

	const check = async () => {
		const n = Number(amount.replace(/[.,\s]/g, ''));
		if (!Number.isInteger(n) || n <= 0) return notify.error('Nhập số tiền (đồng)');
		setChecking(true);
		try {
			setResult(await bankReconcileApi.preview(content, n));
		} catch (e) {
			notify.error(errText(e, 'Thử đối soát thất bại'));
		} finally {
			setChecking(false);
		}
	};

	const e = result?.enrollment;
	return (
		<>
			<div className={styles.toolRow}>
				<input className={styles.input} readOnly value={url} aria-label='Đường dẫn webhook' onFocus={(ev) => ev.target.select()} />
				<Button variant='secondary' onClick={copy} disabled={!provider}>
					Chép
				</Button>
				<span className={dirty || !provider ? styles.toolHint : styles.toolNote}>
					{dirty
						? 'Lưu thay đổi trước khi khai với ngân hàng'
						: !provider
							? 'Đang tắt — chọn bộ kết nối, đặt khóa bí mật và lưu để bắt đầu nhận giao dịch.'
							: conn?.last_received_at
								? `Nhận gần nhất ${formatStamp(conn.last_received_at)}`
								: 'Chưa nhận giao dịch nào.'}
					{conn && conn.unmatched > 0 && (
						<>
							{' · '}
							<Link to='/admin/doi-soat-ngan-hang'>{conn.unmatched} giao dịch chờ xử lý</Link>
						</>
					)}
				</span>
			</div>
			<div className={styles.toolRow}>
				<input
					className={styles.input}
					aria-label='Nội dung chuyển khoản thử'
					placeholder='Nội dung, vd: HP DK202611050001'
					value={content}
					maxLength={500}
					onChange={(ev) => setContent(ev.target.value)}
				/>
				<input
					className={styles.input}
					style={{ maxWidth: 160, minWidth: 120 }}
					inputMode='numeric'
					aria-label='Số tiền thử (đồng)'
					placeholder='Số tiền'
					value={amount}
					onChange={(ev) => setAmount(ev.target.value)}
					onKeyDown={(ev) => ev.key === 'Enter' && void check()}
				/>
				<Button variant='secondary' loading={checking} disabled={!content.trim() || !amount.trim()} onClick={check}>
					Thử đối soát
				</Button>
				<span className={styles.toolNote}>Chỉ xem kết quả, không ghi nhận tiền.</span>
			</div>
			{result && (
				<div className={styles.toolRow} role='status'>
					<span className={result.action === 'apply' ? styles.toolNote : styles.toolHint}>
						{result.action === 'apply' ? 'Sẽ tự ghi nhận' : `Vào hàng chờ: ${result.reason_text}`}
						{e
							? ` — ${e.trainee_name} (${e.enrollment_id}), ${e.course_name}: phải nộp ${formatVnd(e.due)}, đã nộp ${formatVnd(e.paid)}, còn ${formatVnd(e.remaining)}.`
							: result.codes.length
								? ` — mã dò được: ${result.codes.join(', ')}.`
								: '.'}
					</span>
				</div>
			)}
		</>
	);
}
