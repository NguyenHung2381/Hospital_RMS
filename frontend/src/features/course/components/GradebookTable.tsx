import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ExcelActions, type ExcelColumn } from '@/shared/components/Excel';
import { numText } from '@/shared/components/Excel/excelHelpers';
import { showToast } from '@/shared/utils/feedback';
import {
	GRADE_FLAG_LABEL,
	type GradeBulkRow,
	type GradeFlag,
	type GradePart,
	type Gradebook,
	type GradebookRow,
} from '../types/course.type';
import styles from './GradebookTable.module.css';

/**
 * Bảng nhập điểm 2 phần Lý thuyết + Thực hành (giai đoạn 4), dùng chung cho cán bộ
 * (tab Kết quả của khóa) và giảng viên (cổng /me — chỉ sửa phần mình được phân).
 * - Nhập dạng lưới: Enter / ↑ ↓ sang dòng, ← → sang cột, Tab như thường.
 * - Ô điểm nhận 0–10, hoặc "v" = vắng thi, "m" = miễn thi.
 * - Lưu 1 lần cho cả bảng; còn thay đổi chưa lưu thì cảnh báo khi rời trang.
 * Kết quả / xếp loại do server tính (gradeRules.js) — dòng đang sửa hiện kết quả cũ kèm *.
 */

const PARTS: GradePart[] = ['theory', 'practice'];
const PART_SHORT: Record<GradePart, string> = { theory: 'LT', practice: 'TH' };
const FLAG_TEXT: Record<GradeFlag, string> = { absent: 'V', exempt: 'M' };

type Draft = Partial<Record<GradePart | 'note', string>>;

const fmt = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','));

// Chuỗi ô điểm → giá trị gửi server; undefined = không hợp lệ
const parseCell = (text: string): { score: number | null; flag: GradeFlag | null } | undefined => {
	const t = text.trim().toLowerCase();
	if (!t) return { score: null, flag: null };
	if (t === 'v' || t === 'vắng') return { score: null, flag: 'absent' };
	if (t === 'm' || t === 'miễn') return { score: null, flag: 'exempt' };
	const n = Number(numText(t));
	if (!Number.isFinite(n) || n < 0 || n > 10) return undefined;
	return { score: Math.round(n * 10) / 10, flag: null };
};

const cellText = (row: GradebookRow, part: GradePart) => {
	const flag = row[`${part}_flag`];
	return flag ? FLAG_TEXT[flag] : fmt(row[`${part}_score`]);
};

interface Props {
	book: Gradebook;
	onSave: (rows: GradeBulkRow[], source?: 'import') => Promise<void>;
	/** Tên file Excel, không dấu */
	fileName: string;
	/** Nút thêm trên thanh công cụ (khóa điểm, cấp chứng nhận…) */
	toolbar?: ReactNode;
	/** Cột thao tác cuối mỗi dòng (thi lại, chứng chỉ…) */
	rowActions?: (row: GradebookRow) => ReactNode;
	/** Có thì tên học viên thành link sang hồ sơ (trang quản trị; cổng giảng viên không truyền) */
	traineeHref?: (row: GradebookRow) => string;
}

