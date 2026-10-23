import { useCallback, useEffect, useState } from 'react';
import { CalendarSvg, ClockSvg, FileTextSvg, PlusSvg } from '@/assets/icons';
import { Badge, Button, Card, EmptyState, InlineLoading, type BadgeTone } from '@/shared/components';
import { Pagination } from '@/shared/components/Table/Pagination';
import tbl from '@/shared/components/Table/Table.module.css';
import { useClientPaging } from '@/shared/hooks/useClientPaging';
import { useModules } from '@/shared/hooks/useModules';
import { formatDateTimeVN, formatDateVN, formatTimeVN } from '@/shared/utils/formatDate';
import { notify } from '@/shared/utils/feedback';
import UserLayout from '../../../layouts/UserLayout';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import LeaveRequestModal from '../components/LeaveRequestModal';
import {
	cancelLeaveRequest,
	checkAttendance,
	getMyAttendance,
	getMyLeaveRequests,
	LEAVE_STATUS,
	LEAVE_TYPE_TEXT,
	type AttendanceRow,
	type LeaveRequest,
	type CheckOption,
	type MyAttendance as Data,
	type ShiftSlot,
} from '../api/meApi';
import styles from './SelfService.module.css';
import own from './MyAttendance.module.css';

const GEO_ERRORS: Record<number, string> = {
	1: 'Bạn đã chặn quyền vị trí. Mở cài đặt trình duyệt → cho phép trang này truy cập vị trí rồi thử lại.',
	2: 'Không xác định được vị trí. Bật GPS/định vị của thiết bị rồi thử lại.',
	3: 'Lấy vị trí quá lâu. Ra gần cửa sổ hoặc bật GPS rồi thử lại.',
};
const WEEKDAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

const getPosition = () =>
	new Promise<GeolocationPosition>((resolve, reject) => {
		if (!window.isSecureContext || !navigator.geolocation)
			return reject(new Error('Trình duyệt không hỗ trợ định vị (trang cần chạy qua HTTPS).'));
		navigator.geolocation.getCurrentPosition(resolve, (e) => reject(new Error(GEO_ERRORS[e.code] ?? e.message)), {
			enableHighAccuracy: true,
			timeout: 20000,
			maximumAge: 0,
		});
	});

const shiftLabel = (s: Pick<ShiftSlot, 'name' | 'start_time' | 'end_time'>) =>
	s.name ? `${s.name} (${s.start_time}–${s.end_time})` : 'Điểm danh tự do';
const slotKey = (s: Pick<ShiftSlot, 'shift_id' | 'work_date'>) => `${s.work_date}|${s.shift_id ?? ''}`;

function ShiftTag({ s }: { s: Pick<ShiftSlot, 'code' | 'color' | 'name' | 'start_time' | 'end_time'> }) {
	if (!s.code) return null;
	return (
		<span title={shiftLabel(s)}>
			<Badge tone={(s.color ?? 'gray') as BadgeTone}>{s.code}</Badge>
		</span>
	);
}

/** Đi muộn / về sớm / chưa điểm danh ra */
function Notes({ r }: { r: AttendanceRow }) {
	return (
		<span className={own.notes}>
			{!!r.late_min && <Badge tone='amber'>Muộn {r.late_min}′</Badge>}
			{!!r.early_min && <Badge tone='amber'>Sớm {r.early_min}′</Badge>}
			{!r.check_out_at && <span className={tbl.cellSub}>Chưa điểm danh ra</span>}
		</span>
	);
}

/** "05/12" hoặc "05/12 – 07/12" (+ ca / giờ có mặt) */
const leavePeriod = (l: LeaveRequest) => {
	const range = l.from_date === l.to_date ? formatDateVN(l.from_date) : `${formatDateVN(l.from_date)} – ${formatDateVN(l.to_date)}`;
	const extra = [l.shift_name, l.arrive_time ? `có mặt lúc ${l.arrive_time}` : null].filter(Boolean).join(' · ');
	return extra ? `${range} · ${extra}` : range;
};

