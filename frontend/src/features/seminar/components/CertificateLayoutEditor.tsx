import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { CheckSvg, EditSvg, EyeOffSvg, EyeSvg, LayersSvg, PlusSvg, RefreshSvg } from '@/assets/icons';
import { Modal, confirmDialog } from '@/shared/components';
import { InlineLoading } from '@/shared/components/Loading';
import { BASE_URL } from '@/shared/api/endpoints';
import { showToast } from '@/shared/utils/feedback';
import {
	getCertificateLayout,
	resetCertificateLayout,
	saveCertificateLayout,
	type CertificateLayout,
	type CertificateSlot,
	type CertificateSlotEdit,
	type CertificateText,
	type CertificateTextEdit,
	missingChars,
} from '../api/seminarApi';
import styles from '../pages/Seminar.module.css';
import css from './CertificateLayoutEditor.module.css';

const errMsg = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);
const r1 = (v: number) => Math.round(v * 10) / 10;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
// Số đo font Inter (em): chân chữ cách đỉnh dòng ASCENT, cả dòng ASCENT + DESCENT
const ASCENT = 0.969;
const LINE = 1.211;
const MIN_W = 10;
const BOLD_KEYS = new Set(['name', 'credits']);

type Kind = 'slot' | 'text';
type Geo = { x0: number; x1: number; baseline: number; size: number; align: 'left' | 'center' };
type Sel = { kind: Kind; id: string } | null;
type Drag = {
	sel: { kind: Kind; id: string };
	/** resize: kéo mép phải; resizeL: kéo mép trái (giữ mép phải) */
	mode: 'move' | 'resize' | 'resizeL';
	px: number;
	py: number;
	k: number;
	start: Geo;
};
const SERIF_STACK = "'Times New Roman', Tinos, 'Liberation Serif', serif";
// Vị trí ô / đoạn dòng đã lưu — mẫu nét vẽ chỉ xoá chữ cũ ở vùng ĐÃ LƯU
const slotSig = (s: CertificateSlot) => `${s.x0},${s.x1},${s.baseline},${s.size},${s.hidden}`;
const textSig = (t: CertificateText) => `${t.x0},${t.x1}`;

/**
 * Chỉnh mẫu giấy chứng nhận, 2 thẻ:
 *  - Ô dữ liệu: kéo ô để di chuyển, kéo mép phải đổi độ rộng, phím mũi tên dịch
 *    1pt (Shift 5pt); cỡ chữ, căn lề, ẩn/hiện, thêm ô mẫu không có.
 *  - Chữ trên mẫu: sửa các dòng in sẵn (tên hội nghị, ngày tháng, người ký...) —
 *    khi lưu, dòng gốc bị xoá khỏi mẫu và bản in viết dòng mới (font Inter).
 * Mẫu chữ nét vẽ (layout.vector — không có lớp chữ): dòng chữ là các khối dò theo
 * hình, không đọc được nội dung → kéo 2 mép chọn đoạn cần thay rồi gõ chữ mới; mỗi
 * ô dữ liệu cũng xoá chữ mẫu nằm dưới nó. Kiểu chữ (đậm, nghiêng, có chân, màu) chọn tay.
 * Chữ minh hoạ dùng Inter như bản in; "Xem thử" ở hộp thoại ngoài cho bản in thật.
 */
