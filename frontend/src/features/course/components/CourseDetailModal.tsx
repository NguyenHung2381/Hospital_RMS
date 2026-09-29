import { formatDateVN } from '../../../shared/utils/formatDate';
import { useMemo, useState } from 'react';
import {
	BadgeSvg,
	BookOpenSvg,
	CalendarSvg,
	CheckSvg,
	ClipboardCheckSvg,
	DocSvg,
	LayersSvg,
	PlusSvg,
	TrashSvg,
	UserCheckSvg,
	UsersSvg,
	XSvg,
} from '@/assets/icons';
import { VenueSelect } from '../../venue/components/VenueSelect';
import { useCourseDetail, type DetailTab } from '../hooks/useCourseDetail';
import type { Course } from '../types/course.type';
import { groupGradesByProgram } from '../utils/gradeStats';
import { AttendanceModal } from './AttendanceModal';
import { CourseDocumentsTab } from './CourseDocumentsTab';
import { LecturerOptions } from './LecturerOptions';
import { ProgramLinksTab } from './ProgramLinksTab';
import { EnrollmentsTab } from './EnrollmentsTab';
import { ExamsTab } from './ExamsTab';
import styles from '../pages/Courses.module.css';

const TABS: { key: DetailTab; label: string; icon: React.ReactNode }[] = [
	{ key: 'programs', label: 'Chương trình áp dụng', icon: <BookOpenSvg /> },
	{ key: 'enrollments', label: 'Đăng ký học viên', icon: <UsersSvg /> },
	{ key: 'lecturers', label: 'Giảng viên', icon: <UserCheckSvg /> },
	{ key: 'sessions', label: 'Lịch học', icon: <ClipboardCheckSvg /> },
	{ key: 'documents', label: 'Tài liệu & Kiểm tra', icon: <DocSvg /> },
	{ key: 'exams', label: 'Ngân hàng câu hỏi & Thi online', icon: <ClipboardCheckSvg /> },
	{ key: 'results', label: 'Kết quả & Chứng chỉ', icon: <BadgeSvg /> },
];

const WEEKDAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

