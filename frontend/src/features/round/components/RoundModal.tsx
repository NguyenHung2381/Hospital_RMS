import { useState } from 'react';
import { CheckSvg, PlusSvg, XSvg } from '@/assets/icons';
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
		<div
			className={styles.modalBackdrop}
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
		>
			<div
				className={styles.modal}
				role='dialog'
				aria-modal='true'
				aria-labelledby='modal-title'
			>
				<div className={styles.modalHeader}>
					<div>
						<h2
							id='modal-title'
							className={styles.modalTitle}
						>
							{mode === 'create'
								? 'Tạo đợt nghiên cứu mới'
								: 'Chỉnh sửa đợt nghiên cứu'}
						</h2>
						<p className={styles.modalSubtitle}>
							{mode === 'create'
								? 'Thiết lập đợt đăng ký và thực hiện đề tài NCKH'
								: `Cập nhật thông tin — ${round?.id}`}
						</p>
					</div>
					<button
						className={styles.modalCloseBtn}
						onClick={onClose}
						aria-label='Đóng'
					>
						<XSvg style={{ width: 14, height: 14 }} />
					</button>
				</div>

				{mode === 'edit' && (
					<div className={styles.modalTabs}>
						<button
							className={`${styles.modalTab} ${activeTab === 'info' ? styles.modalTabActive : ''}`}
							onClick={() => setActiveTab('info')}
						>
							Thông tin chung
						</button>
						<button
							className={`${styles.modalTab} ${activeTab === 'advanced' ? styles.modalTabActive : ''}`}
							onClick={() => setActiveTab('advanced')}
						>
							Cài đặt &amp; Thống kê
						</button>
					</div>
				)}

				<div className={styles.modalBody}>
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
				</div>

				<div className={styles.modalFooter}>
					{saveError && (
						<span style={{ color: '#A32D2D', fontSize: 13, flex: 1 }}>
							{saveError}
						</span>
					)}
					<button
						className={styles.btnSecondary}
						onClick={onClose}
					>
						Huỷ
					</button>
					<button
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
				</div>
			</div>
		</div>
	);
}
