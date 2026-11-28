import { Modal, ModalActions } from '@/shared/components';
import { useEffect, useRef, useState } from 'react';
import styles from './SignatureImage.module.css';

const W = 640;
const H = 240;

/**
 * Vẽ chữ ký bằng chuột / bút cảm ứng / ngón tay. Trả PNG nền trong suốt (data URL);
 * server còn cắt sát nét và chuẩn hóa lại.
 */
export function SignaturePadModal({
	loading,
	onClose,
	onSave,
}: {
	loading: boolean;
	onClose: () => void;
	onSave: (dataUrl: string) => void;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const drawing = useRef(false);
	const last = useRef<{ x: number; y: number } | null>(null);
	const [empty, setEmpty] = useState(true);

	useEffect(() => {
		const c = canvasRef.current;
		if (!c) return;
		// Vẽ ở độ phân giải gấp đôi cho nét mịn
		c.width = W * 2;
		c.height = H * 2;
		const g = c.getContext('2d');
		if (!g) return;
		g.scale(2, 2);
		g.lineCap = 'round';
		g.lineJoin = 'round';
		g.strokeStyle = '#13235b';
		g.lineWidth = 3;
	}, []);

	const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
		const r = e.currentTarget.getBoundingClientRect();
		return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
	};

	const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
		e.currentTarget.setPointerCapture(e.pointerId);
		drawing.current = true;
		last.current = pos(e);
		const g = canvasRef.current?.getContext('2d');
		if (!g) return;
		// Chấm (bấm không kéo) cũng thành nét
		g.beginPath();
		g.arc(last.current.x, last.current.y, 1.5, 0, Math.PI * 2);
		g.fillStyle = '#13235b';
		g.fill();
		setEmpty(false);
	};

	const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
		if (!drawing.current || !last.current) return;
		const g = canvasRef.current?.getContext('2d');
		if (!g) return;
		const p = pos(e);
		// Bút cảm ứng: nét dày theo lực nhấn
		g.lineWidth = e.pointerType === 'pen' && e.pressure ? 1.5 + e.pressure * 3 : 3;
		g.beginPath();
		g.moveTo(last.current.x, last.current.y);
		g.lineTo(p.x, p.y);
		g.stroke();
		last.current = p;
	};

	const up = () => {
		drawing.current = false;
		last.current = null;
	};

	const clear = () => {
		const c = canvasRef.current;
		c?.getContext('2d')?.clearRect(0, 0, W, H);
		setEmpty(true);
	};

	return (
		<Modal
			open
			dirty={!empty}
			onClose={onClose}
			title='Vẽ chữ ký'
			subtitle='Ký bằng chuột, bút cảm ứng hoặc ngón tay trong khung bên dưới'
			size='lg'
			footer={
				<>
					<button
						type='button'
						className={styles.textBtn}
						onClick={clear}
						disabled={empty || loading}
					>
						Vẽ lại
					</button>
					<ModalActions
						onCancel={onClose}
						onConfirm={() => canvasRef.current && onSave(canvasRef.current.toDataURL('image/png'))}
						loading={loading}
						disabled={empty}
						confirmLabel='Dùng chữ ký này'
					/>
				</>
			}
		>
			<div className={styles.padWrap}>
				<canvas
					ref={canvasRef}
					className={styles.pad}
					style={{ aspectRatio: `${W} / ${H}` }}
					onPointerDown={down}
					onPointerMove={move}
					onPointerUp={up}
					onPointerCancel={up}
					aria-label='Khung vẽ chữ ký'
				/>
				<span
					className={styles.padLine}
					aria-hidden
				/>
				{empty && <span className={styles.padHint}>Ký vào đây</span>}
			</div>
		</Modal>
	);
}
