import { useState } from 'react';
import { cx } from '../../../shared/utils/cx';
import s from '../pages/FormConfigs.module.css';
import { parseChoices } from '../utils/formConfigHelpers';

const MAX_CHOICES = 100;

/**
 * Chọn kiểu nhập của ô chữ: gõ tự do, hay chọn trong danh sách admin đặt (mỗi dòng
 * một lựa chọn). Giá trị lưu vẫn là đúng chữ đã chọn nên dữ liệu cũ không hỏng.
 */
export function ChoicesEditor({
	choices,
	maxLength,
	onChange,
}: {
	choices: string[] | undefined;
	/** Độ dài tối đa của cột dữ liệu */
	maxLength: number;
	onChange: (next: string[] | undefined) => void;
}) {
	const [mode, setMode] = useState<'text' | 'select'>(choices?.length ? 'select' : 'text');
	const [raw, setRaw] = useState((choices ?? []).join('\n'));
	const list = parseChoices(raw);
	const tooLong = list.filter((c) => c.length > maxLength);

	const pick = (m: 'text' | 'select') => {
		setMode(m);
		onChange(m === 'select' && list.length ? list.slice(0, MAX_CHOICES) : undefined);
	};

	return (
		<div className={s.choices}>
			<div className={s.modeCards}>
				<button
					type='button'
					className={cx(s.modeCard, mode === 'text' && s.modeCardOn)}
					onClick={() => pick('text')}
					aria-pressed={mode === 'text'}
				>
					<span className={s.modeDemo}>
						<span className={s.demoInput}>Nguyễn Văn A|</span>
					</span>
					<b>Ô nhập chữ</b>
					<span>Người dùng tự gõ</span>
				</button>
				<button
					type='button'
					className={cx(s.modeCard, mode === 'select' && s.modeCardOn)}
					onClick={() => pick('select')}
					aria-pressed={mode === 'select'}
				>
					<span className={s.modeDemo}>
						<span className={s.demoInput}>
							— Chọn — <span className={s.demoCaret}>▾</span>
						</span>
					</span>
					<b>Danh sách chọn</b>
					<span>Chỉ chọn trong các mục bạn đặt</span>
				</button>
			</div>

			{mode === 'select' && (
				<label className={s.setting}>
					<span className={s.settingLabel}>Các lựa chọn — mỗi dòng một mục</span>
					<textarea
						className={s.ruleInput}
						rows={Math.min(10, Math.max(4, list.length + 1))}
						value={raw}
						placeholder={'Bác sĩ\nĐiều dưỡng\nKỹ thuật viên'}
						onChange={(e) => {
							setRaw(e.target.value);
							const next = parseChoices(e.target.value).slice(0, MAX_CHOICES);
							onChange(next.length ? next : undefined);
						}}
					/>
					<span className={s.settingHelp}>
						{list.length
							? `${Math.min(list.length, MAX_CHOICES)} lựa chọn (dòng trống, dòng trùng tự bỏ; tối đa ${MAX_CHOICES}).`
							: 'Chưa có lựa chọn nào — ô vẫn là ô nhập chữ cho tới khi bạn nhập ít nhất 1 dòng.'}{' '}
						Bản ghi cũ có giá trị ngoài danh sách sẽ phải chọn lại khi sửa.
					</span>
					{tooLong.length > 0 && (
						<span className={s.choiceError}>
							Mỗi lựa chọn tối đa {maxLength} ký tự — dòng quá dài: “{tooLong[0].slice(0, 40)}…”
						</span>
					)}
				</label>
			)}
		</div>
	);
}
