import type { Html5Qrcode } from 'html5-qrcode';

// Tiện ích dùng chung cho các màn hình quét QR (QrScanner, trang quét vé hội thảo).

/** Trình duyệt chỉ cho getUserMedia trên HTTPS hoặc localhost. Truy cập qua IP LAN
 * (http://192.168.x.x) thì camera trực tiếp bị chặn — khi đó vẫn quét được bằng
 * cách chụp ảnh / chọn ảnh (input file không cần secure context). */
export const canUseLiveCamera =
	typeof window !== 'undefined' &&
	window.isSecureContext &&
	!!navigator.mediaDevices?.getUserMedia;

function loadImage(file: File): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const url = URL.createObjectURL(file);
		const img = new Image();
		img.onload = () => {
			URL.revokeObjectURL(url);
			resolve(img);
		};
		img.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error('Không đọc được ảnh'));
		};
		img.src = url;
	});
}

/** Vẽ lại (một vùng của) ảnh ở cạnh dài `maxSide` px thành File mới để đưa vào scanFile. */
function resample(
	img: HTMLImageElement,
	maxSide: number,
	crop: number, // tỉ lệ vùng giữa ảnh giữ lại (1 = cả ảnh)
): Promise<File | null> {
	const sw = img.naturalWidth * crop;
	const sh = img.naturalHeight * crop;
	const sx = (img.naturalWidth - sw) / 2;
	const sy = (img.naturalHeight - sh) / 2;
	const scale = Math.min(1, maxSide / Math.max(sw, sh));
	const canvas = document.createElement('canvas');
	canvas.width = Math.round(sw * scale);
	canvas.height = Math.round(sh * scale);
	const ctx = canvas.getContext('2d');
	if (!ctx) return Promise.resolve(null);
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
	return new Promise((resolve) =>
		canvas.toBlob(
			(blob) => resolve(blob ? new File([blob], 'qr.jpg', { type: 'image/jpeg' }) : null),
			'image/jpeg',
			0.95,
		),
	);
}

/** Ảnh chụp từ điện thoại (~4000px, chụp màn hình có moire/lóa) mà đưa nguyên cỡ vào
 * ZXing thì rất hay trượt. Thử lần lượt vài cỡ vừa phải + cắt vùng giữa (mã QR thường
 * nằm giữa khung), cuối cùng mới thử ảnh gốc. */
export async function decodeImageFile(scanner: Html5Qrcode, file: File): Promise<string> {
	let img: HTMLImageElement | null = null;
	try {
		img = await loadImage(file);
	} catch {
		// Trình duyệt không vẽ được ảnh này (vd HEIC) — chỉ còn cách thử ảnh gốc.
	}
	if (img) {
		const attempts: [number, number][] = [
			[1200, 1],
			[1200, 0.6],
			[1800, 1],
			[800, 1],
			[1600, 0.45],
			[800, 0.6],
		];
		for (const [maxSide, crop] of attempts) {
			const f = await resample(img, maxSide, crop);
			if (!f) continue;
			try {
				return await scanner.scanFile(f, false);
			} catch {
				// thử cỡ tiếp theo
			}
		}
	}
	return scanner.scanFile(file, false);
}
