import { useState } from 'react';
import type { SimpleItem } from '../api/topicApi';
import { exportTopicsExcel } from '../api/topicApi';
import styles from '../pages/Topic.module.css';
import type { Topic } from '../types/topic.type';
import { AlertSvg as IcAlert, DownloadSvg as IcDownload, XSvg as IcX } from '@/assets/icons';

interface ExportExcelModalProps {
	topics: Topic[];
	filtered: Topic[];
	categories: SimpleItem[];
	levels: SimpleItem[];
	rounds: SimpleItem[];
	departments: SimpleItem[];
	onClose: () => void;
}

export function ExportExcelModal({
	topics,
	filtered,
	onClose,
}: ExportExcelModalProps) {
	const currentYear = new Date().getFullYear();
	const year = String(currentYear);

	const [scope, setScope] = useState<'filtered' | 'all'>('filtered');
	const [fileName, setFileName] = useState(`lich-bao-ve-de-tai-${year}`);
	const [refNumber, setRefNumber] = useState('');
	const [refDate, setRefDate] = useState('');
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const [customTitle, setCustomTitle] = useState(
		`LỊCH BẢO VỆ ĐỀ CƯƠNG SÁNG KIẾN, ĐỀ TÀI NGHIÊN CỨU KHOA HỌC CẤP CƠ SỞ NĂM ${year}`,
	);
	const [customSubtitle, setCustomSubtitle] = useState(
		`(Danh sách đề tài nghiên cứu khoa học cấp cơ sở năm ${year})`,
	);

	const exportData = scope === 'all' ? topics : filtered;

	const handleExport = async () => {
		setLoading(true);
		setError('');
		try {
			const blob = await exportTopicsExcel({
				ids: exportData.map((t) => t.id),
				fileName: fileName.trim() || `lich-bao-ve-de-tai-${year}`,
				customTitle,
				customSubtitle,
				refNumber,
				refDate,
			});
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `${fileName.trim() || `lich-bao-ve-de-tai-${year}`}.xlsx`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
			onClose();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Lỗi xuất file Excel');
			setLoading(false);
		}
	};

	return (
		<div
			className={styles.modalBackdrop}
			onClick={(e) => {
				if (e.target === e.currentTarget && !loading) onClose();
			}}
		>
			<div
				className={styles.modal}
				style={{ maxWidth: 480 }}
				role='dialog'
				aria-modal='true'
				aria-labelledby='export-title'
			>
				{/* Header */}
				<div className={styles.modalHeader}>
					<div>
						<h2
							id='export-title'
							className={styles.modalTitle}
						>
							Xuất Excel
						</h2>
						<p className={styles.modalSubtitle}>
							Lịch bảo vệ đề tài — theo mẫu bệnh viện
						</p>
					</div>
					<button
						className={styles.modalCloseBtn}
						onClick={onClose}
						disabled={loading}
						aria-label='Đóng'
					>
						<IcX />
					</button>
				</div>

				<div className={styles.modalBody}>
					{/* ── TIÊU ĐỀ TÙY CHỈNH ── */}
					<div className={styles.formSection}>Tiêu đề văn bản</div>

					<div className={styles.formGroup}>
						<label className={styles.formLabel}>Dòng tiêu đề chính</label>
						<textarea
							className={styles.formInput}
							value={customTitle}
							onChange={(e) => setCustomTitle(e.target.value)}
							rows={2}
							style={{
								resize: 'vertical',
								fontFamily: 'inherit',
								fontSize: 13,
							}}
						/>
					</div>
					<div
						className={styles.formGroup}
						style={{ marginTop: 8 }}
					>
						<label className={styles.formLabel}>
							Dòng phụ đề{' '}
							<span className={styles.formHint}>(in nghiêng bên dưới)</span>
						</label>
						<textarea
							className={styles.formInput}
							value={customSubtitle}
							onChange={(e) => setCustomSubtitle(e.target.value)}
							rows={2}
							style={{
								resize: 'vertical',
								fontFamily: 'inherit',
								fontSize: 13,
							}}
						/>
					</div>

					{/* ── THÔNG TIN VĂN BẢN ── */}
					<div
						className={styles.formSection}
						style={{ marginTop: 'var(--space-3)' }}
					>
						Thông tin văn bản{' '}
						<span className={styles.formHint}>(tuỳ chọn)</span>
					</div>
					<div className={styles.formRow}>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Số thông báo</label>
							<input
								className={styles.formInput}
								value={refNumber}
								onChange={(e) => setRefNumber(e.target.value)}
								placeholder='VD: 38'
							/>
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Ngày thông báo</label>
							<input
								className={styles.formInput}
								value={refDate}
								onChange={(e) => setRefDate(e.target.value)}
								placeholder='VD: 16/01/2026'
							/>
						</div>
					</div>

					{/* ── PHẠM VI ── */}
					<div
						className={styles.formSection}
						style={{ marginTop: 'var(--space-3)' }}
					>
						Phạm vi xuất
					</div>
					<div style={{ display: 'flex', gap: 8 }}>
						{(
							[
								{
									value: 'filtered',
									label: 'Danh sách đang lọc',
									count: filtered.length,
								},
								{ value: 'all', label: 'Tất cả đề tài', count: topics.length },
							] as const
						).map((opt) => (
							<button
								key={opt.value}
								type='button'
								onClick={() => setScope(opt.value)}
								style={{
									flex: 1,
									display: 'flex',
									flexDirection: 'column',
									alignItems: 'flex-start',
									gap: 2,
									padding: '10px 14px',
									borderRadius: 8,
									fontSize: 13,
									fontWeight: 600,
									cursor: 'pointer',
									transition: 'all 0.15s',
									border:
										scope === opt.value
											? '2px solid var(--color-primary)'
											: '2px solid var(--color-gray-200)',
									background:
										scope === opt.value
											? 'var(--color-primary-light, #f0fdf4)'
											: 'var(--color-white)',
									color:
										scope === opt.value
											? 'var(--color-primary-dark)'
											: 'var(--color-gray-700)',
								}}
							>
								<span>{opt.label}</span>
								<span
									style={{
										fontSize: 12,
										fontWeight: 400,
										color: 'var(--color-gray-400)',
									}}
								>
									{opt.count} đề tài
								</span>
							</button>
						))}
					</div>

					{/* ── TÊN FILE ── */}
					<div
						className={styles.formSection}
						style={{ marginTop: 'var(--space-3)' }}
					>
						Tên file
					</div>
					<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
						<input
							className={styles.formInput}
							value={fileName}
							onChange={(e) => setFileName(e.target.value)}
							maxLength={80}
						/>
						<span
							style={{
								fontSize: 13,
								color: 'var(--color-gray-400)',
								whiteSpace: 'nowrap',
							}}
						>
							.xlsx
						</span>
					</div>

					{/* Preview */}
					<div
						style={{
							marginTop: 'var(--space-3)',
							padding: '10px 12px',
							background: 'var(--color-gray-50)',
							border: '1px solid var(--color-gray-200)',
							borderRadius: 8,
							fontSize: 12,
							color: 'var(--color-gray-500)',
							lineHeight: 1.5,
						}}
					>
						Sẽ xuất{' '}
						<strong style={{ color: 'var(--color-gray-700)' }}>
							{exportData.length} đề tài
						</strong>{' '}
						— file được tạo trên server và tải về trực tiếp.
					</div>
				</div>

				{/* Footer */}
				<div className={styles.modalFooter}>
					{error && (
						<span
							style={{ fontSize: 12, color: 'var(--color-red-600)', flex: 1 }}
						>
							<IcAlert /> {error}
						</span>
					)}
					<button
						className={styles.btnSecondary}
						onClick={onClose}
						disabled={loading}
					>
						Huỷ
					</button>
					<button
						className={styles.btnPrimary}
						onClick={handleExport}
						disabled={loading || exportData.length === 0}
					>
						{loading ? (
							<>
								<span className={styles.spinner} />
								Đang xuất...
							</>
						) : (
							<>
								<IcDownload />
								Tải xuống
							</>
						)}
					</button>
				</div>
			</div>
		</div>
	);
}
