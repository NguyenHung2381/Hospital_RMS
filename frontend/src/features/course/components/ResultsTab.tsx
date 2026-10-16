import { useMemo, useState } from 'react';
import { BadgeSvg, TrashSvg } from '@/assets/icons';
import { formatDateVN } from '@/shared/utils/formatDate';
import type { useCourseDetail } from '../hooks/useCourseDetail';
import { groupGradesByProgram } from '../utils/gradeStats';
import styles from '../pages/Courses.module.css';

/** Bước cuối: nhập điểm TX/GK/CK cho học viên đã duyệt rồi cấp/thu hồi chứng chỉ. */
export function ResultsTab({ d }: { d: ReturnType<typeof useCourseDetail> }) {
	const [certExpiry, setCertExpiry] = useState<Record<string, string>>({});
	const gradeGroups = useMemo(() => groupGradesByProgram(d.grades, d.programLinks), [d.grades, d.programLinks]);
	const approved = d.enrollments.filter((e) => e.status === 'approved');

	return (
		<>
			<div
				className={styles.subRowMeta}
				style={{ marginBottom: 10 }}
			>
				Nhập điểm (tự lưu khi rời ô) rồi cấp chứng chỉ cho học viên đã được duyệt tham gia khóa học.
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
			{approved.length === 0 ? (
				<div className={styles.subEmpty}>Chưa có học viên nào được duyệt.</div>
			) : (
				<div className={styles.subList}>
					{approved.map((en) => {
						const grade = d.grades.find((g) => g.enrollment_id === en.id && !g.subject_id);
						const cert = d.certificates.find((c) => c.enrollment_id === en.id);
						const save = (patch: { program_id?: string; regular_score?: number; midterm_score?: number; final_score?: number }) =>
							d.upsertGrade({
								enrollment_id: en.id,
								// Khóa chỉ 1 chương trình → tự gắn, không bắt chọn
								program_id:
									grade?.program_id ??
									(d.programLinks.length === 1 ? d.programLinks[0].program_id : undefined),
								regular_score: grade?.regular_score ?? undefined,
								midterm_score: grade?.midterm_score ?? undefined,
								final_score: grade?.final_score ?? undefined,
								...patch,
							});
						const num = (v: string) => (v ? Number(v) : undefined);
						return (
							<div
								key={en.id}
								className={styles.subRow}
								style={{ flexWrap: 'wrap' }}
							>
								<div className={styles.subRowMain}>
									<div className={styles.subRowName}>{en.trainee_name}</div>
									<div className={styles.subRowMeta}>
										{grade?.classification && <span className={styles.certBadge}>{grade.classification}</span>}
										{cert && (
											<>
												{' '}
												<span
													className={styles.certBadge}
													style={cert.status === 'revoked' ? { background: '#fcebeb', color: '#791f1f' } : undefined}
												>
													{cert.cert_no} · {cert.status === 'revoked' ? 'Đã thu hồi' : 'Đã cấp'}
												</span>{' '}
												Cấp ngày {formatDateVN(cert.issue_date)}
												{cert.expiry_date ? ` · Hạn ${formatDateVN(cert.expiry_date)}` : ''}
											</>
										)}
									</div>
								</div>
								{d.programLinks.length > 1 && (
									<select
										className={styles.subSelect}
										title='Chương trình đào tạo'
										value={grade?.program_id ?? ''}
										onChange={(e) => save({ program_id: e.target.value || undefined })}
									>
										<option value=''>-- Chương trình --</option>
										{d.programLinks.map((link) => (
											<option
												key={link.program_id}
												value={link.program_id}
											>
												{link.program_name}
											</option>
										))}
									</select>
								)}
								<input
									type='number'
									step='0.1'
									className={styles.scoreInput}
									placeholder='TX'
									title='Điểm thường xuyên'
									defaultValue={grade?.regular_score ?? ''}
									onBlur={(e) => save({ regular_score: num(e.target.value) })}
								/>
								<input
									type='number'
									step='0.1'
									className={styles.scoreInput}
									placeholder='GK'
									title='Điểm giữa kỳ'
									defaultValue={grade?.midterm_score ?? ''}
									onBlur={(e) => save({ midterm_score: num(e.target.value) })}
								/>
								<input
									type='number'
									step='0.1'
									className={styles.scoreInput}
									placeholder='CK'
									title='Điểm cuối kỳ'
									defaultValue={grade?.final_score ?? ''}
									onBlur={(e) => save({ final_score: num(e.target.value) })}
								/>
								<span
									className={styles.subRowMeta}
									title='Điểm tổng kết'
								>
									{grade?.score ?? '—'}
								</span>
								{!cert ? (
									<>
										<input
											type='date'
											className={styles.subInput}
											style={{ maxWidth: 140 }}
											title='Hạn chứng chỉ (bỏ trống = không thời hạn)'
											value={certExpiry[en.id] ?? ''}
											onChange={(e) => setCertExpiry((m) => ({ ...m, [en.id]: e.target.value }))}
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
	);
}
