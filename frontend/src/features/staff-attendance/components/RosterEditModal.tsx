import { useMemo, useState } from 'react';
import { CalendarSvg } from '@/assets/icons';
import { Modal, ModalActions } from '@/shared/components';
import { FormField } from '@/shared/components/Input/FormField';
import m from '@/shared/components/Modal/Modal.module.css';
import { cx } from '@/shared/utils/cx';
import { rosterApi, type RosterMode, type WorkShift } from '../api/shiftApi';
import styles from '../pages/Roster.module.css';

export interface RosterCell {
	user_id: string;
	date: string;
}
type Value = { mode: RosterMode; shift_ids?: number[] };
/** Bước xoay vòng: id ca hoặc 'off' = nghỉ */
type Step = number | 'off';

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

// Gom các ô cùng giá trị + cùng tập ngày để gửi ít lượt nhất (API nhận tích người × ngày)
const save = async (cells: (RosterCell & { value: Value })[]) => {
	const byValue = new Map<string, { value: Value; byUser: Map<string, string[]> }>();
	for (const c of cells) {
		const k = JSON.stringify(c.value);
		if (!byValue.has(k)) byValue.set(k, { value: c.value, byUser: new Map() });
		const g = byValue.get(k)!.byUser;
		g.set(c.user_id, [...(g.get(c.user_id) ?? []), c.date]);
	}
	for (const { value, byUser } of byValue.values()) {
		const bySig = new Map<string, { dates: string[]; users: string[] }>();
		for (const [user, dates] of byUser) {
			const sig = dates.sort().join(',');
			if (!bySig.has(sig)) bySig.set(sig, { dates, users: [] });
			bySig.get(sig)!.users.push(user);
		}
		for (const { dates, users } of bySig.values()) await rosterApi.set({ user_ids: users, dates, ...value });
	}
};

export function RosterEditModal({
	cells,
	shifts,
	onClose,
	onSaved,
}: {
	cells: RosterCell[];
	/** Chỉ ca đang dùng */
	shifts: WorkShift[];
	onClose: () => void;
	onSaved: () => void;
}) {
	const [kind, setKind] = useState<'same' | 'rotate'>('same');
	const [picked, setPicked] = useState<number[]>([]);
	const [steps, setSteps] = useState<Step[]>([]);
	const [error, setError] = useState('');
	const [saving, setSaving] = useState(false);

	const users = useMemo(() => new Set(cells.map((c) => c.user_id)).size, [cells]);
	const firstDate = useMemo(() => cells.map((c) => c.date).sort()[0], [cells]);
	const byId = new Map(shifts.map((s) => [s.id, s]));
	const stepLabel = (s: Step) => (s === 'off' ? 'Nghỉ' : (byId.get(s)?.code ?? '?'));

	const run = async (values: (c: RosterCell) => Value) => {
		setError('');
		setSaving(true);
		try {
			await save(cells.map((c) => ({ ...c, value: values(c) })));
			onSaved();
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Lưu thất bại');
		} finally {
			setSaving(false);
		}
	};

	const confirm = () => {
		if (kind === 'same') {
			if (!picked.length) return setError('Chọn ít nhất 1 ca, hoặc dùng nút "Đặt nghỉ" / "Theo mẫu tuần"');
			return run(() => ({ mode: 'shifts', shift_ids: picked }));
		}
		if (!steps.length) return setError('Thêm ít nhất 1 bước xoay vòng');
		// Bước tính theo số ngày kể từ ngày đầu tiên đang chọn — cùng ngày thì mọi người cùng ca
		return run((c) => {
			const s = steps[((daysBetween(firstDate, c.date) % steps.length) + steps.length) % steps.length];
			return s === 'off' ? { mode: 'off' } : { mode: 'shifts', shift_ids: [s] };
		});
	};

	return (
		<Modal
			open
			onClose={onClose}
			icon={<CalendarSvg />}
			title='Xếp ca'
			subtitle={`${cells.length} ô — ${users} người`}
			size='lg'
			bodyClassName={m.stack}
			footer={
				<ModalActions
					onCancel={onClose}
					onConfirm={confirm}
					loading={saving}
					confirmLabel={kind === 'same' ? 'Xếp ca đã chọn' : 'Áp dụng xoay vòng'}
				/>
			}
		>
			<div className={styles.modeRow}>
				<button type='button' className={cx(styles.pick, kind === 'same' && styles.pickOn)} onClick={() => setKind('same')}>
					Cùng ca cho mọi ô
				</button>
				<button type='button' className={cx(styles.pick, kind === 'rotate' && styles.pickOn)} onClick={() => setKind('rotate')}>
					Xoay vòng
				</button>
			</div>

			{kind === 'same' ? (
				<>
					<FormField label='Ca'>
						<div className={styles.chips}>
							{shifts.map((s) => (
								<button
									key={s.id}
									type='button'
									className={cx(styles.pick, picked.includes(s.id) && styles.pickOn)}
									aria-pressed={picked.includes(s.id)}
									onClick={() => setPicked((p) => (p.includes(s.id) ? p.filter((x) => x !== s.id) : [...p, s.id]))}
								>
									{s.code} · {s.start_time}–{s.end_time}
								</button>
							))}
						</div>
					</FormField>
					<FormField label='Hoặc'>
						<div className={styles.modeRow}>
							<button type='button' className={styles.pick} disabled={saving} onClick={() => run(() => ({ mode: 'off' }))}>
								Đặt nghỉ
							</button>
							<button type='button' className={styles.pick} disabled={saving} onClick={() => run(() => ({ mode: 'pattern' }))}>
								Bỏ phân ca — theo mẫu tuần
							</button>
						</div>
					</FormField>
				</>
			) : (
				<>
					<FormField
						label='Chu kỳ xoay vòng'
					>
						<div className={styles.chips}>
							{shifts.map((s) => (
								<button key={s.id} type='button' className={styles.pick} onClick={() => setSteps((x) => [...x, s.id])}>
									+ {s.code}
								</button>
							))}
							<button type='button' className={styles.pick} onClick={() => setSteps((x) => [...x, 'off'])}>
								+ Nghỉ
							</button>
						</div>
					</FormField>
					<div className={styles.steps}>
						{steps.length === 0 && <span className={styles.preview}>Chưa có bước nào</span>}
						{steps.map((s, i) => (
							<span key={i} className={styles.step}>
								{i + 1}. {stepLabel(s)}
								<button type='button' className={styles.stepX} aria-label='Bỏ bước' onClick={() => setSteps((x) => x.filter((_, j) => j !== i))}>
									×
								</button>
							</span>
						))}
					</div>
					{steps.length > 0 && <div className={styles.preview}>Chu kỳ {steps.length} ngày: {steps.map(stepLabel).join(' → ')}</div>}
				</>
			)}

			{error && <div className={m.fieldError}>{error}</div>}
		</Modal>
	);
}
