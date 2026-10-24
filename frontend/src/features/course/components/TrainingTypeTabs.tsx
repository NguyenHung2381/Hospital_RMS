import crud from '@/shared/components/Table/CrudPage.module.css';
import { TRAINING_TYPE_TABS } from '../types/course.type';

/** Thanh tab loại khóa (Tất cả / GPHN / ĐTLT / CTCV) — dùng ở trang Khóa học và Học viên. */
export function TrainingTypeTabs({
	value,
	counts,
	onChange,
	tabs = TRAINING_TYPE_TABS,
}: {
	value: string;
	counts?: Record<string, number>;
	onChange: (id: string) => void;
	/** Danh sách / thứ tự tab riêng (mặc định TRAINING_TYPE_TABS). */
	tabs?: { id: string; label: string }[];
}) {
	return (
		<div className={crud.tabs}>
			{tabs.map((t) => (
				<button
					key={t.id}
					type='button'
					className={`${crud.tabBtn} ${value === t.id ? crud.tabBtnActive : ''}`}
					onClick={() => onChange(t.id)}
				>
					{t.label}
					{counts && <span>({counts[t.id] ?? 0})</span>}
				</button>
			))}
		</div>
	);
}
