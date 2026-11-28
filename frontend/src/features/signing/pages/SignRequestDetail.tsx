import { CheckSvg, DownloadSvg, FilePdfSvg, KeySvg, XCircleSvg } from '@/assets/icons';
import AdminLayout from '@/layouts/AdminLayout';
import UserLayout from '@/layouts/UserLayout';
import { useRealtimeUpdate } from '@/layouts/hooks/useRealtime';
import { Badge, Button, Modal, ModalActions } from '@/shared/components';
import { InlineLoading } from '@/shared/components/Loading';
import { showToast } from '@/shared/utils/feedback';
import { formatDateVN } from '@/shared/utils/formatDate';
import { saveBlob } from '@/shared/utils/saveBlob';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { PDFPageProxy } from 'pdfjs-dist';
import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { signingApi } from '../api/signingApi';
import { REQUEST_STATUS, SIGNER_STATUS, signRequestApi, type SignRequestDetail as Detail } from '../api/signRequestApi';
import { PdfSignCanvas, type CanvasBox } from '../components/PdfSignCanvas';
import { formatStamp } from '../utils/formatStamp';
import { DEFAULT_BOX, boxAtAnchor, defaultBox, fromPdfRect, openPdf, pdfErrorMessage, toPdfRect } from '../utils/pdfDoc';
import { findSignAnchors } from '../utils/signAnchors';
import type { SignBox } from '../utils/signBox';
import { signRequestBase } from '../utils/signRequestPaths';
import styles from './SignRequestDetail.module.css';

const EVENT_LABEL: Record<string, string> = {
	created: 'Tạo và gửi hồ sơ',
	signed: 'Đã ký số',
	rejected: 'Từ chối ký',
	cancelled: 'Hủy hồ sơ',
	step_started: 'Chuyển sang',
	completed: 'Hồ sơ đã ký xong',
};

interface Loaded {
	blob: Blob;
	pages: PDFPageProxy[];
}

