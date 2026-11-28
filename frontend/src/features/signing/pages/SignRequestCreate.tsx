import { FilePdfSvg, PlusSvg, TrashSvg, XSvg } from '@/assets/icons';
import AdminLayout from '@/layouts/AdminLayout';
import UserLayout from '@/layouts/UserLayout';
import { Button, DatePicker, FileDropzone } from '@/shared/components';
import { showToast } from '@/shared/utils/feedback';
import { toIsoDate } from '@/shared/utils/formatDate';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { signRequestApi, type UserOption } from '../api/signRequestApi';
import { PdfSignCanvas, type CanvasBox } from '../components/PdfSignCanvas';
import { UserSearch } from '../components/UserSearch';
import { DEFAULT_BOX, boxAtAnchor, defaultBox, openPdf, pdfErrorMessage, toPdfRect } from '../utils/pdfDoc';
import { findSignAnchors, type SignAnchor } from '../utils/signAnchors';
import type { SignBox } from '../utils/signBox';
import { signRequestBase } from '../utils/signRequestPaths';
import styles from './SignRequestCreate.module.css';

interface Doc {
	file: File;
	doc: PDFDocumentProxy;
	pages: PDFPageProxy[];
	anchors: SignAnchor[];
}
interface Step {
	key: number;
	mode: 'all' | 'any';
	signers: UserOption[];
}

const MAX_DOCS = 20;
let stepSeq = 1;
const fieldKey = (docIdx: number, userId: string) => `${docIdx}:${userId}`;

