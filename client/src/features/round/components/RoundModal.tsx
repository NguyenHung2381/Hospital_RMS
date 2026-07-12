import { useState } from 'react';
import {
	ActivitySvg,
	CheckCircleSvg,
	CheckSvg,
	ClipboardSvg,
	CopySvg,
	KeySvg,
	LinkSvg,
	PlusSvg,
	XSvg,
} from '@/assets/icons';
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
import styles from '../pages/Round.module.css';

interface RoundModalProps {
	mode: 'create' | 'edit';
	round?: ResearchRound;
	rounds: ResearchRound[];
	onClose: () => void;
	onSave: (form: RoundForm) => Promise<void>;
}

export function RoundModal({
	mode,
	round,
	rounds,
	onClose,
	onSave,
}: RoundModalProps) {
	const currentYear = new Date().getFullYear();
	const [activeTab, setActiveTab] = useState<'info' | 'advanced'>('info');
	const [form, setForm] = useState<RoundForm>({
		name: round?.name ?? '',
		year: round?.year ?? currentYear,
		round_number: round?.round_number ?? 1,
		start_date: round?.start_date ?? '',
		end_date: round?.end_date ?? '',
		status: round?.status ?? 'draft',
	});
	const [errors, setErrors] = useState<FormErrors>({});
	const [loading, setLoading] = useState(false);
	const [saveError, setSaveError] = useState('');

	const [tokenCopied, setTokenCopied] = useState(false);
	const [linkCopied, setLinkCopied] = useState(false);

	const handleCopyToken = async (token: string) => {
		try {
			await navigator.clipboard.writeText(token);
			setTokenCopied(true);
			setTimeout(() => setTokenCopied(false), 2000);
		} catch (err) {
			console.error('Copy failed', err);
		}
	};

	const handleCopyLink = async (token: string) => {
		try {
			const link = `${window.location.origin}/portal?token=${token}`;
			await navigator.clipboard.writeText(link);
			setLinkCopied(true);
			setTimeout(() => setLinkCopied(false), 2000);
		} catch (err) {
			console.error('Copy failed', err);
		}
	};

	const set = <K extends keyof RoundForm>(field: K, val: RoundForm[K]) => {
		setForm((p) => {
			const next = { ...p, [field]: val };
			if (mode === 'create' && (field === 'year' || field === 'round_number'))
				next.name = `Đợt ${next.round_number} năm ${next.year}`;
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

	const duplicateRound = rounds.find(
		(r) =>
			r.id !== round?.id &&
			r.year === form.year &&
			r.round_number === form.round_number
	);

	const validate = (): boolean => {
		const e: FormErrors = {};
		if (!form.name.trim()) e.name = 'Vui lòng nhập tên đợt';
		if (!form.start_date) e.start_date = 'Vui lòng chọn ngày bắt đầu';
		if (!form.end_date) e.end_date = 'Vui lòng chọn ngày kết thúc';
		const s = parseDate(form.start_date),
			e2 = parseDate(form.end_date);
		if (s && e2 && e2 <= s) e.end_date = 'Ngày kết thúc phải sau ngày bắt đầu';
		if (duplicateRound)
			e.round_number = `Đợt ${form.round_number} năm ${form.year} đã tồn tại`;
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
									id='round_number'
									label='Số đợt trong năm'
									required
									error={
										duplicateRound
											? `Đợt ${form.round_number} năm ${form.year} đã tồn tại`
											: errors.round_number
									}
								>
									<input
										id='round_number'
										type='number'
										min={1}
										max={99}
										className={`${styles.formInput} ${duplicateRound ? styles.hasError : ''}`}
										value={form.round_number}
										onChange={(e) => set('round_number', Number(e.target.value))}
									/>
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

					{mode === 'edit' && activeTab === 'advanced' && round && (() => {
						const topicTotal = round.topic_total || 0;
						const topicActive = round.topic_active || 0;
						const topicCompleted = round.topic_completed || 0;
						const topicOther = Math.max(0, topicTotal - topicActive - topicCompleted);

						const activePct = topicTotal ? Math.round((topicActive / topicTotal) * 100) : 0;
						const completedPct = topicTotal ? Math.round((topicCompleted / topicTotal) * 100) : 0;
						const otherPct = topicTotal ? Math.round((topicOther / topicTotal) * 100) : 0;

						return (
							<>
								<div className={styles.formSection}>
									Mã truy cập &amp; Liên kết đăng ký công khai
								</div>
								
								<div className={styles.tokenAccessCard}>
									<div className={styles.tokenHeader}>
										<KeySvg />
										<span>Cài đặt bảo mật &amp; Truy cập công khai</span>
									</div>
									<div className={styles.tokenBody}>
										<span className={styles.tokenWarningText}>
											Cung cấp mã khóa này hoặc liên kết trực tiếp cho các khoa/phòng để họ có thể tự đăng ký đề tài nghiên cứu mà không cần phải có tài khoản hệ thống.
										</span>
										<div className={styles.tokenRow}>
											<div className={styles.tokenValueBox} title="Mã token">
												{round.public_token}
											</div>
											<button
												type="button"
												className={`${styles.btnCopy} ${tokenCopied ? styles.btnCopySuccess : ''}`}
												onClick={() => void handleCopyToken(round.public_token)}
											>
												{tokenCopied ? (
													<>
														<CheckSvg style={{ width: 14, height: 14 }} />
														<span>Đã chép!</span>
													</>
												) : (
													<>
														<CopySvg style={{ width: 14, height: 14 }} />
														<span>Sao chép mã</span>
													</>
												)}
											</button>
										</div>
										<div className={styles.tokenRow}>
											<div className={styles.tokenValueBox} title="Đường dẫn đăng ký đề tài">
												{`${window.location.origin}/portal?token=${round.public_token}`}
											</div>
											<button
												type="button"
												className={`${styles.btnCopy} ${linkCopied ? styles.btnCopySuccess : ''}`}
												onClick={() => void handleCopyLink(round.public_token)}
											>
												{linkCopied ? (
													<>
														<CheckSvg style={{ width: 14, height: 14 }} />
														<span>Đã chép!</span>
													</>
												) : (
													<>
														<LinkSvg style={{ width: 14, height: 14 }} />
														<span>Sao chép liên kết</span>
													</>
												)}
											</button>
										</div>
									</div>
								</div>

								<div className={styles.formSection}>Mốc thời gian &amp; Hạn nộp</div>
								<DeadlineManager roundId={round.id} />

								<div className={styles.formSection}>
									Thống kê đề tài trong đợt
								</div>

								<div className={styles.modalStatsGrid}>
									<div className={`${styles.modalStatCard} ${styles.total}`}>
										<div className={styles.modalStatIcon}>
											<ClipboardSvg />
										</div>
										<div className={styles.modalStatBody}>
											<div className={styles.modalStatValue}>{topicTotal}</div>
											<div className={styles.modalStatLabel}>Tổng đề tài</div>
										</div>
									</div>
									
									<div className={`${styles.modalStatCard} ${styles.active}`}>
										<div className={styles.modalStatIcon}>
											<ActivitySvg />
										</div>
										<div className={styles.modalStatBody}>
											<div className={styles.modalStatValue}>{topicActive}</div>
											<div className={styles.modalStatLabel}>Đang chạy</div>
										</div>
									</div>

									<div className={`${styles.modalStatCard} ${styles.completed}`}>
										<div className={styles.modalStatIcon}>
											<CheckCircleSvg />
										</div>
										<div className={styles.modalStatBody}>
											<div className={styles.modalStatValue}>{topicCompleted}</div>
											<div className={styles.modalStatLabel}>Hoàn thành</div>
										</div>
									</div>
								</div>

								<div className={styles.progressSection}>
									<div className={styles.progressHeader}>
										<span className={styles.progressTitle}>Tỷ lệ hoàn thành đề tài</span>
										<span className={styles.progressPercent}>
											{topicTotal ? Math.round((topicCompleted / topicTotal) * 100) : 0}%
										</span>
									</div>
									
									<div className={styles.segmentedProgressTrack}>
										<div 
											className={`${styles.progressSegment} ${styles.segmentCompleted}`} 
											style={{ width: `${completedPct}%` }}
											title={`Hoàn thành: ${completedPct}%`}
										/>
										<div 
											className={`${styles.progressSegment} ${styles.segmentActive}`} 
											style={{ width: `${activePct}%` }}
											title={`Đang thực hiện: ${activePct}%`}
										/>
										<div 
											className={`${styles.progressSegment} ${styles.segmentOther}`} 
											style={{ width: `${otherPct}%` }}
											title={`Trạng thái khác: ${otherPct}%`}
										/>
									</div>

									<div className={styles.progressLegend}>
										<div className={styles.legendItem}>
											<span className={styles.legendDot} style={{ background: '#10b981' }} />
											<span>Hoàn thành ({topicCompleted})</span>
										</div>
										<div className={styles.legendItem}>
											<span className={styles.legendDot} style={{ background: '#3b82f6' }} />
											<span>Đang thực hiện ({topicActive})</span>
										</div>
										{topicOther > 0 && (
											<div className={styles.legendItem}>
												<span className={styles.legendDot} style={{ background: '#9ca3af' }} />
												<span>Khác ({topicOther})</span>
											</div>
										)}
									</div>
								</div>
							</>
						);
					})()}
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
