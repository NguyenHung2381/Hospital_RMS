import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChartSvg, EditSvg, PlusSvg } from '@/assets/icons';
import { Can, InlineLoading, Modal } from '@/shared/components';
import { showToast } from '@/shared/utils/feedback';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { createCourse } from '../../course/api/courseApi';
import { CourseFormModal } from '../../course/components/CourseFormModal';
import type { CourseFormData } from '../../course/types/course.type';
import { trainingPlanApi } from '../api/trainingPlanApi';
import type { TrainingPlan, TrainingPlanItem } from '../types/trainingPlan.type';
import styles from '../pages/TrainingPlan.module.css';

/** Chi tiết kế hoạch: từng hạng mục → các khóa đã mở + số học viên so với chỉ tiêu; mở khóa mới ngay tại hạng mục. */
export function PlanDetailModal({
	planId,
	onClose,
	onEdit,
}: {
	planId: string;
	onClose: () => void;
	onEdit: (plan: TrainingPlan) => void;
}) {
	const navigate = useNavigate();
	const [plan, setPlan] = useState<TrainingPlan | null>(null);
	const [creatingFor, setCreatingFor] = useState<TrainingPlanItem | null>(null);
	const [saving, setSaving] = useState(false);

	const load = useCallback(
		() =>
			trainingPlanApi
				.getById(planId)
				.then(setPlan)
				.catch((e: Error) => showToast('error', e.message || 'Không thể tải kế hoạch')),
		[planId],
	);
	useEffect(() => {
		void load();
	}, [load]);
	useRealtimeUpdate('course', load);

	const handleCreate = async (form: CourseFormData) => {
		setSaving(true);
		try {
			const created = await createCourse(form);
			showToast('success', `Đã mở khóa "${created.name}"`);
			// Đi tiếp luồng: sang trang khóa học để ghi danh học viên
			navigate(`/admin/courses/${created.id}`);
		} catch (err) {
			showToast('error', err instanceof Error ? err.message : 'Tạo khóa học thất bại');
			setSaving(false);
		}
	};

	const items = plan?.items ?? [];
	const doneCount = items.filter((i) => i.courses?.some((c) => c.status !== 'cancelled')).length;

	return (
		<>
			<Modal
				open
				onClose={onClose}
				icon={<BarChartSvg />}
				title={plan?.title ?? 'Kế hoạch đào tạo'}
				subtitle={
					plan
						? `Năm ${plan.year} · ${plan.department_name ?? 'Toàn viện'} · ${doneCount}/${items.length} hạng mục đã mở khóa học`
						: undefined
				}
				className={`${styles.modal} ${styles.modalLg}`}
				bodyClassName={styles.modalBody}
				footer={
					plan && (
						<button
							className={styles.btnGhost}
							onClick={() => onEdit(plan)}
						>
							<EditSvg /> Sửa kế hoạch & hạng mục
						</button>
					)
				}
			>
				{!plan ? (
					<InlineLoading />
				) : items.length === 0 ? (
					<div className={styles.emptyItems}>
						Kế hoạch chưa có hạng mục nào. Bấm "Sửa kế hoạch & hạng mục" để thêm.
					</div>
				) : (
					<div className={styles.planItems}>
						{items.map((item) => {
							const trained = item.trainee_count ?? 0;
							const pct = item.target_count ? Math.min(100, Math.round((trained / item.target_count) * 100)) : null;
							return (
								<div
									key={item.id}
									className={styles.planItem}
								>
									<div className={styles.planItemHead}>
										<div className={styles.planItemTitle}>
											{item.title}
											{item.quarter && <span className={styles.quarterBadge}>Quý {item.quarter}</span>}
										</div>
										<Can permission='courses:create'>
											<button
												className={styles.btnSmall}
												onClick={() => setCreatingFor(item)}
											>
												<PlusSvg /> Mở khóa học
											</button>
										</Can>
									</div>
									<div className={styles.planItemMeta}>
										{trained} học viên{item.target_count ? ` / chỉ tiêu ${item.target_count}` : ''}
										{item.note ? ` · ${item.note}` : ''}
									</div>
									{pct != null && (
										<div
											className={styles.progress}
											role='progressbar'
											aria-valuenow={pct}
											aria-valuemin={0}
											aria-valuemax={100}
										>
											<span style={{ width: `${pct}%` }} />
										</div>
									)}
									{item.courses && item.courses.length > 0 ? (
										<div className={styles.courseLinks}>
											{item.courses.map((c) => (
												<button
													key={c.id}
													className={`${styles.courseLink} ${c.status === 'cancelled' ? styles.courseLinkCancelled : ''}`}
													title='Mở khóa học'
													onClick={() => navigate(`/admin/courses/${c.id}`)}
												>
													{c.name} · {c.approved_count} HV
												</button>
											))}
										</div>
									) : (
										<div className={styles.planItemEmpty}>Chưa mở khóa học nào cho hạng mục này.</div>
									)}
								</div>
							);
						})}
					</div>
				)}
			</Modal>

			{creatingFor && (
				<CourseFormModal
					mode='add'
					initial={{ name: creatingFor.title, plan_item_id: creatingFor.id }}
					onClose={() => setCreatingFor(null)}
					onSave={handleCreate}
					loading={saving}
				/>
			)}
		</>
	);
}
