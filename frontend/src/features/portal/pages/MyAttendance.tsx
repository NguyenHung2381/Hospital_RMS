import { useCallback, useEffect, useState } from 'react';
import { CalendarSvg, ClockSvg } from '@/assets/icons';
import { Badge, Button, Card, EmptyState, InlineLoading, type BadgeTone } from '@/shared/components';
import { Pagination } from '@/shared/components/Table/Pagination';
import tbl from '@/shared/components/Table/Table.module.css';
import { useClientPaging } from '@/shared/hooks/useClientPaging';
import { useModules } from '@/shared/hooks/useModules';
import { formatDateVN, formatTimeVN } from '@/shared/utils/formatDate';
import { notify } from '@/shared/utils/feedback';
import UserLayout from '../../../layouts/UserLayout';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import {
	checkAttendance,
	getMyAttendance,
	type AttendanceRow,
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
	s.name ? `${s.name} (${s.start_time}–${s.end_time})` : 'Chấm công tự do';
const slotKey = (s: Pick<ShiftSlot, 'shift_id' | 'work_date'>) => `${s.work_date}|${s.shift_id ?? ''}`;

function ShiftTag({ s }: { s: Pick<ShiftSlot, 'code' | 'color' | 'name' | 'start_time' | 'end_time'> }) {
	if (!s.code) return null;
	return (
		<span title={shiftLabel(s)}>
			<Badge tone={(s.color ?? 'gray') as BadgeTone}>{s.code}</Badge>
		</span>
	);
}

/** Đi muộn / về sớm / chưa chấm ra */
function Notes({ r }: { r: AttendanceRow }) {
	return (
		<span className={own.notes}>
			{!!r.late_min && <Badge tone='amber'>Muộn {r.late_min}′</Badge>}
			{!!r.early_min && <Badge tone='amber'>Sớm {r.early_min}′</Badge>}
			{!r.check_out_at && <span className={tbl.cellSub}>Chưa chấm ra</span>}
		</span>
	);
}

export default function MyAttendance() {
	const [data, setData] = useState<Data | null>(null);
	// Ca sắp tới gần nhất (tính lúc tải) — hiện khi chưa tới giờ chấm
	const [next, setNext] = useState<ShiftSlot | null>(null);
	const [loadError, setLoadError] = useState('');
	const [checking, setChecking] = useState<string | null>(null);
	const [checkError, setCheckError] = useState('');
	const pg = useClientPaging(data?.history ?? []);
	const enabled = useModules().attendance;

	const load = useCallback(() => {
		getMyAttendance()
			.then((d) => {
				const now = Date.now();
				setData(d);
				setNext(d.week.flatMap((w) => w.shifts ?? []).find((x) => x.start_at && new Date(x.start_at).getTime() > now) ?? null);
			})
			.catch((e) => setLoadError(e instanceof Error ? e.message : 'Không thể tải dữ liệu chấm công'));
	}, []);
	useEffect(load, [load]);
	useRealtimeUpdate(['staff_attendance', 'shift_assignments', 'work_shifts'], load);

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
			notify.success(res.action === 'check_in' ? 'Đã chấm công vào' : 'Đã chấm công ra');
			load();
		} catch (e) {
			setCheckError(e instanceof Error ? e.message : 'Chấm công thất bại');
			load();
		} finally {
			setChecking(null);
		}
	};

	const blocked = !enabled
		? 'Chức năng chấm công đang tắt. Vui lòng liên hệ phòng Đào tạo.'
		: data && !data.is_trainee
			? 'Chấm công chỉ dành cho học viên đang học khóa đào tạo tại bệnh viện.'
			: data && !data.configured
				? 'Quản trị chưa cấu hình chấm công. Vui lòng liên hệ phòng CNTT.'
				: '';
	const noCourseWeek = data?.week.every((d) => !d.course_id) ?? true;

	return (
		<UserLayout pageTitle='Chấm công' pageSubtitle='Chấm công theo ca trong thời gian khóa học — cần kết nối mạng bệnh viện và đang ở trong khuôn viên'>
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
									{data.current_course ? 'Hiện không có ca nào trong giờ chấm công.' : 'Hôm nay bạn không có khóa học nào đang diễn ra nên không cần chấm công.'}
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
													{o.action === 'check_in' ? 'Chấm công vào' : 'Chấm công ra'}
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
									<p className={own.note}>Chấm công ra nhiều lần trong ca thì lấy lần cuối cùng.</p>
								</div>
							)}
						</Card.Body>
					</Card>

					<Card>
						<Card.Header icon={<CalendarSvg />} title='Lịch ca 7 ngày tới' />
						<Card.Body>
							{noCourseWeek ? (
								<p className={own.idle}>7 ngày tới bạn không có khóa học nào đang diễn ra.</p>
							) : data.week.every((d) => !d.course_id || d.shifts === null) ? (
								<p className={own.idle}>Khóa học chưa có lịch ca — chấm công tự do 1 lượt vào/ra mỗi ngày học.</p>
							) : (
								<div className={own.week}>
									{data.week.map((d) => (
										<div key={d.date} className={own.weekDay}>
											<div className={own.timeLabel}>
												{WEEKDAY[new Date(`${d.date}T00:00:00Z`).getUTCDay()]} {d.date.slice(8)}/{d.date.slice(5, 7)}
											</div>
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
						<Card.Header title='Lịch sử chấm công gần đây' />
						<Card.Body>
							{data.history.length === 0 ? (
								<EmptyState title='Chưa có lượt chấm công nào' />
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
		</UserLayout>
	);
}
