import { CheckSvg, FilePdfSvg, KeySvg, RefreshSvg } from '@/assets/icons';
import AdminLayout from '@/layouts/AdminLayout';
import UserLayout from '@/layouts/UserLayout';
import { FileDropzone } from '@/shared/components';
import { showToast } from '@/shared/utils/feedback';
import { saveBlob } from '@/shared/utils/saveBlob';
import { useQuery } from '@tanstack/react-query';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { signingApi } from '../api/signingApi';
import { PdfSignCanvas } from '../components/PdfSignCanvas';
import { clampBox, type SignBox } from '../utils/signBox';
import { findSignAnchors, type SignAnchor } from '../utils/signAnchors';
import styles from './SignDocument.module.css';

const MAX_PAGES = 200;
// Cỡ khung (pt) — cùng tỉ lệ ~22:7 với khung chữ ký trên phiếu của hệ thống
const SIZES = [
	{ key: 's', label: 'Nhỏ', width: 150, height: 48 },
	{ key: 'm', label: 'Vừa', width: 190, height: 60 },
	{ key: 'l', label: 'Lớn', width: 240, height: 76 },
] as const;
const errMsg = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

const loadPdf = async (file: File): Promise<PDFDocumentProxy> => {
	const pdfjs = await import('pdfjs-dist');
	// ?worker: Vite đóng gói worker cùng origin (hợp CSP worker-src 'self')
	const { default: PdfWorker } = await import('pdfjs-dist/build/pdf.worker.min.mjs?worker');
	pdfjs.GlobalWorkerOptions.workerPort ??= new PdfWorker();
	return pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
};

/** Khung đặt ngay dưới chỗ ký tìm được */
const boxAtAnchor = (a: SignAnchor, page: PDFPageProxy, w: number, h: number): SignBox => {
	const vp = page.getViewport({ scale: 1 });
	return clampBox({ page: a.page, left: a.centerX - w / 2, top: a.belowY + 4, width: w, height: h }, vp);
};
/** Không tìm thấy chỗ ký: góc dưới phải trang cuối */
const defaultBox = (pages: PDFPageProxy[], w: number, h: number): SignBox => {
	const vp = pages[pages.length - 1].getViewport({ scale: 1 });
	return clampBox({ page: pages.length, left: vp.width - w - 60, top: vp.height - h - 110, width: w, height: h }, vp);
};

/** Đổi khung (viewport pt, gốc trên-trái) sang tọa độ PDF cho VIN-HSM (gốc dưới-trái, đã tính xoay trang) */
const toPdfRect = (page: PDFPageProxy, b: SignBox) => {
	const vp = page.getViewport({ scale: 1 });
	const [x1, y1] = vp.convertToPdfPoint(b.left, b.top);
	const [x2, y2] = vp.convertToPdfPoint(b.left + b.width, b.top + b.height);
	return {
		x: Math.min(x1, x2),
		y: Math.min(y1, y2),
		width: Math.abs(x2 - x1),
		height: Math.abs(y2 - y1),
	};
};

