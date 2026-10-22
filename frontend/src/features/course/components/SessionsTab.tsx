import { useState } from 'react';
import { CalendarSvg, CheckSvg, PlusSvg, TrashSvg, UsersSvg, XSvg } from '@/assets/icons';
import { Badge, Button, EmptyState } from '@/shared/components';
import { FormField } from '@/shared/components/Input/FormField';
import { Modal, ModalActions } from '@/shared/components/Modal';
import m from '@/shared/components/Modal/Modal.module.css';
import tbl from '@/shared/components/Table/Table.module.css';
import { Pagination } from '@/shared/components/Table/Pagination';
import { useClientPaging } from '@/shared/hooks/useClientPaging';
import { formatDateVN } from '@/shared/utils/formatDate';
import { VenueSelect } from '../../venue/components/VenueSelect';
import type { LecturerItem, useCourseDetail } from '../hooks/useCourseDetail';
import type { CourseLesson, LecturerAssignment, SessionKind } from '../types/course.type';
import { LecturerOptions } from './LecturerOptions';
import styles from '../pages/Courses.module.css';
import ss from './SessionsTab.module.css';

type Detail = ReturnType<typeof useCourseDetail>;

const WEEKDAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const EMPTY_SESSION = {
	session_date: '',
	start_time: '',
	end_time: '',
	room: '',
	lesson_id: '',
	lecturer_id: '',
	session_kind: '' as SessionKind | '',
};
const EMPTY_BULK = {
	start_date: '',
	end_date: '',
	weekdays: [] as number[],
	start_time: '',
	end_time: '',
	room: '',
	lesson_id: '',
	lecturer_id: '',
	session_kind: '' as SessionKind | '',
};

const SESSION_KIND_LABEL: Record<SessionKind, string> = { theory: 'Lý thuyết', practice: 'Thực hành' };

// Buổi LT / TH — để tính chuyên cần từng phần ở bảng điểm (bỏ trống = theo loại bài học)
const kindSelect = (value: SessionKind | '', onChange: (v: SessionKind | '') => void, cls: string) => (
	<select
		className={cls}
		value={value}
		title='Buổi lý thuyết hay thực hành — tính chuyên cần ở bảng điểm'
		onChange={(e) => onChange(e.target.value as SessionKind | '')}
	>
		<option value=''>-- LT/TH theo bài --</option>
		<option value='theory'>Buổi lý thuyết</option>
		<option value='practice'>Buổi thực hành</option>
	</select>
);

const lessonLabel = (l: { code: string | null; title: string }) => (l.code ? `${l.code} — ${l.title}` : l.title);
const hoursText = (l: CourseLesson) =>
	[l.theory_hours ? `LT ${l.theory_hours}` : '', l.practice_hours ? `TH ${l.practice_hours}` : '']
		.filter(Boolean)
		.join(' · ');

