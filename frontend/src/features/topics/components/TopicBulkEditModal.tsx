import { Modal } from '@/shared/components';
import { useState } from 'react';
import { CheckSvg as IcCheck } from '@/assets/icons';
import styles from '../pages/Topic.module.css';
import type { SimpleItem } from '../api/topicApi';
import type { TopicBulkPatch } from '../hooks/useTopicPage';
import type { TopicStatus } from '../types/topic.type';
import { STATUS_CFG } from '../utils/topicHelpers';

export function TopicBulkEditModal({
	count,
	categories,
	levels,
	departments,
	loading,
	onClose,
	onSave,
}: {
	count: number;
	categories: SimpleItem[];
	levels: SimpleItem[];
	departments: SimpleItem[];
	loading: boolean;
	onClose: () => void;
	onSave: (patch: TopicBulkPatch) => void;
}) {
	const [status, setStatus] = useState<TopicStatus | ''>('');
	const [categoryId, setCategoryId] = useState('');
	const [levelId, setLevelId] = useState('');
	const [departmentId, setDepartmentId] = useState('');

	// Chỉ gửi trường được chọn — trường "Giữ nguyên" không đụng tới
	const patch: TopicBulkPatch = {
		...(status ? { status } : {}),
		...(categoryId ? { category_id: categoryId } : {}),
		...(levelId ? { level_id: levelId } : {}),
		...(departmentId ? { department_id: departmentId } : {}),
	};
	const hasChange = Object.keys(patch).length > 0;

	return (
		<Modal
			open
			onClose={onClose}
			title='Sửa đồng loạt'
			subtitle={<>{count} đề tài đã chọn</>}
			className={styles.modal}
			bodyClassName={styles.modalBody}
			footer={
				<>
					<button
						className={styles.btnSecondary}
						onClick={onClose}
						disabled={loading}
					>
						Huỷ
					</button>
					<button
						className={styles.btnPrimary}
						onClick={() => onSave(patch)}
						disabled={loading || !hasChange}
					>
						{loading ? (
							<>
								<span className={styles.spinner} />
								Đang lưu...
							</>
						) : (
							<>
								<IcCheck />
								Áp dụng cho {count} đề tài
							</>
						)}
					</button>
				</>
			}
		>
			<p className={styles.modalSubtitle} style={{ marginTop: 0 }}>
				Trường để "Giữ nguyên" sẽ không bị ghi đè.
			</p>
			<div className={styles.formRow}>
				<label>
					<div className={styles.formSection}>Trạng thái</div>
					<select
						className={styles.formSelect}
						value={status}
						onChange={(e) => setStatus(e.target.value as TopicStatus | '')}
					>
						<option value=''>— Giữ nguyên —</option>
						{(Object.keys(STATUS_CFG) as TopicStatus[]).map((s) => (
							<option
								key={s}
								value={s}
							>
								{STATUS_CFG[s].label}
							</option>
						))}
					</select>
				</label>
				<label>
					<div className={styles.formSection}>Phân loại</div>
					<select
						className={styles.formSelect}
						value={categoryId}
						onChange={(e) => setCategoryId(e.target.value)}
					>
						<option value=''>— Giữ nguyên —</option>
						{categories.map((c) => (
							<option
								key={c.id}
								value={c.id}
							>
								{c.name}
							</option>
						))}
					</select>
				</label>
			</div>
			<div className={styles.formRow}>
				<label>
					<div className={styles.formSection}>Cấp độ</div>
					<select
						className={styles.formSelect}
						value={levelId}
						onChange={(e) => setLevelId(e.target.value)}
					>
						<option value=''>— Giữ nguyên —</option>
						{levels.map((l) => (
							<option
								key={l.id}
								value={l.id}
							>
								{l.name}
							</option>
						))}
					</select>
				</label>
				<label>
					<div className={styles.formSection}>Khoa / Phòng</div>
					<select
						className={styles.formSelect}
						value={departmentId}
						onChange={(e) => setDepartmentId(e.target.value)}
					>
						<option value=''>— Giữ nguyên —</option>
						{departments.map((dp) => (
							<option
								key={dp.id}
								value={dp.id}
							>
								{dp.name}
							</option>
						))}
					</select>
				</label>
			</div>
		</Modal>
	);
}
