import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { CameraSvg, ImageSvg, LockSvg, QrSvg, RefreshSvg, WarnSvg, XSvg } from '@/assets/icons';
import { canUseLiveCamera, decodeImageFile } from '@/shared/components/QrScanner/qrImage';
import { primeAudio, type ScanTone } from './feedback';
import styles from './TicketCamera.module.css';

/** Khung camera toàn khối cho trang quét vé: lấp đầy vùng chứa (object-fit: cover),
 * khung ngắm vẽ bằng CSS, nút đổi camera trước/sau, và màn báo lỗi rõ ràng khi không có
 * camera / bị từ chối quyền. Tách riêng khỏi `shared/components/QrScanner` (dạng thẻ,
 * dùng cho điểm danh lớp học) vì bố cục khác hẳn. */

let seq = 0;

type Phase = 'idle' | 'starting' | 'scanning' | 'error';
type ErrKind = 'denied' | 'notfound' | 'busy' | 'other';
type Facing = 'environment' | 'user';

const FACING_KEY = 'ticketScan.facing';
// Cạnh khung ngắm = 72% cạnh ngắn của khung camera — phải khớp `--frame` trong CSS.
const FRAME_RATIO = 0.72;

function classify(err: unknown): ErrKind {
	const name = (err as { name?: string })?.name ?? '';
	const msg = String((err as { message?: string })?.message ?? err ?? '');
	if (name === 'NotAllowedError' || name === 'SecurityError' || /permission|denied|not allowed/i.test(msg))
		return 'denied';
	if (name === 'NotFoundError' || name === 'OverconstrainedError' || /not ?found|no camera|requested device/i.test(msg))
		return 'notfound';
	if (name === 'NotReadableError' || name === 'AbortError' || /in use|could not start|not readable/i.test(msg))
		return 'busy';
	return 'other';
}

const ERR_TEXT: Record<ErrKind, { title: string; body: string }> = {
	denied: {
		title: 'Chưa được phép dùng camera',
		body: 'Trình duyệt đang chặn camera cho trang này. Nhấn biểu tượng ổ khoá / camera cạnh thanh địa chỉ → chọn “Cho phép” camera, rồi nhấn “Thử lại”.',
	},
	notfound: {
		title: 'Không tìm thấy camera',
		body: 'Thiết bị này không có camera hoặc camera đang bị tắt. Hãy dùng điện thoại / máy tính bảng có camera, hoặc chọn ảnh chụp mã QR.',
	},
	busy: {
		title: 'Camera đang bận',
		body: 'Camera đang được ứng dụng khác sử dụng (Zoom, Teams, máy ảnh…). Đóng ứng dụng đó rồi nhấn “Thử lại”.',
	},
	other: {
		title: 'Không mở được camera',
		body: 'Đã có lỗi khi mở camera. Hãy thử lại, hoặc chọn ảnh chụp mã QR.',
	},
};

function readFacing(): Facing {
	try {
		return localStorage.getItem(FACING_KEY) === 'user' ? 'user' : 'environment';
	} catch {
		return 'environment';
	}
}

function SwitchCamSvg() {
	return (
		<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
			<path d='M20 16V8a2 2 0 0 0-2-2h-2.2l-1.4-2H9.6L8.2 6H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2Z' />
			<path d='M9.5 11.5A2.6 2.6 0 0 1 14 10l.8.8M14.5 12.5A2.6 2.6 0 0 1 10 14l-.8-.8' />
			<path d='M14.8 9v1.8H13M9.2 15v-1.8H11' />
		</svg>
	);
}

interface TicketCameraProps {
	onScan: (decodedText: string) => void;
	/** Đang gọi API cho mã vừa quét — tạm bỏ qua mã mới. */
	paused?: boolean;
	/** Kết quả mới nhất: đổi `id` → nháy viền khung camera theo màu `tone`. */
	flash?: { id: number; tone: ScanTone } | null;
}