/** 1 dòng của bảng Bài học × Giảng viên: GV chính + số tiết + GV phụ, đổi là lưu ngay. */
function LessonRow({
	d,
	lesson,
	index,
	lecturers,
}: {
	d: Detail;
	lesson: CourseLesson;
	index: number;
	lecturers: LecturerItem[];
}) {
	const rows = d.assignments.filter((a) => a.subject_id === lesson.id);
	const main = rows.find((a) => a.role === 'main');
	const assistants = rows.filter((a) => a.role !== 'main');
	const toInput = (a: LecturerAssignment) => ({ lecturer_id: a.lecturer_id, hours: a.hours });

	const save = (mainId: string, mainHours: number | null, assistantList: { lecturer_id: string; hours: number | null }[]) =>
		d.setLessonLecturers(lesson.id, {
			main: mainId ? { lecturer_id: mainId, hours: mainHours } : null,
			assistants: assistantList.filter((a) => a.lecturer_id !== mainId),
		});

	const taken = new Set(rows.map((a) => a.lecturer_id));

	return (
		<tr className={tbl.tr}>
			<td className={`${tbl.td} ${tbl.tdIdx}`}>{index}</td>
			<td className={tbl.td}>
				<div className={tbl.cellTitle}>{lesson.title}</div>
				{lesson.code && <div className={tbl.cellCode}>{lesson.code}</div>}
				<div className={tbl.cellSub}>
					{[lesson.program_name, hoursText(lesson) && `${hoursText(lesson)} tiết`].filter(Boolean).join(' · ')}
				</div>
			</td>
			<td className={tbl.td}>
				<select
					className={styles.subSelect}
					value={main?.lecturer_id ?? ''}
					disabled={d.busy}
					onChange={(e) =>
						save(e.target.value, main?.hours ?? lesson.total_hours ?? null, assistants.map(toInput))
					}
				>
					<option value=''>-- Chưa phân công --</option>
					<LecturerOptions lecturers={lecturers} />
				</select>
			</td>
			<td className={tbl.td}>
				<input
					// key theo giá trị đã lưu: tải lại thì ô nhận số mới
					key={`${main?.id ?? ''}:${main?.hours ?? ''}`}
					type='number'
					min={0}
					className={styles.subInput}
					style={{ width: 80 }}
					title='Số tiết GV chính đảm nhận'
					defaultValue={main?.hours ?? ''}
					disabled={!main || d.busy}
					onBlur={(e) => {
						const v = e.target.value === '' ? null : Number(e.target.value);
						if (main && v !== main.hours) save(main.lecturer_id, v, assistants.map(toInput));
					}}
				/>
			</td>
			<td className={tbl.td}>
				<div className={styles.chipList}>
					{assistants.map((a) => (
						<span
							key={a.id}
							className={styles.chip}
						>
							{a.lecturer_name}
							<button
								className={styles.chipRemove}
								title='Bỏ GV phụ'
								disabled={d.busy}
								onClick={() =>
									save(
										main?.lecturer_id ?? '',
										main?.hours ?? null,
										assistants.filter((x) => x.id !== a.id).map(toInput),
									)
								}
							>
								<XSvg />
							</button>
						</span>
					))}
					<select
						className={styles.subSelect}
						value=''
						disabled={d.busy}
						onChange={(e) =>
							e.target.value &&
							save(main?.lecturer_id ?? '', main?.hours ?? null, [
								...assistants.map(toInput),
								{ lecturer_id: e.target.value, hours: null },
							])
						}
					>
						<option value=''>+ Thêm GV phụ</option>
						<LecturerOptions lecturers={lecturers.filter((l) => !taken.has(l.id))} />
					</select>
				</div>
			</td>
		</tr>
	);
}

type SessionForm = typeof EMPTY_SESSION;
type BulkForm = typeof EMPTY_BULK;

const monthOf = (iso: string) => {
	const [y, mo] = iso.slice(0, 10).split('-');
	return `Tháng ${Number(mo)}/${y}`;
};

