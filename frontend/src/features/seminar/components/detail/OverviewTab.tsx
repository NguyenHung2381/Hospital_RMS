import type { ReactNode } from 'react';
import { BadgeSvg, ClipboardCheckSvg, FileTextSvg, QrSvg, UsersSvg } from '@/assets/icons';
import sem from '../../pages/Seminar.module.css';
import s from './Detail.module.css';
import { parseTestQuestions } from './detailUtils';
import type { TabProps } from './types';

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

/** Tab "Tổng quan": thông tin chung + số liệu + tiến độ tổ chức (bấm để sang tab tương ứng). */
export function OverviewTab({ seminar: sm, counts, actions, ht }: TabProps) {
	const hosted = sm.scope === 'hosted';
	const hasTest = parseTestQuestions(sm).length > 0;

	// Thông tin phụ — chỉ hiện ô có dữ liệu
	const details = [
		...(ht
			? [
					['Chủ đề', sm.topic_name],
					['Khoa/phòng tổ chức', sm.organizer_department_name],
					['Số tiết', sm.lesson_hours != null ? `${sm.lesson_hours} tiết` : null],
					['Khoa bắt buộc tham dự', sm.required_departments?.map((x) => x.name).join(', ')],
				]
			: []),
		['Chủ tọa', sm.host_chair],
		['Báo cáo viên', sm.speakers],
		['Người điều phối', sm.coordinator],
		['Đơn vị phối hợp', sm.co_organizers],
		['Công văn cấp phép', sm.permit_doc_no],
	].filter(([, v]) => !!v) as [string, string][];

	const manual = sm.manual_participant_count != null || sm.manual_cme_count != null;

	return (
		<div className={s.stack}>
			<section className={s.card}>
				<div className={s.cardTitle}>Thông tin chung</div>
				{details.length > 0 ? (
					<dl className={sem.detailGrid}>
						{details.map(([label, value]) => (
							<div key={label}>
								<dt>{label}</dt>
								<dd>{value}</dd>
							</div>
						))}
					</dl>
				) : (
					<span className={sem.muted}>Chưa có thông tin chủ tọa, báo cáo viên, đơn vị phối hợp…</span>
				)}
				{sm.notes && <p className={sem.overviewNote}>{sm.notes}</p>}

				<div className={sem.statStrip}>
					<Stat
						label='Người tham dự'
						value={sm.manual_participant_count ?? sm.participant_count ?? 0}
						manual={sm.manual_participant_count != null}
					/>
					<Stat
						label='Nội viện'
						value={sm.manual_internal_count ?? sm.internal_count ?? 0}
					/>
					<Stat
						label='Ngoại viện'
						value={sm.manual_external_count ?? sm.external_count ?? 0}
					/>
					<Stat
						label='Nước ngoài'
						value={sm.manual_foreign_count ?? sm.foreign_count ?? 0}
					/>
					{sm.grants_cme && (
						<Stat
							label='Đã cấp CME'
							value={sm.manual_cme_count ?? sm.cme_issued_count ?? 0}
							manual={sm.manual_cme_count != null}
						/>
					)}
				</div>
				{manual && <p className={sem.hint}>* Số liệu nhập tay — danh sách người tham gia chỉ là chi tiết bổ sung.</p>}
			</section>

			<div className={s.kpis}>
				<Kpi
					icon={<UsersSvg />}
					label='Người tham gia'
					value={counts.total}
					sub='Xem danh sách'
					onClick={() => actions.goTab('participants')}
				/>
				{hosted && (
					<Kpi
						icon={<QrSvg />}
						label='Tự đăng ký qua QR'
						value={counts.registered}
						sub='người có vé tham dự'
						onClick={() => actions.goTab('checkin')}
					/>
				)}
				{hosted && (
					<Kpi
						icon={<ClipboardCheckSvg />}
						label='Đã điểm danh'
						value={counts.checkedIn}
						of={counts.total}
						onClick={() => actions.goTab('checkin')}
					/>
				)}
				{hosted && (
					<Kpi
						icon={<FileTextSvg />}
						label='Nộp bài kiểm tra'
						value={hasTest ? counts.submitted : '—'}
						of={hasTest ? counts.total : undefined}
						sub={hasTest ? undefined : 'Chưa soạn bài kiểm tra'}
						onClick={() => actions.goTab('test')}
					/>
				)}
				{sm.grants_cme && (
					<Kpi
						icon={<BadgeSvg />}
						label='Đã cấp số CME'
						value={counts.cmeIssued}
						of={counts.total}
						sub={counts.cmeReady ? `${counts.cmeReady} người đủ điều kiện chờ cấp` : undefined}
						onClick={() => actions.goTab('cme')}
					/>
				)}
			</div>
		</div>
	);
}

function Stat({ label, value, manual }: { label: string; value: ReactNode; manual?: boolean }) {
	return (
		<div className={sem.statItem}>
			<span className={sem.statNum}>
				{value}
				{manual && <sup title='Số liệu nhập tay'>*</sup>}
			</span>
			<span className={sem.statText}>{label}</span>
		</div>
	);
}

/** Ô số liệu; có `of` thì hiện thêm thanh tiến độ value/of. */
export function Kpi({
	icon,
	label,
	value,
	of,
	sub,
	onClick,
}: {
	icon?: ReactNode;
	label: string;
	value: ReactNode;
	of?: number;
	sub?: ReactNode;
	onClick?: () => void;
}) {
	const body = (
		<>
			<span className={s.kpiLabel}>
				{icon}
				{label}
			</span>
			<span className={s.kpiValue}>
				{value}
				{of != null && <small> / {of}</small>}
			</span>
			{of != null && typeof value === 'number' && (
				<span
					className={s.bar}
					aria-hidden
				>
					<span style={{ width: `${pct(value, of)}%` }} />
				</span>
			)}
			{sub && <span className={s.kpiSub}>{sub}</span>}
		</>
	);
	return onClick ? (
		<button
			type='button'
			className={s.kpi}
			onClick={onClick}
		>
			{body}
		</button>
	) : (
		<div className={s.kpi}>{body}</div>
	);
}
