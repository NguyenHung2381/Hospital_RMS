import { useState } from 'react';
import { CheckSvg, KeySvg, PlusSvg, XSvg } from '@/assets/icons';
import type {
	FormErrors,
	ResearchRound,
	RoundForm,
	RoundStatus,
} from '../types/round.type';
import {
	STATUS_CFG,
	STATUS_OPTIONS,
	fromInputDate,
	toInputDate,
} from '../utils/roundHelpers';
import { DeadlineManager, FormField } from './DeadlineManager';
import { SupplementManager } from './SupplementManager';
import styles from '../pages/Round.module.css';

interface RoundModalProps {
	mode: 'create' | 'edit';
	round?: ResearchRound;
	onClose: () => void;
	onSave: (form: RoundForm) => Promise<void>;
	onRoundUpdate?: (r: ResearchRound) => void;
}

export function RoundModal({
	mode,
	round,
	onClose,
	onSave,
	onRoundUpdate,
}: RoundModalProps) {
	const currentYear = new Date().getFullYear();
	const [activeTab, setActiveTab] = useState<'info' | 'advanced'>('info');
	const [form, setForm] = useState<RoundForm>({
		name: round?.name ?? '',
		year: round?.year ?? currentYear,
		dot_so: round?.dot_so ?? 1,
		start_date: round?.start_date ?? '',
		end_date: round?.end_date ?? '',
		registration_start_date: round?.registration_start_date ?? '',
		registration_end_date: round?.registration_end_date ?? '',
		status: round?.status ?? 'draft',
	});
	const [errors, setErrors] = useState<FormErrors>({});
	const [loading, setLoading] = useState(false);
	const [saveError, setSaveError] = useState('');

	const set = <K extends keyof RoundForm>(field: K, val: RoundForm[K]) => {
		setForm((p) => {
			const next = { ...p, [field]: val };
			if (mode === 'create' && (field === 'year' || field === 'dot_so'))
				next.name = `Đợt ${next.dot_so} năm ${next.year}`;
			return next;
		});
		if (errors[field as string])
			setErrors((p) => {
				const n = { ...p };
				delete n[field as string];
				return n;
			});
	};

	const parseDate = (s: string) => {
		if (!s) return null;
		const [d, m, y] = s.split('/').map(Number);
		return new Date(y, m - 1, d);
	};

	const validate = (): boolean => {
		const e: FormErrors = {};
		if (!form.name.trim()) e.name = 'Vui lòng nhập tên đợt';
		if (!form.start_date) e.start_date = 'Vui lòng chọn ngày bắt đầu';
		if (!form.end_date) e.end_date = 'Vui lòng chọn ngày kết thúc';
		const s = parseDate(form.start_date),
			e2 = parseDate(form.end_date);
		if (s && e2 && e2 <= s) e.end_date = 'Ngày kết thúc phải sau ngày bắt đầu';
		const rs = parseDate(form.registration_start_date),
			re = parseDate(form.registration_end_date);
		if (form.registration_start_date && !form.registration_end_date)
			e.registration_end_date = 'Vui lòng nhập ngày kết thúc đăng ký';
		if (!form.registration_start_date && form.registration_end_date)
			e.registration_start_date = 'Vui lòng nhập ngày bắt đầu đăng ký';
		if (rs && re && re < rs)
			e.registration_end_date = 'Ngày kết thúc đăng ký phải sau ngày bắt đầu';
		setErrors(e);
		return Object.keys(e).length === 0;
	};

	const handleSubmit = async () => {
		if (!validate()) {
			setActiveTab('info');
			return;
		}
		setLoading(true);
		setSaveError('');
		try {
			await onSave(form);
		} catch (err) {
			setSaveError(err instanceof Error ? err.message : 'Lưu thất bại');
		} finally {
			setLoading(false);
		}
	};

	const years = Array.from({ length: 6 }, (_, i) => currentYear + 1 - i);

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
						<>
							<div className={styles.formSection}>Thông tin đợt nghiên cứu</div>
							<div className={styles.formRow}>
								<FormField
									id='year'
									label='Năm'
									required
									error={errors.year as string}
								>
									<select
										id='year'
										className={styles.formSelect}
										value={form.year}
										onChange={(e) => set('year', Number(e.target.value))}
									>
										{years.map((y) => (
											<option
												key={y}
												value={y}
											>
												{y}
											</option>
										))}
									</select>
								</FormField>
								<FormField
									id='dot_so'
									label='Số đợt trong năm'
									required
								>
									<select
										id='dot_so'
										className={styles.formSelect}
										value={form.dot_so}
										onChange={(e) => set('dot_so', Number(e.target.value))}
									>
										<option value={1}>Đợt 1</option>
										<option value={2}>Đợt 2</option>
										<option value={3}>Đợt 3</option>
									</select>
								</FormField>
							</div>
							<FormField
								id='name'
								label='Tên đợt nghiên cứu'
								required
								error={errors.name}
								hint='Có thể chỉnh sửa tên tự sinh'
							>
								<input
									id='name'
									className={`${styles.formInput} ${errors.name ? styles.hasError : ''}`}
									placeholder='VD: Đợt 1 năm 2026'
									value={form.name}
									onChange={(e) => set('name', e.target.value)}
								/>
							</FormField>
							<div className={styles.formSection}>Thời gian đăng ký đề tài</div>
							<div className={styles.formRow}>
								<FormField
									id='registration_start_date'
									label='Bắt đầu nhận đăng ký'
									error={errors.registration_start_date}
									hint='Để trống nếu chưa xác định'
								>
									<input
										id='registration_start_date'
										type='date'
										className={`${styles.formInput} ${errors.registration_start_date ? styles.hasError : ''}`}
										value={toInputDate(form.registration_start_date)}
										onChange={(e) =>
											set(
												'registration_start_date',
												fromInputDate(e.target.value),
											)
										}
									/>
								</FormField>
								<FormField
									id='registration_end_date'
									label='Kết thúc nhận đăng ký'
									error={errors.registration_end_date}
								>
									<input
										id='registration_end_date'
										type='date'
										className={`${styles.formInput} ${errors.registration_end_date ? styles.hasError : ''}`}
										value={toInputDate(form.registration_end_date)}
										onChange={(e) =>
											set(
												'registration_end_date',
												fromInputDate(e.target.value),
											)
										}
									/>
								</FormField>
							</div>
							<div className={styles.formSection}>Thời gian thực hiện</div>
							<div className={styles.formRow}>
								<FormField
									id='start_date'
									label='Ngày bắt đầu'
									required
									error={errors.start_date}
								>
									<input
										id='start_date'
										type='date'
										className={`${styles.formInput} ${errors.start_date ? styles.hasError : ''}`}
										value={toInputDate(form.start_date)}
										onChange={(e) =>
											set('start_date', fromInputDate(e.target.value))
										}
									/>
								</FormField>
								<FormField
									id='end_date'
									label='Ngày kết thúc'
									required
									error={errors.end_date}
								>
									<input
										id='end_date'
										type='date'
										className={`${styles.formInput} ${errors.end_date ? styles.hasError : ''}`}
										value={toInputDate(form.end_date)}
										onChange={(e) =>
											set('end_date', fromInputDate(e.target.value))
										}
									/>
								</FormField>
							</div>
							<div className={styles.formSection}>Trạng thái đợt</div>
							<div className={styles.statusSelector}>
								{STATUS_OPTIONS.map(({ value, label, desc }) => {
									const cfg = STATUS_CFG[value];
									return (
										<button
											key={value}
											type='button'
											className={`${styles.statusOption} ${form.status === value ? styles.statusOptionSelected : ''}`}
											onClick={() => set('status', value as RoundStatus)}
										>
											<span
												className={`${styles.badge} ${styles[cfg.cls as keyof typeof styles]}`}
											>
												<span className={styles.badgeDot} />
												{label}
											</span>
											<span className={styles.statusOptionDesc}>{desc}</span>
										</button>
									);
								})}
							</div>
						</>
					)}

					{mode === 'edit' && activeTab === 'advanced' && round && (
						<>
							<div className={styles.formSection}>
								Mã truy cập công khai (public_token)
							</div>
							<div className={styles.tokenInfoBox}>
								<KeySvg />
								<div style={{ flex: 1, minWidth: 0 }}>
									<div style={{ fontSize: 12, marginBottom: 4 }}>
										Token cho phép truy cập không cần đăng nhập:
									</div>
									<div className={styles.tokenCode}>{round.public_token}</div>
								</div>
							</div>
							<div className={styles.formSection}>Hạn nộp báo cáo</div>
							<DeadlineManager roundId={round.id} />
							<div className={styles.formSection}>
								Cửa sổ bổ sung thông tin đề tài
							</div>
							<SupplementManager
								round={round}
								onDone={(updated) => onRoundUpdate?.(updated)}
							/>
							<div className={styles.formSection}>
								Thống kê đề tài trong đợt
							</div>
							<div className={styles.statusInfoRow}>
								<div className={styles.statusInfoItem}>
									<div className={styles.statusInfoVal}>
										{round.topic_total}
									</div>
									<div className={styles.statusInfoLbl}>Tổng đề tài</div>
								</div>
								<div className={styles.statusInfoItem}>
									<div className={styles.statusInfoVal}>
										{round.topic_active}
									</div>
									<div className={styles.statusInfoLbl}>Đang thực hiện</div>
								</div>
								<div className={styles.statusInfoItem}>
									<div className={styles.statusInfoVal}>
										{round.topic_completed}
									</div>
									<div className={styles.statusInfoLbl}>Hoàn thành</div>
								</div>
							</div>
						</>
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