/** Hộp thoại thêm buổi học: 1 buổi hoặc lịch lặp theo tuần. */
function SessionFormModal({
	d,
	bulk,
	lessonOptions,
	sessionLecturers,
	mainLecturerOf,
	onClose,
}: {
	d: Detail;
	bulk: boolean;
	lessonOptions: { id: string; name: string }[];
	sessionLecturers: LecturerItem[];
	mainLecturerOf: (lessonId: string) => string;
	onClose: (result?: { created: number; skipped: number }) => void;
}) {
	const [one, setOne] = useState<SessionForm>(EMPTY_SESSION);
	const [many, setMany] = useState<BulkForm>(EMPTY_BULK);
	// Phần chung 2 chế độ (giờ, phòng, bài, LT/TH, GV) đọc/ghi qua 1 bộ hàm
	const f = bulk ? many : one;
	const set = (patch: Partial<SessionForm & BulkForm>) =>
		bulk ? setMany((x) => ({ ...x, ...patch })) : setOne((x) => ({ ...x, ...patch }));
	const valid = bulk ? !!many.start_date && !!many.end_date && many.weekdays.length > 0 : !!one.session_date;

	const submit = async () => {
		if (bulk) {
			const { lesson_id, session_kind, ...rest } = many;
			const result = await d.createSessionsBulk({
				...rest,
				subject_id: lesson_id || undefined,
				session_kind: session_kind || undefined,
			});
			if (result) onClose(result);
			return;
		}
		const ok = await d.createSession({
			session_date: one.session_date,
			start_time: one.start_time || undefined,
			end_time: one.end_time || undefined,
			room: one.room || undefined,
			subject_id: one.lesson_id || undefined,
			lecturer_id: one.lecturer_id || undefined,
			session_kind: one.session_kind || undefined,
		});
		if (ok) onClose();
	};

	return (
		<Modal
			open
			onClose={() => onClose()}
			title={bulk ? 'Tạo lịch lặp theo tuần' : 'Thêm buổi học'}
			subtitle={bulk ? 'Tạo các buổi vào những thứ đã chọn trong khoảng ngày — bỏ qua buổi trùng lịch' : undefined}
			icon={<CalendarSvg />}
			size='md'
			footer={
				<ModalActions
					onCancel={() => onClose()}
					onConfirm={() => void submit()}
					loading={d.busy}
					disabled={!valid}
					confirmLabel={bulk ? 'Tạo lịch' : 'Thêm buổi học'}
				/>
			}
		>
			{d.error && <div className={m.error}>{d.error}</div>}
			{bulk ? (
				<>
					<div className={m.formRow}>
						<FormField
							label='Từ ngày'
							required
						>
							<input
								type='date'
								className={m.formInput}
								value={many.start_date}
								onChange={(e) => set({ start_date: e.target.value })}
							/>
						</FormField>
						<FormField
							label='Đến ngày'
							required
						>
							<input
								type='date'
								className={m.formInput}
								value={many.end_date}
								onChange={(e) => set({ end_date: e.target.value })}
							/>
						</FormField>
					</div>
					<FormField
						label='Các thứ trong tuần'
						required
					>
						<div className={ss.weekdays}>
							{WEEKDAY_LABELS.map((label, idx) => {
								const on = many.weekdays.includes(idx);
								return (
									<button
										key={idx}
										type='button'
										aria-pressed={on}
										className={`${ss.weekday} ${on ? ss.weekdayOn : ''}`}
										onClick={() =>
											set({ weekdays: on ? many.weekdays.filter((w) => w !== idx) : [...many.weekdays, idx] })
										}
									>
										{label}
									</button>
								);
							})}
						</div>
					</FormField>
				</>
			) : (
				<FormField
					label='Ngày học'
					required
				>
					<input
						type='date'
						className={m.formInput}
						value={one.session_date}
						onChange={(e) => set({ session_date: e.target.value })}
					/>
				</FormField>
			)}
			<div className={m.formRow}>
				<FormField label='Giờ bắt đầu'>
					<input
						type='time'
						className={m.formInput}
						value={f.start_time}
						onChange={(e) => set({ start_time: e.target.value })}
					/>
				</FormField>
				<FormField label='Giờ kết thúc'>
					<input
						type='time'
						className={m.formInput}
						value={f.end_time}
						onChange={(e) => set({ end_time: e.target.value })}
					/>
				</FormField>
			</div>
			<FormField label='Bài học'>
				<select
					className={m.formInput}
					value={f.lesson_id}
					onChange={(e) =>
						set({ lesson_id: e.target.value, lecturer_id: mainLecturerOf(e.target.value) || f.lecturer_id })
					}
				>
					<option value=''>-- Chọn bài học --</option>
					{lessonOptions.map((l) => (
						<option
							key={l.id}
							value={l.id}
						>
							{l.name}
						</option>
					))}
				</select>
			</FormField>
			<div className={m.formRow}>
				<FormField label='Giảng viên'>
					<select
						className={m.formInput}
						value={f.lecturer_id}
						onChange={(e) => set({ lecturer_id: e.target.value })}
					>
						<option value=''>-- Chọn giảng viên --</option>
						<LecturerOptions lecturers={sessionLecturers} />
					</select>
				</FormField>
				<FormField label='Loại buổi'>
					{kindSelect(f.session_kind, (session_kind) => set({ session_kind }), m.formInput)}
				</FormField>
			</div>
			<FormField label='Phòng học'>
				<VenueSelect
					scope='training'
					className={m.formInput}
					placeholder='-- Chọn phòng học --'
					value={f.room}
					onChange={(room) => set({ room })}
				/>
			</FormField>
		</Modal>
	);
}