export function CertificateLayoutEditor({
	seminarId,
	onClose,
	onSaved,
}: {
	seminarId: string;
	onClose: () => void;
	onSaved: () => void;
}) {
	const [layout, setLayout] = useState<CertificateLayout | null>(null);
	const [slots, setSlots] = useState<Record<string, CertificateSlot | null>>({});
	const [texts, setTexts] = useState<Record<string, CertificateText>>({});
	// Dòng đã sửa / ô và ĐÃ LƯU (kèm vị trí lúc lưu) → ảnh nền không còn chữ gốc ở đó
	const [removedInImage, setRemovedInImage] = useState<Map<string, string>>(new Map());
	const [savedSlots, setSavedSlots] = useState<Map<string, string>>(new Map());
	const [tab, setTab] = useState<Kind>('slot');
	const [sel, setSel] = useState<Sel>(null);
	const [dirty, setDirty] = useState(false);
	const [busy, setBusy] = useState<'save' | 'reset' | null>(null);
	const [imgLoaded, setImgLoaded] = useState(false);
	const drag = useRef<Drag | null>(null);
	const canvasRef = useRef<HTMLDivElement>(null);

	const apply = (l: CertificateLayout) => {
		setLayout((prev) => {
			if (prev?.image_url !== l.image_url) setImgLoaded(false);
			return l;
		});
		setSlots(Object.fromEntries(l.fields.map((f) => [f.key, f.slot])));
		setTexts(Object.fromEntries(l.texts.map((t) => [t.id, t])));
		setRemovedInImage(new Map(l.texts.filter((t) => t.edited).map((t) => [t.id, l.vector ? textSig(t) : ''])));
		setSavedSlots(new Map(l.fields.flatMap((f) => (f.slot ? [[f.key, slotSig(f.slot)] as const] : []))));
		setDirty(false);
	};

	useEffect(() => {
		getCertificateLayout(seminarId)
			.then((l) => {
				apply(l);
				const first = l.fields.find((f) => f.slot);
				setSel(first ? { kind: 'slot', id: first.key } : null);
			})
			.catch((e) => {
				showToast('error', errMsg(e, 'Không tải được mẫu'));
				onClose();
			});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [seminarId]);

	const page = layout?.page ?? { width: 595, height: 842 };
	const fields = layout?.fields ?? [];
	const textList = layout ? layout.texts.map((t) => texts[t.id]).filter(Boolean) : [];

	const geoOf = (s: { kind: Kind; id: string }): Geo | null =>
		s.kind === 'slot' ? (slots[s.id] ?? null) : (texts[s.id] ?? null);

	const update = (s: { kind: Kind; id: string }, patch: Partial<CertificateSlot & CertificateText>) => {
		if (s.kind === 'slot') {
			setSlots((prev) => (prev[s.id] ? { ...prev, [s.id]: { ...prev[s.id]!, ...patch } } : prev));
		} else {
			setTexts((prev) => (prev[s.id] ? { ...prev, [s.id]: { ...prev[s.id], ...patch, edited: true } } : prev));
		}
		setDirty(true);
	};

	// Màu chữ hay gặp nhất trên mẫu nét vẽ (thân bài) — màu mặc định cho ô mới
	const bodyColor = () => {
		const count = new Map<string, number>();
		for (const t of layout?.texts ?? []) count.set(t.color, (count.get(t.color) ?? 0) + (t.box.x1 - t.box.x0));
		return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
	};

	// Ô mẫu không có: đặt giữa trang, cùng màu ô khác — người dùng kéo tới chỗ cần
	const addField = (key: string) => {
		const ref = Object.values(slots).find(Boolean);
		const vector = !!layout?.vector;
		const x0 = r1(page.width * 0.35);
		setSlots((prev) => ({
			...prev,
			[key]: {
				x0,
				x1: r1(x0 + 180),
				baseline: r1(page.height * 0.5),
				size: 12,
				align: 'left',
				hidden: false,
				color: ref?.color ?? (vector ? bodyColor() : undefined) ?? '#049240',
				bold: ref && vector ? ref.bold : BOLD_KEYS.has(key),
				italic: false,
				suffix: '',
				// Mẫu nét vẽ hay là giấy hành chính chữ Times
				serif: ref ? ref.serif : vector,
			},
		}));
		setSel({ kind: 'slot', id: key });
		setDirty(true);
	};

	// Trả dòng chữ về như mẫu gốc (bỏ bản sửa): chữ, vị trí, kiểu chữ của dòng gốc
	const revertText = (id: string) => {
		const orig = layout?.texts.find((t) => t.id === id);
		if (!orig) return;
		setTexts((prev) => ({
			...prev,
			[id]: { ...prev[id], ...orig.base, text: orig.original, edited: false },
		}));
		setDirty(true);
	};

	// ─── Kéo thả ───────────────────────────────────────────────────────────
	const startDrag = (e: PointerEvent, s: { kind: Kind; id: string }, mode: Drag['mode']) => {
		const g = geoOf(s);
		const rect = canvasRef.current?.getBoundingClientRect();
		if (!g || !rect) return;
		e.preventDefault();
		e.stopPropagation();
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		setSel(s);
		drag.current = { sel: s, mode, px: e.clientX, py: e.clientY, k: rect.width / page.width, start: { ...g } };
	};
	const onDrag = (e: PointerEvent) => {
		const d = drag.current;
		if (!d) return;
		const dx = (e.clientX - d.px) / d.k;
		const dy = (e.clientY - d.py) / d.k;
		if (Math.abs(dx) < 0.3 && Math.abs(dy) < 0.3) return; // bấm chọn, không kéo
		const g = d.start;
		if (d.mode === 'move') {
			const w = g.x1 - g.x0;
			const x0 = clamp(g.x0 + dx, 0, page.width - w);
			update(d.sel, { x0: r1(x0), x1: r1(x0 + w), baseline: r1(clamp(g.baseline + dy, g.size, page.height)) });
		} else if (d.mode === 'resizeL') {
			update(d.sel, { x0: r1(clamp(g.x0 + dx, 0, g.x1 - MIN_W)) });
		} else {
			update(d.sel, { x1: r1(clamp(g.x1 + dx, g.x0 + MIN_W, page.width)) });
		}
	};
	const endDrag = () => {
		drag.current = null;
	};

	const onKey = (e: KeyboardEvent) => {
		const g = sel && geoOf(sel);
		if (!sel || !g) return;
		if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
		const step = e.shiftKey ? 5 : 1;
		const m = (
			{ ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] } as Record<
				string,
				[number, number]
			>
		)[e.key];
		if (!m) return;
		e.preventDefault();
		const w = g.x1 - g.x0;
		const x0 = clamp(g.x0 + m[0], 0, page.width - w);
		update(sel, { x0: r1(x0), x1: r1(x0 + w), baseline: r1(clamp(g.baseline + m[1], g.size, page.height)) });
	};

	// ─── Lưu / khôi phục ───────────────────────────────────────────────────
	const save = async () => {
		const slotEdits: Record<string, CertificateSlotEdit> = {};
		for (const [key, s] of Object.entries(slots)) {
			if (!s) continue;
			const { x0, x1, baseline, size, align, hidden, color, bold, italic, serif, suffix } = s;
			slotEdits[key] = { x0, x1, baseline, size, align, hidden, color, bold, italic, serif, suffix };
		}
		const textEdits: Record<string, CertificateTextEdit> = {};
		for (const t of Object.values(texts)) {
			if (t.edited) {
				const { text, x0, x1, baseline, size, align, color, bold, italic, serif } = t;
				// Dòng nét vẽ: kiểu chữ do người dùng chọn; dòng thường in bằng font của dòng gốc
				textEdits[t.id] = t.vector
					? { text, x0, x1, baseline, size, align, color, bold, italic, serif }
					: { text, x0, x1, baseline, size, align };
			}
		}
		setBusy('save');
		try {
			apply(await saveCertificateLayout(seminarId, slotEdits, textEdits));
			showToast('success', 'Đã lưu mẫu');
			onSaved();
		} catch (e) {
			showToast('error', errMsg(e, 'Lưu thất bại'));
		} finally {
			setBusy(null);
		}
	};

	const reset = async () => {
		const ok = await confirmDialog({
			title: 'Khôi phục mẫu gốc?',
			message: 'Bỏ mọi chỉnh sửa (vị trí ô và chữ đã sửa), quay về mẫu như lúc tải lên?',
			confirmLabel: 'Khôi phục',
			tone: 'danger',
		});
		if (!ok) return;
		setBusy('reset');
		try {
			apply(await resetCertificateLayout(seminarId));
			showToast('success', 'Đã khôi phục mẫu gốc');
			onSaved();
		} catch (e) {
			showToast('error', errMsg(e, 'Khôi phục thất bại'));
		} finally {
			setBusy(null);
		}
	};

	const close = async () => {
		if (
			dirty &&
			!(await confirmDialog({
				title: 'Đóng mà không lưu?',
				message: 'Các thay đổi chưa được lưu. Đóng mà không lưu?',
				confirmLabel: 'Đóng không lưu',
				tone: 'danger',
			}))
		)
			return;
		onClose();
	};

	const geoStyle = (g: Geo): CSSProperties => ({
		left: `${(g.x0 / page.width) * 100}%`,
		width: `${((g.x1 - g.x0) / page.width) * 100}%`,
		top: `${((g.baseline - ASCENT * g.size) / page.height) * 100}%`,
		height: `${((LINE * g.size) / page.height) * 100}%`,
		// cqw: theo bề rộng khung trang → cỡ chữ co giãn cùng ảnh nền
		fontSize: `${(g.size / page.width) * 100}cqw`,
		textAlign: g.align,
	});

	const isSel = (kind: Kind, id: string) => sel?.kind === kind && sel.id === id;
	const vector = !!layout?.vector;
	const imageUrl = layout ? `${BASE_URL}${layout.image_url}` : '';
	// Tay nắm 2 mép của mục đang chọn
	const handles = (s: { kind: Kind; id: string }) => (
		<>
			{(['resizeL', 'resize'] as const).map((mode) => (
				<span
					key={mode}
					className={mode === 'resizeL' ? `${css.handle} ${css.handleLeft}` : css.handle}
					onPointerDown={(e) => startDrag(e, s, mode)}
					onPointerMove={onDrag}
					onPointerUp={endDrag}
					onPointerCancel={endDrag}
					aria-hidden
				/>
			))}
		</>
	);
	const selGeo = sel ? geoOf(sel) : null;
	const selSlotField = sel?.kind === 'slot' ? fields.find((f) => f.key === sel.id) : undefined;
	const selText = sel?.kind === 'text' ? texts[sel.id] : undefined;
	const editedCount = textList.filter((t) => t.edited).length;

	return (
		<Modal
			open
			onClose={close}
			icon={<LayersSvg />}
			title='Chỉnh mẫu giấy chứng nhận'
			subtitle='Kéo để di chuyển · kéo mép phải để đổi độ rộng · phím mũi tên dịch 1pt (Shift: 5pt)'
			size='xl'
			closeOnBackdrop={false}
			bodyClassName={css.body}
			footer={
				<>
					<button
						type='button'
						className={`${styles.btnGhost} ${css.resetBtn}`}
						onClick={() => void reset()}
						disabled={!layout || !!busy}
					>
						{busy === 'reset' ? <span className={styles.spinner} /> : <RefreshSvg />} Khôi phục mẫu gốc
					</button>
					<button
						type='button'
						className={styles.btnCancel}
						onClick={close}
						disabled={!!busy}
					>
						Hủy
					</button>
					<button
						type='button'
						className={styles.btnPrimary}
						onClick={() => void save()}
						disabled={!dirty || !!busy}
					>
						{busy === 'save' ? <span className={styles.spinner} /> : <CheckSvg />}
						{busy === 'save' ? 'Đang lưu…' : 'Lưu'}
					</button>
				</>
			}
		>
			{!layout ? (
				<InlineLoading />
			) : (
				<div className={css.layout}>
					{/* ── Trang mẫu ── */}
					<div className={css.stage}>
						<div
							ref={canvasRef}
							className={`${css.canvas} ${tab === 'text' ? css.canvasText : ''}`}
							style={{
								aspectRatio: `${page.width} / ${page.height}`,
								width: `min(100%, calc(72vh * ${page.width / page.height}))`,
							}}
							tabIndex={0}
							onKeyDown={onKey}
							onPointerDown={() => setSel(null)}
							aria-label='Trang mẫu giấy chứng nhận — chọn rồi dùng phím mũi tên để dịch'
						>
							<img
								src={imageUrl}
								alt='Mẫu giấy chứng nhận'
								className={css.bg}
								draggable={false}
								onLoad={() => setImgLoaded(true)}
							/>
							{!imgLoaded && <div className={css.bgLoading}>Đang tải ảnh mẫu…</div>}

							{/* Dòng chữ in sẵn: thẻ "Chữ trên mẫu" thì chọn được; thẻ kia chỉ hiện dòng đã sửa */}
							{textList.map((t) => {
								const interactive = tab === 'text';
								if (!interactive && !t.edited) return null;
								const active = interactive && isSel('text', t.id);
								// Sửa nhưng chưa lưu (mẫu nét vẽ: hoặc đổi đoạn xoá): ảnh nền vẫn còn chữ gốc → che tạm
								const cover = t.edited && removedInImage.get(t.id) !== (vector ? textSig(t) : '');
								return (
									<div
										key={t.id}
										className={[
											css.line,
											interactive ? css.lineInteractive : css.linePassive,
											t.edited ? css.lineEdited : '',
											cover ? css.lineCover : '',
											active ? css.lineActive : '',
										].join(' ')}
										style={{
											...geoStyle(t),
											color: t.color,
											fontWeight: t.bold ? 700 : 400,
											fontStyle: t.italic ? 'italic' : 'normal',
											...(t.serif ? { fontFamily: SERIF_STACK } : {}),
										}}
										onPointerDown={interactive ? (e) => startDrag(e, { kind: 'text', id: t.id }, 'move') : undefined}
										onPointerMove={interactive ? onDrag : undefined}
										onPointerUp={interactive ? endDrag : undefined}
										onPointerCancel={interactive ? endDrag : undefined}
										title={interactive ? t.original || 'Dòng chữ trên mẫu' : undefined}
									>
										{t.edited && <span className={css.fieldText}>{t.text}</span>}
										{/* Dòng nét vẽ: chọn đoạn cần thay bằng 2 mép ngay cả khi chưa gõ chữ */}
										{active && (t.edited || t.vector) && handles({ kind: 'text', id: t.id })}
									</div>
								);
							})}

							{/* Ô dữ liệu */}
							{fields.map((f) => {
								const s = slots[f.key];
								if (!s) return null;
								const interactive = tab === 'slot';
								const active = interactive && isSel('slot', f.key);
								return (
									<div
										key={f.key}
										className={[
											css.field,
											interactive ? '' : css.fieldPassive,
											active ? css.fieldActive : '',
											s.hidden ? css.fieldHidden : '',
											// Mẫu nét vẽ: ô mới / vừa dời chưa lưu → chữ mẫu bên dưới chưa bị xoá, che tạm
											vector && !s.hidden && savedSlots.get(f.key) !== slotSig(s) ? css.lineCover : '',
										].join(' ')}
										style={{
											...geoStyle(s),
											color: s.color,
											fontWeight: s.bold ? 700 : 400,
											fontStyle: s.italic ? 'italic' : 'normal',
											...(s.serif ? { fontFamily: SERIF_STACK } : {}),
										}}
										onPointerDown={interactive ? (e) => startDrag(e, { kind: 'slot', id: f.key }, 'move') : undefined}
										onPointerMove={interactive ? onDrag : undefined}
										onPointerUp={interactive ? endDrag : undefined}
										onPointerCancel={interactive ? endDrag : undefined}
										title={interactive ? f.label : undefined}
									>
										<span className={css.fieldText}>
											{f.sample}
											{s.suffix}
										</span>
										{interactive && <span className={css.fieldTag}>{f.label}</span>}
										{active && handles({ kind: 'slot', id: f.key })}
									</div>
								);
							})}
						</div>
					</div>

					{/* ── Bảng bên phải ── */}
					<aside className={css.panel}>
						<div
							className={css.tabs}
							role='tablist'
						>
							<button
								type='button'
								role='tab'
								aria-selected={tab === 'slot'}
								className={tab === 'slot' ? css.tabOn : ''}
								onClick={() => {
									setTab('slot');
									setSel(null);
								}}
							>
								Ô dữ liệu
							</button>
							<button
								type='button'
								role='tab'
								aria-selected={tab === 'text'}
								className={tab === 'text' ? css.tabOn : ''}
								onClick={() => {
									setTab('text');
									setSel(null);
								}}
							>
								Chữ trên mẫu{editedCount ? ` (${editedCount})` : ''}
							</button>
						</div>

						{tab === 'slot' ? (
							<ul className={css.list}>
								{fields.map((f) => {
									const s = slots[f.key];
									return (
										<li key={f.key}>
											<button
												type='button'
												className={`${css.item} ${isSel('slot', f.key) ? css.itemActive : ''}`}
												onClick={() => (s ? setSel({ kind: 'slot', id: f.key }) : addField(f.key))}
											>
												<span className={css.itemLabel}>{f.label}</span>
												{!s ? (
													<span className={css.itemAdd}>
														<PlusSvg /> Thêm
													</span>
												) : s.hidden ? (
													<span className={css.itemMuted}>
														<EyeOffSvg /> Ẩn
													</span>
												) : (
													<span
														className={css.itemDot}
														style={{ background: s.color }}
													/>
												)}
											</button>
										</li>
									);
								})}
							</ul>
						) : (
							<>
								<p className={css.note}>
									{vector
										? 'Mẫu này không có lớp chữ (chữ đã chuyển thành nét vẽ). Chọn một dòng, kéo 2 mép để khoanh đoạn cần thay, rồi gõ chữ mới — đoạn đó bị xoá khỏi mẫu khi lưu.'
										: 'Bấm một dòng trên mẫu hoặc trong danh sách để sửa — vd tên hội nghị, ngày tháng, người ký.'}
								</p>
								<ul className={`${css.list} ${css.listScroll}`}>
									{textList.map((t) => (
										<li key={t.id}>
											<button
												type='button'
												className={`${css.item} ${isSel('text', t.id) ? css.itemActive : ''}`}
												onClick={() => setSel({ kind: 'text', id: t.id })}
												title={t.original || undefined}
												aria-label={t.vector && !t.text ? `Dòng ${t.id.slice(1)} trên mẫu` : undefined}
											>
												{t.vector && !(t.edited && t.text) ? (
													<LineThumb
														url={imageUrl}
														page={page}
														box={t.box}
														struck={t.edited}
													/>
												) : (
													<span className={`${css.itemLabel} ${t.edited && !t.text ? css.itemStrike : ''}`}>
														{t.edited ? t.text || t.original : t.original}
													</span>
												)}
												{t.edited && (
													<span className={css.itemAdd}>
														<EditSvg /> Đã sửa
													</span>
												)}
											</button>
										</li>
									))}
								</ul>
							</>
						)}

						{/* Thuộc tính của mục đang chọn */}
						{sel && selGeo && (selSlotField || selText) && (
							<div className={css.props}>
								<div className={css.propsTitle}>{selSlotField ? selSlotField.label : 'Dòng chữ'}</div>

								{selText && (
									<label className={css.textEdit}>
										<span>Nội dung</span>
										<textarea
											rows={2}
											value={selText.text}
											onChange={(e) => update(sel, { text: e.target.value })}
											placeholder={
												selText.vector ? 'Chữ mới thay cho đoạn đã khoanh — để trống để chỉ xoá' : 'Để trống để xoá dòng này'
											}
										/>
										{selText.edited && selText.original && selText.text !== selText.original && (
											<span className={css.original}>Gốc: {selText.original}</span>
										)}
										{missingChars(selText.text, selText.charset).length > 0 && (
											<span className={css.missing}>
												Mẫu không có ký tự{' '}
												{missingChars(selText.text, selText.charset)
													.map((c) => `"${c}"`)
													.join(', ')}{' '}
												— in bằng font thay thế
											</span>
										)}
									</label>
								)}

								{(selSlotField || selText?.edited || selText?.vector) && (
									<>
										<div className={css.prop}>
											<span>Cỡ chữ</span>
											<div className={css.stepper}>
												<button
													type='button'
													onClick={() => update(sel, { size: r1(clamp(selGeo.size - 0.5, 6, 40)) })}
													aria-label='Giảm cỡ chữ'
												>
													−
												</button>
												<input
													type='number'
													aria-label='Cỡ chữ'
													min={6}
													max={40}
													step={0.5}
													value={selGeo.size}
													onChange={(e) => {
														const v = Number(e.target.value);
														if (Number.isFinite(v)) update(sel, { size: r1(clamp(v, 6, 40)) });
													}}
												/>
												<button
													type='button'
													onClick={() => update(sel, { size: r1(clamp(selGeo.size + 0.5, 6, 40)) })}
													aria-label='Tăng cỡ chữ'
												>
													+
												</button>
											</div>
										</div>
										<div className={css.prop}>
											<span>Căn lề</span>
											<div
												className={css.segment}
												role='radiogroup'
												aria-label='Căn lề'
											>
												{(['left', 'center'] as const).map((a) => (
													<button
														key={a}
														type='button'
														role='radio'
														aria-checked={selGeo.align === a}
														className={selGeo.align === a ? css.segOn : ''}
														onClick={() => update(sel, { align: a })}
													>
														{a === 'left' ? 'Trái' : 'Giữa'}
													</button>
												))}
											</div>
										</div>
										<div className={css.coords}>
											{(
												[
													['X', 'x0'],
													['Y', 'baseline'],
													['Rộng', 'w'],
												] as const
											).map(([label, k]) => (
												<label key={k}>
													<span>{label}</span>
													<input
														type='number'
														step={1}
														value={k === 'w' ? r1(selGeo.x1 - selGeo.x0) : selGeo[k]}
														onChange={(e) => {
															const v = Number(e.target.value);
															if (!Number.isFinite(v)) return;
															if (k === 'w') update(sel, { x1: r1(selGeo.x0 + Math.max(MIN_W, v)) });
															else if (k === 'x0') update(sel, { x0: r1(v), x1: r1(v + selGeo.x1 - selGeo.x0) });
															else update(sel, { baseline: r1(v) });
														}}
													/>
												</label>
											))}
										</div>
									</>
								)}

								{/* Kiểu chữ: ô dữ liệu và dòng nét vẽ (dòng thường dùng font của mẫu) */}
								{(selSlotField || selText?.vector) && (
									<StyleRow
										value={selSlotField ? slots[selSlotField.key]! : selText!}
										onChange={(patch) => update(sel, patch)}
										serifMissing={!layout.serif_font}
									/>
								)}

								{selSlotField && slots[selSlotField.key] && (
									<label className={css.textEdit}>
										<span>Chữ in kèm sau</span>
										<input
											className={css.textInput}
											value={slots[selSlotField.key]!.suffix}
											onChange={(e) => update(sel, { suffix: e.target.value })}
											placeholder={selSlotField.key === 'so' ? 'vd /GCN/2025' : 'vd  giờ tín chỉ)'}
											maxLength={80}
										/>
									</label>
								)}

								{selSlotField && slots[selSlotField.key] && (
									<button
										type='button'
										className={`${css.toggle} ${slots[selSlotField.key]!.hidden ? css.toggleOff : ''}`}
										onClick={() => update(sel, { hidden: !slots[selSlotField.key]!.hidden })}
									>
										{slots[selSlotField.key]!.hidden ? <EyeOffSvg /> : <EyeSvg />}
										{slots[selSlotField.key]!.hidden ? 'Đang ẩn — không in ô này' : 'Đang in ô này'}
									</button>
								)}

								{selText?.edited && (
									<button
										type='button'
										className={css.linkBtn}
										onClick={() => revertText(selText.id)}
									>
										<RefreshSvg /> Trả về chữ gốc
									</button>
								)}

								<p className={css.note}>
									{selText?.vector
										? 'Chữ mẫu trong khung (từ mép trái tới mép phải) bị xoá khi lưu, chữ mới in từ mép trái. Bấm "Xem thử" sau khi lưu để kiểm tra bản in.'
										: selText
											? 'Dòng sửa dùng lại font, cỡ, màu của dòng gốc trên mẫu. Bấm "Xem thử" sau khi lưu để kiểm tra bản in.'
											: vector
												? 'Kéo ô đè lên chữ mẫu cần thay (vd tên người trên giấy mẫu) và kéo 2 mép phủ hết đoạn đó — chữ mẫu dưới ô bị xoá khi lưu.'
												: `Đơn vị: điểm (pt) trên khổ ${Math.round(page.width)}×${Math.round(page.height)}. Bấm "Xem thử" sau khi lưu để kiểm tra bản in.`}
								</p>
							</div>
						)}
					</aside>
				</div>
			)}
		</Modal>
	);
}

