import { useEffect, useState } from 'react';
import { DocSvg, UsersSvg } from '@/assets/icons';
import { Badge, InlineLoading, Modal } from '@/shared/components';
import { fileSlug, saveBlob } from '@/shared/utils/saveBlob';
import { showToast } from '@/shared/utils/feedback';
import {
	ENROLLMENT_STATUS_TONE,
	downloadCourseProposal,
	getCourseProposals,
	type ProposalGroup,
} from '../api/registrationApi';
import { ENROLLMENT_STATUS_CFG } from '../types/course.type';
import styles from '../pages/Courses.module.css';
import tbl from '@/shared/components/Table/Table.module.css';

const groupKey = (g: ProposalGroup) => `${g.department_id}|${g.program_id ?? ''}`;

// Nhân viên nội viện đăng ký qua form, gom theo khoa + chương trình — mỗi nhóm 1 Tờ trình
// cử cán bộ (.docx, kèm Bảng phân tích nhu cầu đào tạo) để gửi khoa ký.
export function CourseProposalsModal({
	courseId,
	courseName,
	onClose,
}: {
	courseId: string;
	courseName: string;
	onClose: () => void;
}) {
	const [groups, setGroups] = useState<ProposalGroup[] | null>(null);
	const [error, setError] = useState('');
	const [busy, setBusy] = useState<string | null>(null);

	useEffect(() => {
		getCourseProposals(courseId)
			.then(setGroups)
			.catch((err) => setError(err instanceof Error ? err.message : 'Không tải được danh sách'));
	}, [courseId]);

	const download = async (g: ProposalGroup) => {
		setBusy(groupKey(g));
		try {
			const blob = await downloadCourseProposal(courseId, g.department_id, g.program_id);
			saveBlob(blob, `to-trinh_${fileSlug(g.department_name)}_${fileSlug(g.program_name ?? courseName)}.docx`);
		} catch (err) {
			showToast('error', err instanceof Error ? err.message : 'Không tạo được tờ trình');
		} finally {
			setBusy(null);
		}
	};

	return (
		<Modal
			open
			onClose={onClose}
			icon={<UsersSvg />}
			title='Tờ trình cử cán bộ theo khoa'
			subtitle={courseName}
			size='lg'
		>
			{error && <div className={styles.errorBanner}>{error}</div>}
			{!groups && !error && <InlineLoading />}
			{groups && groups.length === 0 && (
				<div className={styles.subEmpty}>Chưa có nhân viên nội viện nào đăng ký khóa này qua form đăng ký.</div>
			)}
			{groups && groups.length > 0 && (
				<>
					<div
						className={styles.hint}
						style={{ marginBottom: 'var(--space-3)' }}
					>
						Mỗi khoa / chương trình 1 tờ trình. Người bị từ chối không có trong danh sách cử đi; ô kỹ thuật và lý do để trống cho
						khoa ghi tay.
					</div>
					<div className={styles.subList}>
						{groups.map((g) => (
							<div
								key={groupKey(g)}
								className={styles.subRow}
								style={{ alignItems: 'flex-start' }}
							>
								<div className={styles.subRowMain}>
									<div className={styles.subRowName}>
										{g.department_name}
										{g.program_name && ` · ${g.program_name}`}
									</div>
									<div className={styles.subRowMeta}>{g.proposed_count} người được cử đi</div>
									<div className={tbl.tableWrap}>
										<table className={tbl.table}>
											<thead>
												<tr>
													<th className={tbl.th}>MNV</th>
													<th className={tbl.th}>Họ tên</th>
													<th className={tbl.th}>Trình độ</th>
													<th className={tbl.th}>Trạng thái</th>
													<th className={tbl.th}>Tờ trình đã duyệt</th>
												</tr>
											</thead>
											<tbody>
												{g.people.map((p) => (
														<tr
															key={p.enrollment_id}
															className={tbl.tr}
														>
															<td className={tbl.td}>{p.staff_number ?? '—'}</td>
															<td className={tbl.td}>{p.full_name}</td>
															<td className={tbl.td}>{p.qualification ?? '—'}</td>
															<td className={tbl.td}>
																<Badge tone={ENROLLMENT_STATUS_TONE[p.enrollment_status] ?? 'gray'}>
																	{ENROLLMENT_STATUS_CFG[p.enrollment_status]?.label ?? p.enrollment_status}
																</Badge>
															</td>
															<td className={tbl.td}>
																{p.proposal_checked_at ? 'Đã đối chiếu' : p.dossier_uploaded_at ? 'Đã nộp, chờ đối chiếu' : 'Chưa nộp'}
															</td>
														</tr>
												))}
											</tbody>
										</table>
									</div>
								</div>
								<button
									type='button'
									className={styles.btnGhost}
									disabled={busy !== null || g.proposed_count === 0}
									onClick={() => void download(g)}
								>
									<DocSvg /> {busy === groupKey(g) ? 'Đang tạo…' : 'Tải tờ trình'}
								</button>
							</div>
						))}
					</div>
				</>
			)}
		</Modal>
	);
}