/** Bước "Lịch học & Giảng viên": 2 phần — lịch buổi học (điểm danh) và phân công giảng viên theo bài. */
export function SessionsTab({ d }: { d: Detail }) {
	const [view, setView] = useState<'sessions' | 'lecturers'>(
		d.sessions.length || !d.courseLessons.length ? 'sessions' : 'lecturers',
	);
	const [newLecturerId, setNewLecturerId] = useState('');
	const [adding, setAdding] = useState<null | 'one' | 'bulk'>(null);
	const [bulkResult, setBulkResult] = useState<{ created: number; skipped: number } | null>(null);
	const lessonPg = useClientPaging(d.courseLessons);

	// Buổi học chỉ chọn GV đã có hồ sơ (nhân viên CCHN phân công vào bài trước); GV đã phân công lên đầu
	const assignedIds = new Set(d.assignments.map((a) => a.lecturer_id));
	const realLecturers = d.lecturers.filter((l) => l.group !== 'staff');
	const sessionLecturers = [
		...realLecturers.filter((l) => assignedIds.has(l.id)),
		...realLecturers.filter((l) => !assignedIds.has(l.id)),
	];
	// Bài học chọn cho buổi: bài của khóa; khóa chưa gắn chương trình thì mọi bài
	const lessonOptions = d.courseLessons.length
		? d.courseLessons.map((l) => ({ id: l.id, name: lessonLabel(l) }))
		: d.lessons;
	const courseLessonIds = new Set(d.courseLessons.map((l) => l.id));
	// Phân công cả khóa + phân công cũ theo bài không còn trong chương trình của khóa
	const otherAssignments = d.assignments.filter((a) => !a.subject_id || !courseLessonIds.has(a.subject_id));
	// Chọn bài → tự điền GV chính của bài (vẫn đổi được)
	const mainLecturerOf = (lessonId: string) =>
		d.assignments.find((a) => a.subject_id === lessonId && a.role === 'main')?.lecturer_id ?? '';
	const lessonsWithMain = d.courseLessons.filter((l) => mainLecturerOf(l.id)).length;

	// Nhóm buổi theo tháng cho dễ dò
	const months: { month: string; items: typeof d.sessions }[] = [];
	for (const s of d.sessions) {
		const mo = monthOf(s.session_date);
		const last = months[months.length - 1];
		if (last?.month === mo) last.items.push(s);
		else months.push({ month: mo, items: [s] });
	}

	return (
		<>
			<div className={ss.head}>
				<div className={styles.segment}>
					<button
						className={`${styles.segBtn} ${view === 'sessions' ? styles.segBtnActive : ''}`}
						onClick={() => setView('sessions')}
					>
						<CalendarSvg /> Buổi học <span className={styles.sectionCount}>{d.sessions.length}</span>
					</button>
					<button
						className={`${styles.segBtn} ${view === 'lecturers' ? styles.segBtnActive : ''}`}
						onClick={() => setView('lecturers')}
					>
						<UsersSvg /> Phân công giảng viên{' '}
						<span className={styles.sectionCount}>
							{lessonsWithMain}/{d.courseLessons.length} bài
						</span>
					</button>
				</div>
				{view === 'sessions' && (
					<div className={ss.actions}>
						<Button
							variant='secondary'
							size='sm'
							icon={<CalendarSvg />}
							onClick={() => setAdding('bulk')}
						>
							Tạo lịch lặp theo tuần
						</Button>
						<Button
							size='sm'
							icon={<PlusSvg />}
							onClick={() => setAdding('one')}
						>
							Thêm buổi học
						</Button>
					</div>
				)}
			</div>

			{view === 'sessions' ? (
				<>
					{bulkResult && (
						<div className={ss.note}>
							Đã tạo {bulkResult.created} buổi
							{bulkResult.skipped ? `, bỏ qua ${bulkResult.skipped} buổi trùng lịch` : ''}.
						</div>
					)}
					{d.sessions.length === 0 ? (
						<EmptyState
							icon={<CalendarSvg />}
							title='Chưa có buổi học nào'
							desc='Thêm từng buổi hoặc tạo lịch lặp theo tuần. Phân công giảng viên theo bài trước thì buổi học tự điền giảng viên.'
						/>
					) : (
						months.map((g) => (
							<div
								key={g.month}
								className={ss.month}
							>
								<div className={ss.monthTitle}>
									{g.month} <span>{g.items.length} buổi</span>
								</div>
								<div className={ss.list}>
									{g.items.map((s) => {
										const dt = new Date(s.session_date);
										return (
											<div
												key={s.id}
												className={ss.row}
											>
												<span className={ss.date}>
													<span>{WEEKDAY_LABELS[dt.getDay()]}</span>
													<strong>{formatDateVN(s.session_date).slice(0, 5)}</strong>
												</span>
												<div className={ss.main}>
													<div className={ss.title}>
														<span>{s.subject_name ?? 'Chưa gán bài học'}</span>
														{s.session_kind && (
															<Badge tone={s.session_kind === 'practice' ? 'teal' : 'blue'}>
																{SESSION_KIND_LABEL[s.session_kind]}
															</Badge>
														)}
													</div>
													<div className={ss.meta}>
														<span>
															{s.start_time
																? `${s.start_time.slice(0, 5)}–${(s.end_time ?? '').slice(0, 5)}`
																: 'Chưa đặt giờ'}
														</span>
														<span>{s.room ?? 'Chưa gán phòng'}</span>
														<span>{s.lecturer_name ?? 'Chưa gán giảng viên'}</span>
														{s.lecturer_clashes && (
															<Badge
																tone='amber'
																dot
															>
																Trùng lịch GV: {s.lecturer_clashes}
															</Badge>
														)}
													</div>
												</div>
												<div className={ss.rowActions}>
													<Button
														size='sm'
														variant='secondary'
														icon={<CheckSvg />}
														onClick={() => d.setAttendanceSessionId(s.id)}
													>
														Điểm danh
													</Button>
													<button
														className={styles.actionBtn}
														title='Xoá buổi học'
														disabled={d.busy}
														onClick={() => d.removeSession(s.id)}
													>
														<TrashSvg />
													</button>
												</div>
											</div>
										);
									})}
								</div>
							</div>
						))
					)}
				</>
			) : (
				<>
					<div className={tbl.tableCard}>
						<div className={tbl.tableHeader}>
							<div className={tbl.tableHeaderLeft}>
								<span className={tbl.tableTitle}>Giảng viên theo bài học</span>
								<span className={tbl.tableCount}>{d.courseLessons.length}</span>
							</div>
						</div>
						<div className={tbl.tableWrap}>
							<table className={tbl.table}>
								<thead>
									<tr>
										<th className={`${tbl.th} ${tbl.thIdx}`}>STT</th>
										<th className={tbl.th}>Bài học</th>
										<th className={tbl.th}>Giảng viên chính</th>
										<th className={tbl.th}>Số tiết</th>
										<th className={tbl.th}>Giảng viên phụ</th>
									</tr>
								</thead>
								<tbody>
									{d.courseLessons.length === 0 ? (
										<tr>
											<td
												className={tbl.td}
												colSpan={5}
											>
												<div className={styles.subEmpty}>
													Khóa chưa có bài học — chọn chương trình đào tạo cho khóa để phân công giảng viên theo bài.
												</div>
											</td>
										</tr>
									) : (
										lessonPg.paged.map((l, i) => (
											<LessonRow
												key={l.id}
												d={d}
												lesson={l}
												index={lessonPg.offset + i + 1}
												lecturers={d.lecturers}
											/>
										))
									)}
								</tbody>
							</table>
						</div>
						<Pagination
							{...lessonPg.pagination}
							itemLabel='bài'
						/>
					</div>

					<div className={styles.sectionTitle}>Giảng viên phụ trách chung</div>
					<div className={styles.subToolbar}>
						<select
							className={styles.subSelect}
							value={newLecturerId}
							onChange={(e) => setNewLecturerId(e.target.value)}
						>
							<option value=''>-- Chọn giảng viên --</option>
							<LecturerOptions lecturers={d.lecturers} />
						</select>
						<button
							className={styles.btnGhost}
							disabled={!newLecturerId || d.busy}
							onClick={() => {
								d.assignLecturer({ lecturer_id: newLecturerId });
								setNewLecturerId('');
							}}
						>
							<PlusSvg /> Phân công cả khóa
						</button>
					</div>
					{otherAssignments.length === 0 ? (
						<div className={styles.subEmpty}>Chưa phân công giảng viên phụ trách chung.</div>
					) : (
						<div className={styles.chipList}>
							{otherAssignments.map((a) => (
								<span
									key={a.id}
									className={styles.chip}
								>
									<strong>{a.lecturer_name}</strong>
									{a.subject_name && <span className={styles.chipMeta}>· {a.subject_name}</span>}
									<button
										className={styles.chipRemove}
										title='Gỡ phân công'
										disabled={d.busy}
										onClick={() => d.removeAssignment(a.id)}
									>
										<XSvg />
									</button>
								</span>
							))}
						</div>
					)}
				</>
			)}

			{adding && (
				<SessionFormModal
					d={d}
					bulk={adding === 'bulk'}
					lessonOptions={lessonOptions}
					sessionLecturers={sessionLecturers}
					mainLecturerOf={mainLecturerOf}
					onClose={(result) => {
						setAdding(null);
						if (result) setBulkResult(result);
					}}
				/>
			)}
		</>
	);
}
