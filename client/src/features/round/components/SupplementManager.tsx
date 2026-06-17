import { useState } from 'react';
import { PlusSvg } from '@/assets/icons';
import { closeSupplementWindow, openSupplementWindow } from '../api/roundApi';
import type { ResearchRound } from '../types/round.type';
import styles from '../pages/Round.module.css';

interface SupplementManagerProps {
	round: ResearchRound;
	onDone: (updated: ResearchRound) => void;
}

export function SupplementManager({ round, onDone }: SupplementManagerProps) {
	const isOpen = !!(round.supplement_start_date && round.supplement_end_date);
	const [startDate, setStartDate] = useState('');
	const [endDate, setEndDate] = useState('');
	const [saving, setSaving] = useState(false);
	const [err, setErr] = useState('');

	const handleOpen = async () => {
		if (!startDate || !endDate) {
			setErr('Vui lòng chọn đủ ngày bắt đầu và kết thúc');
			return;
		}
		if (endDate < startDate) {
			setErr('Ngày kết thúc phải sau ngày bắt đầu');
			return;
		}
		setSaving(true);
		setErr('');
		try {
			await openSupplementWindow(round.id, {
				supplement_start: startDate,
				supplement_end: endDate,
			});
			onDone({
				...round,
				supplement_start_date: startDate.split('-').reverse().join('/'),
				supplement_end_date: endDate.split('-').reverse().join('/'),
			});
		} catch {
			setErr('Mở cửa sổ thất bại');
		} finally {
			setSaving(false);
		}
	};

	const handleClose = async () => {
		setSaving(true);
		setErr('');
		try {
			await closeSupplementWindow(round.id);
			onDone({
				...round,
				supplement_start_date: null,
				supplement_end_date: null,
			});
		} catch {
			setErr('Đóng cửa sổ thất bại');
		} finally {
			setSaving(false);
		}
	};

	return (
		<div>
			{err && (
				<div style={{ color: '#A32D2D', fontSize: 12, marginBottom: 8 }}>
					{err}
				</div>
			)}

			{isOpen ? (
				<div>
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 8,
							marginBottom: 10,
							fontSize: 13,
						}}
					>
						<span
							style={{
								background: '#E8F5E9',
								color: '#1B5E20',
								padding: '2px 10px',
								borderRadius: 999,
								fontWeight: 600,
								fontSize: 12,
							}}
						>
							Đang mở
						</span>
						<span style={{ color: 'var(--color-muted)' }}>
							{round.supplement_start_date} → {round.supplement_end_date}
						</span>
					</div>
					<button
						className={styles.btnDanger}
						onClick={() => void handleClose()}
						disabled={saving}
						style={{ fontSize: 12 }}
					>
						{saving && <span className={styles.spinner} />}Đóng cửa sổ bổ sung
					</button>
				</div>
			) : (
				<div>
					<div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
						<div style={{ flex: 1 }}>
							<label
								style={{
									fontSize: 12,
									color: 'var(--color-muted)',
									display: 'block',
									marginBottom: 4,
								}}
							>
								Ngày bắt đầu
							</label>
							<input
								type='date'
								className={styles.formInput}
								value={startDate}
								onChange={(e) => setStartDate(e.target.value)}
							/>
						</div>
						<div style={{ flex: 1 }}>
							<label
								style={{
									fontSize: 12,
									color: 'var(--color-muted)',
									display: 'block',
									marginBottom: 4,
								}}
							>
								Ngày kết thúc
							</label>
							<input
								type='date'
								className={styles.formInput}
								value={endDate}
								onChange={(e) => setEndDate(e.target.value)}
							/>
						</div>
					</div>
					<button
						className={styles.btnPrimary}
						onClick={() => void handleOpen()}
						disabled={saving}
						style={{ fontSize: 12 }}
					>
						{saving ? (
							<span className={styles.spinner} />
						) : (
							<PlusSvg style={{ width: 14, height: 14 }} />
						)}
						Mở cửa sổ bổ sung
					</button>
				</div>
			)}
		</div>
	);
}
