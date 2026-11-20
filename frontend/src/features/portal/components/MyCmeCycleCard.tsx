import { BarChartSvg } from '@/assets/icons';
import { Badge, Card } from '@/shared/components';
import { formatDateVN } from '@/shared/utils/formatDate';
import { CmeCycleProgress } from '../../seminar/components/CmeCycleProgress';
import { CME_CYCLE_BASIS_NOTE, CME_CYCLE_STATUS, formatDaysLeft, formatHours } from '../../seminar/utils/cmeCycle';
import type { MyCmeCycle } from '../api/meApi';
import styles from './MyCmeCycleCard.module.css';

/** Khối "Chu kỳ cập nhật kiến thức y khoa liên tục" đầu trang CME của tôi. Ẩn khi không tính được chu kỳ. */
export default function MyCmeCycleCard({ cycle }: { cycle: MyCmeCycle | null | undefined }) {
	if (!cycle) return null;
	const st = CME_CYCLE_STATUS[cycle.status];
	const basisNote = CME_CYCLE_BASIS_NOTE[cycle.basis];

	return (
		<Card>
			<Card.Header
				icon={<BarChartSvg />}
				title='Chu kỳ cập nhật kiến thức y khoa liên tục'
				sub={`Tối thiểu ${formatHours(cycle.required)} giờ tín chỉ trong ${cycle.cycle_years} năm liên tục (Thông tư 32/2023/TT-BYT)`}
			/>
			<Card.Body>
				<div className={styles.top}>
					<div className={styles.progress}>
						<CmeCycleProgress
							earned={cycle.earned}
							required={cycle.required}
							status={cycle.status}
							large
						/>
					</div>
					<Badge tone={st.tone}>{st.label}</Badge>
				</div>

				<dl className={styles.facts}>
					<div className={styles.fact}>
						<dt>Chu kỳ</dt>
						<dd>
							{formatDateVN(cycle.cycle_start)} – {formatDateVN(cycle.cycle_end)}
						</dd>
					</div>
					<div className={styles.fact}>
						<dt>Còn thiếu</dt>
						<dd>{cycle.missing > 0 ? `${formatHours(cycle.missing)} giờ` : 'Đã đủ'}</dd>
					</div>
					<div className={styles.fact}>
						<dt>Còn lại</dt>
						<dd>{formatDaysLeft(cycle.days_left, cycle.basis)}</dd>
					</div>
					{cycle.license_no && (
						<div className={styles.fact}>
							<dt>Số giấy phép hành nghề</dt>
							<dd>{cycle.license_no}</dd>
						</div>
					)}
				</dl>

				{(basisNote || cycle.earned_undated > 0) && (
					<ul className={styles.notes}>
						{basisNote && <li>{basisNote}.</li>}
						{cycle.earned_undated > 0 && <li>Số giờ đã có gồm {formatHours(cycle.earned_undated)} giờ chưa rõ ngày.</li>}
					</ul>
				)}
			</Card.Body>
		</Card>
	);
}