/** Danh sách đơn xin nghỉ / đi muộn của học viên — huỷ được đơn còn chờ duyệt. */
function LeaveList({ leaves, onCancel, cancelling }: { leaves: LeaveRequest[]; onCancel: (l: LeaveRequest) => void; cancelling: number | null }) {
	const pg = useClientPaging(leaves);
	if (!leaves.length) return <p className={own.idle}>Bạn chưa gửi đơn xin phép nào.</p>;
	return (
		<>
			<div className={own.leaveList}>
				{pg.paged.map((l) => (
					<div key={l.id} className={own.leaveItem}>
						<div className={own.leaveHead}>
							<Badge tone={l.type === 'absent' ? 'blue' : 'purple'}>{LEAVE_TYPE_TEXT[l.type]}</Badge>
							<span className={tbl.cellTitle}>{leavePeriod(l)}</span>
							<Badge tone={LEAVE_STATUS[l.status].tone} dot>
								{LEAVE_STATUS[l.status].label}
							</Badge>
						</div>
						<div className={tbl.cellSub}>Lý do: {l.reason}</div>
						{l.course_name && <div className={tbl.cellSub}>Khóa học: {l.course_name}</div>}
						{(l.status === 'approved' || l.status === 'rejected') && (
							<div className={tbl.cellSub}>
								{l.status === 'approved' ? 'Duyệt' : 'Từ chối'} bởi {l.reviewer_name ?? '—'}
								{l.reviewed_at ? ` lúc ${formatDateTimeVN(l.reviewed_at)}` : ''}
								{l.review_note ? ` — ${l.review_note}` : ''}
							</div>
						)}
						{l.status === 'pending' && (
							<div>
								<Button size='sm' variant='ghost' loading={cancelling === l.id} disabled={cancelling != null && cancelling !== l.id} onClick={() => onCancel(l)}>
									Huỷ đơn
								</Button>
							</div>
						)}
					</div>
				))}
			</div>
			<Pagination {...pg.pagination} itemLabel='đơn' />
		</>
	);
}

