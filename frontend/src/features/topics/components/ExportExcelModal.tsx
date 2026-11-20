import { useId, useState } from 'react';
import type { SimpleItem } from '../api/topicApi';
import { exportTopicsExcel } from '../api/topicApi';
import styles from '../pages/Topic.module.css';
import { AlertSvg as IcAlert, DownloadSvg as IcDownload } from '@/assets/icons';
import { Modal } from '@/shared/components';

interface ExportExcelModalProps {
	totalCount: number;
	filteredCount: number;
	/** Lấy id theo phạm vi ngay lúc xuất — không giữ cả bảng trong bộ nhớ */
	fetchExportIds: (scope: 'filtered' | 'all') => Promise<string[]>;
	categories: SimpleItem[];
	levels: SimpleItem[];
	rounds: SimpleItem[];
	departments: SimpleItem[];
	onClose: () => void;
}

export function ExportExcelModal({
	totalCount,
	filteredCount,
	fetchExportIds,
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

	const uid = useId();
	const exportCount = scope === 'all' ? totalCount : filteredCount;

	const handleExport = async () => {
		setLoading(true);
		setError('');
		try {
			const ids = await fetchExportIds(scope);
			const blob = await exportTopicsExcel({
				ids,
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

	// Đang xuất thì không cho đóng (Esc, bấm nền, nút X).
	const requestClose = () => {
		if (!loading) onClose();
	};

	return (
		<Modal
			open
			onClose={requestClose}
			title='Xuất Excel'
			subtitle='Lịch bảo vệ đề tài — theo mẫu bệnh viện'
			closeOnBackdrop={!loading}
			bodyClassName={styles.modalBody}
			footer={
				<>
					{error && (
						<span
							role='alert'
							style={{ fontSize: 12, color: 'var(--tone-red-fg)', flex: 1 }}
						>
							<IcAlert /> {error}
						</span>
					)}
					<button
						type='button'
						className={styles.btnSecondary}
						onClick={onClose}
						disabled={loading}
					>
						Hủy
					</button>
					<button
						type='button'
						className={styles.btnPrimary}
						onClick={handleExport}
						disabled={loading || exportCount === 0}
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
				</>
			}
		>
			{/* ── TIÊU ĐỀ TÙY CHỈNH ── */}
			<div className={styles.formSection}>Tiêu đề văn bản</div>

			<div className={styles.formGroup}>
				<label
					className={styles.formLabel}
					htmlFor={`${uid}-title`}
				>
					Dòng tiêu đề chính
				</label>
				<textarea
					id={`${uid}-title`}
					className={styles.formInput}
					value={customTitle}
					onChange={(e) => setCustomTitle(e.target.value)}
					rows={2}
					style={{
						resize: 'vertical',
						fontFamily: 'inherit',
						fontSize: 14,
					}}
				/>
			</div>
			<div
				className={styles.formGroup}
				style={{ marginTop: 8 }}
			>
				<label
					className={styles.formLabel}
					htmlFor={`${uid}-f1`}
				>
					Dòng phụ đề{' '}
					<span className={styles.formHint}>(in nghiêng bên dưới)</span>
				</label>
				<textarea
					id={`${uid}-f1`}
					className={styles.formInput}
					value={customSubtitle}
					onChange={(e) => setCustomSubtitle(e.target.value)}
					rows={2}
					style={{
						resize: 'vertical',
						fontFamily: 'inherit',
						fontSize: 14,
					}}
				/>
			</div>

			{/* ── THÔNG TIN VĂN BẢN ── */}
			<div
				className={styles.formSection}
				style={{ marginTop: 'var(--space-3)' }}
			>
				Thông tin văn bản{' '}
				<span className={styles.formHint}>(tùy chọn)</span>
			</div>
			<div className={styles.formRow}>
				<div className={styles.formGroup}>
					<label
						className={styles.formLabel}
						htmlFor={`${uid}-f2`}
					>
						Số thông báo
					</label>
					<input
						id={`${uid}-f2`}
						className={styles.formInput}
						value={refNumber}
						onChange={(e) => setRefNumber(e.target.value)}
						placeholder='Ví dụ: 38'
					/>
				</div>
				<div className={styles.formGroup}>
					<label
						className={styles.formLabel}
						htmlFor={`${uid}-f3`}
					>
						Ngày thông báo
					</label>
					<input
						id={`${uid}-f3`}
						className={styles.formInput}
						value={refDate}
						onChange={(e) => setRefDate(e.target.value)}
						placeholder='Ví dụ: 16/01/2026'
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
							count: filteredCount,
						},
						{ value: 'all', label: 'Tất cả đề tài', count: totalCount },
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
							gap: 4,
							padding: '14px 18px',
							borderRadius: 12,
							fontSize: 14,
							fontWeight: 600,
							cursor: 'pointer',
							transition: 'all 0.2s ease',
							border:
								scope === opt.value
									? '2px solid var(--color-primary)'
									: '2px solid var(--color-gray-200)',
							background:
								scope === opt.value
									? 'var(--color-primary-pale)'
									: 'var(--color-white)',
							color:
								scope === opt.value
									? 'var(--color-gray-900)'
									: 'var(--color-gray-700)',
							boxShadow:
								scope === opt.value
									? '0 4px 12px rgba(10, 155, 74, 0.12)'
									: 'none',
						}}
					>
						<span style={{ fontSize: 15, fontWeight: 700 }}>{opt.label}</span>
						<span
							style={{
								fontSize: 13,
								fontWeight: 500,
								color:
									scope === opt.value
										? 'var(--color-primary-dark)'
										: 'var(--color-gray-500)',
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
					aria-label='Tên file xuất'
					className={styles.formInput}
					value={fileName}
					onChange={(e) => setFileName(e.target.value)}
					maxLength={80}
				/>
				<span
					style={{
						fontSize: 14,
						color: 'var(--color-gray-500)',
						whiteSpace: 'nowrap',
						fontWeight: 500,
					}}
				>
					.xlsx
				</span>
			</div>

			{/* Preview */}
			<div
				style={{
					marginTop: 'var(--space-3)',
					padding: '12px 16px',
					background: 'var(--color-gray-50)',
					border: '1px solid var(--color-gray-200)',
					borderRadius: 10,
					fontSize: 13.5,
					color: 'var(--color-gray-600)',
					lineHeight: 1.5,
				}}
			>
				Sẽ xuất{' '}
				<strong style={{ color: 'var(--color-gray-800)' }}>
					{exportCount} đề tài
				</strong>{' '}
				— file được tạo trên server và tải về trực tiếp.
			</div>
		</Modal>
	);
}
