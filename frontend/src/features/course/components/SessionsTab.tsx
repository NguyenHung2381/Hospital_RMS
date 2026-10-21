import { useState } from 'react';
import { CalendarSvg, CheckSvg, PlusSvg, TrashSvg, XSvg } from '@/assets/icons';
import { Badge } from '@/shared/components';
import tbl from '@/shared/components/Table/Table.module.css';
import { Pagination } from '@/shared/components/Table/Pagination';
import { useClientPaging } from '@/shared/hooks/useClientPaging';
import { formatDateVN } from '@/shared/utils/formatDate';
import { VenueSelect } from '../../venue/components/VenueSelect';
import type { LecturerItem, useCourseDetail } from '../hooks/useCourseDetail';
import type { CourseLesson, LecturerAssignment } from '../types/course.type';
import { LecturerOptions } from './LecturerOptions';
import styles from '../pages/Courses.module.css';

type Detail = ReturnType<typeof useCourseDetail>;

const WEEKDAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const EMPTY_SESSION = { session_date: '', start_time: '', end_time: '', room: '', lesson_id: '', lecturer_id: '' };
const EMPTY_BULK = {
	start_date: '',
	end_date: '',
	weekdays: [] as number[],
	start_time: '',
	end_time: '',
	room: '',
	lesson_id: '',
	lecturer_id: '',
};

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

