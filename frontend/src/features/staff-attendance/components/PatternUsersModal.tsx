import { useEffect, useMemo, useState } from 'react';
import { UsersSvg } from '@/assets/icons';
import { Badge, InlineLoading, Modal, ModalActions, SelectCheckbox } from '@/shared/components';
import m from '@/shared/components/Modal/Modal.module.css';
import tbl from '@/shared/components/Table/Table.module.css';
import { SearchInput } from '@/shared/components/Table/TableToolbar';
import { patternApi, type ShiftPattern, type ShiftUser } from '../api/shiftApi';
import styles from '../pages/Shifts.module.css';

const MAX_SHOWN = 300;

export function PatternUsersModal({
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
	const [users, setUsers] = useState<ShiftUser[] | null>(null);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [search, setSearch] = useState('');
	const [dept, setDept] = useState('');
	const [onlySelected, setOnlySelected] = useState(false);
	const [error, setError] = useState('');
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		patternApi
			.users()
			.then((list) => {
				setUsers(list);
				setSelected(new Set(list.filter((u) => u.shift_pattern_id === pattern.id).map((u) => u.id)));
			})
			.catch((e) => setError(e instanceof Error ? e.message : 'Không tải được danh sách người dùng'));
	}, [pattern.id]);

	const nameOf = useMemo(() => new Map(patterns.map((s) => [s.id, s.name])), [patterns]);
	const departments = useMemo(
		() => [...new Set((users ?? []).map((u) => u.department_name).filter((d): d is string => !!d))].sort(),
		[users],
	);
	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		return (users ?? []).filter(
			(u) =>
				(!dept || u.department_name === dept) &&
				(!onlySelected || selected.has(u.id)) &&
				(!q || u.full_name.toLowerCase().includes(q) || (u.staff_number ?? '').toLowerCase() === q),
		);
	}, [users, search, dept, onlySelected, selected]);

	const allFilteredOn = filtered.length > 0 && filtered.every((u) => selected.has(u.id));
	const toggle = (id: string) =>
		setSelected((s) => {
			const next = new Set(s);
			if (!next.delete(id)) next.add(id);
			return next;
		});
	const toggleFiltered = () =>
		setSelected((s) => {
			const next = new Set(s);
			for (const u of filtered) {
				if (allFilteredOn) next.delete(u.id);
				else next.add(u.id);
			}
			return next;
		});

	// Người đang thuộc lịch khác sẽ bị chuyển sang lịch này
	const moving = (users ?? []).filter((u) => selected.has(u.id) && u.shift_pattern_id && u.shift_pattern_id !== pattern.id).length;

	const save = async () => {
		setSaving(true);
		setError('');
		try {
			await patternApi.setUsers(pattern.id, [...selected]);
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
			icon={<UsersSvg />}
			title='Người áp dụng mẫu ca'
			subtitle={pattern.name}
			size='lg'
			bodyClassName={m.stack}
			footer={<ModalActions onCancel={onClose} onConfirm={save} loading={saving} disabled={!users} confirmLabel={`Lưu (${selected.size} người)`} />}
		>
			{!users && !error && <InlineLoading />}
			{users && (
				<>
					<div className={styles.userFilters}>
						<SearchInput value={search} onChange={setSearch} placeholder='Tìm theo tên, MNV...' />
						<select className={tbl.filterSelect} value={dept} onChange={(e) => setDept(e.target.value)} aria-label='Khoa/phòng'>
							<option value=''>Tất cả khoa/phòng</option>
							{departments.map((d) => (
								<option key={d} value={d}>
									{d}
								</option>
							))}
						</select>
						<label className={styles.checkRow}>
							<input type='checkbox' checked={onlySelected} onChange={(e) => setOnlySelected(e.target.checked)} />
							Chỉ người đã chọn
						</label>
					</div>

					<div className={styles.userSummary}>
						<label className={styles.checkRow}>
							<SelectCheckbox checked={allFilteredOn} onChange={toggleFiltered} title='Chọn tất cả đang hiện' />
							{allFilteredOn ? 'Bỏ chọn' : 'Chọn'} tất cả {filtered.length} người đang hiện
						</label>
						<span>
							Đã chọn <b>{selected.size}</b>
							{moving > 0 && ` · ${moving} người sẽ chuyển từ mẫu khác sang`}
						</span>
					</div>

					<div className={styles.userList}>
						{filtered.length === 0 && <div className={tbl.emptyState}>Không có người dùng phù hợp</div>}
						{filtered.slice(0, MAX_SHOWN).map((u) => (
							<label key={u.id} className={styles.userRow}>
								<SelectCheckbox checked={selected.has(u.id)} onChange={() => toggle(u.id)} />
								<div className={styles.userMain}>
									<div className={tbl.cellTitle}>{u.full_name}</div>
									<div className={tbl.cellSub}>
										{u.staff_number ? `MNV ${u.staff_number}` : 'Chưa có MNV'}
										{u.department_name ? ` · ${u.department_name}` : ''}
									</div>
								</div>
								{u.shift_pattern_id && u.shift_pattern_id !== pattern.id && (
									<Badge tone='gray'>{nameOf.get(u.shift_pattern_id) ?? 'Mẫu khác'}</Badge>
								)}
							</label>
						))}
						{filtered.length > MAX_SHOWN && (
							<div className={tbl.emptyState}>
								Đang hiện {MAX_SHOWN}/{filtered.length} người — tìm hoặc lọc khoa để thu hẹp (nút "Chọn tất cả" vẫn áp dụng cho cả {filtered.length} người).
							</div>
						)}
					</div>
				</>
			)}
			{error && <div className={m.fieldError}>{error}</div>}
		</Modal>
	);
}