export function TicketCamera({ onScan, paused, flash }: TicketCameraProps) {
	const [elId] = useState(() => `ticket-cam-${seq++}`);
	const [phase, setPhase] = useState<Phase>('idle');
	const [err, setErr] = useState<ErrKind | null>(null);
	const [facing, setFacing] = useState<Facing>(readFacing);
	const [camCount, setCamCount] = useState(0);
	const [fileBusy, setFileBusy] = useState(false);
	const [fileErr, setFileErr] = useState(false);
	const scannerRef = useRef<Html5Qrcode | null>(null);
	const stageRef = useRef<HTMLDivElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const onScanRef = useRef(onScan);
	const pausedRef = useRef(paused);
	const startingRef = useRef(false);
	const facingRef = useRef(facing);

	useEffect(() => {
		onScanRef.current = onScan;
		pausedRef.current = paused;
		facingRef.current = facing;
	});

	useEffect(() => {
		const scanner = new Html5Qrcode(elId, {
			verbose: false,
			formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
		});
		scannerRef.current = scanner;
		return () => {
			scannerRef.current = null;
			if (scanner.isScanning) scanner.stop().then(() => scanner.clear()).catch(() => {});
		};
	}, [elId]);

	const start = useCallback(async (face: Facing) => {
		const scanner = scannerRef.current;
		if (!scanner || startingRef.current) return;
		startingRef.current = true;
		setErr(null);
		setFileErr(false);
		// Khung video phải có kích thước TRƯỚC khi start(): thư viện đo clientWidth/Height
		// lúc video sẵn sàng để tính vùng quét (xem ghi chú trong QrScanner).
		flushSync(() => setPhase('starting'));
		try {
			if (scanner.isScanning) await scanner.stop();
			await scanner.start(
				{ facingMode: face },
				{
					fps: 10,
					// Vùng giải mã trùng khung ngắm vẽ bằng CSS (giữa khung, 72% cạnh ngắn).
					qrbox: (w, h) => {
						const s = Math.max(120, Math.floor(Math.min(w, h) * FRAME_RATIO));
						return { width: s, height: s };
					},
					// Luồng camera (kể cả camera trước) không bị lật — bỏ lượt giải mã ảnh lật.
					disableFlip: true,
				},
				(text) => {
					if (!pausedRef.current) onScanRef.current(text);
				},
				() => {
					// khung hình không có mã — bình thường
				},
			);
			setPhase('scanning');
			navigator.mediaDevices
				?.enumerateDevices()
				.then((ds) => setCamCount(ds.filter((d) => d.kind === 'videoinput').length))
				.catch(() => {});
		} catch (e) {
			setPhase('error');
			setErr(classify(e));
		} finally {
			startingRef.current = false;
		}
	}, []);

	// Đã cấp quyền từ lần trước → mở camera ngay, khỏi bấm. Bị chặn hẳn → báo luôn.
	useEffect(() => {
		if (!canUseLiveCamera || !navigator.permissions?.query) return;
		let alive = true;
		navigator.permissions
			.query({ name: 'camera' as PermissionName })
			.then((st) => {
				if (!alive) return;
				if (st.state === 'granted') void start(facingRef.current);
				else if (st.state === 'denied') {
					setPhase('error');
					setErr('denied');
				}
			})
			.catch(() => {
				// Firefox cũ không hỗ trợ truy vấn quyền 'camera' — chờ người dùng bấm
			});
		return () => {
			alive = false;
		};
	}, [start]);

	// Xoay máy / đổi cỡ cửa sổ nhiều → vùng quét (tính bằng px lúc mở camera) lệch khỏi
	// khung ngắm, nên mở lại camera theo kích thước mới.
	useEffect(() => {
		const el = stageRef.current;
		if (!el || phase !== 'scanning' || typeof ResizeObserver === 'undefined') return;
		const w0 = el.clientWidth;
		const h0 = el.clientHeight;
		let timer = 0;
		const ro = new ResizeObserver(() => {
			window.clearTimeout(timer);
			timer = window.setTimeout(() => {
				const dw = Math.abs(el.clientWidth - w0) / (w0 || 1);
				const dh = Math.abs(el.clientHeight - h0) / (h0 || 1);
				if (dw > 0.15 || dh > 0.15) void start(facingRef.current);
			}, 450);
		});
		ro.observe(el);
		return () => {
			window.clearTimeout(timer);
			ro.disconnect();
		};
	}, [phase, start]);

	const stop = async () => {
		const scanner = scannerRef.current;
		if (scanner?.isScanning) await scanner.stop().catch(() => {});
		setPhase('idle');
	};

	const switchCamera = () => {
		const next: Facing = facing === 'environment' ? 'user' : 'environment';
		setFacing(next);
		try {
			localStorage.setItem(FACING_KEY, next);
		} catch {
			// không lưu được lựa chọn — không sao
		}
		void start(next);
	};

	const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		e.target.value = ''; // cho phép chọn lại cùng 1 ảnh
		const scanner = scannerRef.current;
		if (!file || !scanner) return;
		setFileErr(false);
		setFileBusy(true);
		try {
			if (scanner.isScanning) await stop();
			const text = await decodeImageFile(scanner, file);
			if (!pausedRef.current) onScanRef.current(text);
		} catch {
			setFileErr(true);
		} finally {
			setFileBusy(false);
		}
	};

	const pickFile = () => fileInputRef.current?.click();
	const live = phase === 'starting' || phase === 'scanning';

	return (
		<div
			ref={stageRef}
			className={`${styles.stage} ${facing === 'user' ? styles.mirror : ''}`}
			data-phase={phase}
		>
			{/* html5-qrcode gắn <video> vào đây — luôn có trong DOM, chỉ ẩn khi camera tắt. */}
			<div id={elId} className={live ? styles.viewport : styles.viewportHidden} />

			{flash && <div key={flash.id} className={`${styles.flash} ${styles[flash.tone]}`} aria-hidden='true' />}

			{live && (
				<>
					<div className={styles.frame} aria-hidden='true'>
						<span />
					</div>
					<div className={styles.topBar}>
						<span className={styles.chip} role='status'>
							<i className={paused || phase === 'starting' ? styles.dotBusy : styles.dot} />
							{phase === 'starting' ? 'Đang mở camera…' : paused ? 'Đang kiểm tra vé…' : 'Đang quét'}
						</span>
						<div className={styles.tools}>
							{camCount > 1 && (
								<button
									type='button'
									className={styles.roundBtn}
									onClick={switchCamera}
									disabled={phase === 'starting'}
									aria-label={facing === 'environment' ? 'Chuyển sang camera trước' : 'Chuyển sang camera sau'}
									title={facing === 'environment' ? 'Camera trước' : 'Camera sau'}
								>
									<SwitchCamSvg />
								</button>
							)}
							<button
								type='button'
								className={styles.roundBtn}
								onClick={pickFile}
								disabled={fileBusy || paused}
								aria-label='Chọn ảnh mã QR'
								title='Chọn ảnh mã QR'
							>
								<ImageSvg />
							</button>
							<button
								type='button'
								className={styles.roundBtn}
								onClick={() => void stop()}
								aria-label='Tắt camera'
								title='Tắt camera'
							>
								<XSvg />
							</button>
						</div>
					</div>
					<p className={styles.hint}>Đưa mã QR trên vé vào giữa khung</p>
				</>
			)}

			{!live && (
				<div className={styles.panel}>
					{!canUseLiveCamera ? (
						<>
							<span className={`${styles.panelIcon} ${styles.iconWarn}`}>
								<LockSvg />
							</span>
							<h2 className={styles.panelTitle}>Không quét trực tiếp được</h2>
							<p className={styles.panelText}>
								Kết nối hiện tại chưa bảo mật (không phải HTTPS) nên trình duyệt chặn camera trực tiếp. Bạn vẫn
								điểm danh được bằng cách <b>chụp ảnh mã QR</b>.
							</p>
							<div className={styles.panelActions}>
								<button type='button' className={styles.btnPrimary} onClick={pickFile} disabled={fileBusy || paused}>
									<CameraSvg />
									{fileBusy ? 'Đang đọc ảnh…' : 'Chụp ảnh mã QR'}
								</button>
							</div>
						</>
					) : phase === 'error' && err ? (
						<>
							<span className={`${styles.panelIcon} ${err === 'denied' ? styles.iconBad : styles.iconWarn}`}>
								{err === 'denied' ? <LockSvg /> : <WarnSvg />}
							</span>
							<h2 className={styles.panelTitle}>{ERR_TEXT[err].title}</h2>
							<p className={styles.panelText}>{ERR_TEXT[err].body}</p>
							<div className={styles.panelActions}>
								<button
									type='button'
									className={styles.btnPrimary}
									onClick={() => {
										primeAudio();
										void start(facing);
									}}
								>
									<RefreshSvg />
									Thử lại
								</button>
								<button type='button' className={styles.btnGhost} onClick={pickFile} disabled={fileBusy || paused}>
									<ImageSvg />
									{fileBusy ? 'Đang đọc ảnh…' : 'Chọn ảnh mã QR'}
								</button>
							</div>
						</>
					) : (
						<>
							<span className={styles.panelIcon}>
								<QrSvg />
							</span>
							<h2 className={styles.panelTitle}>Sẵn sàng quét vé</h2>
							<p className={styles.panelText}>Bật camera rồi hướng vào mã QR trên vé của đại biểu.</p>
							<div className={styles.panelActions}>
								<button
									type='button'
									className={styles.btnPrimary}
									onClick={() => {
										primeAudio();
										void start(facing);
									}}
								>
									<CameraSvg />
									Bật camera
								</button>
								<button type='button' className={styles.btnGhost} onClick={pickFile} disabled={fileBusy || paused}>
									<ImageSvg />
									{fileBusy ? 'Đang đọc ảnh…' : 'Chọn ảnh mã QR'}
								</button>
							</div>
						</>
					)}
					{fileErr && (
						<p className={styles.fileErr} role='alert'>
							Không nhận ra mã QR trong ảnh. Chụp lại sao cho mã QR chiếm phần lớn khung hình, giữ máy thẳng
							và tránh lóa sáng.
						</p>
					)}
				</div>
			)}

			<input
				ref={fileInputRef}
				type='file'
				accept='image/*'
				capture={canUseLiveCamera ? undefined : 'environment'}
				className={styles.fileInput}
				onChange={handleFile}
			/>
		</div>
	);
}
