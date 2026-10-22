import { useCallback, useEffect, useState } from 'react';
import { PlusSvg, UsersSvg } from '@/assets/icons';
import AdminLayout from '@/layouts/AdminLayout';
import { useRealtimeUpdate } from '@/layouts/hooks/useRealtime';
import { Badge, Button, ConfirmDeleteModal, TableEmpty } from '@/shared/components';
import tbl from '@/shared/components/Table/Table.module.css';
import { RowAction, RowActions } from '@/shared/components/Table/TableToolbar';
import { notify } from '@/shared/utils/feedback';
import { WEEKDAYS, describeDuration, patternApi, shiftApi, type PatternInput, type ShiftInput, type ShiftPattern, type WorkShift } from '../api/shiftApi';
import { PatternFormModal } from '../components/PatternFormModal';
import { PatternCoursesModal } from '../components/PatternCoursesModal';
import { ShiftBadge } from '../components/ShiftBadge';
import { ShiftFormModal } from '../components/ShiftFormModal';
import styles from './Shifts.module.css';
import { ExcelActions, type ExcelColumn } from '@/shared/components/Excel';

type Tab = 'shifts' | 'patterns';

const SHIFT_EXCEL_COLS: ExcelColumn<WorkShift>[] = [
	{ header: 'Mã ca', value: (s) => s.code },
	{ header: 'Tên ca', value: (s) => s.name },
	{ header: 'Giờ vào', value: (s) => s.start_time.slice(0, 5) },
	{ header: 'Giờ ra', value: (s) => s.end_time.slice(0, 5) },
	{ header: 'Thời lượng', value: (s) => describeDuration(s) },
	{ header: 'Chấm vào sớm nhất (phút)', value: (s) => s.checkin_before_min },
	{ header: 'Chấm ra muộn nhất (phút)', value: (s) => s.checkout_after_min },
	{ header: 'Du di (phút)', value: (s) => s.grace_min },
	{ header: 'Đang dùng', value: (s) => (s.is_active ? 'Có' : 'Không') },
];