export default function SignDocument() {
	const isAdmin = useLocation().pathname.startsWith('/admin');
	const Layout = isAdmin ? AdminLayout : UserLayout;
	const profilePath = isAdmin ? '/admin/profile#chu-ky-so' : '/user/profile#chu-ky-so';

	const { data: me, isLoading: meLoading } = useQuery({ queryKey: ['signing', 'me'], queryFn: signingApi.getMine });
	const acc = me?.account ?? null;
	const { data: img } = useQuery({
		queryKey: ['signing', 'my-signature-image'],
		queryFn: signingApi.getSignatureImage,
		enabled: !!acc?.has_signature_image,
	});
	const ready = !!acc && acc.is_active && acc.has_cert && !acc.cert_expired;

	const [file, setFile] = useState<File | null>(null);
	const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
	const [pages, setPages] = useState<PDFPageProxy[]>([]);
	const [loading, setLoading] = useState(false);
	const [anchors, setAnchors] = useState<SignAnchor[]>([]);
	const [anchorIdx, setAnchorIdx] = useState<number | null>(null);
	const [sizeKey, setSizeKey] = useState<(typeof SIZES)[number]['key']>('m');
	const [box, setBox] = useState<SignBox | null>(null);
	const [signing, setSigning] = useState(false);
	const [signed, setSigned] = useState<{ blob: Blob; name: string } | null>(null);
	const size = SIZES.find((s) => s.key === sizeKey) ?? SIZES[1];

	// Giải phóng worker / bộ nhớ của tài liệu cũ khi đổi file hoặc rời trang
	useEffect(() => () => void doc?.loadingTask.destroy(), [doc]);

	const reset = () => {
		setFile(null);
		setDoc(null);
		setPages([]);
		setAnchors([]);
		setAnchorIdx(null);
		setBox(null);
		setSigned(null);
	};

	const openFile = async (f: File | null) => {
		reset();
		if (!f) return;
		setFile(f);
		setLoading(true);
		try {
			const pdf = await loadPdf(f);
			if (pdf.numPages > MAX_PAGES) throw new Error(`Tài liệu quá dài (tối đa ${MAX_PAGES} trang).`);
			const ps = await Promise.all(Array.from({ length: pdf.numPages }, (_, i) => pdf.getPage(i + 1)));
			const found = await findSignAnchors(ps).catch(() => []);
			setDoc(pdf);
			setPages(ps);
			setAnchors(found);
			// Khối ký thường ở cuối văn bản ⇒ chọn chỗ ký cuối cùng tìm được
			if (found.length) {
				const i = found.length - 1;
				setAnchorIdx(i);
				setBox(boxAtAnchor(found[i], ps[found[i].page - 1], size.width, size.height));
			} else {
				setBox(defaultBox(ps, size.width, size.height));
			}
		} catch (e) {
			const pwd = e instanceof Error && e.name === 'PasswordException';
			showToast('error', pwd ? 'File PDF có mật khẩu — bỏ mật khẩu rồi tải lại.' : errMsg(e, 'Không mở được file PDF'));
			reset();
		} finally {
			setLoading(false);
		}
	};

	const pickAnchor = (i: number) => {
		const a = anchors[i];
		setAnchorIdx(i);
		setSigned(null);
		setBox(boxAtAnchor(a, pages[a.page - 1], size.width, size.height));
		document.querySelector(`[data-page="${a.page}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
	};

	const changeSize = (k: (typeof SIZES)[number]['key']) => {
		setSizeKey(k);
		const s = SIZES.find((x) => x.key === k);
		if (!box || !s) return;
		// Đổi cỡ quanh tâm khung hiện tại
		const cx = box.left + box.width / 2;
		const cy = box.top + box.height / 2;
		setBox(
			clampBox(
				{ ...box, left: cx - s.width / 2, top: cy - s.height / 2, width: s.width, height: s.height },
				pages[box.page - 1].getViewport({ scale: 1 }),
			),
		);
	};

	const moveBox = (b: SignBox) => {
		setBox(b);
		setSigned(null);
		setAnchorIdx(null);
	};

	const sign = async () => {
		if (!file || !box) return;
		setSigning(true);
		try {
			const rect = toPdfRect(pages[box.page - 1], box);
			const form = new FormData();
			form.append('file', file);
			form.append('page', String(box.page));
			form.append('x', rect.x.toFixed(2));
			form.append('y', rect.y.toFixed(2));
			form.append('width', rect.width.toFixed(2));
			form.append('height', rect.height.toFixed(2));
			const blob = await signingApi.signPdf(form);
			const name = `${file.name.replace(/\.pdf$/i, '')} (ky so).pdf`;
			saveBlob(blob, name);
			setSigned({ blob, name });
			showToast('success', 'Đã ký số và tải file về');
		} catch (e) {
			showToast('error', errMsg(e, 'Ký số không thành công'));
		} finally {
			setSigning(false);
		}
	};

	// Nội dung khung: giống bản VIN-HSM in ra (ảnh chữ ký + chức vụ, hoặc dòng chữ khi chưa có ảnh)
	const caption = acc?.signature_show_text ? acc.signature_caption || acc.profile_position || '' : '';
	const name = acc?.signature_display_name || acc?.user_name || '';
	const boxContent = img?.image ? (
				<div className={styles.stamp}>
					<img
						src={img.image}
						alt=''
						className={styles.stampImg}
					/>
					{caption && <span className={styles.stampCaption}>{caption}</span>}
				</div>
			) : (
				<div className={styles.stampText}>
					<span>Ký bởi: {name}</span>
					<span>Ký ngày: (thời điểm ký)</span>
				</div>
			);

	const signerNote = meLoading ? null : !acc ? (
		<p className={styles.warn}>
			Bạn chưa khai báo chứng thư số. <Link to={profilePath}>Khai báo ở Hồ sơ cá nhân</Link> để ký.
		</p>
	) : !ready ? (
		<p className={styles.warn}>
			Chứng thư chưa sẵn sàng ({acc.last_error || (acc.cert_expired ? 'đã hết hạn' : 'chưa kiểm tra kết nối')}).{' '}
			<Link to={profilePath}>Kiểm tra ở Hồ sơ cá nhân</Link>.
		</p>
	) : null;

	return (
		<Layout
			pageTitle='Ký tài liệu'
			pageSubtitle='Ký số file PDF bằng chứng thư của bạn — đặt chữ ký đúng chỗ trên văn bản'
		>
			{!pages.length ? (
				<div className={styles.start}>
					<FileDropzone
						value={file}
						onChange={(f) => void openFile(f)}
						accept='.pdf'
						hint={loading ? 'Đang mở tài liệu…' : 'Chọn hoặc kéo thả file PDF cần ký (tối đa 20 MB)'}
						disabled={loading}
					/>
					<ol className={styles.steps}>
						<li>Hệ thống tự tìm chỗ ký (Giám đốc, Trưởng khoa, Người phê duyệt…) và đặt sẵn khung chữ ký.</li>
						<li>Kéo khung tới đúng chỗ nếu cần, kéo chấm ở góc để đổi cỡ.</li>
						<li>Bấm “Ký và tải về” — file trả về đã có chữ ký số của bạn.</li>
					</ol>
					{signerNote}
				</div>
			) : (
				<div className={styles.workspace}>
					<div className={styles.viewer}>
						{box && (
							<PdfSignCanvas
								pages={pages}
								boxes={[{ key: 'me', box, editable: true, content: boxContent }]}
								activeKey='me'
								onBoxChange={(_k, b) => moveBox(b)}
							/>
						)}
					</div>

					<aside className={styles.panel}>
						<div className={styles.fileRow}>
							<span className={styles.fileIcon}>
								<FilePdfSvg />
							</span>
							<div className={styles.fileMeta}>
								<span
									className={styles.fileName}
									title={file?.name}
								>
									{file?.name}
								</span>
								<span className={styles.sub}>{pages.length} trang</span>
							</div>
							<button
								type='button'
								className={styles.textBtn}
								onClick={reset}
								disabled={signing}
							>
								Đổi file
							</button>
						</div>

						<div className={styles.group}>
							<span className={styles.groupLabel}>Vị trí ký</span>
							{anchors.length ? (
								<div className={styles.anchorList}>
									{anchors.map((a, i) => (
										<button
											key={`${a.page}-${i}`}
											type='button'
											className={i === anchorIdx ? `${styles.anchor} ${styles.anchorOn}` : styles.anchor}
											onClick={() => pickAnchor(i)}
										>
											<span className={styles.anchorLabel}>{a.label}</span>
											<span className={styles.anchorPage}>Trang {a.page}</span>
										</button>
									))}
								</div>
							) : (
								<p className={styles.sub}>
									Không tìm thấy chỗ ký trong văn bản (file ảnh quét không có lớp chữ). Khung đang ở cuối trang
									cuối — kéo tới đúng chỗ cần ký.
								</p>
							)}
							{box && (
								<span className={styles.sub}>
									Đang đặt ở trang {box.page}
									{anchorIdx === null && anchors.length ? ' · vị trí tự chọn' : ''}
								</span>
							)}
						</div>

						<div className={styles.group}>
							<span
								className={styles.groupLabel}
								id='sign-size'
							>
								Cỡ khung chữ ký
							</span>
							<div
								className={styles.segmented}
								role='radiogroup'
								aria-labelledby='sign-size'
							>
								{SIZES.map((s) => (
									<button
										key={s.key}
										type='button'
										role='radio'
										aria-checked={sizeKey === s.key}
										className={sizeKey === s.key ? styles.segOn : undefined}
										onClick={() => changeSize(s.key)}
									>
										{s.label}
									</button>
								))}
							</div>
						</div>

						{signerNote}

						<div className={styles.actions}>
							<button
								type='button'
								className={styles.btnPrimary}
								onClick={() => void sign()}
								disabled={!ready || !box || signing}
							>
								<KeySvg />
								{signing ? 'Đang ký số…' : 'Ký và tải về'}
							</button>
							{signed && (
								<div
									className={styles.done}
									role='status'
								>
									<span className={styles.doneText}>
										<CheckSvg />
										Đã ký — file đã tải về
									</span>
									<button
										type='button'
										className={styles.textBtn}
										onClick={() => saveBlob(signed.blob, signed.name)}
									>
										<RefreshSvg />
										Tải lại
									</button>
								</div>
							)}
							<span className={styles.sub}>
								Ký bằng chứng thư {acc?.cert_subject?.match(/CN=([^,]+)/)?.[1] ?? 'của bạn'}. Mỗi lần ký được ghi vào
								nhật ký ký số.
							</span>
						</div>
					</aside>
				</div>
			)}
		</Layout>
	);
}
