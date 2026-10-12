import { useEffect, useState } from 'react';
import { DocPlusSvg } from '@/assets/icons';
import { getUnassignedTopics } from '../api/councilApi';
import type { Council, CouncilTopic } from '../types/council.type';
import { InlineLoading, Modal, ModalActions } from '@/shared/components';
import styles from '../pages/Council.module.css';

export function AssignTopicsModal({
	council,
	onClose,
	onSave,
	loading,
}: {
	council: Council;
	onClose: () => void;
	onSave: (topicIds: string[]) => void;
	loading: boolean;
}) {
	const [topics, setTopics] = useState<CouncilTopic[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [error, setError] = useState('');

	useEffect(() => {
		getUnassignedTopics(council.round_id)
			.then(setTopics)
			.catch(() => setError('Không thể tải danh sách đề tài'))
			.finally(() => setIsLoading(false));
	}, [council.round_id]);

	const toggle = (id: string) => {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	const handleSave = () => {
		if (selected.size === 0) {
			setError('Vui lòng chọn ít nhất một đề tài');
			return;
		}
		onSave([...selected]);
	};

	return (
		<Modal
			open
			onClose={onClose}
			icon={<DocPlusSvg />}
			title='Gán đề tài vào hội đồng'
			subtitle={council.name}
			className={styles.modal}
			bodyClassName={styles.modalBody}
			footer={
				<ModalActions
					onCancel={onClose}
					onConfirm={handleSave}
					loading={loading}
					disabled={topics.length === 0}
					confirmLabel={<>Gán {selected.size > 0 ? `(${selected.size})` : ''}</>}
				/>
			}
		>
			{isLoading ? (
				<InlineLoading label='Đang tải…' />
			) : topics.length === 0 ? (
				<div className={styles.emptyState}>
					<div className={styles.emptyDesc}>
						Không còn đề tài nào chưa gán trong đợt này.
					</div>
				</div>
			) : (
				<div className={styles.checkList}>
					{topics.map((t) => (
						<label
							key={t.id}
							className={styles.checkRow}
						>
							<input
								type='checkbox'
								checked={selected.has(t.id)}
								onChange={() => toggle(t.id)}
							/>
							<div style={{ minWidth: 0 }}>
								<div className={styles.topicTitle}>{t.title}</div>
								<div className={styles.topicDept}>
									{t.department_name ?? ''}
								</div>
							</div>
						</label>
					))}
				</div>
			)}
			{error && <div className={styles.fieldError}>{error}</div>}
		</Modal>
	);
}
