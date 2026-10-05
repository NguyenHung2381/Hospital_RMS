// Lưu mã QR (antd <QRCode type='canvas'> nằm trong `container`) thành ảnh PNG
// kèm vài dòng chữ bên dưới (tên hội nghị, họ tên...) — để in/gắn vào văn bản
// hoặc giữ trong máy làm vé.
export function downloadQrPng(container: HTMLElement | null, lines: string[], filename: string) {
	const qr = container?.querySelector('canvas');
	if (!qr) return false;
	const W = 600;
	const PAD = 40;
	// Phóng to theo bội số nguyên của canvas gốc — tỉ lệ lẻ làm ô QR méo, khó quét
	const QR = qr.width * Math.max(1, Math.floor((W - PAD * 2) / qr.width));
	const LINE = 30;
	const canvas = document.createElement('canvas');
	const ctx = canvas.getContext('2d');
	if (!ctx) return false;

	// Ngắt dòng theo độ rộng ảnh (dòng đầu in đậm)
	const wrapped = lines.flatMap((text, i) => {
		ctx.font = `${i === 0 ? 'bold ' : ''}22px Arial, sans-serif`;
		const out: string[] = [];
		let cur = '';
		for (const word of text.split(/\s+/)) {
			const next = cur ? `${cur} ${word}` : word;
			if (cur && ctx.measureText(next).width > W - PAD * 2) {
				out.push(cur);
				cur = word;
			} else cur = next;
		}
		if (cur) out.push(cur);
		return out.map((t) => ({ t, bold: i === 0 }));
	});

	canvas.width = W;
	canvas.height = PAD + QR + 16 + wrapped.length * LINE + PAD;
	ctx.fillStyle = '#fff';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.imageSmoothingEnabled = false;
	ctx.drawImage(qr, (W - QR) / 2, PAD, QR, QR);
	ctx.fillStyle = '#111';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'top';
	wrapped.forEach(({ t, bold }, i) => {
		ctx.font = `${bold ? 'bold ' : ''}22px Arial, sans-serif`;
		ctx.fillText(t, W / 2, PAD + QR + 16 + i * LINE);
	});

	const a = document.createElement('a');
	a.href = canvas.toDataURL('image/png');
	a.download = filename.endsWith('.png') ? filename : `${filename}.png`;
	document.body.appendChild(a);
	a.click();
	a.remove();
	return true;
}
