import { useState } from 'react';
import { CheckSvg, PlusSvg } from '@/assets/icons';
import { Modal } from '@/shared/components';
import type { ResearchRound, RoundForm, RoundType } from '../types/round.type';
import { useRoundModalForm } from '../hooks/useRoundModalForm';
import { RoundAdvancedTab } from './RoundAdvancedTab';
import { RoundInfoTab } from './RoundInfoTab';
import styles from '../pages/Round.module.css';

interface RoundModalProps {
	mode: 'create' | 'edit';
	round?: ResearchRound;
	rounds: ResearchRound[];
	roundTypes: RoundType[];
	onClose: () => void;
	onSave: (form: RoundForm) => Promise<void>;
}

export function RoundModal({
	mode,
	round,
	rounds,
	roundTypes,
	onClose,
	onSave,
}: RoundModalProps) {
	const [activeTab, setActiveTab] = useState<'info' | 'advanced'>('info');
	const { form, errors, loading, saveError, set, duplicateRound, handleSubmit, years } =
		useRoundModalForm({
			round,
			rounds,
			roundTypes,
			onSave,
			onSubmitInvalid: () => setActiveTab('info'),
		});

	return (
		<Modal
			open
			onClose={onClose}
			title={mode === 'create' ? 'Tạo đợt nghiên cứu mới' : 'Chỉnh sửa đợt nghiên cứu'}
			subtitle={
				mode === 'create'
					? 'Thiết lập đợt đăng ký và thực hiện đề tài NCKH'
					: `Cập nhật thông tin — ${round?.id}`
			}
			size='lg'
			bodyClassName={styles.modalBody}
			footer={
				<>
					{saveError && (
						<span
							role='alert'
							style={{ color: 'var(--tone-red-fg)', fontSize: 13, flex: 1 }}
						>
							{saveError}
						</span>
					)}
					<button
						type='button'
						className={styles.btnSecondary}
						onClick={onClose}
					>
						Hủy
					</button>
					<button
						type='button'
						className={styles.btnPrimary}
						onClick={() => void handleSubmit()}
						disabled={loading}
					>
						{loading ? (
							<>
								<span className={styles.spinner} />
								Đang lưu...
							</>
						) : mode === 'create' ? (
							<>
								<PlusSvg style={{ width: 14, height: 14 }} />
								Tạo đợt nghiên cứu
							</>
						) : (
							<>
								<CheckSvg style={{ width: 14, height: 14 }} />
								Lưu thay đổi
							</>
						)}
					</button>
				</>
			}
		>
			{mode === 'edit' && (
				<div
					className={`${styles.modalTabs} ${styles.modalTabsFlush}`}
					role='tablist'
					aria-label='Nội dung đợt nghiên cứu'
				>
					<button
						type='button'
						role='tab'
						aria-selected={activeTab === 'info'}
						className={`${styles.modalTab} ${activeTab === 'info' ? styles.modalTabActive : ''}`}
						onClick={() => setActiveTab('info')}
					>
						Thông tin chung
					</button>
					<button
						type='button'
						role='tab'
						aria-selected={activeTab === 'advanced'}
						className={`${styles.modalTab} ${activeTab === 'advanced' ? styles.modalTabActive : ''}`}
						onClick={() => setActiveTab('advanced')}
					>
						Cài đặt &amp; Thống kê
					</button>
				</div>
			)}

			{(mode === 'create' || activeTab === 'info') && (
				<RoundInfoTab
					form={form}
					errors={errors}
					set={set}
					duplicateRound={duplicateRound}
					years={years}
					roundTypes={roundTypes}
					showDeadlines={mode === 'create'}
				/>
			)}

			{mode === 'edit' && activeTab === 'advanced' && round && (
				<RoundAdvancedTab round={round} />
			)}
		</Modal>
	);
}