export function GradebookTable({ book, onSave, fileName, toolbar, rowActions, traineeHref }: Props) {
	const [drafts, setDrafts] = useState<Record<string, Draft>>({});
	const [saving, setSaving] = useState(false);
	const tableRef = useRef<HTMLTableElement>(null);
	const { rules, access, rows } = book;

	const editable = (row: GradebookRow, part: GradePart) =>
		access[part] && !row.locked_at && row.computed[part].applies;

	// Chỉ giữ ô khác giá trị server
	const dirty = useMemo(() => {
		const out: GradeBulkRow[] = [];
		let invalid = 0;
		for (const row of rows) {
			const d = drafts[row.enrollment_id];
			if (!d) continue;
			const item: GradeBulkRow = { enrollment_id: row.enrollment_id };
			let changed = false;
			for (const part of PARTS) {
				if (d[part] === undefined || d[part] === cellText(row, part)) continue;
				const v = parseCell(d[part]!);
				if (!v) {
					invalid++;
					continue;
				}
				item[`${part}_score`] = v.score;
				item[`${part}_flag`] = v.flag;
				changed = true;
			}
			if (d.note !== undefined && d.note !== (row.note ?? '')) {
				item.note = d.note || null;
				changed = true;
			}
			if (changed) out.push(item);
		}
		return { rows: out, invalid };
	}, [drafts, rows]);
	const hasChanges = dirty.rows.length > 0 || dirty.invalid > 0;

	useEffect(() => {
		if (!hasChanges) return;
		const warn = (e: BeforeUnloadEvent) => e.preventDefault();
		window.addEventListener('beforeunload', warn);
		return () => window.removeEventListener('beforeunload', warn);
	}, [hasChanges]);

	const setCell = (enrollmentId: string, key: GradePart | 'note', value: string) =>
		setDrafts((m) => ({ ...m, [enrollmentId]: { ...m[enrollmentId], [key]: value } }));

	const save = async (source?: 'import') => {
		if (dirty.invalid) {
			showToast('error', `Có ${dirty.invalid} ô điểm không hợp lệ (0–10, "v" vắng thi, "m" miễn thi)`);
			return;
		}
		if (!dirty.rows.length) return;
		setSaving(true);
		try {
			await onSave(dirty.rows, source);
			setDrafts({});
		} catch (err) {
			showToast('error', err instanceof Error ? err.message : 'Lưu điểm thất bại');
		} finally {
			setSaving(false);
		}
	};

	// Di chuyển giữa các ô bằng phím: data-r = dòng, data-c = cột (0 LT, 1 TH, 2 ghi chú)
	const move = (e: KeyboardEvent<HTMLInputElement>) => {
		const r = Number(e.currentTarget.dataset.r);
		const c = Number(e.currentTarget.dataset.c);
		const delta: Record<string, [number, number]> = {
			Enter: [e.shiftKey ? -1 : 1, 0],
			ArrowDown: [1, 0],
			ArrowUp: [-1, 0],
			ArrowRight: [0, 1],
			ArrowLeft: [0, -1],
		};
		const d = delta[e.key];
		if (!d) return;
		// ← → trong ô ghi chú để di chuyển con trỏ chữ
		if (c === 2 && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return;
		const inputs = [...(tableRef.current?.querySelectorAll<HTMLInputElement>('input[data-r]') ?? [])];
		const find = (rr: number, cc: number) => inputs.find((i) => i.dataset.r === String(rr) && i.dataset.c === String(cc));
		let [nr, nc] = [r + d[0], c + d[1]];
		while (nr >= 0 && nr < rows.length && nc >= 0 && nc <= 2) {
			const next = find(nr, nc);
			if (next) {
				e.preventDefault();
				next.focus();
				next.select();
				return;
			}
			[nr, nc] = [nr + d[0], nc + d[1]];
		}
	};

	// Lớp có làm kiểm tra đầu vào ⇒ hiện cột để so sánh trước / sau
	const hasEntrance = rows.some((r) => r.entrance_score != null);
	// Phần thi theo chương trình (exam_parts): không ai trong lớp thi phần đó ⇒ ẩn cột
	const shown = Object.fromEntries(
		PARTS.map((p) => [p, rows.length === 0 || rows.some((r) => r.computed[p].applies)]),
	) as Record<GradePart, boolean>;
	const colCount = 6 + (rowActions ? 1 : 0) + (hasEntrance ? 1 : 0) + PARTS.filter((p) => shown[p]).length * 2;

	const allCols: ExcelColumn<GradebookRow>[] = [
		{ header: 'Mã HV', key: 'code', required: true, value: (r) => r.trainee_id },
		{ header: 'Họ tên', key: 'name', value: (r) => r.trainee_name },
		{ header: 'Đầu vào', value: (r) => fmt(r.entrance_score) },
		{ header: 'Điểm LT', key: 'theory', value: (r) => cellText(r, 'theory') },
		{ header: 'Điểm TH', key: 'practice', value: (r) => cellText(r, 'practice') },
		{ header: 'Ghi chú', key: 'note', value: (r) => r.note ?? '' },
	];
	const excelCols = allCols.filter((c) => !PARTS.includes(c.key as GradePart) || shown[c.key as GradePart]);

	// Nhập Excel chỉ điền vào bảng (chưa lưu) để người nhập xem lại rồi bấm Lưu.
	const importRow = async (rec: Record<string, string>) => {
		const row = rows.find((r) => r.trainee_id === rec.code?.trim());
		if (!row) throw new Error(`Không có học viên mã "${rec.code}" trong khóa`);
		for (const part of PARTS) {
			const text = rec[part] ?? '';
			if (!text) continue;
			if (!parseCell(text)) throw new Error(`Điểm ${PART_SHORT[part]} "${text}" không hợp lệ`);
			if (!editable(row, part)) throw new Error(`Không sửa được điểm ${PART_SHORT[part]} của ${row.trainee_name}`);
			setCell(row.enrollment_id, part, text);
		}
		if (rec.note) setCell(row.enrollment_id, 'note', rec.note);
	};

	const pct = (part: GradePart, row: GradebookRow) => {
		const p = row.computed[part];
		const a = row.attendance[part];
		if (!p.applies) return <span className={styles.pending}>—</span>;
		if (!a.held) return <span className={styles.pending}>chưa có</span>;
		const present = Math.round(((a.held - a.absent) / a.held) * 1000) / 10;
		const text = `${fmt(present)}%`;
		return p.attendanceOk === false ? (
			<span
				className={styles.bad}
				title={`Vắng ${a.absent}/${a.held} buổi — tối đa ${fmt(part === 'theory' ? rules.theoryMaxAbsentPct : rules.practiceMaxAbsentPct)}%`}
			>
				{text}
			</span>
		) : (
			<span title={`Có mặt ${a.held - a.absent}/${a.held} buổi`}>{text}</span>
		);
	};

	const scoreCell = (row: GradebookRow, part: GradePart, r: number) => {
		const p = row.computed[part];
		const attempt = row[`${part}_attempt`];
		const attemptNote = attempt > 1 ? <span className={styles.sub}>lần {attempt}</span> : null;
		if (!p.applies) return <span className={styles.pending}>—</span>;
		if (!editable(row, part)) {
			const flag = row[`${part}_flag`];
			const text = flag ? GRADE_FLAG_LABEL[flag] : (fmt(row[`${part}_score`]) || '—');
			return (
				<>
					<span className={`${styles.readOnly} ${p.passed === false ? styles.bad : ''}`}>{text}</span>
					{attemptNote}
				</>
			);
		}
		const value = drafts[row.enrollment_id]?.[part] ?? cellText(row, part);
		const isDirty = value !== cellText(row, part);
		const invalid = isDirty && !parseCell(value);
		const cls = invalid ? styles.cellInvalid : isDirty ? styles.cellDirty : p.passed === false ? styles.cellInvalid : '';
		return (
			<>
				<input
					className={`${styles.cell} ${cls}`}
					value={value}
					data-r={r}
					data-c={part === 'theory' ? 0 : 1}
					inputMode='decimal'
					title={`0–10, "v" = vắng thi, "m" = miễn thi${p.passed === false ? ' — chưa đạt' : ''}`}
					aria-label={`Điểm ${PART_SHORT[part]} ${row.trainee_name}`}
					onChange={(e) => setCell(row.enrollment_id, part, e.target.value)}
					onKeyDown={move}
					onFocus={(e) => e.target.select()}
				/>
				{attemptNote}
			</>
		);
	};

	const resultCell = (row: GradebookRow) => {
		const c = row.computed;
		const mark = drafts[row.enrollment_id] && dirty.rows.some((d) => d.enrollment_id === row.enrollment_id) ? ' *' : '';
		if (c.result === 'pass') return <span className={styles.pass}>Đạt{mark}</span>;
		if (c.result === 'fail')
			return (
				<span
					className={styles.fail}
					title={c.reasons.join('\n')}
				>
					Chưa đạt{mark}
				</span>
			);
		return <span className={styles.pending}>Chưa đủ điểm{mark}</span>;
	};

	const noteEditable = (row: GradebookRow) => (access.theory || access.practice) && !row.locked_at;

	return (
		<div>
			<div className={styles.rules}>
				Đạt khi: LT ≥ {fmt(rules.theoryPassPct / 10)} · TH &gt; {fmt(rules.practicePassPct / 10)} · vắng LT ≤{' '}
				{fmt(rules.theoryMaxAbsentPct)}% · vắng TH ≤ {fmt(rules.practiceMaxAbsentPct)}% · thi lại tối đa {rules.maxRetakes}{' '}
				lần (Phụ lục III TT 32/2023, sửa ở Cấu hình hệ thống → Đào tạo)
				{!access.theory || !access.practice ? (
					<>
						{' '}
						· Bạn nhập được:{' '}
						{PARTS.filter((p) => access[p])
							.map((p) => (p === 'theory' ? 'lý thuyết' : 'thực hành'))
							.join(', ') || 'không phần nào'}
					</>
				) : null}
			</div>
			<div className={styles.toolbar}>
				<button
					className={styles.btnPrimary}
					disabled={saving || !hasChanges}
					onClick={() => void save()}
				>
					{saving ? 'Đang lưu…' : `Lưu điểm${dirty.rows.length ? ` (${dirty.rows.length})` : ''}`}
				</button>
				{hasChanges && (
					<button
						className={styles.btnGhost}
						disabled={saving}
						onClick={() => setDrafts({})}
					>
						Bỏ thay đổi
					</button>
				)}
				{hasChanges && <span className={styles.dirtyNote}>Có thay đổi chưa lưu</span>}
				{book.locked && <span className={styles.lockBadge}>Đã khóa điểm</span>}
				<span className={styles.spacer} />
				<ExcelActions
					fileName={fileName}
					itemLabel='điểm học viên'
					columns={excelCols}
					getRows={() => rows}
					importRow={book.locked || (!access.theory && !access.practice) ? undefined : importRow}
					importHint='Nhập vào bảng để xem lại, chưa lưu — bấm "Lưu điểm" sau khi kiểm tra. Ô điểm: 0–10, "v" = vắng thi, "m" = miễn thi.'
					onImported={() => showToast('info', 'Đã điền điểm vào bảng — kiểm tra rồi bấm "Lưu điểm"')}
				/>
				{toolbar}
			</div>
			<div className={styles.wrap}>
				<table
					className={styles.table}
					ref={tableRef}
				>
					<thead>
						<tr>
							<th className={styles.th}>STT</th>
							<th className={styles.th}>Học viên</th>
							{shown.theory && <th className={`${styles.th} ${styles.center}`}>Chuyên cần LT</th>}
							{shown.practice && <th className={`${styles.th} ${styles.center}`}>Chuyên cần TH</th>}
							{hasEntrance && (
								<th
									className={`${styles.th} ${styles.center}`}
									title='Kiểm tra đầu vào — chỉ tham khảo, so với điểm lý thuyết cuối khóa'
								>
									Đầu vào
								</th>
							)}
							{shown.theory && <th className={`${styles.th} ${styles.center}`}>Điểm LT</th>}
							{shown.practice && <th className={`${styles.th} ${styles.center}`}>Điểm TH</th>}
							<th className={`${styles.th} ${styles.center}`}>Tổng</th>
							<th className={styles.th}>Xếp loại</th>
							<th className={styles.th}>Kết quả</th>
							<th className={styles.th}>Ghi chú</th>
							{rowActions && <th className={styles.th} />}
						</tr>
					</thead>
					<tbody>
						{rows.length === 0 && (
							<tr>
								<td
									className={styles.td}
									colSpan={colCount}
								>
									Chưa có học viên nào được duyệt.
								</td>
							</tr>
						)}
						{rows.map((row, r) => (
							<tr key={row.enrollment_id}>
								<td className={styles.tdIdx}>{r + 1}</td>
								<td className={styles.td}>
									{traineeHref ? (
										<Link
											className={styles.nameLink}
											to={traineeHref(row)}
											title='Mở hồ sơ học viên'
										>
											{row.trainee_name}
										</Link>
									) : (
										row.trainee_name
									)}
									<span className={styles.sub}>
										{row.trainee_id}
										{row.program_name ? ` · ${row.program_name}` : ''}
									</span>
								</td>
								{shown.theory && <td className={`${styles.td} ${styles.center}`}>{pct('theory', row)}</td>}
								{shown.practice && <td className={`${styles.td} ${styles.center}`}>{pct('practice', row)}</td>}
								{hasEntrance && (
									<td className={`${styles.td} ${styles.center}`}>
										{row.entrance_score == null ? '—' : fmt(row.entrance_score)}
										{row.entrance_score != null && row.theory_score != null && (
											<div className={styles.sub}>
												{row.theory_score >= row.entrance_score ? '+' : ''}
												{fmt(Math.round((row.theory_score - row.entrance_score) * 10) / 10)} so với LT
											</div>
										)}
									</td>
								)}
								{shown.theory && <td className={`${styles.td} ${styles.center}`}>{scoreCell(row, 'theory', r)}</td>}
								{shown.practice && (
									<td className={`${styles.td} ${styles.center}`}>{scoreCell(row, 'practice', r)}</td>
								)}
								<td className={`${styles.td} ${styles.center}`}>{fmt(row.computed.total) || '—'}</td>
								<td className={styles.td}>{row.computed.classification ?? '—'}</td>
								<td className={styles.td}>{resultCell(row)}</td>
								<td className={styles.td}>
									{noteEditable(row) ? (
										<input
											className={`${styles.cell} ${styles.noteCell}`}
											value={drafts[row.enrollment_id]?.note ?? row.note ?? ''}
											data-r={r}
											data-c={2}
											maxLength={255}
											aria-label={`Ghi chú ${row.trainee_name}`}
											onChange={(e) => setCell(row.enrollment_id, 'note', e.target.value)}
											onKeyDown={move}
										/>
									) : (
										(row.note ?? '')
									)}
								</td>
								{rowActions && (
									<td className={styles.td}>
										<div className={styles.actions}>{rowActions(row)}</div>
									</td>
								)}
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}