export default function Shifts() {
	const [tab, setTab] = useState<Tab>('shifts');
	const [shifts, setShifts] = useState<WorkShift[]>([]);
	const [patterns, setPatterns] = useState<ShiftPattern[]>([]);
	const [loading, setLoading] = useState(true);
	// undefined = đóng, null = thêm mới
	const [editShift, setEditShift] = useState<WorkShift | null | undefined>(undefined);
	const [editPattern, setEditPattern] = useState<ShiftPattern | null | undefined>(undefined);
	const [assigning, setAssigning] = useState<ShiftPattern | null>(null);
	const [deleting, setDeleting] = useState<{ kind: Tab; id: number; name: string; warning?: string } | null>(null);

	const load = useCallback(() => {
		Promise.all([shiftApi.list(), patternApi.list()])
			.then(([s, p]) => {
				setShifts(s);
				setPatterns(p);
			})
			.catch((e) => notify.error(e instanceof Error ? e.message : 'Không thể tải ca làm việc'))
			.finally(() => setLoading(false));
	}, []);
	useEffect(load, [load]);
	useRealtimeUpdate(['work_shifts'], load);

	const byId = new Map(shifts.map((s) => [s.id, s]));
	const hasDefault = patterns.some((p) => p.is_default);

	const saveShift = async (data: ShiftInput) => {
		if (editShift) await shiftApi.update(editShift.id, data);
		else await shiftApi.create(data);
		notify.success(editShift ? 'Đã cập nhật ca làm' : 'Đã thêm ca làm');
		setEditShift(undefined);
		load();
	};
	const savePattern = async (data: PatternInput) => {
		if (editPattern) await patternApi.update(editPattern.id, data);
		else await patternApi.create(data);
		notify.success(editPattern ? 'Đã cập nhật mẫu ca tuần' : 'Đã thêm mẫu ca tuần');
		setEditPattern(undefined);
		load();
	};

	return (
		<AdminLayout
			pageTitle='Ca học viên'
			pageSubtitle='Ca và mẫu ca theo tuần của khóa đào tạo — học viên chỉ chấm công được trong giờ ca, trong thời gian khóa học'
			headerActions={
				<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
					{tab === 'shifts' && (
						<ExcelActions fileName='ca-lam-viec' itemLabel='ca làm' columns={SHIFT_EXCEL_COLS} getRows={() => shifts} />
					)}
					<Button icon={<PlusSvg />} onClick={() => (tab === 'shifts' ? setEditShift(null) : setEditPattern(null))}>
						{tab === 'shifts' ? 'Thêm ca' : 'Thêm mẫu ca tuần'}
					</Button>
				</div>
			}
		>
			<div className={tbl.tableCard}>
				<div className={tbl.tabsRow}>
					{(
						[
							['shifts', 'Ca làm', shifts.length],
							['patterns', 'Mẫu ca tuần', patterns.length],
						] as const
					).map(([key, label, count]) => (
						<div
							key={key}
							role='tab'
							aria-selected={tab === key}
							className={`${tbl.tab} ${tab === key ? tbl.tabActive : ''}`}
							onClick={() => setTab(key)}
						>
							{label}
							<span className={tbl.tabBadge}>{count}</span>
						</div>
					))}
				</div>

				{tab === 'shifts' ? (
					<div className={tbl.tableWrap}>
						<table className={tbl.table}>
							<thead>
								<tr>
									<th className={tbl.th}>Ca</th>
									<th className={tbl.th}>Giờ làm</th>
									<th className={tbl.th}>Được chấm công</th>
									<th className={tbl.th}>Du di</th>
									<th className={`${tbl.th} ${tbl.thRight}`}>Thao tác</th>
								</tr>
							</thead>
							<tbody>
								{!loading && shifts.length === 0 ? (
									<TableEmpty
										colSpan={5}
										title='Chưa có ca làm'
										desc='Thêm ca (hành chính, ca sáng/chiều/đêm, trực 24h...) rồi ghép thành mẫu ca tuần hoặc xếp vào bảng phân ca.'
									/>
								) : (
									shifts.map((s) => (
										<tr key={s.id} className={tbl.tr}>
											<td className={tbl.td}>
												<div className={tbl.cellTitle}>
													<ShiftBadge shift={s} /> {s.name}
												</div>
												{!s.is_active && <Badge tone='gray'>Ngừng dùng</Badge>}
											</td>
											<td className={tbl.td}>
												<div className={`${tbl.cellTitle} ${styles.mono}`}>
													{s.start_time} → {s.end_time}
												</div>
												<div className={tbl.cellSub}>{describeDuration(s)}</div>
											</td>
											<td className={tbl.td}>
												<div className={tbl.cellSub}>Vào: từ {s.checkin_before_min} phút trước giờ vào</div>
												<div className={tbl.cellSub}>Ra: tới {s.checkout_after_min} phút sau giờ ra</div>
											</td>
											<td className={tbl.td}>{s.grace_min} phút</td>
											<td className={`${tbl.td} ${tbl.tdActions}`}>
												<RowActions
													onEdit={() => setEditShift(s)}
													onDelete={() => setDeleting({ kind: 'shifts', id: s.id, name: `${s.code} — ${s.name}` })}
												/>
											</td>
										</tr>
									))
								)}
							</tbody>
						</table>
					</div>
				) : (
					<>
						<div className={tbl.tableHeader}>
							<span className={tbl.cellSub}>
								{hasDefault
									? 'Khóa học chưa gán mẫu riêng dùng mẫu mặc định. Bảng phân ca theo ngày (từng học viên) ghi đè mẫu tuần.'
									: 'Chưa có mẫu mặc định — học viên của khóa chưa gán mẫu, chưa được phân ca thì chấm công tự do (1 lượt/ngày trong thời gian khóa học).'}
							</span>
						</div>
						<div className={tbl.tableWrap}>
							<table className={tbl.table}>
								<thead>
									<tr>
										<th className={tbl.th}>Tên mẫu</th>
										<th className={tbl.th}>Ca trong tuần</th>
										<th className={tbl.th}>Áp dụng</th>
										<th className={`${tbl.th} ${tbl.thRight}`}>Thao tác</th>
									</tr>
								</thead>
								<tbody>
									{!loading && patterns.length === 0 ? (
										<TableEmpty colSpan={4} title='Chưa có mẫu ca tuần' desc='Mẫu ca tuần là ca cố định theo thứ, vd hành chính T2–T6.' />
									) : (
										patterns.map((p) => (
											<tr key={p.id} className={tbl.tr}>
												<td className={tbl.td}>
													<div className={tbl.cellTitle}>{p.name}</div>
													{p.is_default && <Badge tone='blue'>Mặc định</Badge>}
												</td>
												<td className={tbl.td}>
													<div className={styles.weekGrid}>
														{WEEKDAYS.map((d) => {
															const list = p.days[d.value].map((id) => byId.get(id)).filter((s): s is WorkShift => !!s);
															return (
																<div key={d.value} className={styles.weekDay}>
																	<span className={styles.weekLabel}>{d.label}</span>
																	{list.length ? list.map((s) => <ShiftBadge key={s.id} shift={s} />) : <span className={styles.off}>Nghỉ</span>}
																</div>
															);
														})}
													</div>
												</td>
												<td className={tbl.td}>
													<button type='button' className={styles.linkBtn} onClick={() => setAssigning(p)}>
														{p.course_count} khóa học được gán
													</button>
													{p.is_default && <div className={tbl.cellSub}>+ khóa chưa gán mẫu</div>}
												</td>
												<td className={`${tbl.td} ${tbl.tdActions}`}>
													<RowActions
														onEdit={() => setEditPattern(p)}
														onDelete={() =>
															setDeleting({
																kind: 'patterns',
																id: p.id,
																name: p.name,
																warning: p.is_default
																	? 'Đây là mẫu mặc định: sau khi xoá, khóa chưa có mẫu riêng chỉ còn theo bảng phân ca (ngày không được phân ca thì chấm công tự do).'
																	: p.course_count
																		? `${p.course_count} khóa học đang dùng mẫu này sẽ chuyển về ${hasDefault ? 'mẫu mặc định' : 'không có mẫu (chỉ theo bảng phân ca)'}.`
																		: undefined,
															})
														}
													>
														<RowAction title='Chọn khóa học áp dụng' onClick={() => setAssigning(p)}>
															<UsersSvg />
														</RowAction>
													</RowActions>
												</td>
											</tr>
										))
									)}
								</tbody>
							</table>
						</div>
					</>
				)}
			</div>

			{editShift !== undefined && <ShiftFormModal shift={editShift} onClose={() => setEditShift(undefined)} onSave={saveShift} />}
			{editPattern !== undefined && (
				<PatternFormModal pattern={editPattern} shifts={shifts} onClose={() => setEditPattern(undefined)} onSave={savePattern} />
			)}
			{assigning && (
				<PatternCoursesModal
					pattern={assigning}
					patterns={patterns}
					onClose={() => setAssigning(null)}
					onSaved={() => {
						notify.success('Đã cập nhật khóa học áp dụng mẫu ca');
						setAssigning(null);
						load();
					}}
				/>
			)}
			{deleting && (
				<ConfirmDeleteModal
					title={deleting.kind === 'shifts' ? 'Xoá ca làm' : 'Xoá mẫu ca tuần'}
					subtitle={deleting.name}
					onClose={() => setDeleting(null)}
					onConfirm={async () => {
						if (deleting.kind === 'shifts') await shiftApi.remove(deleting.id);
						else await patternApi.remove(deleting.id);
						notify.success(deleting.kind === 'shifts' ? 'Đã xoá ca làm' : 'Đã xoá mẫu ca tuần');
						setDeleting(null);
						load();
					}}
					warning={deleting.warning}
				>
					{deleting.kind === 'shifts'
						? 'Chỉ xoá được ca chưa dùng trong mẫu tuần hay bảng phân ca. Ca đã dùng thì chuyển sang "Ngừng dùng".'
						: 'Bạn có chắc muốn xoá mẫu ca tuần này?'}
				</ConfirmDeleteModal>
			)}
		</AdminLayout>
	);
}