/** Bước "Lịch học & Giảng viên": phân công giảng viên theo bài, rồi xếp buổi học + điểm danh. */
export function SessionsTab({ d }: { d: Detail }) {
	const [newLecturerId, setNewLecturerId] = useState('');
	const [sessionForm, setSessionForm] = useState(EMPTY_SESSION);
	const [bulkMode, setBulkMode] = useState(false);
	const [bulkForm, setBulkForm] = useState(EMPTY_BULK);
	const [bulkResult, setBulkResult] = useState<{ created: number; skipped: number } | null>(null);
	const lessonPg = useClientPaging(d.courseLessons);

	// Giảng viên đã phân công lên đầu danh sách chọn cho buổi học
	const assignedIds = new Set(d.assignments.map((a) => a.lecturer_id));
	const sessionLecturers = [
		...d.lecturers.filter((l) => assignedIds.has(l.id)),
		...d.lecturers.filter((l) => !assignedIds.has(l.id)),
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

	const lessonSelect = (value: string, onChange: (lessonId: string) => void) => (
		<select
			className={styles.subSelect}
			value={value}
			onChange={(e) => onChange(e.target.value)}
		>
			<option value=''>-- Bài học --</option>
			{lessonOptions.map((l) => (
				<option
					key={l.id}
					value={l.id}
				>
					{l.name}
				</option>
			))}
		</select>
	);

	return (
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

			<div className={styles.sectionTitle}>
				Buổi học <span className={styles.sectionCount}>{d.sessions.length}</span>
			</div>
			<div className={styles.segment}>
				<button
					className={`${styles.segBtn} ${!bulkMode ? styles.segBtnActive : ''}`}
					onClick={() => setBulkMode(false)}
				>
					<PlusSvg /> Thêm 1 buổi
				</button>
				<button
					className={`${styles.segBtn} ${bulkMode ? styles.segBtnActive : ''}`}
					onClick={() => setBulkMode(true)}
				>
					<CalendarSvg /> Tạo lịch lặp theo tuần
				</button>
			</div>

			{!bulkMode ? (
				<div className={styles.subToolbar}>
					<input
						type='date'
						className={styles.subInput}
						value={sessionForm.session_date}
						onChange={(e) => setSessionForm((f) => ({ ...f, session_date: e.target.value }))}
					/>
					<input
						type='time'
						className={styles.subInput}
						value={sessionForm.start_time}
						onChange={(e) => setSessionForm((f) => ({ ...f, start_time: e.target.value }))}
					/>
					<input
						type='time'
						className={styles.subInput}
						value={sessionForm.end_time}
						onChange={(e) => setSessionForm((f) => ({ ...f, end_time: e.target.value }))}
					/>
					<VenueSelect
						scope='training'
						className={styles.subSelect}
						placeholder='-- Phòng học --'
						value={sessionForm.room}
						onChange={(room) => setSessionForm((f) => ({ ...f, room }))}
					/>
					{lessonSelect(sessionForm.lesson_id, (lesson_id) =>
						setSessionForm((f) => ({ ...f, lesson_id, lecturer_id: mainLecturerOf(lesson_id) || f.lecturer_id })),
					)}
					<select
						className={styles.subSelect}
						value={sessionForm.lecturer_id}
						onChange={(e) => setSessionForm((f) => ({ ...f, lecturer_id: e.target.value }))}
					>
						<option value=''>-- Giảng viên --</option>
						<LecturerOptions lecturers={sessionLecturers} />
					</select>
					<button
						className={styles.btnGhost}
						disabled={!sessionForm.session_date || d.busy}
						onClick={() => {
							d.createSession({
								session_date: sessionForm.session_date,
								start_time: sessionForm.start_time || undefined,
								end_time: sessionForm.end_time || undefined,
								room: sessionForm.room || undefined,
								subject_id: sessionForm.lesson_id || undefined,
								lecturer_id: sessionForm.lecturer_id || undefined,
							});
							setSessionForm(EMPTY_SESSION);
						}}
					>
						<PlusSvg /> Thêm buổi học
					</button>
				</div>
			) : (
				<div className={styles.subToolbar}>
					<input
						type='date'
						className={styles.subInput}
						title='Từ ngày'
						value={bulkForm.start_date}
						onChange={(e) => setBulkForm((f) => ({ ...f, start_date: e.target.value }))}
					/>
					<input
						type='date'
						className={styles.subInput}
						title='Đến ngày'
						value={bulkForm.end_date}
						onChange={(e) => setBulkForm((f) => ({ ...f, end_date: e.target.value }))}
					/>
					<div className={styles.weekdayGroup}>
						{WEEKDAY_LABELS.map((label, idx) => (
							<label
								key={idx}
								className={styles.attRadio}
							>
								<input
									type='checkbox'
									checked={bulkForm.weekdays.includes(idx)}
									onChange={(e) =>
										setBulkForm((f) => ({
											...f,
											weekdays: e.target.checked
												? [...f.weekdays, idx]
												: f.weekdays.filter((w) => w !== idx),
										}))
									}
								/>
								{label}
							</label>
						))}
					</div>
					<input
						type='time'
						className={styles.subInput}
						value={bulkForm.start_time}
						onChange={(e) => setBulkForm((f) => ({ ...f, start_time: e.target.value }))}
					/>
					<input
						type='time'
						className={styles.subInput}
						value={bulkForm.end_time}
						onChange={(e) => setBulkForm((f) => ({ ...f, end_time: e.target.value }))}
					/>
					<VenueSelect
						scope='training'
						className={styles.subSelect}
						placeholder='-- Phòng học --'
						value={bulkForm.room}
						onChange={(room) => setBulkForm((f) => ({ ...f, room }))}
					/>
					{lessonSelect(bulkForm.lesson_id, (lesson_id) =>
						setBulkForm((f) => ({ ...f, lesson_id, lecturer_id: mainLecturerOf(lesson_id) || f.lecturer_id })),
					)}
					<select
						className={styles.subSelect}
						value={bulkForm.lecturer_id}
						onChange={(e) => setBulkForm((f) => ({ ...f, lecturer_id: e.target.value }))}
					>
						<option value=''>-- Giảng viên --</option>
						<LecturerOptions lecturers={sessionLecturers} />
					</select>
					<button
						className={styles.btnGhost}
						disabled={!bulkForm.start_date || !bulkForm.end_date || bulkForm.weekdays.length === 0 || d.busy}
						onClick={async () => {
							const { lesson_id, ...rest } = bulkForm;
							const result = await d.createSessionsBulk({ ...rest, subject_id: lesson_id || undefined });
							if (result) setBulkResult(result);
						}}
					>
						<PlusSvg /> Tạo lịch
					</button>
					{bulkResult && (
						<span className={styles.subRowMeta}>
							Đã tạo {bulkResult.created} buổi
							{bulkResult.skipped ? `, bỏ qua ${bulkResult.skipped} buổi trùng lịch` : ''}.
						</span>
					)}
				</div>
			)}

			{d.sessions.length === 0 ? (
				<div className={styles.subEmpty}>Chưa có buổi học nào.</div>
			) : (
				<div className={styles.subList}>
					{d.sessions.map((s) => (
						<div
							key={s.id}
							className={styles.subRow}
						>
							<div className={styles.subRowMain}>
								<div className={styles.subRowName}>
									{formatDateVN(s.session_date)}
									{s.start_time ? ` · ${s.start_time}-${s.end_time ?? ''}` : ''}
									{s.subject_name ? ` · ${s.subject_name}` : ''}
								</div>
								<div className={styles.subRowMeta}>
									{s.room ?? 'Chưa gán phòng'} · {s.lecturer_name ?? 'Chưa gán giảng viên'}
									{s.lecturer_clashes && (
										<>
											{' '}
											<Badge
												tone='amber'
												dot
											>
												Trùng lịch GV: {s.lecturer_clashes}
											</Badge>
										</>
									)}
								</div>
							</div>
							<button
								className={styles.btnGhost}
								onClick={() => d.setAttendanceSessionId(s.id)}
							>
								<CheckSvg /> Điểm danh
							</button>
							<button
								className={styles.actionBtn}
								title='Xoá buổi học'
								disabled={d.busy}
								onClick={() => d.removeSession(s.id)}
							>
								<TrashSvg />
							</button>
						</div>
					))}
				</div>
			)}
		</>
	);
}
