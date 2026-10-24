import { useCallback, useEffect, useState } from 'react';
import { BadgeSvg, BuildingSvg, CalendarSvg, CheckSvg, ClockSvg, TagSvg, XSvg } from '@/assets/icons';
import { Badge, Button, Card, EmptyState, InlineLoading } from '@/shared/components';
import { formatDateVN } from '@/shared/utils/formatDate';
import { showToast } from '@/shared/utils/feedback';
import UserLayout from '../../../layouts/UserLayout';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { hospitalTrainingSelfApi, type MyHospitalTraining } from '../api/hospitalTrainingSelfApi';
import self from './SelfService.module.css';
import styles from './MyHospitalTrainings.module.css';

// Thứ tự nhóm: việc của mình trước (đã đăng ký sắp học), rồi buổi còn nhận đăng ký, cuối cùng buổi đã qua.
const GROUPS: { title: string; match: (t: MyHospitalTraining) => boolean }[] = [
	{ title: 'Bạn sẽ tham dự', match: (t) => t.open && t.registered },
	{ title: 'Đang nhận đăng ký', match: (t) => t.open && !t.registered },
	{ title: 'Đã diễn ra gần đây', match: (t) => !t.open },
];

const dateText = (t: MyHospitalTraining) => {
	if (!t.start_date) return t.date_text || 'Chưa có ngày';
	const day =
		t.end_date && t.end_date !== t.start_date
			? `${formatDateVN(t.start_date)} – ${formatDateVN(t.end_date)}`
			: formatDateVN(t.start_date);
	return day;
};

/** Tập huấn bệnh viện: nhân viên xem buổi sắp tới, tự đăng ký / hủy (GĐ6). Dùng tốt trên điện thoại. */
export default function MyHospitalTrainings() {
	const [rows, setRows] = useState<MyHospitalTraining[] | null>(null);
	const [error, setError] = useState('');

	const load = useCallback(
		() =>
			hospitalTrainingSelfApi
				.list()
				.then((r) => {
					setRows(r);
					setError('');
				})
				.catch((err) => setError(err instanceof Error ? err.message : 'Không tải được danh sách')),
		[],
	);
	useEffect(() => {
		void load();
	}, [load]);
	useRealtimeUpdate('seminar', load);

	return (
		<UserLayout pageTitle='Tập huấn bệnh viện' pageSubtitle='Buổi tập huấn do bệnh viện tổ chức — đăng ký tham dự'>
			{error && <EmptyState title='Không tải được dữ liệu' desc={error} />}
			{!rows && !error && <InlineLoading />}
			{rows && rows.length === 0 && (
				<EmptyState title='Chưa có buổi tập huấn' desc='Hiện chưa có buổi tập huấn bệnh viện nào sắp diễn ra.' />
			)}
			{rows && rows.length > 0 && (
				<div className={self.stack}>
					{GROUPS.map((g) => {
						const items = rows.filter(g.match);
						if (!items.length) return null;
						return (
							<section key={g.title}>
								<div className={self.groupTitle}>
									{g.title} ({items.length})
								</div>
								<div className={self.list}>
									{items.map((t) => (
										<TrainingCard
											key={t.id}
											row={t}
											onChanged={load}
										/>
									))}
								</div>
							</section>
						);
					})}
				</div>
			)}
		</UserLayout>
	);
}

function TrainingCard({ row, onChanged }: { row: MyHospitalTraining; onChanged: () => void }) {
	const [busy, setBusy] = useState(false);

	const act = async (fn: () => Promise<unknown>, ok: string) => {
		setBusy(true);
		try {
			await fn();
			showToast('success', ok);
			onChanged();
		} catch (err) {
			showToast('error', err instanceof Error ? err.message : 'Thao tác thất bại');
		} finally {
			setBusy(false);
		}
	};

	// Vì sao không hủy được — hiện cạnh trạng thái để người dùng khỏi bấm thử
	const lockNote =
		row.registered && row.open && !row.can_cancel
			? row.required
				? 'Khoa bạn bắt buộc tham dự'
				: !row.self_registered
					? 'Phòng Đào tạo đã thêm bạn vào danh sách'
					: row.checked_in_at
						? null
						: 'Hôm nay là ngày học — không hủy được nữa'
			: null;

	return (
		<Card className={self.item}>
			<div className={styles.head}>
				<div className={styles.title}>{row.title}</div>
				<div className={styles.badges}>
					{row.required && <Badge tone='amber'>Bắt buộc với khoa bạn</Badge>}
					{row.checked_in_at ? (
						<Badge tone='green'>Đã điểm danh</Badge>
					) : row.registered ? (
						<Badge tone='blue'>Đã đăng ký</Badge>
					) : null}
				</div>
			</div>
			<div className={styles.facts}>
				<span>
					<CalendarSvg />
					{dateText(row)}
				</span>
				{(row.start_time || row.end_time) && (
					<span>
						<ClockSvg />
						{[row.start_time, row.end_time].filter(Boolean).join(' – ')}
					</span>
				)}
				{row.location && (
					<span>
						<BuildingSvg />
						{row.location}
					</span>
				)}
				{row.topic_name && (
					<span>
						<TagSvg />
						{row.topic_name}
					</span>
				)}
				{row.grants_cme && (
					<span>
						<BadgeSvg />
						{row.lesson_hours ? `${row.lesson_hours} tiết · ${row.lesson_hours} giờ CME` : 'Có cấp CME'}
					</span>
				)}
				{row.organizer_department_name && (
					<span className={styles.organizer}>Khoa tổ chức: {row.organizer_department_name}</span>
				)}
			</div>

			{(row.can_register || row.can_cancel || lockNote) && (
				<div className={styles.footer}>
					{lockNote && <span className={styles.note}>{lockNote}</span>}
					{row.can_register && (
						<Button
							icon={<CheckSvg />}
							className={styles.bigBtn}
							loading={busy}
							onClick={() => void act(() => hospitalTrainingSelfApi.register(row.id), 'Đã đăng ký tham dự')}
						>
							Đăng ký tham dự
						</Button>
					)}
					{row.can_cancel && (
						<Button
							variant='secondary'
							icon={<XSvg />}
							className={styles.bigBtn}
							loading={busy}
							onClick={() => {
								if (confirm(`Hủy đăng ký "${row.title}"?`))
									void act(() => hospitalTrainingSelfApi.cancel(row.id), 'Đã hủy đăng ký');
							}}
						>
							Hủy đăng ký
						</Button>
					)}
				</div>
			)}
		</Card>
	);
}
