import { useSearchParams } from 'react-router-dom';
import { EmptyState } from '@/shared/components';
import { useModules, type ModuleKey } from '@/shared/hooks/useModules';
import AdminLayout from '../../../layouts/AdminLayout';
import { ResearchReports } from '../components/ResearchReports';
import { SeminarReports } from '../components/SeminarReports';
import { TrainingReports } from '../components/TrainingReports';
import styles from './Reports.module.css';

type Area = Extract<ModuleKey, 'research' | 'training' | 'seminar'>;

const AREAS: { key: Area; label: string }[] = [
	{ key: 'research', label: 'Nghiên cứu khoa học' },
	{ key: 'training', label: 'Đào tạo' },
	{ key: 'seminar', label: 'Hội thảo – CME' },
];

const THIS_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 10 }, (_, i) => THIS_YEAR + 1 - i);

// Trang Báo cáo: chọn mảng + năm (giữ trên URL để gửi link), mỗi mảng có chỉ số
// trong năm và các báo cáo xuất Excel / PDF. Biểu đồ nằm ở Bảng điều khiển.
export default function Reports() {
	const modules = useModules();
	const [params, setParams] = useSearchParams();
	const areas = AREAS.filter((a) => modules[a.key] !== false);
	const area = areas.find((a) => a.key === params.get('tab'))?.key ?? areas[0]?.key;
	const year = Number(params.get('year')) || THIS_YEAR;

	const update = (patch: Record<string, string>) =>
		setParams((p) => {
			const next = new URLSearchParams(p);
			for (const [k, v] of Object.entries(patch)) next.set(k, v);
			return next;
		}, { replace: true });

	return (
		<AdminLayout
			pageTitle='Báo cáo'
			pageSubtitle='Số liệu theo năm và xuất báo cáo Excel / PDF cho NCKH, Đào tạo, Hội thảo – CME'
		>
			<div className={styles.toolbar}>
				<div
					className={styles.areaTabs}
					role='tablist'
					aria-label='Chọn mảng báo cáo'
				>
					{areas.map((a) => (
						<button
							key={a.key}
							type='button'
							role='tab'
							aria-selected={a.key === area}
							className={`${styles.areaTab} ${a.key === area ? styles.areaTabActive : ''}`}
							onClick={() => update({ tab: a.key })}
						>
							{a.label}
						</button>
					))}
				</div>
				<label className={styles.yearField}>
					Năm
					<select
						className={styles.select}
						value={year}
						onChange={(e) => update({ year: e.target.value })}
					>
						{(YEARS.includes(year) ? YEARS : [year, ...YEARS]).map((y) => (
							<option
								key={y}
								value={y}
							>
								{y}
							</option>
						))}
					</select>
				</label>
			</div>

			{area === 'research' && <ResearchReports year={year} />}
			{area === 'training' && <TrainingReports year={year} />}
			{area === 'seminar' && <SeminarReports year={year} />}
			{!area && (
				<EmptyState
					title='Chưa có mảng nào để báo cáo'
					desc='NCKH, Đào tạo và Hội thảo – CME đều đang tắt ở Cấu hình hệ thống.'
				/>
			)}
		</AdminLayout>
	);
}
