import { useMemo } from 'react';
import { ClipboardCheckSvg, QrSvg, UserCheckSvg, UsersSvg } from '@/assets/icons';
import { formatDateTimeVN } from '@/shared/utils/formatDate';
import sem from '../../pages/Seminar.module.css';
import s from './Detail.module.css';
import { Kpi } from './OverviewTab';
import { PersonList } from './PersonList';
import type { TabProps } from './types';

/** Tab "Đăng ký & điểm danh" (hội nghị BV tổ chức): QR đăng ký, quét vé, ai chưa điểm danh. */
export function CheckinTab({ participants, counts, perms, actions }: TabProps) {
	const waiting = useMemo(() => participants.filter((p) => p.ticket_code && !p.checked_in_at), [participants]);
	const recent = useMemo(
		() =>
			participants
				.filter((p) => p.checked_in_at)
				.sort((a, b) => (b.checked_in_at ?? '').localeCompare(a.checked_in_at ?? '')),
		[participants],
	);

	return (
		<div className={s.stack}>
			<div className={s.kpis}>
				<Kpi
					icon={<UsersSvg />}
					label='Người tham gia'
					value={counts.total}
					sub='trong danh sách'
				/>
				<Kpi
					icon={<QrSvg />}
					label='Tự đăng ký qua QR'
					value={counts.registered}
					sub='người có vé tham dự'
				/>
				<Kpi
					icon={<ClipboardCheckSvg />}
					label='Đã điểm danh'
					value={counts.checkedIn}
					of={counts.total}
				/>
				<Kpi
					icon={<UserCheckSvg />}
					label='Có vé, chưa điểm danh'
					value={waiting.length}
				/>
			</div>

			{perms.canUpdate && (
				<section className={s.card}>
					<div className={s.cardHead}>
						<div>
							<div className={s.cardTitle}>Công cụ tổ chức</div>
							<div className={s.cardSub}>
								Người tham dự quét mã QR để tự đăng ký và nhận vé; tại hội trường ban tổ chức quét vé để điểm
								danh.
							</div>
						</div>
						<div className={s.cardActions}>
							<button
								className={sem.btnGhost}
								onClick={actions.openRegQr}
							>
								<QrSvg /> Mã QR đăng ký
							</button>
							<button
								className={sem.btnPrimary}
								onClick={actions.scanTickets}
							>
								<ClipboardCheckSvg /> Quét vé điểm danh
							</button>
						</div>
					</div>
				</section>
			)}

			<section className={s.card}>
				<div className={s.cardTitle}>Đã đăng ký, chưa điểm danh ({waiting.length})</div>
				<PersonList
					items={waiting}
					onOpen={actions.openParticipant}
					limit={15}
					empty='Không có ai đang chờ điểm danh.'
				/>
			</section>

			<section className={s.card}>
				<div className={s.cardTitle}>Điểm danh gần đây</div>
				<PersonList
					items={recent}
					onOpen={actions.openParticipant}
					limit={15}
					empty='Chưa có ai điểm danh.'
					right={(p) => <span className={sem.muted}>{formatDateTimeVN(p.checked_in_at!)}</span>}
				/>
			</section>
		</div>
	);
}
