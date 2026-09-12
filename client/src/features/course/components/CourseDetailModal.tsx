import { useRef, useState } from 'react';
import {
	BadgeSvg,
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
import { useCourseDetail, type DetailTab } from '../hooks/useCourseDetail';
import { DOC_TYPE_CFG, ENROLLMENT_STATUS_CFG, type Course, type DocType } from '../types/course.type';
import { AttendanceModal } from './AttendanceModal';
import styles from '../pages/Courses.module.css';

const TABS: { key: DetailTab; label: string; icon: React.ReactNode }[] = [
	{ key: 'enrollments', label: 'Đăng ký học viên', icon: <UsersSvg /> },
	{ key: 'lecturers', label: 'Giảng viên', icon: <UserCheckSvg /> },
	{ key: 'sessions', label: 'Lịch học', icon: <ClipboardCheckSvg /> },
	{ key: 'documents', label: 'Tài liệu & Kiểm tra', icon: <DocSvg /> },
	{ key: 'results', label: 'Kết quả & Chứng chỉ', icon: <BadgeSvg /> },
];

export function CourseDetailModal({ course, onClose }: { course: Course; onClose: () => void }) {
	const d = useCourseDetail(course.id);
	const [newTraineeId, setNewTraineeId] = useState('');
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
	const attendanceSession = d.sessions.find((s) => s.id === d.attendanceSessionId) ?? null;
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [docForm, setDocForm] = useState<{ doc_type: DocType; title: string; is_public: boolean }>({
		doc_type: 'material',
		title: '',
		is_public: true,
	});

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
					) : d.tab === 'enrollments' ? (
						<>
							<div className={styles.subToolbar}>
								<select
									className={styles.subSelect}
									value={newTraineeId}
									onChange={(e) => setNewTraineeId(e.target.value)}
								>
									<option value=''>-- Chọn học viên để thêm --</option>
									{d.trainees
										.filter((t) => !d.enrollments.some((e) => e.trainee_id === t.id))
										.map((t) => (
											<option
												key={t.id}
												value={t.id}
											>
												{t.name}
											</option>
										))}
								</select>
								<button
									className={styles.btnGhost}
									disabled={!newTraineeId || d.busy}
									onClick={() => {
										d.registerTrainee(newTraineeId);
										setNewTraineeId('');
									}}
								>
									<PlusSvg /> Thêm đăng ký
								</button>
							</div>

							{d.enrollments.length === 0 ? (
								<div className={styles.subEmpty}>Chưa có học viên nào đăng ký khóa học này.</div>
							) : (
								<div className={styles.subList}>
									{d.enrollments.map((en) => {
										const cfg = ENROLLMENT_STATUS_CFG[en.status];
										return (
											<div
												key={en.id}
												className={styles.subRow}
											>
												<div className={styles.subRowMain}>
													<div className={styles.subRowName}>{en.trainee_name}</div>
													<div className={styles.subRowMeta}>
														{en.trainee_phone ?? en.trainee_email ?? '—'}
													</div>
												</div>
												<span
													className={styles.badge}
													style={{ background: cfg.bg, color: cfg.color }}
												>
													{cfg.label}
												</span>
												{en.status === 'pending' && (
													<>
														<button
															className={`${styles.btnSmall} ${styles.btnSmallApprove}`}
															disabled={d.busy}
															onClick={() => d.decideEnrollment(en.id, 'approved')}
														>
															Duyệt
														</button>
														<button
															className={`${styles.btnSmall} ${styles.btnSmallReject}`}
															disabled={d.busy}
															onClick={() => d.decideEnrollment(en.id, 'rejected')}
														>
															Từ chối
														</button>
													</>
												)}
												<button
													className={styles.actionBtn}
													title='Xoá đăng ký'
													disabled={d.busy}
													onClick={() => d.removeEnrollment(en.id)}
												>
													<TrashSvg />
												</button>
											</div>
										);
									})}
								</div>
							)}
						</>
					) : d.tab === 'lecturers' ? (
						<>
							<div className={styles.subToolbar}>
								<select
									className={styles.subSelect}
									value={newLecturerId}
									onChange={(e) => setNewLecturerId(e.target.value)}
								>
									<option value=''>-- Chọn giảng viên --</option>
									{d.lecturers.map((l) => (
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
								<input
									className={styles.subInput}
									placeholder='Phòng học'
									value={sessionForm.room}
									onChange={(e) => setSessionForm((f) => ({ ...f, room: e.target.value }))}
								/>
								<select
									className={styles.subSelect}
									value={sessionForm.lecturer_id}
									onChange={(e) => setSessionForm((f) => ({ ...f, lecturer_id: e.target.value }))}
								>
									<option value=''>-- Giảng viên --</option>
									{d.lecturers.map((l) => (
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
							</div>

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
													{s.session_date}
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
						<>
							<div className={styles.subToolbar}>
								<select
									className={styles.subSelect}
									value={docForm.doc_type}
									onChange={(e) => setDocForm((f) => ({ ...f, doc_type: e.target.value as DocType }))}
								>
									<option value='material'>Tài liệu</option>
									<option value='test_question'>Đề kiểm tra</option>
									<option value='test_answer'>Đáp án</option>
								</select>
								<input
									className={styles.subInput}
									placeholder='Tiêu đề'
									value={docForm.title}
									onChange={(e) => setDocForm((f) => ({ ...f, title: e.target.value }))}
								/>
								<label className={styles.attRadio}>
									<input
										type='checkbox'
										checked={docForm.is_public}
										onChange={(e) => setDocForm((f) => ({ ...f, is_public: e.target.checked }))}
									/>
									Công khai
								</label>
								<input
									type='file'
									ref={fileInputRef}
									className={styles.subInput}
								/>
								<button
									className={styles.btnGhost}
									disabled={d.busy || !docForm.title.trim()}
									onClick={() => {
										const file = fileInputRef.current?.files?.[0];
										if (!file || !docForm.title.trim()) return;
										d.addDocument(file, docForm);
										setDocForm({ doc_type: 'material', title: '', is_public: true });
										if (fileInputRef.current) fileInputRef.current.value = '';
									}}
								>
									<PlusSvg /> Tải lên
								</button>
							</div>

							{d.documents.length === 0 ? (
								<div className={styles.subEmpty}>Chưa có tài liệu nào.</div>
							) : (
								<div className={styles.subList}>
									{d.documents.map((doc) => (
										<div
											key={doc.id}
											className={styles.subRow}
										>
											<div className={styles.subRowMain}>
												<a
													href={doc.file_url}
													target='_blank'
													rel='noreferrer'
													className={styles.docLink}
												>
													{doc.title}
												</a>
												<div className={styles.subRowMeta}>
													{DOC_TYPE_CFG[doc.doc_type]} · {doc.file_name}
													{!doc.is_public ? ' · Chưa công khai' : ''}
												</div>
											</div>
											<button
												className={styles.actionBtn}
												title='Xoá'
												disabled={d.busy}
												onClick={() => d.removeDocument(doc.id)}
											>
												<TrashSvg />
											</button>
										</div>
									))}
								</div>
							)}
						</>
					) : (
						<>
							<div
								className={styles.subRowMeta}
								style={{ marginBottom: 10 }}
							>
								Kết quả học tập & cấp chứng chỉ cho học viên đã được duyệt tham gia khóa học.
							</div>
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
												>
													<div className={styles.subRowMain}>
														<div className={styles.subRowName}>{en.trainee_name}</div>
														{cert && (
															<div className={styles.subRowMeta}>
																<span className={styles.certBadge}>{cert.cert_no}</span> · Cấp
																ngày {cert.issue_date}
															</div>
														)}
													</div>
													<input
														type='number'
														step='0.1'
														className={styles.scoreInput}
														placeholder='Điểm'
														defaultValue={grade?.score ?? ''}
														onBlur={(e) =>
															d.upsertGrade({
																enrollment_id: en.id,
																score: e.target.value ? Number(e.target.value) : undefined,
																result: grade?.result ?? undefined,
															})
														}
													/>
													<select
														className={styles.subSelect}
														style={{ maxWidth: 140 }}
														defaultValue={grade?.result ?? ''}
														onChange={(e) =>
															d.upsertGrade({
																enrollment_id: en.id,
																score: grade?.score ?? undefined,
																result: e.target.value || undefined,
															})
														}
													>
														<option value=''>-- Kết quả --</option>
														<option value='pass'>Đạt</option>
														<option value='fail'>Không đạt</option>
													</select>
													{!cert ? (
														<button
															className={styles.btnGhost}
															disabled={d.busy}
															onClick={() => d.issueCertificate(en.id)}
														>
															<BadgeSvg /> Cấp chứng chỉ
														</button>
													) : (
														<button
															className={styles.actionBtn}
															title='Thu hồi chứng chỉ'
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
