import { useState, type ReactNode } from 'react';
import { DownloadSvg, FilePdfSvg, FilterSvg } from '@/assets/icons';
import { Button, Card, Modal } from '@/shared/components';
import { notify } from '@/shared/utils/feedback';
import styles from '../pages/Reports.module.css';

type Job = 'excel' | 'pdf';

interface ReportCardProps {
	icon: ReactNode;
	title: string;
	desc: string;
	onExcel?: () => Promise<void>;
	onPdf?: () => Promise<void>;
	/** Mở hộp thoại tùy chọn (cột, tiêu đề, nội dung…) của báo cáo. */
	onOptions?: () => void;
	/** Lý do không xuất được (vd bộ lọc không còn đề tài nào) — khoá nút xuất. */
	disabledReason?: string;
}

/** Một báo cáo xuất được: tiêu đề, mô tả, nút Excel / PDF / Tùy chọn. */
export function ReportCard({ icon, title, desc, onExcel, onPdf, onOptions, disabledReason }: ReportCardProps) {
	const [busy, setBusy] = useState<Job | null>(null);

	const run = async (job: Job, fn: () => Promise<void>) => {
		setBusy(job);
		try {
			await fn();
		} catch (e) {
			notify.error(e instanceof Error ? e.message : 'Xuất báo cáo thất bại');
		} finally {
			setBusy(null);
		}
	};

	const blocked = !!disabledReason || busy !== null;
	return (
		<Card className={styles.card}>
			<Card.Header
				icon={icon}
				title={title}
			/>
			<div className={styles.cardBody}>
				<p className={styles.cardDesc}>{disabledReason ?? desc}</p>
				<div className={styles.cardActions}>
					{onExcel && (
						<Button
							size='sm'
							icon={<DownloadSvg />}
							loading={busy === 'excel'}
							disabled={blocked}
							onClick={() => void run('excel', onExcel)}
						>
							Excel
						</Button>
					)}
					{onPdf && (
						<Button
							size='sm'
							variant='secondary'
							icon={<FilePdfSvg />}
							loading={busy === 'pdf'}
							disabled={blocked}
							onClick={() => void run('pdf', onPdf)}
						>
							PDF
						</Button>
					)}
					{onOptions && (
						<Button
							size='sm'
							variant='ghost'
							icon={<FilterSvg />}
							onClick={onOptions}
						>
							Tùy chọn
						</Button>
					)}
				</div>
			</div>
		</Card>
	);
}

interface CheckOption<K extends string> {
	key: K;
	label: string;
	desc?: string;
}

/** Hộp thoại tích chọn (cột / phần nội dung) — chọn xong bấm Xong, thẻ báo cáo dùng lựa chọn này. */
export function CheckListModal<K extends string>({
	open,
	title,
	options,
	value,
	onChange,
	onClose,
	grid,
}: {
	open: boolean;
	title: string;
	options: readonly CheckOption<K>[];
	value: Set<K>;
	onChange: (next: Set<K>) => void;
	onClose: () => void;
	grid?: boolean;
}) {
	const toggle = (key: K, on: boolean) => {
		const next = new Set(value);
		if (on) next.add(key);
		else next.delete(key);
		onChange(next);
	};
	return (
		<Modal
			open={open}
			onClose={onClose}
			title={title}
			subtitle={value.size === 0 ? 'Chọn ít nhất 1 mục' : `Đã chọn ${value.size}/${options.length}`}
			size='md'
			footer={
				<Button
					onClick={onClose}
					disabled={value.size === 0}
				>
					Xong
				</Button>
			}
		>
			<div className={grid ? styles.checkGrid : styles.checkList}>
				{options.map((o) => (
					<label
						key={o.key}
						className={styles.checkItem}
					>
						<input
							type='checkbox'
							checked={value.has(o.key)}
							onChange={(e) => toggle(o.key, e.target.checked)}
						/>
						<span>
							{o.label}
							{o.desc && <span className={styles.checkHint}>{o.desc}</span>}
						</span>
					</label>
				))}
			</div>
		</Modal>
	);
}