export default function MyAttendance() {
	const [data, setData] = useState<Data | null>(null);
	// Ca sắp tới gần nhất (tính lúc tải) — hiện khi chưa tới giờ điểm danh
	const [next, setNext] = useState<ShiftSlot | null>(null);
	const [loadError, setLoadError] = useState('');
	const [checking, setChecking] = useState<string | null>(null);
	const [checkError, setCheckError] = useState('');
	const pg = useClientPaging(data?.history ?? []);
	const enabled = useModules().attendance;
	const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
	const [leaveOpen, setLeaveOpen] = useState(false);
	const [cancelling, setCancelling] = useState<number | null>(null);

	const load = useCallback(() => {
		getMyAttendance()
			.then((d) => {
				const now = Date.now();
				setData(d);
				setNext(d.week.flatMap((w) => w.shifts ?? []).find((x) => x.start_at && new Date(x.start_at).getTime() > now) ?? null);
			})
			.catch((e) => setLoadError(e instanceof Error ? e.message : 'Không thể tải dữ liệu điểm danh'));
	}, []);
	useEffect(load, [load]);
	useRealtimeUpdate(['staff_attendance', 'shift_assignments', 'work_shifts'], load);

	const loadLeaves = useCallback(() => {
		getMyLeaveRequests()
			.then(setLeaves)
			.catch(() => setLeaves([]));
	}, []);
	useEffect(loadLeaves, [loadLeaves]);
	useRealtimeUpdate(['attendance_leave'], loadLeaves);

	const cancelLeave = async (l: LeaveRequest) => {
		if (!window.confirm(`Huỷ đơn ${LEAVE_TYPE_TEXT[l.type].toLowerCase()} ${leavePeriod(l)}?`)) return;
		setCancelling(l.id);
		try {
			await cancelLeaveRequest(l.id);
			notify.success('Đã huỷ đơn xin phép');
			loadLeaves();
		} catch (e) {
			notify.error(e instanceof Error ? e.message : 'Huỷ đơn thất bại');
		} finally {
			setCancelling(null);
		}
	};
	// Đơn chờ duyệt / đã duyệt phủ 1 ngày (để đánh dấu trên lịch ca)
	const leaveOn = (date: string) =>
		leaves.find((l) => (l.status === 'approved' || l.status === 'pending') && l.from_date <= date && date <= l.to_date);

	const handleCheck = async (o: CheckOption) => {
		setChecking(slotKey(o));
		setCheckError('');
		try {
			const { coords } = await getPosition();
			const res = await checkAttendance({
				lat: coords.latitude,
				lng: coords.longitude,
				accuracy: coords.accuracy,
				shift_id: o.shift_id,
				work_date: o.work_date,
			});
			notify.success(res.action === 'check_in' ? 'Đã điểm danh vào' : 'Đã điểm danh ra');
			load();
		} catch (e) {
			setCheckError(e instanceof Error ? e.message : 'Điểm danh thất bại');
			load();
		} finally {
			setChecking(null);
		}
	};

	const blocked = !enabled
		? 'Chức năng điểm danh đang tắt. Vui lòng liên hệ phòng Đào tạo.'
		: data && !data.is_trainee
			? 'Điểm danh chỉ dành cho học viên đang học khóa đào tạo tại bệnh viện.'
			: data && !data.configured
				? 'Quản trị chưa cấu hình điểm danh. Vui lòng liên hệ phòng CNTT.'
				: '';
	const noCourseWeek = data?.week.every((d) => !d.course_id) ?? true;

	return (
		<UserLayout pageTitle='Điểm danh & xin phép' pageSubtitle='Điểm danh theo ca trong thời gian khóa học (cần mạng bệnh viện và ở trong khuôn viên); có việc đột xuất thì gửi đơn xin nghỉ / đi muộn'>
			{loadError && <EmptyState title='Không thể tải dữ liệu' desc={loadError} />}
			{!data && !loadError && <InlineLoading />}

			{data && (
				<div className={styles.stack}>
					<Card>
						<Card.Header icon={<ClockSvg />} title={`Hôm nay, ${formatDateVN(new Date())}`} />
						<Card.Body>
							{data.current_course && (
								<p className={own.note}>
									Khóa đang học: <b>{data.current_course.course_name}</b>
								</p>
							)}
							<div className={own.conditions}>
								<Badge tone={data.ip_ok ? 'green' : 'red'} dot>
									{data.ip_ok ? 'Đang dùng mạng bệnh viện' : 'Chưa kết nối mạng bệnh viện'}
								</Badge>
								<Badge tone='gray'>Vị trí trong bán kính {data.radius_m}m</Badge>
							</div>

							{blocked ? (
								<p className={own.error}>{blocked}</p>
							) : data.options.length === 0 ? (
								<p className={own.idle}>
									{data.current_course ? 'Hiện không có ca nào trong giờ điểm danh.' : 'Hôm nay bạn không có khóa học nào đang diễn ra nên không cần điểm danh.'}
									{next && (
										<>
											{' '}
											Ca tới: <b>{shiftLabel(next)}</b> ngày {formatDateVN(next.work_date)}.
										</>
									)}
								</p>
							) : (
								<div className={own.options}>
									{data.options.map((o) => {
										const k = slotKey(o);
										return (
											<div key={k} className={own.option}>
												<div className={own.optionInfo}>
													<ShiftTag s={o} />
													<div>
														<div className={tbl.cellTitle}>{shiftLabel(o)}</div>
														{o.shift_id != null && <div className={tbl.cellSub}>Ca ngày {formatDateVN(o.work_date)}</div>}
													</div>
												</div>
												<Button
													size='lg'
													variant={o.action === 'check_in' ? 'primary' : 'secondary'}
													loading={checking === k}
													disabled={!!checking && checking !== k}
													onClick={() => handleCheck(o)}
												>
													{o.action === 'check_in' ? 'Điểm danh vào' : 'Điểm danh ra'}
												</Button>
											</div>
										);
									})}
								</div>
							)}
							{checkError && <p className={own.error}>{checkError}</p>}

							{data.recent.length > 0 && (
								<div className={own.recent}>
									{data.recent.map((r) => (
										<div key={r.id} className={own.recentRow}>
											<div className={own.optionInfo}>
												<ShiftTag s={{ code: r.shift_code, color: null, name: r.shift_name, start_time: null, end_time: null }} />
												<span className={tbl.cellSub}>
													{r.shift_name ?? 'Tự do'} · {formatDateVN(r.work_date)}
													{r.course_name ? ` · ${r.course_name}` : ''}
												</span>
											</div>
											<div className={own.times}>
												<div>
													<div className={own.timeLabel}>Giờ vào</div>
													<div className={own.timeValue}>{formatTimeVN(r.check_in_at)}</div>
												</div>
												<div>
													<div className={own.timeLabel}>Giờ ra</div>
													<div className={own.timeValue}>{formatTimeVN(r.check_out_at) || '--:--'}</div>
												</div>
											</div>
											<Notes r={r} />
										</div>
									))}
									<p className={own.note}>Điểm danh ra nhiều lần trong ca thì lấy lần cuối cùng.</p>
								</div>
							)}
						</Card.Body>
					</Card>

					<Card>
						<Card.Header
							icon={<FileTextSvg />}
							title='Đơn xin phép'
							sub='Có việc đột xuất không thể tham gia hoặc phải đến muộn? Gửi đơn để được duyệt nghỉ / đi muộn có phép.'
							actions={
								data.is_trainee &&
								enabled &&
								data.leave?.enabled !== false && (
									<Button size='sm' icon={<PlusSvg />} onClick={() => setLeaveOpen(true)}>
										Tạo đơn xin phép
									</Button>
								)
							}
						/>
						<Card.Body>
							<LeaveList leaves={leaves} onCancel={cancelLeave} cancelling={cancelling} />
						</Card.Body>
					</Card>

					<Card>
						<Card.Header icon={<CalendarSvg />} title='Lịch ca 7 ngày tới' />
						<Card.Body>
							{noCourseWeek ? (
								<p className={own.idle}>7 ngày tới bạn không có khóa học nào đang diễn ra.</p>
							) : data.week.every((d) => !d.course_id || d.shifts === null) ? (
								<p className={own.idle}>Khóa học chưa có lịch ca — điểm danh tự do 1 lượt vào/ra mỗi ngày học.</p>
							) : (
								<div className={own.week}>
									{data.week.map((d) => (
										<div key={d.date} className={own.weekDay}>
											<div className={own.timeLabel}>
												{WEEKDAY[new Date(`${d.date}T00:00:00Z`).getUTCDay()]} {d.date.slice(8)}/{d.date.slice(5, 7)}
											</div>
											{(() => {
												const l = d.course_id ? leaveOn(d.date) : undefined;
												return (
													l && (
														<Badge tone={l.status === 'approved' ? 'green' : 'amber'}>
															{l.type === 'absent' ? 'Nghỉ' : 'Muộn'}
															{l.status === 'approved' ? ' có phép' : ' (chờ duyệt)'}
														</Badge>
													)
												);
											})()}
											{!d.course_id ? (
												<span className={tbl.cellSub}>Không học</span>
											) : d.shifts === null ? (
												<span className={tbl.cellSub}>Tự do</span>
											) : d.shifts.length === 0 ? (
												<span className={tbl.cellSub}>Nghỉ</span>
											) : (
												d.shifts.map((s) => (
													<div key={slotKey(s)} className={own.weekShift}>
														<ShiftTag s={s} />
														<span className={tbl.cellSub}>
															{s.start_time}–{s.end_time}
														</span>
													</div>
												))
											)}
										</div>
									))}
								</div>
							)}
							{data.current_course?.pattern_name && (
								<p className={own.note}>
									Mẫu ca tuần của khóa: {data.current_course.pattern_name}. Ngày được phân ca riêng sẽ theo bảng phân ca.
								</p>
							)}
						</Card.Body>
					</Card>

					<Card>
						<Card.Header title='Lịch sử điểm danh gần đây' />
						<Card.Body>
							{data.history.length === 0 ? (
								<EmptyState title='Chưa có lượt điểm danh nào' />
							) : (
								<>
									<div className={styles.tableWrap}>
										<table className={styles.table}>
											<thead>
												<tr>
													<th className={tbl.thIdx}>STT</th>
													<th>Ngày</th>
													<th>Khóa học</th>
													<th>Ca</th>
													<th>Giờ vào</th>
													<th>Giờ ra</th>
													<th>Ghi chú</th>
												</tr>
											</thead>
											<tbody>
												{pg.paged.map((r, i) => (
													<tr key={r.id}>
														<td className={tbl.tdIdx}>{pg.offset + i + 1}</td>
														<td className={tbl.cellTitle}>{formatDateVN(r.work_date)}</td>
														<td>{r.course_name ?? '—'}</td>
														<td>{r.shift_name ?? <span className={tbl.cellSub}>Tự do</span>}</td>
														<td>{formatTimeVN(r.check_in_at)}</td>
														<td>{formatTimeVN(r.check_out_at) || '--:--'}</td>
														<td>
															<Notes r={r} />
														</td>
													</tr>
												))}
											</tbody>
										</table>
									</div>
									<Pagination {...pg.pagination} itemLabel='lượt' />
								</>
							)}
						</Card.Body>
					</Card>
				</div>
			)}
			{leaveOpen && data && <LeaveRequestModal week={data.week} policy={data.leave} onClose={() => setLeaveOpen(false)} onSaved={() => {
				notify.success('Đã gửi đơn xin phép, vui lòng chờ duyệt');
				loadLeaves();
			}} />}
		</UserLayout>
	);
}