const THUMB_H = 16;

/** Ảnh cắt đúng khung 1 dòng chữ nét vẽ từ ảnh mẫu — thay cho chữ (không đọc được). */
function LineThumb({
	url,
	page,
	box,
	struck,
}: {
	url: string;
	page: { width: number; height: number };
	box: CertificateText['box'];
	struck: boolean;
}) {
	const pad = 1;
	const w = box.x1 - box.x0 + 2 * pad;
	const h = box.y1 - box.y0 + 2 * pad;
	return (
		// Cùng chiều cao cho mọi dòng (chữ cùng cỡ); dòng dài quá thì cắt bớt bên phải
		<svg
			className={`${css.thumb} ${struck ? css.thumbStruck : ''}`}
			style={{ width: `${(w / h) * THUMB_H}px` }}
			viewBox={`${box.x0 - pad} ${box.y0 - pad} ${w} ${h}`}
			preserveAspectRatio='xMinYMid slice'
			aria-hidden
		>
			<image
				href={url}
				x={0}
				y={0}
				width={page.width}
				height={page.height}
			/>
		</svg>
	);
}

/** Đậm / nghiêng / có chân + màu chữ của ô hoặc dòng nét vẽ đang chọn. */
function StyleRow({
	value,
	onChange,
	serifMissing,
}: {
	value: { bold: boolean; italic: boolean; serif: boolean; color: string };
	onChange: (patch: Partial<{ bold: boolean; italic: boolean; serif: boolean; color: string }>) => void;
	serifMissing: boolean;
}) {
	const toggles = [
		['bold', 'Đậm', 'B'],
		['italic', 'Nghiêng', 'I'],
		['serif', 'Chữ có chân (Times)', 'Tt'],
	] as const;
	return (
		<>
			<div className={css.prop}>
				<span>Kiểu chữ</span>
				<div className={css.styleRow}>
					{toggles.map(([k, label, glyph]) => (
						<button
							key={k}
							type='button'
							className={`${css.styleBtn} ${value[k] ? css.styleOn : ''}`}
							aria-pressed={value[k]}
							aria-label={label}
							title={label}
							onClick={() => onChange({ [k]: !value[k] })}
							style={
								k === 'bold'
									? { fontWeight: 700 }
									: k === 'italic'
										? { fontStyle: 'italic', fontFamily: SERIF_STACK }
										: { fontFamily: SERIF_STACK }
							}
						>
							{glyph}
						</button>
					))}
					<input
						type='color'
						className={css.colorInput}
						value={value.color}
						onChange={(e) => onChange({ color: e.target.value })}
						aria-label='Màu chữ'
						title='Màu chữ'
					/>
				</div>
			</div>
			{value.serif && serifMissing && (
				<span className={css.missing}>
					Máy chủ chưa có font Times New Roman — chữ có chân tạm in bằng Inter. Chép các file times*.ttf vào thư mục font
					giấy chứng nhận trên máy chủ.
				</span>
			)}
		</>
	);
}
