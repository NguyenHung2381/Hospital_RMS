import { useState } from 'react';
import { CalendarSvg, CheckSvg, PlusSvg, TrashSvg, XSvg } from '@/assets/icons';
import { formatDateVN } from '@/shared/utils/formatDate';
import { VenueSelect } from '../../venue/components/VenueSelect';
import type { useCourseDetail } from '../hooks/useCourseDetail';
import { LecturerOptions } from './LecturerOptions';
import styles from '../pages/Courses.module.css';

const WEEKDAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const EMPTY_SESSION = { session_date: '', start_time: '', end_time: '', room: '', lesson_id: '', lecturer_id: '' };
const EMPTY_BULK = {
	start_date: '',
	end_date: '',
	weekdays: [] as number[],
	start_time: '',
	end_time: '',
	room: '',
	lecturer_id: '',
};

/** Bước "Lịch học & Giảng viên": phân công giảng viên phụ trách, rồi xếp buổi học + điểm danh. */
export function SessionsTab({ d }: { d: ReturnType<typeof useCourseDetail> }) {
	const [newLecturerId, setNewLecturerId] = useState('');
	const [newLessonId, setNewLessonId] = useState('');
	const [sessionForm, setSessionForm] = useState(EMPTY_SESSION);
	const [bulkMode, setBulkMode] = useState(false);
	const [bulkForm, setBulkForm] = useState(EMPTY_BULK);
	const [bulkResult, setBulkResult] = useState<{ created: number; skipped: number } | null>(null);

	// Giảng viên đã phân công lên đầu danh sách chọn cho buổi học
	const assignedIds = new Set(d.assignments.map((a) => a.lecturer_id));
	const sessionLecturers = [
		...d.lecturers.filter((l) => assignedIds.has(l.id)),
		...d.lecturers.filter((l) => !assignedIds.has(l.id)),
	];

	return (
		<>
			<div className={styles.sectionTitle}>Giảng viên phụ trách</div>
			<div className={styles.subToolbar}>
				<select
					className={styles.subSelect}
					value={newLecturerId}
					onChange={(e) => setNewLecturerId(e.target.value)}
				>
					<option value=''>-- Chọn giảng viên --</option>
					<LecturerOptions lecturers={d.lecturers} />
				</select>
				<select
					className={styles.subSelect}
					value={newLessonId}
					onChange={(e) => setNewLessonId(e.target.value)}
				>
					<option value=''>-- Bài học phụ trách (tuỳ chọn) --</option>
					{d.lessons.map((l) => (
						<option
							key={l.id}
							value={l.id}
						>
							{l.name}
						</option>
					))}
				</select>
				<button
					className={styles.btnGhost}
					disabled={!newLecturerId || d.busy}
					onClick={() => {
						d.assignLecturer({ lecturer_id: newLecturerId, subject_id: newLessonId || undefined });
						setNewLecturerId('');
						setNewLessonId('');
					}}
				>
					<PlusSvg /> Phân công
				</button>
			</div>
			{d.assignments.length === 0 ? (
				<div className={styles.subEmpty}>Chưa phân công giảng viên nào.</div>
			) : (
				<div className={styles.chipList}>
					{d.assignments.map((a) => (
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
					<select
						className={styles.subSelect}
						value={sessionForm.lesson_id}
						onChange={(e) => setSessionForm((f) => ({ ...f, lesson_id: e.target.value }))}
					>
						<option value=''>-- Bài học --</option>
						{d.lessons.map((l) => (
							<option
								key={l.id}
								value={l.id}
							>
								{l.name}
							</option>
						))}
					</select>
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
							const result = await d.createSessionsBulk(bulkForm);
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
