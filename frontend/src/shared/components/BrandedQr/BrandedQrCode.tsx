import { useEffect, useRef } from 'react';
import { drawQrCode, encodeQr, loadLogo } from './renderBrandedQr';

const QUIET = 2; // vùng trắng quanh mã (ô) — khung trắng bên ngoài đã đủ rộng

// QR hiển thị trên màn hình — vẽ bằng cùng hàm với ảnh tải về (ô bo mềm, logo tròn).
// Không dùng antd <QRCode>: nó chỉ đặt được logo vuông.
export function BrandedQrCode({ value, size = 240 }: { value: string; size?: number }) {
	const ref = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		let alive = true;
		void loadLogo().then((logo) => {
			const canvas = ref.current;
			const ctx = canvas?.getContext('2d');
			if (!alive || !canvas || !ctx) return;
			const qr = encodeQr(value);
			const dpr = window.devicePixelRatio || 1;
			// Ô nguyên pixel vật lý để cạnh ô sắc nét
			const cell = Math.max(1, Math.floor((size * dpr) / (qr.size + QUIET * 2)));
			const px = cell * (qr.size + QUIET * 2);
			canvas.width = px;
			canvas.height = px;
			canvas.style.width = `${px / dpr}px`;
			canvas.style.height = `${px / dpr}px`;
			ctx.fillStyle = '#fff';
			ctx.fillRect(0, 0, px, px);
			drawQrCode(ctx, qr, QUIET * cell, QUIET * cell, cell, logo);
		});
		return () => {
			alive = false;
		};
	}, [value, size]);

	return (
		<canvas
			ref={ref}
			role='img'
			aria-label='Mã QR'
			style={{ display: 'block', borderRadius: 12 }}
		/>
	);
}
