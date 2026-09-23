import { useState } from 'react';
import { XSvg } from '@/assets/icons';
import { COLOR_PRESETS, type ColorPickerState } from '../types/schedule.type';
import styles from './ColorPickerPopup.module.css';

interface Props {
	state: ColorPickerState;
	onClose: () => void;
}

export function ColorPickerPopup({ state, onClose }: Props) {
	const [color, setColor] = useState(state.current);

	return (
		<div
			className={styles.colorPicker}
			style={{ left: state.x, top: state.y }}
			onClick={(e) => e.stopPropagation()}
			onContextMenu={(e) => e.preventDefault()}
		>
			<div className={styles.head}>
				<span className={styles.title}>{state.label}</span>
				<button className={styles.closeBtn} onClick={onClose} aria-label='Đóng'>
					<XSvg style={{ width: 12, height: 12 }} />
				</button>
			</div>

			<div className={styles.presets}>
				{COLOR_PRESETS.map((c) => (
					<button
						key={c}
						className={`${styles.swatch}${c === color ? ` ${styles.swatchActive}` : ''}`}
						style={{ background: c }}
						onClick={() => setColor(c)}
						title={c}
					/>
				))}
			</div>

			<div className={styles.inputRow}>
				<input
					type='color'
					value={color}
					onChange={(e) => setColor(e.target.value)}
					className={styles.colorInput}
					title='Chọn màu tùy chỉnh'
				/>
				<span className={styles.colorHex}>{color}</span>
			</div>

			<div className={styles.foot}>
				<button className={styles.btnSecondary} onClick={onClose}>Hủy</button>
				<button
					className={styles.btnPrimary}
					onClick={() => { state.onApply(color); onClose(); }}
				>
					Áp dụng
				</button>
			</div>
		</div>
	);
}
