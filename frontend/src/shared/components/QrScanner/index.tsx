import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { CameraSvg, ImageSvg, QrSvg, WarnSvg } from '@/assets/icons';
import { canUseLiveCamera, decodeImageFile } from './qrImage';
import styles from './QrScanner.module.css';

/** html5-qrcode yêu cầu mỗi #id chỉ được dùng bởi 1 instance tại 1 thời điểm —
 * tự sinh id ngẫu nhiên mỗi lần mount để 2 màn hình dùng component này cùng
 * lúc không đụng nhau. */
let seq = 0;

interface QrScannerProps {
	onScan: (decodedText: string) => void;
	/** Tạm dừng nhận diện (vd: đang gọi API xử lý kết quả quét trước đó). */
	paused?: boolean;
}

type CamState = 'idle' | 'starting' | 'scanning';

function describeCameraError(err: unknown): string {
	const name = (err as { name?: string })?.name ?? '';
	const msg = String((err as { message?: string })?.message ?? err ?? '');
	if (name === 'NotAllowedError' || /permission|denied/i.test(msg))
		return 'Bạn đã từ chối quyền camera. Hãy cho phép camera cho trang này trong cài đặt trình duyệt, hoặc dùng "Chụp ảnh mã QR" bên dưới.';
	if (name === 'NotFoundError' || /not ?found|no camera/i.test(msg))
		return 'Không tìm thấy camera trên thiết bị này.';
	if (name === 'NotReadableError' || /in use|could not start/i.test(msg))
		return 'Camera đang được ứng dụng khác sử dụng. Hãy đóng ứng dụng đó rồi thử lại.';
	return 'Không mở được camera. Hãy thử lại hoặc dùng "Chụp ảnh mã QR" bên dưới.';
}

export function QrScanner({ onScan, paused }: QrScannerProps) {
	const [elId] = useState(() => `qr-scanner-${seq++}`);
	const [camState, setCamState] = useState<CamState>('idle');
	const [error, setError] = useState<string | null>(null);
	const [fileBusy, setFileBusy] = useState(false);
	const scannerRef = useRef<Html5Qrcode | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const onScanRef = useRef(onScan);
	const pausedRef = useRef(paused);

	useEffect(() => {
		onScanRef.current = onScan;
		pausedRef.current = paused;
	});

	useEffect(() => {
		const scanner = new Html5Qrcode(elId, {
			verbose: false,
			// Chỉ tìm QR — bỏ qua các loại mã vạch khác cho nhanh và ít nhận nhầm.
			formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
		});
		scannerRef.current = scanner;
		return () => {
			scannerRef.current = null;
			if (scanner.isScanning) scanner.stop().then(() => scanner.clear()).catch(() => {});
		};
	}, [elId]);

	const startCamera = async () => {
		const scanner = scannerRef.current;
		if (!scanner) return;
		setError(null);
		// Khung video phải hiện (có kích thước) TRƯỚC khi start(): thư viện đo clientWidth
		// lúc tạo <video> và lúc sự kiện 'playing' để tính vùng quét. Safari bắn 'playing'
		// sớm — nếu khung còn display:none thì vùng quét = 0×0 và không bao giờ nhận mã.
		flushSync(() => setCamState('starting'));
		try {
			await scanner.start(
				{ facingMode: 'environment' },
				// Camera sau không bị lật gương — bỏ lượt giải mã ảnh lật cho nhanh gấp đôi.
				{ fps: 10, qrbox: { width: 240, height: 240 }, disableFlip: true },
				(decodedText) => {
					if (!pausedRef.current) onScanRef.current(decodedText);
				},
				() => {
					// Không tìm thấy mã trong khung hình hiện tại — bình thường, bỏ qua.
				},
			);
			setCamState('scanning');
		} catch (err) {
			setCamState('idle');
			setError(describeCameraError(err));
		}
	};

	const stopCamera = async () => {
		const scanner = scannerRef.current;
		if (scanner?.isScanning) await scanner.stop().catch(() => {});
		setCamState('idle');
	};

	const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		e.target.value = ''; // cho phép chọn lại cùng 1 ảnh
		const scanner = scannerRef.current;
		if (!file || !scanner) return;
		setError(null);
		setFileBusy(true);
		try {
			if (scanner.isScanning) await stopCamera();
			const text = await decodeImageFile(scanner, file);
			if (!pausedRef.current) onScanRef.current(text);
		} catch {
			setError('Không nhận diện được mã QR trong ảnh. Hãy chụp lại sao cho mã QR chiếm phần lớn khung hình, giữ máy thẳng và tránh bị lóa sáng.');
		} finally {
			setFileBusy(false);
		}
	};

	const scanning = camState === 'scanning';

	return (
		<div className={styles.wrap}>
			{/* Vùng html5-qrcode gắn <video> vào — luôn tồn tại trong DOM, chỉ ẩn khi camera tắt. */}
			<div
				id={elId}
				className={camState === 'idle' ? styles.viewportHidden : styles.viewport}
			/>

			{camState === 'idle' && (
				<div className={styles.placeholder}>
					<span className={styles.placeholderIcon}>
						<QrSvg />
					</span>
					<p className={styles.placeholderText}>
						{canUseLiveCamera
							? 'Bật camera và hướng vào mã QR trên màn hình lớp học / hội trường'
							: 'Chụp ảnh mã QR trên màn hình lớp học / hội trường để điểm danh'}
					</p>
				</div>
			)}

			{!canUseLiveCamera && (
				<div className={styles.notice}>
					<WarnSvg className={styles.noticeIcon} />
					<span>
						Kết nối hiện tại chưa bảo mật (không phải HTTPS) nên trình duyệt không cho quét trực tiếp
						bằng camera. Bạn vẫn điểm danh được bằng cách <b>chụp ảnh mã QR</b>.
					</span>
				</div>
			)}

			{error && (
				<div className={styles.error}>
					<WarnSvg className={styles.noticeIcon} />
					<span>{error}</span>
				</div>
			)}

			<div className={styles.actions}>
				{canUseLiveCamera &&
					(scanning ? (
						<button type='button' className={styles.btnSecondary} onClick={stopCamera}>
							Tắt camera
						</button>
					) : (
						<button
							type='button'
							className={styles.btnPrimary}
							onClick={startCamera}
							disabled={camState === 'starting'}
						>
							<CameraSvg />
							{camState === 'starting' ? 'Đang mở camera…' : 'Bật camera để quét'}
						</button>
					))}

				<button
					type='button'
					className={canUseLiveCamera ? styles.btnSecondary : styles.btnPrimary}
					onClick={() => fileInputRef.current?.click()}
					disabled={fileBusy || paused}
				>
					{canUseLiveCamera ? <ImageSvg /> : <CameraSvg />}
					{fileBusy ? 'Đang đọc ảnh…' : canUseLiveCamera ? 'Chọn ảnh mã QR' : 'Chụp ảnh mã QR'}
				</button>
				<input
					ref={fileInputRef}
					type='file'
					accept='image/*'
					// Không secure context → mở thẳng camera của máy để chụp.
					capture={canUseLiveCamera ? undefined : 'environment'}
					className={styles.fileInput}
					onChange={handleFile}
				/>
			</div>
		</div>
	);
}
