import { useRef, useState } from 'react';
import { AlertSvg, DownloadSvg } from '@/assets/icons';
import { downloadRegistrationApplication, type RegistrationProof } from '../api/publicApi';
import s from '../pages/CourseRegisterPublic.module.css';

interface Props {
	code: string;
	/** Yếu tố xác thực của đơn (download_token hoặc CCCD) — đi trong body POST */
	proof: RegistrationProof;
}

// Tải đơn đăng ký (.docx). Dùng ở màn "đăng ký thành công" và màn tra cứu.
export function ApplicationActions({ code, proof }: Props) {
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	// Đơn là dữ liệu của chính người này; lấy 1 lần, bấm tải lại không gọi API nữa
	const cache = useRef<Blob | null>(null);

	const download = async () => {
		setBusy(true);
		setError('');
		try {
			const blob = cache.current ?? (await downloadRegistrationApplication(code, proof));
			cache.current = blob;
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `Don-dang-ky-${code}.docx`;
			document.body.appendChild(a);
			a.click();
			a.remove();
			window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Không lấy được đơn, vui lòng thử lại');
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className={s.appActions}>
			<div className={s.appButtons}>
				<button
					type='button'
					className={s.submitBtn}
					onClick={download}
					disabled={busy}
				>
					<DownloadSvg />
					{busy ? 'Đang tải...' : 'Tải đơn đăng ký (.docx)'}
				</button>
			</div>
			{error && (
				<div
					className={s.serverError}
					role='alert'
				>
					<AlertSvg /> {error}
				</div>
			)}
		</div>
	);
}
