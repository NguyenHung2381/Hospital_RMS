import { useCallback, useEffect, useState } from 'react';
import { ClockSvg } from '@/assets/icons';
import { Badge, Button, Card, EmptyState, InlineLoading } from '@/shared/components';
import { Pagination } from '@/shared/components/Table/Pagination';
import tbl from '@/shared/components/Table/Table.module.css';
import { useClientPaging } from '@/shared/hooks/useClientPaging';
import { useModules } from '@/shared/hooks/useModules';
import { formatDateVN, formatTimeVN } from '@/shared/utils/formatDate';
import { notify } from '@/shared/utils/feedback';
import UserLayout from '../../../layouts/UserLayout';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { checkAttendance, getMyAttendance, type MyAttendance as Data } from '../api/meApi';
import styles from './SelfService.module.css';
import own from './MyAttendance.module.css';

const GEO_ERRORS: Record<number, string> = {
	1: 'Bạn đã chặn quyền vị trí. Mở cài đặt trình duyệt → cho phép trang này truy cập vị trí rồi thử lại.',
	2: 'Không xác định được vị trí. Bật GPS/định vị của thiết bị rồi thử lại.',
	3: 'Lấy vị trí quá lâu. Ra gần cửa sổ hoặc bật GPS rồi thử lại.',
};

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

export default function MyAttendance() {
	const [data, setData] = useState<Data | null>(null);
	const [loadError, setLoadError] = useState('');
	const [checking, setChecking] = useState(false);
	const [checkError, setCheckError] = useState('');
	const pg = useClientPaging(data?.history ?? []);
	const enabled = useModules().attendance;

	const load = useCallback(() => {
		getMyAttendance()
			.then(setData)
			.catch((e) => setLoadError(e instanceof Error ? e.message : 'Không thể tải dữ liệu chấm công'));
	}, []);
	useEffect(load, [load]);
	useRealtimeUpdate(['staff_attendance'], load);

	const handleCheck = async () => {
		setChecking(true);
		setCheckError('');
		try {
			const { coords } = await getPosition();
			const res = await checkAttendance({ lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy });
			notify.success(res.action === 'check_in' ? 'Đã chấm công vào' : 'Đã chấm công ra');
			load();
		} catch (e) {
			setCheckError(e instanceof Error ? e.message : 'Chấm công thất bại');
		} finally {
			setChecking(false);
		}
	};

	const today = data?.today;

	return (
		<UserLayout pageTitle='Chấm công' pageSubtitle='Chấm công hằng ngày — cần kết nối mạng bệnh viện và đang ở trong khuôn viên'>
			{loadError && <EmptyState title='Không thể tải dữ liệu' desc={loadError} />}
			{!data && !loadError && <InlineLoading />}

			{data && (
				<div className={styles.stack}>
					<Card>
						<Card.Header icon={<ClockSvg />} title={`Hôm nay, ${formatDateVN(new Date())}`} />
						<Card.Body>
							<div className={own.times}>
								<div>
									<div className={own.timeLabel}>Giờ vào</div>
									<div className={own.timeValue}>{formatTimeVN(today?.check_in_at) || '--:--'}</div>
								</div>
								<div>
									<div className={own.timeLabel}>Giờ ra</div>
									<div className={own.timeValue}>{formatTimeVN(today?.check_out_at) || '--:--'}</div>
								</div>
							</div>

							<div className={own.conditions}>
								<Badge tone={data.ip_ok ? 'green' : 'red'} dot>
									{data.ip_ok ? 'Đang dùng mạng bệnh viện' : 'Chưa kết nối mạng bệnh viện'}
								</Badge>
								<Badge tone='gray'>Vị trí trong bán kính {data.radius_m}m</Badge>
							</div>

							{!enabled ? (
								<p className={own.error}>Chức năng chấm công đang tắt. Vui lòng liên hệ quản trị hệ thống.</p>
							) : !data.configured ? (
								<p className={own.error}>Quản trị chưa cấu hình chấm công. Vui lòng liên hệ phòng CNTT.</p>
							) : (
								<Button size='lg' className={own.checkBtn} loading={checking} onClick={handleCheck}>
									{today ? 'Chấm công ra' : 'Chấm công vào'}
								</Button>
							)}
							{today && enabled && data.configured && (
								<p className={own.note}>Chấm công ra nhiều lần trong ngày thì lấy lần cuối cùng.</p>
							)}
							{checkError && <p className={own.error}>{checkError}</p>}
						</Card.Body>
					</Card>

					<Card>
						<Card.Header title='Lịch sử 31 ngày gần nhất' />
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
													<th>Giờ vào</th>
													<th>Giờ ra</th>
												</tr>
											</thead>
											<tbody>
												{pg.paged.map((r, i) => (
													<tr key={r.id}>
														<td className={tbl.tdIdx}>{pg.offset + i + 1}</td>
														<td className={tbl.cellTitle}>{formatDateVN(r.work_date)}</td>
														<td>{formatTimeVN(r.check_in_at)}</td>
														<td>{formatTimeVN(r.check_out_at) || <span className={tbl.cellSub}>Chưa chấm ra</span>}</td>
													</tr>
												))}
											</tbody>
										</table>
									</div>
									<Pagination {...pg.pagination} itemLabel='ngày' />
								</>
							)}
						</Card.Body>
					</Card>
				</div>
			)}
		</UserLayout>
	);
}