export default function SignRequestCreate() {
	const { pathname } = useLocation();
	const isAdmin = pathname.startsWith('/admin');
	const Layout = isAdmin ? AdminLayout : UserLayout;
	const baseUrl = signRequestBase(pathname);
	const navigate = useNavigate();

	const [title, setTitle] = useState('');
	const [message, setMessage] = useState('');
	const [dueDate, setDueDate] = useState('');
	const [docs, setDocs] = useState<Doc[]>([]);
	const [opening, setOpening] = useState(false);
	const [steps, setSteps] = useState<Step[]>([{ key: stepSeq++, mode: 'all', signers: [] }]);
	const [fields, setFields] = useState<Map<string, SignBox>>(new Map());
	const [docIdx, setDocIdx] = useState(0);
	const [activeUser, setActiveUser] = useState<string | null>(null);
	const [sending, setSending] = useState(false);

	useEffect(() => () => docs.forEach((d) => void d.doc.loadingTask.destroy()), [docs]);

	const signers = useMemo(() => steps.flatMap((s) => s.signers), [steps]);
	const signerIds = useMemo(() => new Set(signers.map((u) => u.id)), [signers]);
	const doc = docs[docIdx] ?? null;

	// ─── Văn bản ──
	const addFile = async (f: File | null) => {
		if (!f) return;
		if (docs.length >= MAX_DOCS) {
			showToast('error', `Tối đa ${MAX_DOCS} văn bản mỗi hồ sơ`);
			return;
		}
		if (f.size > 20 * 1024 * 1024) {
			showToast('error', 'File quá lớn (tối đa 20 MB)');
			return;
		}
		setOpening(true);
		try {
			const { doc: d, pages } = await openPdf(f);
			const anchors = await findSignAnchors(pages).catch(() => []);
			setDocs((ds) => [...ds, { file: f, doc: d, pages, anchors }]);
			if (!title.trim()) setTitle(f.name.replace(/\.pdf$/i, ''));
		} catch (e) {
			showToast('error', pdfErrorMessage(e));
		} finally {
			setOpening(false);
		}
	};
	const removeDoc = (i: number) => {
		setDocs((ds) => ds.filter((_, k) => k !== i));
		// Khung của văn bản sau dịch chỉ số lên
		setFields((m) => {
			const n = new Map<string, SignBox>();
			m.forEach((b, k) => {
				const [d, u] = k.split(':');
				const di = Number(d);
				if (di < i) n.set(k, b);
				else if (di > i) n.set(fieldKey(di - 1, u), b);
			});
			return n;
		});
		setDocIdx(0);
	};

	// ─── Người ký ──
	const updateStep = (key: number, patch: Partial<Step>) =>
		setSteps((ss) => ss.map((s) => (s.key === key ? { ...s, ...patch } : s)));
	const removeSigner = (userId: string) => {
		setSteps((ss) => ss.map((s) => ({ ...s, signers: s.signers.filter((u) => u.id !== userId) })));
		setFields((m) => {
			const n = new Map(m);
			[...n.keys()].filter((k) => k.endsWith(`:${userId}`)).forEach((k) => n.delete(k));
			return n;
		});
		if (activeUser === userId) setActiveUser(null);
	};

	// ─── Vị trí ký ──
	const placeFor = (userId: string) => {
		if (!doc) return;
		const used = new Set(
			[...fields.entries()]
				.filter(([k]) => k.startsWith(`${docIdx}:`))
				.map(([, b]) => `${b.page}:${Math.round(b.left)}:${Math.round(b.top)}`),
		);
		const placed = [...fields.keys()].filter((k) => k.startsWith(`${docIdx}:`)).length;
		// Chỗ ký gợi ý chưa ai dùng, theo thứ tự trong văn bản; hết thì xếp ở cuối trang cuối
		const free = doc.anchors
			.map((a) => boxAtAnchor(a, doc.pages[a.page - 1], DEFAULT_BOX.width, DEFAULT_BOX.height))
			.find((b) => !used.has(`${b.page}:${Math.round(b.left)}:${Math.round(b.top)}`));
		const box = free ?? defaultBox(doc.pages, DEFAULT_BOX.width, DEFAULT_BOX.height, placed);
		setFields((m) => new Map(m).set(fieldKey(docIdx, userId), box));
		setActiveUser(userId);
		document.querySelector(`[data-page="${box.page}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
	};
	const unplace = (userId: string) =>
		setFields((m) => {
			const n = new Map(m);
			n.delete(fieldKey(docIdx, userId));
			return n;
		});

	const canvasBoxes: CanvasBox[] = signers
		.map((u) => {
			const box = fields.get(fieldKey(docIdx, u.id));
			return box ? { key: u.id, box, label: u.full_name, editable: u.id === activeUser } : null;
		})
		.filter((x): x is NonNullable<typeof x> => x !== null);

	// ─── Gửi ──
	const problems = [
		!title.trim() && 'Nhập tiêu đề hồ sơ',
		!docs.length && 'Thêm ít nhất 1 văn bản PDF',
		!signers.length && 'Thêm ít nhất 1 người ký',
		steps.some((s) => !s.signers.length) && 'Có bước chưa có người ký — thêm người hoặc xóa bước',
	].filter(Boolean) as string[];

	const send = async () => {
		if (problems.length) return;
		setSending(true);
		try {
			const out = await signRequestApi.create(
				docs.map((d) => d.file),
				{
					title: title.trim(),
					message: message.trim() || null,
					due_date: dueDate || null,
					steps: steps.map((s) => ({ mode: s.mode, signers: s.signers.map((u) => u.id) })),
					fields: [...fields.entries()]
						.filter(([k]) => signerIds.has(k.split(':')[1]))
						.map(([k, b]) => {
							const [d, uid] = k.split(':');
							return { doc: Number(d), user_id: uid, ...toPdfRect(docs[Number(d)].pages[b.page - 1], b) };
						}),
				},
			);
			showToast('success', 'Đã gửi hồ sơ — người ký ở bước 1 đã nhận thông báo');
			navigate(`${baseUrl}/${out.id}`);
		} catch (e) {
			showToast('error', e instanceof Error ? e.message : 'Gửi hồ sơ không thành công');
		} finally {
			setSending(false);
		}
	};

	const placedCount = (userId: string) => docs.filter((_, i) => fields.has(fieldKey(i, userId))).length;

	return (
		<Layout
			pageTitle='Tạo hồ sơ trình ký'
			pageSubtitle='Văn bản PDF sẽ được gửi lần lượt cho từng bước người ký'
			breadcrumbs={isAdmin ? undefined : [{ label: 'Trình ký văn bản', to: baseUrl }, { label: 'Tạo hồ sơ' }]}
		>
			<div className={styles.layout}>
				{/* ── 1. Thông tin ── */}
				<section className={styles.card}>
					<h2 className={styles.cardTitle}>
						<span className={styles.num}>1</span> Văn bản trình ký
					</h2>
					<div className={styles.grid}>
						<label className={styles.field}>
							<span className={styles.label}>Tiêu đề hồ sơ</span>
							<input
								className={styles.input}
								value={title}
								onChange={(e) => setTitle(e.target.value)}
								placeholder='VD: Quyết định phê duyệt kế hoạch đào tạo 2027'
								maxLength={300}
							/>
						</label>
						<div className={styles.field}>
							<span className={styles.label}>Hạn ký (không bắt buộc)</span>
							<DatePicker
								value={dueDate}
								onChange={setDueDate}
								min={toIsoDate(new Date())}
								placeholder='Chọn ngày'
							/>
						</div>
						<label className={`${styles.field} ${styles.full}`}>
							<span className={styles.label}>Lời nhắn cho người ký</span>
							<textarea
								className={styles.textarea}
								value={message}
								onChange={(e) => setMessage(e.target.value)}
								rows={2}
								maxLength={2000}
								placeholder='Không bắt buộc'
							/>
						</label>
					</div>
					{docs.length > 0 && (
						<ul className={styles.docList}>
							{docs.map((d, i) => (
								<li
									key={`${d.file.name}-${i}`}
									className={styles.docItem}
								>
									<span className={styles.docIcon}>
										<FilePdfSvg />
									</span>
									<span className={styles.docName}>{d.file.name}</span>
									<span className={styles.docMeta}>{d.pages.length} trang</span>
									<button
										type='button'
										className={styles.iconBtn}
										onClick={() => removeDoc(i)}
										aria-label={`Bỏ ${d.file.name}`}
										title='Bỏ văn bản'
									>
										<TrashSvg />
									</button>
								</li>
							))}
						</ul>
					)}
					<FileDropzone
						value={null}
						onChange={(f) => void addFile(f)}
						accept='.pdf'
						hint={opening ? 'Đang mở văn bản…' : `Thêm file PDF (tối đa ${MAX_DOCS} văn bản, mỗi file ≤ 20 MB)`}
						disabled={opening}
					/>
				</section>

				{/* ── 2. Người ký ── */}
				<section className={styles.card}>
					<h2 className={styles.cardTitle}>
						<span className={styles.num}>2</span> Người ký
					</h2>
					<p className={styles.hint}>
						Các bước ký lần lượt từ trên xuống. Trong một bước, mọi người ký cùng lúc (song song).
					</p>
					<ol className={styles.steps}>
						{steps.map((s, i) => (
							<li
								key={s.key}
								className={styles.step}
							>
								<div className={styles.stepHead}>
									<span className={styles.stepNo}>Bước {i + 1}</span>
									<div
										className={styles.segmented}
										role='radiogroup'
										aria-label={`Cách ký bước ${i + 1}`}
									>
										{(
											[
												['all', 'Tất cả phải ký'],
												['any', 'Chỉ cần 1 người'],
											] as const
										).map(([m, l]) => (
											<button
												key={m}
												type='button'
												role='radio'
												aria-checked={s.mode === m}
												className={s.mode === m ? styles.segOn : undefined}
												onClick={() => updateStep(s.key, { mode: m })}
											>
												{l}
											</button>
										))}
									</div>
									{steps.length > 1 && (
										<button
											type='button'
											className={styles.iconBtn}
											onClick={() => {
												s.signers.forEach((u) => removeSigner(u.id));
												setSteps((ss) => ss.filter((x) => x.key !== s.key));
											}}
											aria-label={`Xóa bước ${i + 1}`}
											title='Xóa bước'
										>
											<TrashSvg />
										</button>
									)}
								</div>
								<div className={styles.chips}>
									{s.signers.map((u) => (
										<span
											key={u.id}
											className={styles.chip}
										>
											{u.full_name}
											<button
												type='button'
												onClick={() => removeSigner(u.id)}
												aria-label={`Bỏ ${u.full_name}`}
											>
												<XSvg />
											</button>
										</span>
									))}
								</div>
								<UserSearch
									exclude={signerIds}
									onPick={(u) => updateStep(s.key, { signers: [...s.signers, u] })}
								/>
							</li>
						))}
					</ol>
					<button
						type='button'
						className={styles.addStep}
						onClick={() => setSteps((ss) => [...ss, { key: stepSeq++, mode: 'all', signers: [] }])}
						disabled={steps.length >= 10}
					>
						<PlusSvg /> Thêm bước ký
					</button>
				</section>

				{/* ── 3. Vị trí ký ── */}
				<section className={`${styles.card} ${styles.placeCard}`}>
					<h2 className={styles.cardTitle}>
						<span className={styles.num}>3</span> Vị trí chữ ký <span className={styles.optional}>không bắt buộc</span>
					</h2>
					<p className={styles.hint}>
						Đặt sẵn khung cho từng người trên từng văn bản để họ chỉ cần bấm Ký (và ký hàng loạt được). Người chưa có
						khung sẽ tự đặt khi ký.
					</p>
					{!docs.length || !signers.length ? (
						<p className={styles.empty}>Thêm văn bản và người ký ở trên để đặt vị trí chữ ký.</p>
					) : (
						<div className={styles.placer}>
							<aside className={styles.placerSide}>
								{docs.length > 1 && (
									<div className={styles.docTabs}>
										{docs.map((d, i) => (
											<button
												key={i}
												type='button'
												className={i === docIdx ? `${styles.docTab} ${styles.docTabOn}` : styles.docTab}
												onClick={() => setDocIdx(i)}
												title={d.file.name}
											>
												{d.file.name}
											</button>
										))}
									</div>
								)}
								<ul className={styles.signerList}>
									{signers.map((u) => {
										const has = fields.has(fieldKey(docIdx, u.id));
										return (
											<li
												key={u.id}
												className={u.id === activeUser ? `${styles.signerRow} ${styles.signerOn}` : styles.signerRow}
											>
												<button
													type='button'
													className={styles.signerName}
													onClick={() => (has ? setActiveUser(u.id) : placeFor(u.id))}
												>
													<span className={has ? styles.dotOn : styles.dot} />
													{u.full_name}
												</button>
												<span className={styles.signerMeta}>
													{placedCount(u.id)}/{docs.length} văn bản
												</span>
												{has ? (
													<button
														type='button'
														className={styles.linkBtn}
														onClick={() => unplace(u.id)}
													>
														Bỏ
													</button>
												) : (
													<button
														type='button'
														className={styles.linkBtn}
														onClick={() => placeFor(u.id)}
													>
														Đặt khung
													</button>
												)}
											</li>
										);
									})}
								</ul>
								<p className={styles.hint}>
									Chọn một người rồi kéo khung của họ trên văn bản, hoặc bấm vào trang để đưa khung tới đó.
								</p>
							</aside>
							<div className={styles.viewer}>
								{doc && (
									<PdfSignCanvas
										pages={doc.pages}
										boxes={canvasBoxes}
										activeKey={activeUser}
										onBoxChange={(k, b) => setFields((m) => new Map(m).set(fieldKey(docIdx, k), b))}
									/>
								)}
							</div>
						</div>
					)}
				</section>

				<div className={styles.footer}>
					{problems.length > 0 && <span className={styles.problem}>{problems[0]}</span>}
					<Button
						variant='secondary'
						onClick={() => navigate(baseUrl)}
						disabled={sending}
					>
						Hủy
					</Button>
					<Button
						variant='primary'
						loading={sending}
						disabled={problems.length > 0}
						onClick={() => void send()}
					>
						Gửi hồ sơ trình ký
					</Button>
				</div>
			</div>
		</Layout>
	);
}
