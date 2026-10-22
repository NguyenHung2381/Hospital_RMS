import { useEffect, useState } from 'react';
import { formatDate } from '../../../shared/utils/formatDate';
import { GRADE_FLAG_LABEL, type GradeFlag } from '../../course/types/course.type';
import type { MyCme } from '../../portal/api/meApi';
import { programLabel, traineeRecordApi, type TraineeCourseResult } from '../api/traineeRecordApi';
import { RotationTable } from './TraineeAttendanceTab';
import styles from '../pages/Trainees.module.css';
import ds from '../pages/TraineeDetail.module.css';

const fmt = (n: number | null | undefined) => (n == null ? '—' : String(n).replace('.', ','));
const part = (score: number | null, flag: GradeFlag | null) => (flag ? GRADE_FLAG_LABEL[flag] : fmt(score));

function ResultChip({ result, reasons }: { result: 'pass' | 'fail' | null; reasons?: string[] }) {
	if (result === 'pass') return <span className={ds.chipDone}>Đạt</span>;
	if (result === 'fail')
		return (
			<span
				className={ds.chipMissing}
				title={reasons?.join('\n')}
			>
				Chưa đạt
			</span>
		);
	return <span className={ds.chipMuted}>Chưa đủ điểm</span>;
}

/** Tab "Kết quả & điểm": điểm lý thuyết, thực hành, chuyên cần, kết quả từng khóa (cả lần thi lại); GPHN Đạt/Không đạt từng vòng. */
/** traineeId bỏ trống = học viên tự xem (cổng /me); enrollmentId = chỉ 1 lượt ghi danh. */
export function TraineeResultsTab({ traineeId, enrollmentId }: { traineeId?: string; enrollmentId?: string }) {
	const [data, setData] = useState<TraineeCourseResult[] | null>(null);
	const [error, setError] = useState('');

	useEffect(() => {
		(traineeId ? traineeRecordApi.grades(traineeId) : traineeRecordApi.myGrades())
			.then((rows) => setData(enrollmentId ? rows.filter((r) => r.enrollment_id === enrollmentId) : rows))
			.catch((err) => setError(err instanceof Error ? err.message : 'Không tải được kết quả'));
	}, [traineeId, enrollmentId]);

	if (error) return <div className={styles.errorBanner}>{error}</div>;
	if (!data) return <div className={styles.subEmpty}>Đang tải...</div>;
	if (!data.length)
		return (
			<div className={styles.subEmpty}>
				{enrollmentId ? 'Chưa có kết quả — học viên cần được duyệt vào lớp.' : 'Học viên chưa được duyệt vào khóa học nào.'}
			</div>
		);

	return (
		<>
			{data.map((c) => {
				const g = c.grade;
				const att = g?.attendance;
				const present = (k: 'theory' | 'practice') =>
					att && att[k].held ? `${Math.round(((att[k].held - att[k].absent) / att[k].held) * 1000) / 10}%` : '—';
				const retakes = c.attempts.filter((a) => a.attempt_no > 1);
				return (
					<div
						key={c.enrollment_id}
						className={ds.course}
					>
						<div className={ds.courseHead}>
							<div className={ds.name}>
								{c.course_name}
								<span className={styles.subRowMeta}>
									{[programLabel(c), c.training_type_name].filter(Boolean).map((x) => ` · ${x}`)}
								</span>
							</div>
							{g && (
								<ResultChip
									result={g.computed.result}
									reasons={g.computed.reasons}
								/>
							)}
						</div>
						{g && (g.computed.theory.applies || g.computed.practice.applies) && (
							<div className={ds.stats}>
								{g.computed.theory.applies && (
									<span>
										Lý thuyết: <b className={g.computed.theory.passed === false ? ds.bad : undefined}>{part(g.theory_score, g.theory_flag)}</b>
										{g.theory_attempt > 1 ? ` (lần ${g.theory_attempt})` : ''} · chuyên cần {present('theory').replace('.', ',')}
									</span>
								)}
								{g.computed.practice.applies && (
									<span>
										Thực hành:{' '}
										<b className={g.computed.practice.passed === false ? ds.bad : undefined}>
											{part(g.practice_score, g.practice_flag)}
										</b>
										{g.practice_attempt > 1 ? ` (lần ${g.practice_attempt})` : ''} · chuyên cần{' '}
										{present('practice').replace('.', ',')}
									</span>
								)}
								<span>
									Tổng: <b>{fmt(g.computed.total)}</b>
									{g.computed.classification ? ` · ${g.computed.classification}` : ''}
								</span>
								{g.locked_at && <span className={ds.chipMuted}>Đã khóa điểm</span>}
							</div>
						)}
						{g?.computed.result === 'fail' && g.computed.reasons.length > 0 && (
							<div className={`${styles.subRowMeta} ${ds.bad}`}>Lý do: {g.computed.reasons.join(' · ')}</div>
						)}
						{retakes.length > 0 && (
							<div className={styles.subRowMeta}>
								Các lần thi:{' '}
								{c.attempts
									.map((a) => `${a.part === 'theory' ? 'LT' : 'TH'} lần ${a.attempt_no}: ${part(a.score, a.flag)}`)
									.join(' · ')}
							</div>
						)}
						{c.legacy.length > 0 && (
							<div className={ds.tableWrap}>
								<table className={ds.miniTable}>
									<thead>
										<tr>
											<th>Bài học (điểm cũ)</th>
											<th>TX</th>
											<th>GK</th>
											<th>CK</th>
											<th>Tổng kết</th>
											<th>Kết quả</th>
										</tr>
									</thead>
									<tbody>
										{c.legacy.map((l, i) => (
											<tr key={i}>
												<td>{l.subject_name ?? 'Toàn khóa'}</td>
												<td>{fmt(l.regular_score)}</td>
												<td>{fmt(l.midterm_score)}</td>
												<td>{fmt(l.final_score)}</td>
												<td>{fmt(l.score)}</td>
												<td>{l.classification ?? l.result ?? '—'}</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						)}
						{c.rotations.length > 0 && <RotationTable rotations={c.rotations} />}
					</div>
				);
			})}
		</>
	);
}

/** Tab "Chứng chỉ / giấy xác nhận": giấy chứng nhận các khóa + CME tích lũy (nếu có tài khoản). */
export function TraineeCertificatesTab({ traineeId }: { traineeId: string }) {
	const [courses, setCourses] = useState<TraineeCourseResult[] | null>(null);
	const [cme, setCme] = useState<MyCme | null | undefined>(undefined);
	const [error, setError] = useState('');

	useEffect(() => {
		Promise.all([traineeRecordApi.grades(traineeId), traineeRecordApi.cme(traineeId)])
			.then(([g, c]) => {
				setCourses(g);
				setCme(c);
			})
			.catch((err) => setError(err instanceof Error ? err.message : 'Không tải được chứng chỉ'));
	}, [traineeId]);

	if (error) return <div className={styles.errorBanner}>{error}</div>;
	if (!courses) return <div className={styles.subEmpty}>Đang tải...</div>;
	const certs = courses.filter((c) => c.cert_no);

	return (
		<>
			<div className={ds.summary}>
				<b>Giấy chứng nhận khóa học ({certs.length})</b>
			</div>
			{certs.length === 0 ? (
				<div className={styles.subEmpty}>Chưa được cấp giấy chứng nhận nào.</div>
			) : (
				<div className={ds.tableWrap}>
					<table className={ds.miniTable}>
						<thead>
							<tr>
								<th>Số</th>
								<th>Khóa học</th>
								<th>Ngày cấp</th>
								<th>Hạn</th>
								<th>Trạng thái</th>
							</tr>
						</thead>
						<tbody>
							{certs.map((c) => (
								<tr key={c.enrollment_id}>
									<td>{c.cert_no}</td>
									<td>
										{c.course_name}
										{programLabel(c) ? <span className={styles.subRowMeta}> · {programLabel(c)}</span> : null}
									</td>
									<td>{formatDate(c.issue_date)}</td>
									<td>{c.expiry_date ? formatDate(c.expiry_date) : 'Không thời hạn'}</td>
									<td>
										<span className={c.certificate_status === 'revoked' ? ds.chipMissing : ds.chipDone}>
											{c.certificate_status === 'revoked' ? 'Đã thu hồi' : 'Còn hiệu lực'}
										</span>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}

			<div
				className={ds.summary}
				style={{ marginTop: 20 }}
			>
				<b>Đào tạo liên tục (CME)</b>
				{cme && (
					<span>
						· Tích lũy <b>{fmt(cme.earned_credits)}</b> giờ tín chỉ ({cme.seminars.length} hội thảo/tập huấn,{' '}
						{cme.records.length} ghi nhận khác)
					</span>
				)}
			</div>
			{cme === null ? (
				<div className={styles.subEmpty}>Học viên chưa có tài khoản nên chưa có sổ CME.</div>
			) : cme && (cme.seminars.length > 0 || cme.records.length > 0) ? (
				<div className={ds.tableWrap}>
					<table className={ds.miniTable}>
						<thead>
							<tr>
								<th>Hoạt động</th>
								<th>Năm</th>
								<th>Giờ tín chỉ</th>
								<th>Trạng thái</th>
							</tr>
						</thead>
						<tbody>
							{cme.seminars.map((s) => (
								<tr key={s.id}>
									<td>{s.seminar_title}</td>
									<td>{s.cme_year ?? '—'}</td>
									<td>{fmt(s.cme_credits)}</td>
									<td>{s.cme_certificate_no ?? s.cme_status}</td>
								</tr>
							))}
							{cme.records.map((r) => (
								<tr key={r.id}>
									<td>{r.title}</td>
									<td>{r.year ?? '—'}</td>
									<td>{fmt(r.credits)}</td>
									<td>
										{r.approval_status === 'approved'
											? 'Đã duyệt'
											: r.approval_status === 'pending'
												? 'Chờ duyệt'
												: 'Từ chối'}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			) : (
				<div className={styles.subEmpty}>Chưa có giờ CME nào.</div>
			)}
		</>
	);
}
