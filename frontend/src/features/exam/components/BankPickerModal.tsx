import { useMemo, useState } from 'react';
import { RefreshSvg, SearchSvg } from '@/assets/icons';
import { Button, Modal, QuestionText } from '../../../shared/components';
import { removeDiacritics } from '../../../shared/utils/helper';
import type { ExamQuestion, QuestionType } from '../types/exam.type';
import { QUESTION_TYPE_SHORT, fmtPoints, sample } from '../utils/examBuilder';
import styles from '../pages/ExamBuilder.module.css';

const norm = (s: string) => removeDiacritics(s).toLowerCase();

/** Chọn câu từ ngân hàng của lớp: lọc (nội dung không dấu, loại câu, chưa dùng), chọn nhiều,
 *  hoặc bốc ngẫu nhiên N câu trong danh sách đang lọc. */
export function BankPickerModal({
	bank,
	excludeIds,
	allowedType,
	bankLabel,
	onClose,
	onAdd,
}: {
	bank: ExamQuestion[];
	/** Câu đã có trong đề — không hiện lại */
	excludeIds: Set<string>;
	/** Đề trắc nghiệm / tự luận chỉ nhận câu cùng loại; null = nhận cả 2 */
	allowedType: QuestionType | null;
	bankLabel: string;
	onClose: () => void;
	onAdd: (questions: ExamQuestion[]) => void;
}) {
	const [search, setSearch] = useState('');
	const [type, setType] = useState<QuestionType | ''>(allowedType ?? '');
	const [onlyUnused, setOnlyUnused] = useState(false);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [randomN, setRandomN] = useState('10');

	const candidates = useMemo(
		() => bank.filter((q) => !excludeIds.has(q.id) && (!allowedType || q.question_type === allowedType)),
		[bank, excludeIds, allowedType],
	);
	const filtered = useMemo(() => {
		const k = norm(search.trim());
		return candidates.filter(
			(q) =>
				(!type || q.question_type === type) &&
				(!onlyUnused || !q.used_count) &&
				(!k || norm(q.question_text).includes(k)),
		);
	}, [candidates, search, type, onlyUnused]);

	const allShownSelected = filtered.length > 0 && filtered.every((q) => selected.has(q.id));
	const toggle = (id: string) =>
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	const toggleAllShown = () =>
		setSelected((prev) => {
			const next = new Set(prev);
			for (const q of filtered) {
				if (allShownSelected) next.delete(q.id);
				else next.add(q.id);
			}
			return next;
		});
	const pickRandom = () => {
		const n = Math.min(Number(randomN) || 0, filtered.length);
		setSelected(new Set(sample(filtered, n).map((q) => q.id)));
	};

	const chosen = candidates.filter((q) => selected.has(q.id));
	const chosenPoints = chosen.reduce((s, q) => s + Number(q.points || 0), 0);

	return (
		<Modal
			open
			onClose={onClose}
			title='Lấy câu hỏi từ ngân hàng'
			size='xl'
			closeOnBackdrop={false}
			footer={
				<div className={styles.pickerFooter}>
					<span className={styles.muted}>
						Đã chọn <strong>{chosen.length}</strong> câu · {fmtPoints(chosenPoints)} điểm
					</span>
					<div className={styles.row}>
						<Button
							variant='secondary'
							onClick={onClose}
						>
							Hủy
						</Button>
						<Button
							disabled={!chosen.length}
							onClick={() => onAdd(chosen)}
						>
							Thêm {chosen.length || ''} câu vào đề
						</Button>
					</div>
				</div>
			}
		>
			<div className={styles.pickerHint}>
				{bankLabel} — {candidates.length} câu chưa có trong đề
			</div>
			<div className={styles.pickerToolbar}>
				<label className={styles.searchBox}>
					<SearchSvg />
					<input
						autoFocus
						placeholder='Tìm theo nội dung câu hỏi (gõ không dấu cũng được)'
						value={search}
						onChange={(e) => setSearch(e.target.value)}
					/>
				</label>
				<select
					className={styles.input}
					value={type}
					disabled={!!allowedType}
					onChange={(e) => setType(e.target.value as QuestionType | '')}
					aria-label='Loại câu'
				>
					<option value=''>Mọi loại câu</option>
					<option value='single_choice'>Trắc nghiệm</option>
					<option value='essay'>Tự luận</option>
				</select>
				<label className={styles.checkLabel}>
					<input
						type='checkbox'
						checked={onlyUnused}
						onChange={(e) => setOnlyUnused(e.target.checked)}
					/>
					Chỉ câu chưa dùng ở đề nào
				</label>
				<div className={styles.randomPick}>
					<span>Bốc ngẫu nhiên</span>
					<input
						className={styles.input}
						type='number'
						min={1}
						value={randomN}
						onChange={(e) => setRandomN(e.target.value)}
						aria-label='Số câu bốc ngẫu nhiên'
					/>
					<span>câu</span>
					<Button
						variant='secondary'
						size='sm'
						icon={<RefreshSvg />}
						disabled={!filtered.length || !(Number(randomN) > 0)}
						onClick={pickRandom}
						title='Chọn ngẫu nhiên trong danh sách đang lọc (thay cho lựa chọn hiện tại)'
					>
						Bốc
					</Button>
				</div>
			</div>

			<div className={styles.pickerList}>
				<label className={`${styles.pickerRow} ${styles.pickerHead}`}>
					<input
						type='checkbox'
						checked={allShownSelected}
						disabled={!filtered.length}
						onChange={toggleAllShown}
					/>
					<span>
						Chọn tất cả {filtered.length} câu đang hiện
						{filtered.length !== candidates.length && ` (lọc từ ${candidates.length})`}
					</span>
				</label>
				{filtered.length === 0 ? (
					<div className={styles.emptyMini}>
						{candidates.length ? 'Không có câu nào khớp bộ lọc.' : 'Ngân hàng không còn câu nào để thêm.'}
					</div>
				) : (
					filtered.map((q) => (
						<label
							key={q.id}
							className={`${styles.pickerRow} ${selected.has(q.id) ? styles.pickerRowOn : ''}`}
						>
							<input
								type='checkbox'
								checked={selected.has(q.id)}
								onChange={() => toggle(q.id)}
							/>
							<span className={styles.typeTag} data-type={q.question_type}>
								{QUESTION_TYPE_SHORT[q.question_type]}
							</span>
							<span className={styles.pickerText}>
								<QuestionText text={q.question_text} />
								{q.image_url && <span className={styles.muted}> · có hình</span>}
							</span>
							<span className={styles.pickerMeta}>
								{fmtPoints(q.points)} đ
								{q.used_count ? <span className={styles.muted}> · {q.used_count} đề</span> : null}
							</span>
						</label>
					))
				)}
			</div>
		</Modal>
	);
}