export default function SignRequestDetail() {
	const { id: idParam } = useParams();
	const id = Number(idParam);
	const { pathname } = useLocation();
	const isAdmin = pathname.startsWith('/admin');
	const Layout = isAdmin ? AdminLayout : UserLayout;
	const baseUrl = signRequestBase(pathname);
	const qc = useQueryClient();

	const { data: d, isLoading, error, refetch } = useQuery({
		queryKey: ['sign-requests', 'detail', id],
		queryFn: () => signRequestApi.detail(id),
		enabled: Number.isFinite(id),
	});
	const { data: me } = useQuery({ queryKey: ['signing', 'me'], queryFn: signingApi.getMine });
	const { data: img } = useQuery({
		queryKey: ['signing', 'my-signature-image'],
		queryFn: signingApi.getSignatureImage,
		enabled: !!me?.account?.has_signature_image,
	});
	useRealtimeUpdate('sign_request', () => void refetch());

	const [docId, setDocId] = useState<number | null>(null);
	const [loaded, setLoaded] = useState<Map<string, Loaded>>(new Map());
	const [placements, setPlacements] = useState<Map<number, SignBox>>(new Map());
	const [busy, setBusy] = useState<'' | 'sign' | 'reject' | 'cancel'>('');
	const [rejectOpen, setRejectOpen] = useState(false);
	const [reason, setReason] = useState('');
	const [cancelOpen, setCancelOpen] = useState(false);

	const activeDoc = d?.documents.find((x) => x.id === docId) ?? d?.documents[0] ?? null;
	const verKey = (doc: { id: number; current_version: number }) => `${doc.id}@${doc.current_version}`;

	// Tải (và nhớ) bản mới nhất của văn bản đang xem; văn bản tôi phải tự đặt khung thì tải trước
	// cả loạt để đặt sẵn khung theo gợi ý
	useEffect(() => {
		if (!d) return;
		const need = d.documents.filter(
			(doc) => (doc.id === activeDoc?.id || d.missing_field_document_ids.includes(doc.id)) && !loaded.has(verKey(doc)),
		);
		if (!need.length) return;
		let cancelled = false;
		(async () => {
			for (const doc of need) {
				try {
					const blob = await signRequestApi.file(id, doc.id);
					const { pages } = await openPdf(blob);
					if (cancelled) return;
					setLoaded((m) => new Map(m).set(verKey(doc), { blob, pages }));
					if (d.missing_field_document_ids.includes(doc.id)) {
						const anchors = await findSignAnchors(pages).catch(() => []);
						const a = anchors.at(-1);
						const box = a
							? boxAtAnchor(a, pages[a.page - 1], DEFAULT_BOX.width, DEFAULT_BOX.height)
							: defaultBox(pages, DEFAULT_BOX.width, DEFAULT_BOX.height);
						setPlacements((m) => (m.has(doc.id) ? m : new Map(m).set(doc.id, box)));
					}
				} catch (e) {
					if (!cancelled) showToast('error', pdfErrorMessage(e, 'Không tải được văn bản'));
				}
			}
		})();
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [d, activeDoc?.id]);

	if (isLoading) {
		return (
			<Layout pageTitle='Hồ sơ trình ký'>
				<InlineLoading />
			</Layout>
		);
	}
	if (error || !d) {
		return (
			<Layout pageTitle='Hồ sơ trình ký'>
				<p className={styles.notFound}>
					Không tìm thấy hồ sơ hoặc bạn không có quyền xem. <Link to={baseUrl}>Về danh sách</Link>
				</p>
			</Layout>
		);
	}

	const cur = activeDoc ? loaded.get(verKey(activeDoc)) : undefined;
	const signerName = new Map(d.steps.flatMap((s) => s.signers.map((x) => [x.id, x] as const)));
	const st = REQUEST_STATUS[d.status];

	// Khung trên văn bản đang xem: người chưa ký (đã ký thì chữ ký nằm sẵn trong PDF)
	const boxes: CanvasBox[] = [];
	if (activeDoc && cur) {
		for (const f of d.fields.filter((x) => x.document_id === activeDoc.id)) {
			const s = signerName.get(f.signer_id);
			if (!s || s.status === 'signed' || s.status === 'skipped' || !cur.pages[f.page - 1]) continue;
			const mine = d.me?.signer_id === f.signer_id;
			boxes.push({
				key: `f${f.id}`,
				box: fromPdfRect(cur.pages[f.page - 1], f),
				label: mine ? 'Bạn ký ở đây' : s.full_name,
				tone: mine && d.can_sign ? 'active' : 'other',
				editable: false,
				content: mine && d.can_sign ? myStamp() : undefined,
			});
		}
		const mineBox = placements.get(activeDoc.id);
		if (d.can_sign && mineBox) {
			boxes.push({ key: 'me', box: mineBox, label: 'Bạn ký ở đây', editable: true, content: myStamp() });
		}
	}

	function myStamp() {
		const caption = me?.account?.signature_show_text
			? me.account.signature_caption || me.account.profile_position || ''
			: '';
		return img?.image ? (
			<div className={styles.stamp}>
				<img
					src={img.image}
					alt=''
					className={styles.stampImg}
				/>
				{caption && <span className={styles.stampCaption}>{caption}</span>}
			</div>
		) : undefined;
	}

	const refreshAll = async () => {
		await qc.invalidateQueries({ queryKey: ['sign-requests'] });
	};

	const sign = async () => {
		setBusy('sign');
		try {
			const extra = d.missing_field_document_ids.map((docId2) => {
				const box = placements.get(docId2);
				const doc = d.documents.find((x) => x.id === docId2);
				const l = doc ? loaded.get(verKey(doc)) : undefined;
				if (!box || !l) throw new Error(`Chưa đặt vị trí ký cho "${doc?.file_name ?? docId2}"`);
				return { document_id: docId2, ...toPdfRect(l.pages[box.page - 1], box) };
			});
			await signRequestApi.sign(id, { placements: extra });
			showToast('success', `Đã ký số ${d.documents.length} văn bản`);
			setPlacements(new Map());
			await refreshAll();
		} catch (e) {
			showToast('error', e instanceof Error ? e.message : 'Ký số không thành công');
		} finally {
			setBusy('');
		}
	};

	const doReject = async () => {
		setBusy('reject');
		try {
			await signRequestApi.reject(id, reason.trim());
			showToast('success', 'Đã từ chối — người gửi đã được báo');
			setRejectOpen(false);
			await refreshAll();
		} catch (e) {
			showToast('error', e instanceof Error ? e.message : 'Không từ chối được');
		} finally {
			setBusy('');
		}
	};

	const doCancel = async () => {
		setBusy('cancel');
		try {
			await signRequestApi.cancel(id, reason.trim() || undefined);
			showToast('success', 'Đã hủy hồ sơ');
			setCancelOpen(false);
			await refreshAll();
		} catch (e) {
			showToast('error', e instanceof Error ? e.message : 'Không hủy được');
		} finally {
			setBusy('');
		}
	};

	const download = async (doc: Detail['documents'][number]) => {
		const l = loaded.get(verKey(doc));
		const blob = l?.blob ?? (await signRequestApi.file(id, doc.id));
		const suffix = d.status === 'completed' ? ' (da ky)' : ` (ban ${doc.current_version})`;
		saveBlob(blob, `${doc.file_name.replace(/\.pdf$/i, '')}${suffix}.pdf`);
	};
	const downloadAll = async () => {
		for (const doc of d.documents) await download(doc);
	};

	return (
		<Layout
			pageTitle={d.title}
			pageSubtitle={`Gửi bởi ${d.creator_name} · ${formatStamp(d.created_at)}`}
			// Cổng quản trị tự thêm tên mục menu vào breadcrumb; cổng người dùng cần đường về danh sách
			breadcrumbs={isAdmin ? undefined : [{ label: 'Trình ký văn bản', to: baseUrl }, { label: d.title }]}
		>
			<div className={styles.workspace}>
				<div className={styles.main}>
					{d.documents.length > 1 && (
						<div
							className={styles.docTabs}
							role='tablist'
						>
							{d.documents.map((doc) => (
								<button
									key={doc.id}
									type='button'
									role='tab'
									aria-selected={doc.id === activeDoc?.id}
									className={doc.id === activeDoc?.id ? `${styles.docTab} ${styles.docTabOn}` : styles.docTab}
									onClick={() => setDocId(doc.id)}
								>
									<FilePdfSvg />
									<span>{doc.file_name}</span>
									{d.missing_field_document_ids.includes(doc.id) && <span className={styles.needs} title='Bạn tự đặt vị trí ký' />}
								</button>
							))}
						</div>
					)}
					<div className={styles.viewer}>
						{cur ? (
							<PdfSignCanvas
								pages={cur.pages}
								boxes={boxes}
								activeKey={d.can_sign && activeDoc && placements.has(activeDoc.id) ? 'me' : null}
								onBoxChange={(_k, b) => activeDoc && setPlacements((m) => new Map(m).set(activeDoc.id, b))}
							/>
						) : (
							<InlineLoading />
						)}
					</div>
				</div>

				<aside className={styles.panel}>
					<div className={styles.statusRow}>
						<Badge
							tone={st.tone}
							dot
						>
							{st.label}
						</Badge>
						{d.due_date && d.status === 'in_progress' && <span className={styles.sub}>Hạn ký {formatDateVN(d.due_date)}</span>}
					</div>
					{d.message && <p className={styles.message}>{d.message}</p>}

					{d.can_sign && (
						<div className={styles.myTurn}>
							<p className={styles.myTurnText}>
								Tới lượt bạn ký {d.documents.length} văn bản.
								{d.missing_field_document_ids.length > 0 &&
									' Khung "Bạn ký ở đây" đã được đặt theo gợi ý — kéo chỉnh nếu cần.'}
							</p>
							<Button
								variant='primary'
								icon={<KeySvg />}
								loading={busy === 'sign'}
								disabled={!!busy || !me?.account?.has_cert}
								onClick={() => void sign()}
							>
								Ký số {d.documents.length > 1 ? `${d.documents.length} văn bản` : ''}
							</Button>
							{!me?.account?.has_cert && (
								<p className={styles.warn}>
									Bạn chưa có chứng thư số sẵn sàng.{' '}
									<Link to={isAdmin ? '/admin/profile#chu-ky-so' : '/user/profile#chu-ky-so'}>Khai báo ở Hồ sơ cá nhân</Link>.
								</p>
							)}
							<button
								type='button'
								className={styles.textDanger}
								onClick={() => {
									setReason('');
									setRejectOpen(true);
								}}
								disabled={!!busy}
							>
								<XCircleSvg /> Từ chối ký
							</button>
						</div>
					)}

					<div className={styles.section}>
						<h3 className={styles.sectionTitle}>Tiến trình ký</h3>
						<ol className={styles.timeline}>
							{d.steps.map((s) => {
								const done = s.signers.every((x) => x.status === 'signed' || x.status === 'skipped');
								const current = d.status === 'in_progress' && s.step_no === d.current_step;
								return (
									<li
										key={s.step_no}
										className={`${styles.tStep} ${done ? styles.tDone : ''} ${current ? styles.tCurrent : ''}`}
									>
										<div className={styles.tHead}>
											<span className={styles.tDot}>{done ? <CheckSvg /> : s.step_no}</span>
											<span className={styles.tTitle}>Bước {s.step_no}</span>
											<span className={styles.sub}>{s.mode === 'any' ? 'Chỉ cần 1 người' : 'Tất cả phải ký'}</span>
										</div>
										<ul className={styles.tSigners}>
											{s.signers.map((x) => (
												<li key={x.id}>
													<div className={styles.tSigner}>
														<span className={styles.tName}>{x.full_name}</span>
														<Badge tone={SIGNER_STATUS[x.status].tone}>{SIGNER_STATUS[x.status].label}</Badge>
													</div>
													{(x.acted_at || x.note) && (
														<div className={styles.sub}>
															{x.acted_at ? formatStamp(x.acted_at) : ''}
															{x.note ? ` · ${x.note}` : ''}
														</div>
													)}
												</li>
											))}
										</ul>
									</li>
								);
							})}
						</ol>
					</div>

					<div className={styles.section}>
						<h3 className={styles.sectionTitle}>Văn bản</h3>
						<ul className={styles.docList}>
							{d.documents.map((doc) => (
								<li key={doc.id}>
									<span className={styles.docName}>{doc.file_name}</span>
									<button
										type='button'
										className={styles.iconBtn}
										onClick={() => void download(doc)}
										title='Tải bản mới nhất'
										aria-label={`Tải ${doc.file_name}`}
									>
										<DownloadSvg />
									</button>
								</li>
							))}
						</ul>
						{d.documents.length > 1 && (
							<button
								type='button'
								className={styles.textBtn}
								onClick={() => void downloadAll()}
							>
								<DownloadSvg /> Tải tất cả
							</button>
						)}
					</div>

					<div className={styles.section}>
						<h3 className={styles.sectionTitle}>Nhật ký</h3>
						<ul className={styles.events}>
							{d.events.map((e, i) => (
								<li key={i}>
									<span className={styles.eTime}>{formatStamp(e.created_at)}</span>
									<span>
										{e.actor_name ? <strong>{e.actor_name}</strong> : null} {EVENT_LABEL[e.action] ?? e.action}
										{e.action === 'step_started' && e.note ? ` ${e.note.toLowerCase()}` : ''}
										{e.note && e.action !== 'step_started' ? `: ${e.note}` : ''}
									</span>
								</li>
							))}
						</ul>
					</div>

					{d.can_cancel && (
						<button
							type='button'
							className={styles.textDanger}
							onClick={() => {
								setReason('');
								setCancelOpen(true);
							}}
							disabled={!!busy}
						>
							Hủy hồ sơ
						</button>
					)}
				</aside>
			</div>

			{rejectOpen && (
				<Modal
					open
					onClose={() => setRejectOpen(false)}
					title='Từ chối ký'
					subtitle='Hồ sơ dừng lại và trả về người gửi kèm lý do'
					footer={
						<ModalActions
							onCancel={() => setRejectOpen(false)}
							onConfirm={() => void doReject()}
							loading={busy === 'reject'}
							disabled={!reason.trim()}
							confirmLabel='Từ chối ký'
							confirmIcon={<XCircleSvg />}
						/>
					}
				>
					<textarea
						className={styles.textarea}
						value={reason}
						onChange={(e) => setReason(e.target.value)}
						rows={4}
						maxLength={1000}
						placeholder='Lý do (bắt buộc), vd: sai số liệu ở mục 2'
						aria-label='Lý do từ chối'
						autoFocus
					/>
				</Modal>
			)}
			{cancelOpen && (
				<Modal
					open
					onClose={() => setCancelOpen(false)}
					title='Hủy hồ sơ trình ký?'
					subtitle='Người đang chờ ký sẽ nhận thông báo; chữ ký đã có vẫn giữ trong lịch sử'
					footer={
						<ModalActions
							onCancel={() => setCancelOpen(false)}
							onConfirm={() => void doCancel()}
							loading={busy === 'cancel'}
							confirmLabel='Hủy hồ sơ'
							confirmIcon={<XCircleSvg />}
						/>
					}
				>
					<textarea
						className={styles.textarea}
						value={reason}
						onChange={(e) => setReason(e.target.value)}
						rows={3}
						maxLength={1000}
						placeholder='Lý do (không bắt buộc)'
						aria-label='Lý do hủy'
					/>
				</Modal>
			)}
		</Layout>
	);
}
