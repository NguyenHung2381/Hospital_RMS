import { useCallback, useRef, useState } from 'react';
import { AlertSvg, DownloadSvg, EyeSvg } from '@/assets/icons';
import { downloadRegistrationApplication, type RegistrationProof } from '../api/publicApi';
import { ApplicationPreview } from './ApplicationPreview';
import s from '../pages/CourseRegisterPublic.module.css';

interface Props {
	code: string;
	/** Yếu tố xác thực của đơn (download_token hoặc CCCD) — đi trong body POST */
	proof: RegistrationProof;
}

// Tải đơn đăng ký (.docx) và xem trước / in. Dùng ở màn "đăng ký thành công" và màn tra cứu.
export function ApplicationActions({ code, proof }: Props) {
	const [busy, setBusy] = useState<'download' | 'preview' | null>(null);
	const [error, setError] = useState('');
	const [preview, setPreview] = useState<Blob | null>(null);
	// Đơn là dữ liệu của chính người này; lấy 1 lần dùng cho cả tải và xem trước
	const cache = useRef<Blob | null>(null);
	const closePreview = useCallback(() => setPreview(null), []);

	const load = async () => {
		if (cache.current) return cache.current;
		const blob = await downloadRegistrationApplication(code, proof);
		cache.current = blob;
		return blob;
	};

	const run = async (kind: 'download' | 'preview') => {
		setBusy(kind);
		setError('');
		try {
			const blob = await load();
			if (kind === 'preview') {
				setPreview(blob);
				return;
			}
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
			setBusy(null);
		}
	};

	return (
		<div className={s.appActions}>
			<div className={s.appButtons}>
				<button
					type='button'
					className={s.submitBtn}
					onClick={() => run('download')}
					disabled={busy !== null}
				>
					<DownloadSvg />
					{busy === 'download' ? 'Đang tải...' : 'Tải đơn đăng ký (.docx)'}
				</button>
				<button
					type='button'
					className={s.ghostBtn}
					onClick={() => run('preview')}
					disabled={busy !== null}
				>
					<EyeSvg />
					{busy === 'preview' ? 'Đang mở...' : 'Xem trước / In'}
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
			{preview && (
				<ApplicationPreview
					blob={preview}
					title={`Đơn đăng ký ${code}`}
					onClose={closePreview}
				/>
			)}
		</div>
	);
}
