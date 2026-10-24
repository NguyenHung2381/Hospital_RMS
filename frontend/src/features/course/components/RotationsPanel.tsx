import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DatePicker } from '@/shared/components';
import { ChevDSvg, PlusSvg, TrashSvg } from '@/assets/icons';
import { apiClient } from '@/shared/api/axios';
import { showToast } from '@/shared/utils/feedback';
import {
	addRotationSegment,
	autoArrangeRotations,
	getRotations,
	moveRotation,
	refreshRotationMentor,
	removeRotation,
	retakeRotation,
	scheduleRotations,
	updateRotation,
} from '../api/courseApi';
import {
	ROTATION_RESULT_LABEL,
	type EnrollmentRotation,
	type RotationList,
	type RotationResult,
	type RotationUpdate,
} from '../types/course.type';
import { MentorPicker } from './MentorPicker';
import { RotationDateRange } from './RotationDateRange';
import { savePracticeDocument } from '../utils/practiceDocuments';
import styles from '../pages/Courses.module.css';

interface Department {
	id: string;
	name: string;
}

const day = (v: string | null) => (v ? v.slice(0, 10) : '');

/** Nút "Xếp lịch ▾": menu các cách xếp, mỗi mục kèm 1 dòng giải thích. Bấm ra ngoài / Esc thì đóng. */
function ArrangeMenu({
	items,
	disabled,
}: {
	items: { label: string; desc: string; onClick: () => void }[];
	disabled: boolean;
}) {
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (!open) return;
		const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
		const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
		document.addEventListener('mousedown', onDown);
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('mousedown', onDown);
			document.removeEventListener('keydown', onKey);
		};
	}, [open]);
	return (
		<div
			className={styles.menuWrap}
			ref={ref}
		>
			<button
				type='button'
				className={styles.btnSmall}
				disabled={disabled}
				aria-haspopup='menu'
				aria-expanded={open}
				onClick={() => setOpen((v) => !v)}
			>
				Xếp lịch <ChevDSvg />
			</button>
			{open && (
				<div
					className={styles.menu}
					role='menu'
				>
					{items.map((it) => (
						<button
							key={it.label}
							type='button'
							role='menuitem'
							className={styles.menuItem}
							onClick={() => {
								setOpen(false);
								it.onClick();
							}}
						>
							<span className={styles.menuLabel}>{it.label}</span>
							<span className={styles.menuDesc}>{it.desc}</span>
						</button>
					))}
				</div>
			)}
		</div>
	);
}

