import { useEffect, useMemo, useState } from 'react';
import { BookOpenSvg } from '@/assets/icons';
import { Badge, InlineLoading, Modal, ModalActions, SelectCheckbox } from '@/shared/components';
import m from '@/shared/components/Modal/Modal.module.css';
import tbl from '@/shared/components/Table/Table.module.css';
import { SearchInput } from '@/shared/components/Table/TableToolbar';
import { formatDateVN } from '@/shared/utils/formatDate';
import { patternApi, type PatternCourse, type ShiftPattern } from '../api/shiftApi';
import styles from '../pages/Shifts.module.css';

const MAX_SHOWN = 300;

const courseDates = (c: PatternCourse) =>
	c.is_rolling ? 'Mở liên tục' : c.start_date || c.end_date ? `${formatDateVN(c.start_date) || '…'} – ${formatDateVN(c.end_date) || '…'}` : 'Chưa xếp lịch';

/** Chọn khóa đào tạo dùng mẫu ca tuần — học viên của khóa chấm công theo mẫu này. */
export function PatternCoursesModal({
	pattern,
	patterns,
	onClose,
	onSaved,
}: {
	pattern: ShiftPattern;
	patterns: ShiftPattern[];
	onClose: () => void;
	onSaved: () => void;
}) {
	const [courses, setCourses] = useState<PatternCourse[] | null>(null);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [search, setSearch] = useState('');
	const [showEnded, setShowEnded] = useState(false);
	const [onlySelected, setOnlySelected] = useState(false);
	const [error, setError] = useState('');
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		patternApi
			.courses()
			.then((list) => {
				setCourses(list);
				setSelected(new Set(list.filter((c) => c.shift_pattern_id === pattern.id).map((c) => c.id)));
			})
			.catch((e) => setError(e instanceof Error ? e.message : 'Không tải được danh sách khóa học'));
	}, [pattern.id]);

	const nameOf = useMemo(() => new Map(patterns.map((s) => [s.id, s.name])), [patterns]);
	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		return (courses ?? []).filter(
			(c) =>
				(showEnded || !c.ended || selected.has(c.id)) &&
				(!onlySelected || selected.has(c.id)) &&
				(!q || c.name.toLowerCase().includes(q) || c.id.toLowerCase() === q),
		);
	}, [courses, search, showEnded, onlySelected, selected]);

	const allFilteredOn = filtered.length > 0 && filtered.every((c) => selected.has(c.id));
	const toggle = (id: string) =>
		setSelected((s) => {
			const next = new Set(s);
			if (!next.delete(id)) next.add(id);
			return next;
		});
	const toggleFiltered = () =>
		setSelected((s) => {
			const next = new Set(s);
			for (const c of filtered) {
				if (allFilteredOn) next.delete(c.id);
				else next.add(c.id);
			}
			return next;
		});

	// Khóa đang dùng mẫu khác sẽ bị chuyển sang mẫu này
	const moving = (courses ?? []).filter((c) => selected.has(c.id) && c.shift_pattern_id && c.shift_pattern_id !== pattern.id).length;

	const save = async () => {
		setSaving(true);
		setError('');
		try {
			await patternApi.setCourses(pattern.id, [...selected]);
			onSaved();
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Lưu thất bại');
		} finally {
			setSaving(false);
		}
	};

	return (
		<Modal
			open
			onClose={onClose}
			icon={<BookOpenSvg />}
			title='Khóa học áp dụng mẫu ca'
			subtitle={pattern.name}
			size='lg'
			bodyClassName={m.stack}
			footer={<ModalActions onCancel={onClose} onConfirm={save} loading={saving} disabled={!courses} confirmLabel={`Lưu (${selected.size} khóa)`} />}
		>
			{!courses && !error && <InlineLoading />}
			{courses && (
				<>
					<div className={styles.userFilters}>
						<SearchInput value={search} onChange={setSearch} placeholder='Tìm theo tên, mã khóa...' />
						<label className={styles.checkRow}>
							<input type='checkbox' checked={showEnded} onChange={(e) => setShowEnded(e.target.checked)} />
							Hiện cả khóa đã kết thúc
						</label>
						<label className={styles.checkRow}>
							<input type='checkbox' checked={onlySelected} onChange={(e) => setOnlySelected(e.target.checked)} />
							Chỉ khóa đã chọn
						</label>
					</div>

					<div className={styles.userSummary}>
						<label className={styles.checkRow}>
							<SelectCheckbox checked={allFilteredOn} onChange={toggleFiltered} title='Chọn tất cả đang hiện' />
							{allFilteredOn ? 'Bỏ chọn' : 'Chọn'} tất cả {filtered.length} khóa đang hiện
						</label>
						<span>
							Đã chọn <b>{selected.size}</b>
							{moving > 0 && ` · ${moving} khóa sẽ chuyển từ mẫu khác sang`}
						</span>
					</div>

					<div className={styles.userList}>
						{filtered.length === 0 && <div className={tbl.emptyState}>Không có khóa học phù hợp</div>}
						{filtered.slice(0, MAX_SHOWN).map((c) => (
							<label key={c.id} className={styles.userRow}>
								<SelectCheckbox checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
								<div className={styles.userMain}>
									<div className={tbl.cellTitle}>{c.name}</div>
									<div className={tbl.cellSub}>
										{c.id} · {courseDates(c)} · {c.trainee_count} học viên
									</div>
								</div>
								{c.ended && <Badge tone='gray'>Đã kết thúc</Badge>}
								{c.shift_pattern_id && c.shift_pattern_id !== pattern.id && (
									<Badge tone='gray'>{nameOf.get(c.shift_pattern_id) ?? 'Mẫu khác'}</Badge>
								)}
							</label>
						))}
						{filtered.length > MAX_SHOWN && (
							<div className={tbl.emptyState}>
								Đang hiện {MAX_SHOWN}/{filtered.length} khóa — tìm để thu hẹp (nút "Chọn tất cả" vẫn áp dụng cho cả {filtered.length} khóa).
							</div>
						)}
					</div>
				</>
			)}
			{error && <div className={m.fieldError}>{error}</div>}
		</Modal>
	);
}
