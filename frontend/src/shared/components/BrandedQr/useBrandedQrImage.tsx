import { useCallback, useEffect, useState } from 'react';
import { renderBrandedQr, renderPlainQr, type BrandedQrOptions } from './renderBrandedQr';
import styles from './BrandedQr.module.css';

// iPadOS 13+ báo là "MacIntel" nhưng có cảm ứng
export const isIOS = () =>
	/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

type Image = { key: string; file: File; dataUrl: string };

/** `plain`: chỉ mã QR (không header, khung, chữ) */
export type QrImageOptions = (BrandedQrOptions | { value: string; plain: true }) & { filename: string };

// Bỏ ký tự Windows/macOS cấm trong tên file, giữ tiếng Việt có dấu
const safeFilename = (name: string) =>
	name
		.replace(/[\\/:*?"<>|]|\p{Cc}/gu, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/[. ]+$/, '')
		.slice(0, 180) || 'ma-qr';

/**
 * Dựng sẵn ảnh QR thương hiệu và trả về hàm `save()` lưu ảnh về máy.
 * - Android/desktop: tải file PNG như bình thường.
 * - iOS: Safari bỏ qua thuộc tính `download` (nhất là trong Zalo/Facebook), nên
 *   mở bảng chia sẻ (có "Lưu hình ảnh"); không chia sẻ được thì hiện ảnh để
 *   người dùng nhấn giữ → "Lưu vào Ảnh".
 * Ảnh được dựng trước khi bấm vì iOS chỉ cho gọi navigator.share() ngay trong
 * thao tác của người dùng — chờ vẽ xong mới gọi sẽ bị chặn.
 */
export function useBrandedQrImage(options: QrImageOptions | null) {
	const [rendered, setRendered] = useState<Image | null>(null);
	const [sheetOpen, setSheetOpen] = useState(false);
	const key = options ? JSON.stringify(options) : '';
	// Ảnh của nội dung cũ (đổi value/title) coi như chưa sẵn sàng
	const image = rendered?.key === key ? rendered : null;

	useEffect(() => {
		if (!key) return;
		const { filename, ...opts } = JSON.parse(key) as QrImageOptions;
		let alive = true;
		void ('plain' in opts ? renderPlainQr(opts.value) : renderBrandedQr(opts))
			.then(
				(canvas) =>
					new Promise<Image>((resolve, reject) =>
						canvas.toBlob((blob) => {
							if (!blob) return reject(new Error('Không tạo được ảnh QR'));
							const name = `${safeFilename(filename.replace(/\.png$/i, ''))}.png`;
							resolve({ key, file: new File([blob], name, { type: 'image/png' }), dataUrl: canvas.toDataURL('image/png') });
						}, 'image/png'),
					),
			)
			.then((img) => alive && setRendered(img))
			.catch((e) => console.error(e));
		return () => {
			alive = false;
		};
	}, [key]);

	/** `auto`: gọi không qua thao tác bấm (vd ngay sau khi đăng ký) — iOS chỉ hiện ảnh để nhấn giữ */
	const save = useCallback(
		(auto = false) => {
			if (!image) return false;
			if (isIOS()) {
				const data = { files: [image.file] };
				if (!auto && navigator.canShare?.(data)) {
					navigator.share(data).catch((e: unknown) => {
						if ((e as Error)?.name !== 'AbortError') setSheetOpen(true);
					});
				} else setSheetOpen(true);
				return true;
			}
			const url = URL.createObjectURL(image.file);
			const a = document.createElement('a');
			a.href = url;
			a.download = image.file.name;
			document.body.appendChild(a);
			a.click();
			a.remove();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
			return true;
		},
		[image],
	);

	const sheet =
		sheetOpen && image ? (
			<div
				className={styles.backdrop}
				onClick={(e) => e.target === e.currentTarget && setSheetOpen(false)}
			>
				<div className={styles.sheet}>
					<div className={styles.hint}>
						Nhấn giữ vào ảnh rồi chọn <b>“Lưu vào Ảnh”</b> (hoặc chụp màn hình)
					</div>
					<img
						src={image.dataUrl}
						alt='Mã QR'
						className={styles.image}
					/>
					<button
						type='button'
						className={styles.close}
						onClick={() => setSheetOpen(false)}
					>
						Đóng
					</button>
				</div>
			</div>
		) : null;

	return { ready: !!image, save, sheet };
}