// Vòng thực hành GPHN của 1 hồ sơ: "Tự động xếp" sinh vòng theo chương trình,
// xếp lịch so le, chọn khoa / người hướng dẫn đang ít người nhất; sau đó sửa tay
// từng vòng (khoa / ngày / NHD / kết quả) — mỗi thay đổi lưu ngay; cảnh báo (đỏ)
// chỉ để lưu ý, không chặn.
export function RotationsPanel({
	enrollmentId,
	who,
	hasProgram,
	approved,
	enrollmentStart,
	onChanged,
}: {
	enrollmentId: string;
	/** Mã thực hành / tên học viên — đặt tên file phiếu nhận xét. */
	who: string;
	hasProgram: boolean;
	/** Duyệt xong mới xếp lịch — hồ sơ chưa duyệt chưa có vòng thì chỉ báo. */
	approved: boolean;
	enrollmentStart: string | null;
	onChanged: () => void;
}) {
	const [data, setData] = useState<RotationList | null>(null);
	const [departments, setDepartments] = useState<Department[]>([]);
	const [busy, setBusy] = useState(false);
	const [startDate, setStartDate] = useState(day(enrollmentStart));
	const [firstLesson, setFirstLesson] = useState('');

	const load = useCallback(
		() =>
			getRotations(enrollmentId)
				.then(setData)
				.catch((err) => showToast('error', err instanceof Error ? err.message : 'Không tải được vòng thực hành')),
		[enrollmentId],
	);
	useEffect(() => {
		load();
		apiClient
			.get<{ data: Department[] }>('/departments?limit=0')
			.then((r) => setDepartments(r.data))
			.catch(() => {});
	}, [load]);

	const run = async (action: () => Promise<unknown>, okMsg?: string) => {
		setBusy(true);
		try {
			await action();
			if (okMsg) showToast('success', okMsg);
			await load();
			onChanged();
		} catch (err) {
			showToast('error', err instanceof Error ? err.message : 'Thao tác thất bại');
		} finally {
			setBusy(false);
		}
	};
	const save = (id: string, patch: RotationUpdate) => run(() => updateRotation(id, patch));

	const rows = useMemo(() => data?.rows ?? [], [data]);
	const deptName = useMemo(() => new Map(departments.map((d) => [d.id, d.name])), [departments]);
	// Dòng cuối của mỗi vòng chia nhiều khoa — đặt nút "Thêm khoa" ở đó
	const lastOfSplit = useMemo(() => {
		const m = new Map<string, string>();
		for (const r of rows) if (r.allow_split && r.lesson_id) m.set(r.lesson_id, r.id);
		return new Set(m.values());
	}, [rows]);

	if (!hasProgram)
		return <div className={styles.subEmpty}>Chọn chương trình (và lưu hồ sơ) để sinh các vòng thực hành.</div>;
	if (!data) return <div className={styles.subEmpty}>Đang tải vòng thực hành…</div>;
	if (!approved && data.rows.length === 0)
		return (
			<div className={styles.subEmpty}>
				Hồ sơ chưa được duyệt — duyệt hồ sơ trước rồi mới xếp lịch thực hành.
			</div>
		);

	const autoArrange = (replace: boolean, carryOver = false) => {
		if (
			replace &&
			!window.confirm(
				'Xếp lại sẽ XOÁ các vòng chưa có kết quả (kể cả người hướng dẫn) rồi xếp mới; vòng đã Đạt / Không đạt được giữ nguyên. Tiếp tục?',
			)
		)
			return;
		run(
			() => autoArrangeRotations(enrollmentId, startDate || null, { replace, firstLessonId: firstLesson, carryOver }),
			carryOver ? 'Đã công nhận vòng đã học và xếp phần còn lại' : 'Đã tự xếp khoa, lịch và người hướng dẫn',
		);
	};

	const schedule = () => {
		if (!startDate) return showToast('error', 'Chọn ngày bắt đầu thực hành trước');
		if (
			rows.some((r) => r.start_date && r.result === 'pending') &&
			!window.confirm('Tính lại sẽ ghi đè ngày của các vòng chưa có kết quả (theo thứ tự hiện tại). Tiếp tục?')
		)
			return;
		run(async () => {
			const out = await scheduleRotations(enrollmentId, startDate);
			showToast(
				out.skipped ? 'error' : 'success',
				out.skipped
					? `Đã xếp ${out.scheduled} vòng; dừng ở vòng chưa có thời lượng (nhập thời lượng rồi xếp lại).`
					: `Đã xếp lịch ${out.scheduled} vòng`,
			);
		});
	};

	const deptOptions = (r: EnrollmentRotation) => {
		const allowed = r.allowed_department_ids.length ? r.allowed_department_ids : departments.map((d) => d.id);
		const ids = r.department_id && !allowed.includes(r.department_id) ? [r.department_id, ...allowed] : allowed;
		return ids.map((id) => ({ id, name: deptName.get(id) ?? r.department_name ?? id }));
	};

	return (
		<div>
			<div className={styles.subToolbar}>
				<span className={styles.hint}>Bắt đầu thực hành</span>
				<DatePicker
					value={startDate}
					onChange={setStartDate}
					style={{ width: 170, flex: '0 0 auto' }}
				/>
				{data.rounds.length > 1 && (
					<select
						className={styles.subSelect}
						style={{ flex: '0 1 220px' }}
						value={firstLesson}
						disabled={busy}
						onChange={(e) => setFirstLesson(e.target.value)}
						title='Học viên phải vào vòng này trước (VD học khoa khác rồi mới sang Cấp cứu) — áp dụng khi tự động xếp'
					>
						<option value=''>Vòng đầu: tự chọn theo tải khoa</option>
						{data.rounds.map((x) => (
							<option
								key={x.id}
								value={x.id}
							>
								Vòng đầu: {x.title}
							</option>
						))}
					</select>
				)}
				{rows.length === 0 && (
					<button
						type='button'
						className={styles.btnPrimary}
						disabled={busy}
						onClick={() => autoArrange(false)}
						title='Sinh vòng theo chương trình, xếp lịch so le, chọn khoa và người hướng dẫn đang kèm ít người nhất (trống ngày ⇒ hôm nay)'
					>
						<PlusSvg /> Tự động xếp khoa · lịch · người hướng dẫn
					</button>
				)}
				{/* Các cách xếp còn lại gom vào 1 menu — tránh hàng nút dài, mỗi mục có giải thích */}
				{(rows.length > 0 || data.previous_passed > 0) && (
					<ArrangeMenu
						disabled={busy}
						items={[
							...(rows.length > 0
								? [
										{
											label: 'Tính lại ngày',
											desc: 'Các vòng chưa có kết quả nối tiếp nhau từ ngày bắt đầu theo thứ tự hiện tại; giữ khoa và người hướng dẫn',
											onClick: schedule,
										},
										{
											label: 'Tự động xếp lại',
											desc: 'Xoá vòng chưa có kết quả rồi xếp lại khoa, lịch, người hướng dẫn; vòng đã Đạt / Không đạt giữ nguyên',
											onClick: () => autoArrange(true),
										},
									]
								: []),
							...(data.previous_passed > 0
								? [
										{
											label: `Công nhận ${data.previous_passed} vòng đã học ở hồ sơ trước`,
											desc: 'Chép các vòng đã Đạt ở hồ sơ khác của học viên (giữ ngày, khoa, người hướng dẫn), rồi xếp phần còn lại',
											onClick: () => autoArrange(rows.length > 0, true),
										},
									]
								: []),
						]}
					/>
				)}
			</div>
			{data.rounds.length === 0 && (
				<div className={styles.hint}>
					Chương trình chưa có vòng thực hành — nhập sổ thực hành cũ để hệ thống tự tạo mẫu vòng, hoặc thêm bài học loại
					"Vòng thực hành" ở màn Chương trình đào tạo.
				</div>
			)}

			<div className={styles.subList}>
				{rows.map((r, i) => {
					const prevEnd = i > 0 ? day(rows[i - 1].end_date) || null : null;
					return (
						<div
							key={r.id}
							className={`${styles.rotCard} ${r.warnings.length ? styles.rotWarn : ''}`}
						>
							<div className={styles.rotHead}>
								<div className={styles.subRowName}>
									{i + 1}. {r.round_title ?? 'Vòng'}
									{r.attempt_no > 1 && <span className={styles.hint}> · học lại lần {r.attempt_no}</span>}
									{r.note?.startsWith('Công nhận') && <span className={styles.hint}> · {r.note}</span>}
								</div>
								<div className={styles.rotTools}>
									<button
										type='button'
										className={styles.actionBtn}
										disabled={busy || i === 0}
										title='Đưa vòng này lên trước — xong bấm "Tính lại ngày"'
										onClick={() => run(() => moveRotation(r.id, 'up'))}
									>
										↑
									</button>
									<button
										type='button'
										className={styles.actionBtn}
										disabled={busy || i === rows.length - 1}
										title='Đưa vòng này xuống sau — xong bấm "Tính lại ngày"'
										onClick={() => run(() => moveRotation(r.id, 'down'))}
									>
										↓
									</button>
									{r.result === 'fail' && !rows.some((x) => x.lesson_id === r.lesson_id && x.attempt_no > r.attempt_no) && (
										<button
											type='button'
											className={styles.btnSmall}
											disabled={busy}
											onClick={() => run(() => retakeRotation(r.id), 'Đã thêm lượt học lại')}
											title='Thêm 1 lượt học lại vòng này ngay sau dòng hiện tại'
										>
											Học lại
										</button>
									)}
									<button
										type='button'
										className={styles.btnSmall}
										disabled={busy}
										title='Tải phiếu nhận xét quá trình thực hành của vòng này (.docx)'
										onClick={() =>
											savePracticeDocument(enrollmentId, 'phieu-nhan-xet', who, {
												id: r.id,
												label: r.department_name || r.round_title || `vong-${i + 1}`,
											})
										}
									>
										Phiếu nhận xét
									</button>
									<button
										type='button'
										className={styles.actionBtn}
										title='Xoá dòng này'
										disabled={busy}
										onClick={() => window.confirm('Xoá vòng này khỏi hồ sơ?') && run(() => removeRotation(r.id))}
									>
										<TrashSvg />
									</button>
								</div>
							</div>

							<div className={styles.rotFields}>
								<div className={styles.rotField}>
									<span className={styles.rotLabel}>Khoa</span>
									<select
										className={styles.subSelect}
										value={r.department_id ?? ''}
										disabled={busy}
										onChange={(e) => save(r.id, { department_id: e.target.value || null })}
									>
										<option value=''>-- Chọn khoa --</option>
										{deptOptions(r).map((d) => (
											<option
												key={d.id}
												value={d.id}
											>
												{d.name}
											</option>
										))}
									</select>
								</div>
								<div className={styles.rotField}>
									<span className={styles.rotLabel}>Kết quả</span>
									<select
										className={styles.subSelect}
										value={r.result}
										disabled={busy}
										onChange={(e) => save(r.id, { result: e.target.value as RotationResult })}
									>
										{Object.entries(ROTATION_RESULT_LABEL).map(([v, label]) => (
											<option
												key={v}
												value={v}
											>
												{label}
											</option>
										))}
									</select>
								</div>
								<div className={styles.rotField}>
									<span className={styles.rotLabel}>Thời lượng</span>
									<input
										className={styles.subSelect}
										defaultValue={r.duration_text ?? ''}
										key={`${r.id}-${r.duration_text}`}
										placeholder={r.allow_split ? 'chia đều' : 'VD: 03 tháng'}
										disabled={busy}
										onBlur={(e) =>
											e.target.value !== (r.duration_text ?? '') && save(r.id, { duration_text: e.target.value || null })
										}
									/>
								</div>
							</div>

							<div className={styles.rotMain}>
								<div className={styles.rotField}>
									<span className={styles.rotLabel}>Thời gian</span>
									<RotationDateRange
										start={day(r.start_date)}
										end={day(r.end_date)}
										duration={r.duration_text}
										prevEnd={prevEnd}
										disabled={busy}
										onChange={(s, e) => save(r.id, { start_date: s || null, end_date: e || null })}
									/>
								</div>
								<div className={styles.rotField}>
									<span className={styles.rotLabel}>Người hướng dẫn</span>
									<MentorPicker
										rotation={r}
										disabled={busy}
										onSelect={(userId) => save(r.id, { mentor_user_id: userId })}
										onRefresh={() => run(() => refreshRotationMentor(r.id), 'Đã cập nhật thông tin người hướng dẫn')}
										onSalutation={(v) => save(r.id, { mentor_salutation: v || null })}
									/>
								</div>
							</div>

							{r.warnings.length > 0 && (
								<div style={{ color: '#b42318', fontSize: 'var(--font-size-xs)' }}>
									{r.warnings.join(' · ')}
								</div>
							)}
							{lastOfSplit.has(r.id) && r.lesson_id && (
								<button
									type='button'
									className={styles.btnSmall}
									style={{ alignSelf: 'flex-start' }}
									disabled={busy}
									onClick={() => run(() => addRotationSegment(enrollmentId, r.lesson_id as string))}
									title='Vòng chia nhiều khoa: thêm 1 khoa nữa, thời gian vòng chia đều khi tự xếp lịch'
								>
									+ Thêm khoa cho vòng này
								</button>
							)}
						</div>
					);
				})}
			</div>
			{rows.length > 0 && (
				<div className={styles.hint}>
					Cảnh báo người hướng dẫn kèm quá {data.max_mentor_load} học viên cùng lúc — đổi ngưỡng ở Cài đặt hệ thống.
				</div>
			)}
		</div>
	);
}
