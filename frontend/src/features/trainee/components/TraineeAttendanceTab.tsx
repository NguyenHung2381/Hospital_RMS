import { useEffect, useState } from 'react';
import { formatDate } from '../../../shared/utils/formatDate';
import { programLabel, traineeRecordApi, type TraineeAttendanceCourse, type TraineeRotation } from '../api/traineeRecordApi';
import styles from '../pages/Trainees.module.css';
import ds from '../pages/TraineeDetail.module.css';

const STATUS_LABEL = { present: 'Có mặt', late: 'Muộn', absent: 'Vắng' } as const;
const ROTATION_RESULT: Record<string, { label: string; cls: string }> = {
	pass: { label: 'Đạt', cls: ds.chipDone },
	fail: { label: 'Không đạt', cls: ds.chipMissing },
	pending: { label: 'Chưa đánh giá', cls: ds.chipMuted },
};

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 1000) / 10}%`.replace('.', ',') : '—');

function Summary({ label, s }: { label: string; s: TraineeAttendanceCourse['theory'] }) {
	if (!s.total) return null;
	const marked = s.total - s.unmarked;
	return (
		<span>
			{label}: có mặt <b>{s.present + s.late}</b>/{s.total} buổi
			{s.late ? ` (muộn ${s.late})` : ''} · vắng{' '}
			<b className={s.absent ? ds.bad : undefined}>{s.absent}</b> · tỉ lệ {pct(s.present + s.late, marked)}
			{s.unmarked ? ` · ${s.unmarked} buổi chưa điểm danh` : ''}
		</span>
	);
}

export function RotationTable({ rotations }: { rotations: TraineeRotation[] }) {
	return (
		<div className={ds.tableWrap}>
			<table className={ds.miniTable}>
				<thead>
					<tr>
						<th>Vòng</th>
						<th>Khoa</th>
						<th>Thời gian</th>
						<th>Người hướng dẫn</th>
						<th>Kết quả</th>
					</tr>
				</thead>
				<tbody>
					{rotations.map((r, i) => {
						const res = ROTATION_RESULT[r.result] ?? ROTATION_RESULT.pending;
						return (
							<tr key={r.id ?? i}>
								<td>
									{r.seq}. {r.round_title ?? '—'}
									{r.attempt_no > 1 ? ` (lần ${r.attempt_no})` : ''}
								</td>
								<td>{r.department_name ?? '—'}</td>
								<td>
									{r.start_date || r.end_date
										? `${formatDate(r.start_date ?? null) ?? '…'} – ${formatDate(r.end_date ?? null) ?? '…'}`
										: '—'}
								</td>
								<td>{r.mentor_name ?? '—'}</td>
								<td>
									<span className={res.cls}>{res.label}</span>
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}

/** Tab "Điểm danh": theo từng khóa — có mặt / vắng / muộn, tỉ lệ, chi tiết từng buổi; GPHN theo lượt khoa. */
/** traineeId bỏ trống = học viên tự xem (cổng /me). */
export function TraineeAttendanceTab({ traineeId }: { traineeId?: string }) {
	const [data, setData] = useState<TraineeAttendanceCourse[] | null>(null);
	const [error, setError] = useState('');
	const [open, setOpen] = useState<Record<string, boolean>>({});

	useEffect(() => {
		(traineeId ? traineeRecordApi.attendance(traineeId) : traineeRecordApi.myAttendance())
			.then(setData)
			.catch((err) => setError(err instanceof Error ? err.message : 'Không tải được điểm danh'));
	}, [traineeId]);

	if (error) return <div className={styles.errorBanner}>{error}</div>;
	if (!data) return <div className={styles.subEmpty}>Đang tải...</div>;
	if (!data.length) return <div className={styles.subEmpty}>Học viên chưa được duyệt vào khóa học nào.</div>;

	return (
		<>
			{data.map((c) => (
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
						<span className={styles.subRowMeta}>
							{c.start_date || c.end_date
								? `${formatDate(c.start_date) ?? '…'} – ${formatDate(c.end_date) ?? '…'}`
								: 'Chưa xếp lịch'}
						</span>
					</div>
					<div className={ds.stats}>
						<Summary
							label='Lý thuyết'
							s={c.theory}
						/>
						<Summary
							label='Thực hành'
							s={c.practice}
						/>
						{!c.sessions.length && !c.rotations.length && <span>Chưa có buổi học nào diễn ra.</span>}
					</div>
					{c.rotations.length > 0 && <RotationTable rotations={c.rotations} />}
					{c.sessions.length > 0 && (
						<>
							<button
								className={ds.toggle}
								onClick={() => setOpen((o) => ({ ...o, [c.enrollment_id]: !o[c.enrollment_id] }))}
							>
								{open[c.enrollment_id] ? 'Ẩn chi tiết từng buổi' : `Xem chi tiết ${c.sessions.length} buổi`}
							</button>
							{open[c.enrollment_id] && (
								<div className={ds.tableWrap}>
									<table className={ds.miniTable}>
										<thead>
											<tr>
												<th>Ngày</th>
												<th>Giờ</th>
												<th>Bài học</th>
												<th>Loại</th>
												<th>Điểm danh</th>
											</tr>
										</thead>
										<tbody>
											{c.sessions.map((s) => (
												<tr key={s.session_id}>
													<td>{formatDate(s.session_date)}</td>
													<td>{s.start_time ? `${s.start_time}–${s.end_time ?? ''}` : '—'}</td>
													<td>{s.lesson_title ?? '—'}</td>
													<td>{s.kind === 'practice' ? 'Thực hành' : 'Lý thuyết'}</td>
													<td className={s.status === 'absent' ? ds.bad : undefined}>
														{s.status ? STATUS_LABEL[s.status] : 'Chưa điểm danh'}
														{s.note ? ` · ${s.note}` : ''}
													</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							)}
						</>
					)}
				</div>
			))}
		</>
	);
}
