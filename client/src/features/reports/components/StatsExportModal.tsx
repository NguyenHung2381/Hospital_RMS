import { useState } from 'react';
import { AlertSvg, CheckSvg, DownloadSvg } from '@/assets/icons';
import { Modal } from '../../../shared/components/Modal';
import type { StatsExportSection } from '../api/reportApi';
import { STATS_EXPORT_SECTIONS } from '../utils/reportHelpers';
import styles from '../pages/Reports.module.css';

const IcAlert = () => (
	<AlertSvg style={{ width: 13, height: 13, verticalAlign: 'middle', marginRight: 4 }} />
);
const IcCheck = () => <CheckSvg style={{ width: 11, height: 11 }} />;
const IcDownload = () => <DownloadSvg style={{ width: 14, height: 14 }} />;

interface StatsExportModalProps {
	open: boolean;
	onClose: () => void;
	exporting: boolean;
	error: string;
	onExport: (sections: StatsExportSection[]) => void;
}

export function StatsExportModal({
	open,
	onClose,
	exporting,
	error,
	onExport,
}: StatsExportModalProps) {
	const [sections, setSections] = useState<Set<StatsExportSection>>(
		() => new Set(STATS_EXPORT_SECTIONS.map((s) => s.key)),
	);

	const toggle = (key: StatsExportSection, on: boolean) => {
		setSections((prev) => {
			const next = new Set(prev);
			if (on) next.add(key);
			else next.delete(key);
			return next;
		});
	};

	return (
		<Modal
			open={open}
			onClose={onClose}
			title='Xuất Excel thống kê'
			size='md'
			footer={
				<>
					{error && (
						<span
							style={{ fontSize: 12, color: 'var(--color-red-600)', flex: 1 }}
						>
							<IcAlert /> {error}
						</span>
					)}
					<button
						className={styles.fmtBtn}
						onClick={onClose}
						disabled={exporting}
					>
						Huỷ
					</button>
					<button
						className={`${styles.btnExport} ${styles.btnExport_green}`}
						onClick={() => onExport([...sections])}
						disabled={exporting || sections.size === 0}
					>
						{exporting ? (
							<>
								<span className={styles.spinner} /> Đang xuất...
							</>
						) : (
							<>
								<IcDownload /> Xuất Excel
							</>
						)}
					</button>
				</>
			}
		>
			<div className={styles.optSectionLabel}>Chọn nội dung muốn xuất</div>
			<div className={styles.sectionChecks}>
				{STATS_EXPORT_SECTIONS.map((s) => (
					<label
						key={s.key}
						className={`${styles.sectionCheck} ${sections.has(s.key) ? styles.sectionCheckOn : ''}`}
					>
						<input
							type='checkbox'
							className={styles.checkInput}
							checked={sections.has(s.key)}
							onChange={(e) => toggle(s.key, e.target.checked)}
						/>
						<span className={styles.checkBox}>
							{sections.has(s.key) && <IcCheck />}
						</span>
						<span className={styles.sectionCheckLabel}>
							{s.label}
							<span
								style={{
									display: 'block',
									fontSize: 11,
									fontWeight: 400,
									color: 'var(--color-gray-400)',
								}}
							>
								{s.desc}
							</span>
						</span>
					</label>
				))}
			</div>
		</Modal>
	);
}
