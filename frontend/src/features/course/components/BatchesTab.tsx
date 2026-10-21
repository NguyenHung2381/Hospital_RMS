import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayersSvg } from '@/assets/icons';
import { InlineLoading } from '@/shared/components';
import { Pagination } from '@/shared/components/Table/Pagination';
import tbl from '@/shared/components/Table/Table.module.css';
import { useClientPaging } from '@/shared/hooks/useClientPaging';
import { formatDateOr } from '@/shared/utils';
import { showToast } from '@/shared/utils/feedback';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { formBatchNow, getBatchOverview } from '../api/courseApi';
import { DISPLAY_STATUS_CFG, type BatchProgram } from '../types/course.type';
import styles from '../pages/Courses.module.css';

/** Khóa tuyển sinh theo đợt: mỗi chương trình — người chờ / sĩ số tối thiểu và các đợt đã lập. */
export function BatchesTab({ courseId, onChanged }: { courseId: string; onChanged: () => void }) {
	const [programs, setPrograms] = useState<BatchProgram[] | null>(null);
	const [busy, setBusy] = useState('');

	const load = useCallback(
		() =>
			getBatchOverview(courseId)
				.then(setPrograms)
				.catch((err) => showToast('error', err instanceof Error ? err.message : 'Không tải được danh sách đợt')),
		[courseId],
	);
	useEffect(() => {
		void load();
	}, [load]);
	useRealtimeUpdate('course', load);

	const formNow = async (p: BatchProgram) => {
		if (!window.confirm(`Lập đợt ngay cho "${p.program_name}" với ${p.waiting} học viên đang chờ (tối thiểu ${p.min})?`))
			return;
		setBusy(p.program_id);
		try {
			const r = await formBatchNow(courseId, p.program_id);
			showToast('success', `Đã lập ${r.formed.map((b) => b.name).join(', ') || 'đợt'}`);
			await load();
			onChanged();
		} catch (err) {
			showToast('error', err instanceof Error ? err.message : 'Lập đợt thất bại');
		} finally {
			setBusy('');
		}
	};

	if (!programs) return <InlineLoading />;
	if (!programs.length)
		return <div className={styles.subEmpty}>Khóa chưa áp dụng chương trình nào — thêm chương trình ở "Sửa thông tin".</div>;

	return (
		<>
			<div
				className={styles.hint}
				style={{ marginBottom: 12 }}
			>
				Học viên được duyệt vào danh sách chờ của chương trình đã chọn. Đủ sĩ số tối thiểu thì tự lập một đợt; đợt chưa khai
				giảng còn chỗ thì người chờ được xếp vào trước. Sĩ số tối thiểu / tối đa đặt ở Chương trình đào tạo.
			</div>
			{programs.map((p) => (
				<ProgramBatches
					key={p.program_id}
					program={p}
					busy={busy === p.program_id}
					onFormNow={() => void formNow(p)}
				/>
			))}
		</>
	);
}

function ProgramBatches({
	program: p,
	busy,
	onFormNow,
}: {
	program: BatchProgram;
	busy: boolean;
	onFormNow: () => void;
}) {
	const navigate = useNavigate();
	const pg = useClientPaging(p.batches);
	return (
		<div
			className={tbl.tableCard}
			style={{ marginBottom: 16 }}
		>
			<div className={tbl.tableHeader}>
				<div className={tbl.tableHeaderLeft}>
					<span className={tbl.tableTitle}>
						{p.program_code ? `${p.program_code} — ` : ''}
						{p.program_name}
					</span>
					<span className={tbl.tableCount}>
						Chờ đợt sau {p.waiting}/{p.min} tối thiểu
						{p.capacity != null ? ` · tối đa ${p.capacity}/đợt` : ''}
						{p.pending ? ` · ${p.pending} chờ duyệt` : ''}
					</span>
				</div>
				<div className={tbl.tableControls}>
					{p.waiting > 0 && (
						<button
							className={styles.btnPrimary}
							disabled={busy}
							onClick={onFormNow}
							title='Lập đợt mới ngay với những người đang chờ, dù chưa đủ sĩ số tối thiểu'
						>
							<LayersSvg /> Lập đợt ngay ({p.waiting})
						</button>
					)}
				</div>
			</div>
			<div className={tbl.tableWrap}>
				<table className={tbl.table}>
					<thead>
						<tr>
							<th className={`${tbl.th} ${tbl.thIdx}`}>STT</th>
							<th className={tbl.th}>Đợt</th>
							<th className={tbl.th}>Sĩ số</th>
							<th className={tbl.th}>Thời gian học</th>
							<th className={tbl.th}>Trạng thái</th>
						</tr>
					</thead>
					<tbody>
						{p.batches.length === 0 ? (
							<tr>
								<td colSpan={5}>
									<div className={tbl.emptyState}>Chưa có đợt nào — đủ {p.min} người chờ sẽ tự lập.</div>
								</td>
							</tr>
						) : (
							pg.paged.map((b, i) => {
								const st = DISPLAY_STATUS_CFG[b.display_status];
								const full = b.capacity != null && b.approved_count >= b.capacity;
								return (
									<tr
										key={b.id}
										className={tbl.tr}
									>
										<td className={`${tbl.td} ${tbl.tdIdx}`}>{pg.offset + i + 1}</td>
										<td className={tbl.td}>
											<span
												className={tbl.cellLink}
												onClick={() => navigate(`/admin/courses/${b.id}`)}
											>
												{b.name}
											</span>
										</td>
										<td className={tbl.td}>
											<span className={`${styles.capacityText} ${full ? styles.capacityFull : ''}`}>
												{b.approved_count}
												{b.capacity != null ? `/${b.capacity}` : ''}
											</span>
										</td>
										<td className={tbl.td}>
											{b.start_date ? `${formatDateOr(b.start_date)} → ${formatDateOr(b.end_date, '?')}` : 'Chưa xếp lịch'}
										</td>
										<td className={tbl.td}>
											{st && (
												<span
													className={styles.badge}
													style={{ background: st.bg, color: st.color }}
												>
													{full && b.display_status === 'awaiting_schedule' ? 'Đã đủ — chờ xếp lịch' : st.label}
												</span>
											)}
										</td>
									</tr>
								);
							})
						)}
					</tbody>
				</table>
			</div>
			<Pagination
				{...pg.pagination}
				itemLabel='đợt'
			/>
		</div>
	);
}