export function CourseDetailModal({
	course,
	initialTab,
	onClose,
}: {
	course: Course;
	/** Tab mở sẵn khi vào modal (vd nút "Lịch học & điểm danh" ở bảng mở thẳng tab sessions). */
	initialTab?: DetailTab;
	onClose: () => void;
}) {
	const d = useCourseDetail(course.id, initialTab);
	const [newLecturerId, setNewLecturerId] = useState('');
	const [newAssignSubjectId, setNewAssignSubjectId] = useState('');
	const [sessionForm, setSessionForm] = useState({
		session_date: '',
		start_time: '',
		end_time: '',
		room: '',
		subject_id: '',
		lecturer_id: '',
	});
	const [showBulkForm, setShowBulkForm] = useState(false);
	const [bulkForm, setBulkForm] = useState({
		start_date: '',
		end_date: '',
		weekdays: [] as number[],
		start_time: '',
		end_time: '',
		room: '',
		lecturer_id: '',
	});
	const [bulkResult, setBulkResult] = useState<{ created: number; skipped: number } | null>(null);
	const attendanceSession = d.sessions.find((s) => s.id === d.attendanceSessionId) ?? null;
	const [certExpiry, setCertExpiry] = useState<Record<string, string>>({});
	const gradeGroups = useMemo(() => groupGradesByProgram(d.grades, d.programLinks), [d.grades, d.programLinks]);

	return (
		<div
			className={styles.modalBackdrop}
			onClick={(e) => e.target === e.currentTarget && onClose()}
		>
			<div className={styles.detailModal}>
				<div className={styles.modalHeader}>
					<div className={styles.modalHeaderIcon}>
						<LayersSvg />
					</div>
					<div>
						<div className={styles.modalTitle}>{course.name}</div>
						<div className={styles.modalSub}>
							{course.approved_count}
							{course.capacity != null ? `/${course.capacity}` : ''} học viên đã duyệt ·{' '}
							{course.pending_count} chờ duyệt
						</div>
					</div>
					<button
						className={styles.modalClose}
						onClick={onClose}
					>
						<XSvg />
					</button>
				</div>

				<div className={styles.detailTabs}>
					{TABS.map((t) => (
						<button
							key={t.key}
							className={`${styles.detailTabBtn} ${d.tab === t.key ? styles.detailTabBtnActive : ''}`}
							onClick={() => d.setTab(t.key)}
						>
							{t.icon} {t.label}
						</button>
					))}
				</div>

				<div className={styles.detailBody}>
					{d.error && <div className={styles.errorBanner}>{d.error}</div>}

					{d.loading ? (
						<div className={styles.subEmpty}>Đang tải...</div>
					) : d.tab === 'programs' ? (
						<ProgramLinksTab
							programs={d.programs}
							programLinks={d.programLinks}
							busy={d.busy}
							onAdd={d.addProgramLink}
							onUpdate={d.updateProgramLink}
							onRemove={d.removeProgramLink}
						/>
					) : d.tab === 'enrollments' ? (
						<EnrollmentsTab
							enrollments={d.enrollments}
							trainees={d.trainees}
							busy={d.busy}
							onRegister={d.registerTrainee}
							onDecide={d.decideEnrollment}
							onDecideBulk={d.decideEnrollmentsBulk}
							onRemove={d.removeEnrollment}
						/>
					) : d.tab === 'lecturers' ? (
						<>
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
									value={newAssignSubjectId}
									onChange={(e) => setNewAssignSubjectId(e.target.value)}
								>
									<option value=''>-- Môn học (tuỳ chọn) --</option>
									{d.subjects.map((s) => (
										<option
											key={s.id}
											value={s.id}
										>
											{s.name}
										</option>
									))}
								</select>
								<button
									className={styles.btnGhost}
									disabled={!newLecturerId || d.busy}
									onClick={() => {
										d.assignLecturer({
											lecturer_id: newLecturerId,
											subject_id: newAssignSubjectId || undefined,
										});
										setNewLecturerId('');
										setNewAssignSubjectId('');
									}}
								>
									<PlusSvg /> Phân công
								</button>
							</div>

							{d.assignments.length === 0 ? (
								<div className={styles.subEmpty}>Chưa phân công giảng viên nào.</div>
							) : (
								<div className={styles.subList}>
									{d.assignments.map((a) => (
										<div
											key={a.id}
											className={styles.subRow}
										>
											<div className={styles.subRowMain}>
												<div className={styles.subRowName}>{a.lecturer_name}</div>
												<div className={styles.subRowMeta}>
													{a.subject_name ?? 'Chưa gán môn'} {a.specialty ? `· ${a.specialty}` : ''}
												</div>
											</div>
											<button
												className={styles.actionBtn}
												title='Gỡ phân công'
												disabled={d.busy}
												onClick={() => d.removeAssignment(a.id)}
											>
												<TrashSvg />
											</button>
										</div>
									))}
								</div>
							)}
						</>
					) : d.tab === 'sessions' ? (
						<>
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
									value={sessionForm.lecturer_id}
									onChange={(e) => setSessionForm((f) => ({ ...f, lecturer_id: e.target.value }))}
								>
									<option value=''>-- Giảng viên --</option>
									<LecturerOptions lecturers={d.lecturers} />
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
											lecturer_id: sessionForm.lecturer_id || undefined,
										});
										setSessionForm({
											session_date: '',
											start_time: '',
											end_time: '',
											room: '',
											subject_id: '',
											lecturer_id: '',
										});
									}}
								>
									<PlusSvg /> Thêm buổi học
								</button>
								<button className={styles.btnGhost} onClick={() => setShowBulkForm((v) => !v)}>
									<CalendarSvg /> Tạo lịch hàng loạt
								</button>
							</div>

							{showBulkForm && (
								<div className={styles.subToolbar} style={{ flexWrap: 'wrap' }}>
									<input
										type='date'
										className={styles.subInput}
										placeholder='Từ ngày'
										value={bulkForm.start_date}
										onChange={(e) => setBulkForm((f) => ({ ...f, start_date: e.target.value }))}
									/>
									<input
										type='date'
										className={styles.subInput}
										placeholder='Đến ngày'
										value={bulkForm.end_date}
										onChange={(e) => setBulkForm((f) => ({ ...f, end_date: e.target.value }))}
									/>
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
									<div style={{ display: 'flex', gap: 4 }}>
										{WEEKDAY_LABELS.map((label, idx) => (
											<label key={idx} className={styles.attRadio}>
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
											Đã tạo {bulkResult.created} buổi{bulkResult.skipped ? `, bỏ qua ${bulkResult.skipped} buổi trùng lịch` : ''}.
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
					) : d.tab === 'documents' ? (
						<CourseDocumentsTab
							documents={d.documents}
							busy={d.busy}
							onAdd={d.addDocument}
							onRemove={d.removeDocument}
							onOpen={d.incrementDocumentDownload}
						/>
					) : d.tab === 'exams' ? (
						<ExamsTab courseId={course.id} />
					) : (
						<>
							<div
								className={styles.subRowMeta}
								style={{ marginBottom: 10 }}
							>
								Kết quả học tập & cấp chứng chỉ cho học viên đã được duyệt tham gia khóa học.
							</div>
							{gradeGroups.length > 0 && (
								<div
									className={styles.subList}
									style={{ marginBottom: 14 }}
								>
									{gradeGroups.map((g) => (
										<div
											key={g.program_id ?? '__none__'}
											className={styles.subRow}
										>
											<div className={styles.subRowMain}>
												<div className={styles.subRowName}>{g.program_name}</div>
												<div className={styles.subRowMeta}>
													{g.total} điểm · Đạt {g.passCount} · Không đạt {g.failCount}
													{g.avgScore != null ? ` · TB ${g.avgScore}` : ''}
												</div>
											</div>
										</div>
									))}
								</div>
							)}
							{d.enrollments.filter((e) => e.status === 'approved').length === 0 ? (
								<div className={styles.subEmpty}>Chưa có học viên nào được duyệt.</div>
							) : (
								<div className={styles.subList}>
									{d.enrollments
										.filter((e) => e.status === 'approved')
										.map((en) => {
											const grade = d.grades.find(
												(g) => g.enrollment_id === en.id && !g.subject_id,
											);
											const cert = d.certificates.find((c) => c.enrollment_id === en.id);
											return (
												<div
													key={en.id}
													className={styles.subRow}
													style={{ flexWrap: 'wrap' }}
												>
													<div className={styles.subRowMain}>
														<div className={styles.subRowName}>{en.trainee_name}</div>
														<div className={styles.subRowMeta}>
															{grade?.classification && (
																<span className={styles.certBadge}>{grade.classification}</span>
															)}
															{cert && (
																<>
																	{' '}
																	<span
																		className={styles.certBadge}
																		style={
																			cert.status === 'revoked'
																				? { background: '#fcebeb', color: '#791f1f' }
																				: undefined
																		}
																	>
																		{cert.cert_no} · {cert.status === 'revoked' ? 'Đã thu hồi' : 'Đã cấp'}
																	</span>{' '}
																	Cấp ngày {formatDateVN(cert.issue_date)}
																	{cert.expiry_date ? ` · Hạn ${formatDateVN(cert.expiry_date)}` : ''}
																</>
															)}
														</div>
													</div>
													<select
														className={styles.subSelect}
														title='Chương trình đào tạo'
														value={grade?.program_id ?? ''}
														onChange={(e) =>
															d.upsertGrade({
																enrollment_id: en.id,
																program_id: e.target.value || undefined,
																regular_score: grade?.regular_score ?? undefined,
																midterm_score: grade?.midterm_score ?? undefined,
																final_score: grade?.final_score ?? undefined,
															})
														}
													>
														<option value=''>-- Chương trình --</option>
														{d.programLinks.map((link) => (
															<option key={link.program_id} value={link.program_id}>
																{link.program_name}
															</option>
														))}
													</select>
													<input
														type='number'
														step='0.1'
														className={styles.scoreInput}
														placeholder='TX'
														title='Điểm thường xuyên'
														defaultValue={grade?.regular_score ?? ''}
														onBlur={(e) =>
															d.upsertGrade({
																enrollment_id: en.id,
																program_id: grade?.program_id ?? undefined,
																regular_score: e.target.value ? Number(e.target.value) : undefined,
																midterm_score: grade?.midterm_score ?? undefined,
																final_score: grade?.final_score ?? undefined,
															})
														}
													/>
													<input
														type='number'
														step='0.1'
														className={styles.scoreInput}
														placeholder='GK'
														title='Điểm giữa kỳ'
														defaultValue={grade?.midterm_score ?? ''}
														onBlur={(e) =>
															d.upsertGrade({
																enrollment_id: en.id,
																program_id: grade?.program_id ?? undefined,
																regular_score: grade?.regular_score ?? undefined,
																midterm_score: e.target.value ? Number(e.target.value) : undefined,
																final_score: grade?.final_score ?? undefined,
															})
														}
													/>
													<input
														type='number'
														step='0.1'
														className={styles.scoreInput}
														placeholder='CK'
														title='Điểm cuối kỳ'
														defaultValue={grade?.final_score ?? ''}
														onBlur={(e) =>
															d.upsertGrade({
																enrollment_id: en.id,
																program_id: grade?.program_id ?? undefined,
																regular_score: grade?.regular_score ?? undefined,
																midterm_score: grade?.midterm_score ?? undefined,
																final_score: e.target.value ? Number(e.target.value) : undefined,
															})
														}
													/>
													<span className={styles.subRowMeta} title='Điểm tổng kết'>
														{grade?.score ?? '—'}
													</span>
													{!cert ? (
														<>
															<input
																type='date'
																className={styles.subInput}
																style={{ maxWidth: 140 }}
																placeholder='Hạn chứng chỉ'
																value={certExpiry[en.id] ?? ''}
																onChange={(e) =>
																	setCertExpiry((m) => ({ ...m, [en.id]: e.target.value }))
																}
															/>
															<button
																className={styles.btnGhost}
																disabled={d.busy}
																onClick={() => d.issueCertificate(en.id, certExpiry[en.id])}
															>
																<BadgeSvg /> Cấp chứng chỉ
															</button>
														</>
													) : cert.status === 'active' ? (
														<button
															className={styles.actionBtn}
															title='Thu hồi chứng chỉ'
															disabled={d.busy}
															onClick={() => {
																const reason = window.prompt('Lý do thu hồi (không bắt buộc):') ?? '';
																d.revokeCertificate(cert.id, reason || undefined);
															}}
														>
															<TrashSvg />
														</button>
													) : (
														<button
															className={styles.actionBtn}
															title='Xoá hẳn chứng chỉ'
															disabled={d.busy}
															onClick={() => d.removeCertificate(cert.id)}
														>
															<TrashSvg />
														</button>
													)}
												</div>
											);
										})}
								</div>
							)}
						</>
					)}
				</div>
			</div>

			{attendanceSession && (
				<AttendanceModal
					session={attendanceSession}
					onClose={() => d.setAttendanceSessionId(null)}
				/>
			)}
		</div>
	);
}
