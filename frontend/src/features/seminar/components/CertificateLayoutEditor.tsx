import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { CheckSvg, EditSvg, EyeOffSvg, EyeSvg, LayersSvg, PlusSvg, RefreshSvg } from '@/assets/icons';
import { Modal } from '@/shared/components';
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
type Drag = { sel: { kind: Kind; id: string }; mode: 'move' | 'resize'; px: number; py: number; k: number; start: Geo };

/**
 * Chỉnh mẫu giấy chứng nhận, 2 thẻ:
 *  - Ô dữ liệu: kéo ô để di chuyển, kéo mép phải đổi độ rộng, phím mũi tên dịch
 *    1pt (Shift 5pt); cỡ chữ, căn lề, ẩn/hiện, thêm ô mẫu không có.
 *  - Chữ trên mẫu: sửa các dòng in sẵn (tên hội nghị, ngày tháng, người ký...) —
 *    khi lưu, dòng gốc bị xoá khỏi mẫu và bản in viết dòng mới (font Inter).
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
	// Dòng đã sửa và ĐÃ LƯU → ảnh nền không còn chữ gốc
	const [removedInImage, setRemovedInImage] = useState<Set<string>>(new Set());
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
		setRemovedInImage(new Set(l.texts.filter((t) => t.edited).map((t) => t.id)));
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

	// Ô mẫu không có: đặt giữa trang, cùng màu ô khác — người dùng kéo tới chỗ cần
	const addField = (key: string) => {
		const ref = Object.values(slots).find(Boolean);
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
				color: ref?.color ?? '#049240',
				bold: BOLD_KEYS.has(key),
				italic: false,
				suffix: '',
				serif: false,
			},
		}));
		setSel({ kind: 'slot', id: key });
		setDirty(true);
	};

	// Trả dòng chữ về như mẫu gốc (bỏ bản sửa)
	const revertText = (id: string) => {
		const orig = layout?.texts.find((t) => t.id === id);
		if (!orig) return;
		// Bản gốc từ server: nếu đang sửa thì toạ độ trong layout là toạ độ đã sửa — lấy chữ gốc
		// và đánh dấu chưa sửa; toạ độ gốc được server trả lại sau khi lưu.
		setTexts((prev) => ({ ...prev, [id]: { ...prev[id], text: orig.original, edited: false } }));
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
			if (s) slotEdits[key] = { x0: s.x0, x1: s.x1, baseline: s.baseline, size: s.size, align: s.align, hidden: s.hidden };
		}
		const textEdits: Record<string, CertificateTextEdit> = {};
		for (const t of Object.values(texts)) {
			if (t.edited) {
				textEdits[t.id] = { text: t.text, x0: t.x0, x1: t.x1, baseline: t.baseline, size: t.size, align: t.align };
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
		if (!window.confirm('Bỏ mọi chỉnh sửa (vị trí ô và chữ đã sửa), quay về mẫu như lúc tải lên?')) return;
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

	const close = () => {
		if (dirty && !window.confirm('Các thay đổi chưa được lưu. Đóng mà không lưu?')) return;
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
						className={`${styles.btnGhost} ${css.resetBtn}`}
						onClick={() => void reset()}
						disabled={!layout || !!busy}
					>
						{busy === 'reset' ? <span className={styles.spinner} /> : <RefreshSvg />} Khôi phục mẫu gốc
					</button>
					<button
						className={styles.btnCancel}
						onClick={close}
						disabled={!!busy}
					>
						Hủy
					</button>
					<button
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
								src={`${BASE_URL}${layout.image_url}`}
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
								// Sửa nhưng chưa lưu: ảnh nền vẫn còn chữ gốc → che tạm bằng nền trắng
								const cover = t.edited && !removedInImage.has(t.id);
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
										}}
										onPointerDown={interactive ? (e) => startDrag(e, { kind: 'text', id: t.id }, 'move') : undefined}
										onPointerMove={interactive ? onDrag : undefined}
										onPointerUp={interactive ? endDrag : undefined}
										onPointerCancel={interactive ? endDrag : undefined}
										title={interactive ? t.original : undefined}
									>
										{t.edited && <span className={css.fieldText}>{t.text}</span>}
										{active && t.edited && (
											<span
												className={css.handle}
												onPointerDown={(e) => startDrag(e, { kind: 'text', id: t.id }, 'resize')}
												onPointerMove={onDrag}
												onPointerUp={endDrag}
												onPointerCancel={endDrag}
												aria-hidden
											/>
										)}
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
										].join(' ')}
										style={{
											...geoStyle(s),
											color: s.color,
											fontWeight: s.bold ? 700 : 400,
											fontStyle: s.italic ? 'italic' : 'normal',
										}}
										onPointerDown={interactive ? (e) => startDrag(e, { kind: 'slot', id: f.key }, 'move') : undefined}
										onPointerMove={interactive ? onDrag : undefined}
										onPointerUp={interactive ? endDrag : undefined}
										onPointerCancel={interactive ? endDrag : undefined}
										title={interactive ? f.label : undefined}
									>
										<span className={css.fieldText}>{f.sample}</span>
										{interactive && <span className={css.fieldTag}>{f.label}</span>}
										{active && (
											<span
												className={css.handle}
												onPointerDown={(e) => startDrag(e, { kind: 'slot', id: f.key }, 'resize')}
												onPointerMove={onDrag}
												onPointerUp={endDrag}
												onPointerCancel={endDrag}
												aria-hidden
											/>
										)}
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
									Bấm một dòng trên mẫu hoặc trong danh sách để sửa — vd tên hội nghị, ngày tháng, người ký.
								</p>
								<ul className={`${css.list} ${css.listScroll}`}>
									{textList.map((t) => (
										<li key={t.id}>
											<button
												type='button'
												className={`${css.item} ${isSel('text', t.id) ? css.itemActive : ''}`}
												onClick={() => setSel({ kind: 'text', id: t.id })}
												title={t.original}
											>
												<span className={`${css.itemLabel} ${t.edited && !t.text ? css.itemStrike : ''}`}>
													{t.edited ? t.text || t.original : t.original}
												</span>
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
											placeholder='Để trống để xoá dòng này'
										/>
										{selText.edited && selText.text !== selText.original && (
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

								{(selSlotField || selText?.edited) && (
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
									{selText
										? 'Dòng sửa dùng lại font, cỡ, màu của dòng gốc trên mẫu. Bấm "Xem thử" sau khi lưu để kiểm tra bản in.'
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
