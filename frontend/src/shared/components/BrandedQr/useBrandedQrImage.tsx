import { useCallback, useEffect, useState } from 'react';
import { renderBrandedQr, renderPlainQr, type BrandedQrOptions } from './renderBrandedQr';
import styles from './BrandedQr.module.css';

// iPadOS 13+ báo là "MacIntel" nhưng có cảm ứng
export const isIOS = () =>
	/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// Trình duyệt nhúng trong app (Zalo, Facebook/Messenger, Instagram, TikTok, LINE, WeChat)
// và WebView Android ("; wv)"): link tải blob thường bị nuốt im lặng.
export const isInAppBrowser = () =>
	/Zalo|FBAN|FBAV|FB_IAB|Instagram|TikTok|musical_ly|Line\/|MicroMessenger|; wv\)/i.test(navigator.userAgent);

type Image = { key: string; file: File; dataUrl: string };

// Tải file bằng <a download> (Android / máy tính)
const downloadFile = (file: File) => {
	const url = URL.createObjectURL(file);
	const a = document.createElement('a');
	a.href = url;
	a.download = file.name;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

// Mở link http trả `Content-Disposition: attachment`: WebView Android (Zalo, Facebook...)
// giao link cho trình tải xuống của máy và vẫn ở lại trang hiện tại
const openDownloadLink = (href: string) => {
	const a = document.createElement('a');
	a.href = href;
	document.body.appendChild(a);
	a.click();
	a.remove();
};

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
 * - Android/desktop: tải file PNG như bình thường (kể cả tự tải sau khi đăng ký).
 * - iOS: web KHÔNG ghi thẳng vào app Ảnh được — chỉ qua bảng chia sẻ ("Lưu hình ảnh")
 *   hoặc nhấn giữ ảnh. Bấm "Tải" hoặc tự lưu ⇒ mở bảng chia sẻ; tự lưu mà Safari chặn
 *   (NotAllowedError: đã quá lâu từ lúc bấm "Đăng ký") ⇒ hiện ảnh có nút "Lưu vào Ảnh".
 * - Trình duyệt trong Zalo/Facebook...: không tải blob được ⇒ Android tải qua link http
 *   `downloadUrl` (nếu có, server trả ảnh dạng attachment), luôn kèm hiện ảnh để nhấn giữ.
 * Ảnh được dựng trước khi bấm vì iOS chỉ cho gọi navigator.share() ngay trong
 * thao tác của người dùng — chờ vẽ xong mới gọi sẽ bị chặn.
 */
export function useBrandedQrImage(options: QrImageOptions | null, { downloadUrl }: { downloadUrl?: string } = {}) {
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

	// Bảng chia sẻ của hệ điều hành (iOS: "Lưu hình ảnh" ⇒ vào app Ảnh). Cần thao tác bấm còn
	// hiệu lực; `auto`: thử ngay sau khi đăng ký, bị chặn / bấm hủy thì hiện ảnh có nút lưu.
	const canShare = !!image && !!navigator.canShare?.({ files: [image.file] });
	const share = useCallback(
		(auto = false) => {
			if (!image) return;
			navigator.share({ files: [image.file] }).then(
				() => setSheetOpen(false),
				(e: unknown) => {
					if (auto || (e as Error)?.name !== 'AbortError') setSheetOpen(true);
				},
			);
		},
		[image],
	);

	// Đã gửi lệnh tải file nhưng vẫn hiện ảnh (Zalo/Facebook trên Android) — bảng ảnh nói file nằm đâu
	const [downloadedTo, setDownloadedTo] = useState<string | null>(null);

	/**
	 * `auto`: gọi không qua thao tác bấm (vd ngay sau khi đăng ký).
	 * Trả 'download' (đã gửi lệnh tải file), 'sheet' (hiện ảnh/bảng chia sẻ) hoặc false (ảnh chưa dựng xong).
	 */
	const save = useCallback(
		(auto = false): 'download' | 'sheet' | false => {
			if (!image) return false;
			// Trình duyệt trong Zalo/Facebook...: không tải được blob. Android: tải qua link http của
			// server; iOS (WKWebView mở link ảnh sẽ rời trang vé) ⇒ chỉ hiện ảnh để nhấn giữ
			if (isInAppBrowser()) {
				const viaLink = !!downloadUrl && !isIOS();
				if (viaLink) {
					openDownloadLink(downloadUrl);
					setDownloadedTo('thư mục Tải xuống (xem thông báo tải xuống)');
				}
				setSheetOpen(true);
				return viaLink ? 'download' : 'sheet';
			}
			// iOS: lưu vào app Ảnh qua bảng chia sẻ (không tải vào Tệp); iOS < 15 không chia sẻ được file ⇒ nhấn giữ
			if (isIOS()) {
				if (navigator.canShare?.({ files: [image.file] })) share(auto);
				else setSheetOpen(true);
				return 'sheet';
			}
			downloadFile(image.file);
			return 'download';
		},
		[image, share, downloadUrl],
	);

	const sheet =
		sheetOpen && image ? (
			<div
				className={styles.backdrop}
				onClick={(e) => e.target === e.currentTarget && setSheetOpen(false)}
			>
				<div className={styles.sheet}>
					<div className={styles.hint}>
						{downloadedTo && (
							<>
								Mã QR đã được tải vào <b>{downloadedTo}</b>.
								<br />
								{isIOS() ? 'Muốn có trong ứng dụng Ảnh' : 'Không thấy file'}:{' '}
							</>
						)}
						{canShare ? (
							<>
								Bấm <b>“Lưu vào Ảnh”</b> rồi chọn <b>“Lưu hình ảnh”</b> — hoặc nhấn giữ vào ảnh
							</>
						) : (
							<>
								Nhấn giữ vào ảnh rồi chọn <b>{isIOS() ? '“Lưu vào Ảnh”' : '“Tải hình ảnh xuống”'}</b> (hoặc chụp
								màn hình)
							</>
						)}
					</div>
					<img
						src={image.dataUrl}
						alt='Mã QR'
						className={styles.image}
					/>
					<div className={styles.actions}>
						{canShare && (
							<button
								type='button'
								className={styles.close}
								onClick={() => share()}
							>
								Lưu vào Ảnh
							</button>
						)}
						<button
							type='button'
							className={canShare ? styles.secondary : styles.close}
							onClick={() => setSheetOpen(false)}
						>
							Đóng
						</button>
					</div>
				</div>
			</div>
		) : null;

	return { ready: !!image, save, sheet };
}
