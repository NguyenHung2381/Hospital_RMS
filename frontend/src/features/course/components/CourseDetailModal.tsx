import { useMemo, useRef, useState } from 'react';
import {
	BadgeSvg,
	BookOpenSvg,
	CalendarSvg,
	CheckSvg,
	ClipboardCheckSvg,
	DocSvg,
	DownloadSvg,
	LayersSvg,
	PlusSvg,
	TrashSvg,
	UserCheckSvg,
	UsersSvg,
	XSvg,
} from '@/assets/icons';
import { useCourseDetail, type DetailTab } from '../hooks/useCourseDetail';
import {
	DOC_TYPE_CFG,
	ENROLLMENT_STATUS_CFG,
	EXAM_TYPE_CFG,
	type Course,
	type DocType,
	type ExamType,
	type SourceType,
} from '../types/course.type';
import { groupGradesByProgram } from '../utils/gradeStats';
import { AttendanceModal } from './AttendanceModal';
import styles from '../pages/Courses.module.css';

const TABS: { key: DetailTab; label: string; icon: React.ReactNode }[] = [
	{ key: 'programs', label: 'Chương trình áp dụng', icon: <BookOpenSvg /> },
	{ key: 'enrollments', label: 'Đăng ký học viên', icon: <UsersSvg /> },
	{ key: 'lecturers', label: 'Giảng viên', icon: <UserCheckSvg /> },
	{ key: 'sessions', label: 'Lịch học', icon: <ClipboardCheckSvg /> },
	{ key: 'documents', label: 'Tài liệu & Kiểm tra', icon: <DocSvg /> },
	{ key: 'results', label: 'Kết quả & Chứng chỉ', icon: <BadgeSvg /> },
];

const WEEKDAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

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
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [docForm, setDocForm] = useState<{
		doc_type: DocType;
		title: string;
		is_public: boolean;
		exam_type: ExamType | '';
		sourceType: SourceType;
		externalUrl: string;
	}>({
		doc_type: 'material',
		title: '',
		is_public: true,
		exam_type: '',
		sourceType: 'file',
		externalUrl: '',
	});
	const [newProgramLink, setNewProgramLink] = useState({ program_id: '', start_date: '', end_date: '', location: '' });
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
						<>
							<div className={styles.subToolbar}>
								<select
									className={styles.subSelect}
									value={newProgramLink.program_id}
									onChange={(e) => setNewProgramLink((f) => ({ ...f, program_id: e.target.value }))}
								>
									<option value=''>-- Chọn chương trình đào tạo --</option>
									{d.programs
										.filter((p) => !d.programLinks.some((l) => l.program_id === p.id))
										.map((p) => (
											<option key={p.id} value={p.id}>
												{p.name}
											</option>
										))}
								</select>
								<input
									type='date'
									className={styles.subInput}
									value={newProgramLink.start_date}
									onChange={(e) => setNewProgramLink((f) => ({ ...f, start_date: e.target.value }))}
								/>
								<input
									type='date'
									className={styles.subInput}
									value={newProgramLink.end_date}
									onChange={(e) => setNewProgramLink((f) => ({ ...f, end_date: e.target.value }))}
								/>
								<input
									className={styles.subInput}
									placeholder='Địa điểm'
									value={newProgramLink.location}
									onChange={(e) => setNewProgramLink((f) => ({ ...f, location: e.target.value }))}
								/>
								<button
									className={styles.btnGhost}
									disabled={!newProgramLink.program_id || d.busy}
									onClick={() => {
										d.addProgramLink({
											program_id: newProgramLink.program_id,
											start_date: newProgramLink.start_date,
											end_date: newProgramLink.end_date,
											location: newProgramLink.location,
											lecturer_id: '',
											external_lecturer_name: '',
											status: 'active',
										});
										setNewProgramLink({ program_id: '', start_date: '', end_date: '', location: '' });
									}}
								>
									<PlusSvg /> Gán chương trình
								</button>
							</div>

							{d.programLinks.length === 0 ? (
								<div className={styles.subEmpty}>Khóa học chưa áp dụng chương trình đào tạo nào.</div>
							) : (
								<div className={styles.subList}>
									{d.programLinks.map((link) => (
										<div key={link.id} className={styles.subRow}>
											<div className={styles.subRowMain}>
												<div className={styles.subRowName}>{link.program_name}</div>
												<div className={styles.subRowMeta}>
													{link.start_date ?? '?'} → {link.end_date ?? '?'}
													{link.location ? ` · ${link.location}` : ''}
													{link.lecturer_name ? ` · GV: ${link.lecturer_name}` : ''}
												</div>
											</div>
											<select
												className={styles.subSelect}
												style={{ maxWidth: 130 }}
												value={link.status}
												onChange={(e) =>
													d.updateProgramLink(link.id, { status: e.target.value as 'active' | 'inactive' })
												}
											>
												<option value='active'>Đang áp dụng</option>
												<option value='inactive'>Ngừng áp dụng</option>
											</select>
											<button
												className={styles.actionBtn}
												title='Gỡ chương trình'
												disabled={d.busy}
												onClick={() => d.removeProgramLink(link.id)}
											>
												<TrashSvg />
											</button>
										</div>
									))}
								</div>
							)}
						</>
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
									<input
										className={styles.subInput}
										placeholder='Phòng học'
										value={bulkForm.room}
										onChange={(e) => setBulkForm((f) => ({ ...f, room: e.target.value }))}
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
								{(docForm.doc_type === 'test_question' || docForm.doc_type === 'test_answer') && (
									<select
										className={styles.subSelect}
										value={docForm.exam_type}
										onChange={(e) => setDocForm((f) => ({ ...f, exam_type: e.target.value as ExamType | '' }))}
									>
										<option value=''>-- Loại kiểm tra --</option>
										{Object.entries(EXAM_TYPE_CFG).map(([key, label]) => (
											<option key={key} value={key}>
												{label}
											</option>
										))}
									</select>
								)}
								<label className={styles.attRadio}>
									<input
										type='checkbox'
										checked={docForm.is_public}
										onChange={(e) => setDocForm((f) => ({ ...f, is_public: e.target.checked }))}
									/>
									Công khai
								</label>
								<select
									className={styles.subSelect}
									value={docForm.sourceType}
									onChange={(e) => setDocForm((f) => ({ ...f, sourceType: e.target.value as SourceType }))}
								>
									<option value='file'>Tải file lên</option>
									<option value='link'>Dán link</option>
								</select>
								{docForm.sourceType === 'file' ? (
									<input
										type='file'
										ref={fileInputRef}
										className={styles.subInput}
									/>
								) : (
									<input
										className={styles.subInput}
										placeholder='https://...'
										value={docForm.externalUrl}
										onChange={(e) => setDocForm((f) => ({ ...f, externalUrl: e.target.value }))}
									/>
								)}
								<button
									className={styles.btnGhost}
									disabled={d.busy || !docForm.title.trim()}
									onClick={() => {
										if (!docForm.title.trim()) return;
										if (docForm.sourceType === 'file') {
											const file = fileInputRef.current?.files?.[0];
											if (!file) return;
											d.addDocument({ type: 'file', file }, docForm);
										} else {
											if (!docForm.externalUrl.trim()) return;
											d.addDocument({ type: 'link', external_url: docForm.externalUrl.trim() }, docForm);
										}
										setDocForm({
											doc_type: 'material',
											title: '',
											is_public: true,
											exam_type: '',
											sourceType: 'file',
											externalUrl: '',
										});
										if (fileInputRef.current) fileInputRef.current.value = '';
									}}
								>
									<PlusSvg /> Thêm tài liệu
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
													href={doc.source_type === 'link' ? (doc.external_url ?? '#') : (doc.file_url ?? '#')}
													target='_blank'
													rel='noreferrer'
													className={styles.docLink}
													onClick={() => d.incrementDocumentDownload(doc.id)}
												>
													{doc.title}
												</a>
												<div className={styles.subRowMeta}>
													{DOC_TYPE_CFG[doc.doc_type]}
													{doc.exam_type ? ` (${EXAM_TYPE_CFG[doc.exam_type]})` : ''} ·{' '}
													{doc.source_type === 'link' ? 'Liên kết ngoài' : doc.file_name}
													{!doc.is_public ? ' · Chưa công khai' : ''}
													{' · '}
													<DownloadSvg /> {doc.download_count}
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
																	Cấp ngày {cert.issue_date}
																	{cert.expiry_date ? ` · Hạn ${cert.expiry_date}` : ''}
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
