import { useEffect, useRef, useState } from 'react';
import { getRoundTypeLevelIds } from '../api/roundApi';
import type {
	FormErrors,
	ResearchRound,
	RoundForm,
	RoundType,
} from '../types/round.type';

interface UseRoundModalFormProps {
	round?: ResearchRound;
	rounds: ResearchRound[];
	roundTypes: RoundType[];
	onSave: (form: RoundForm) => Promise<void>;
	onSubmitInvalid: () => void;
}

function parseDate(s: string) {
	if (!s) return null;
	const [d, m, y] = s.split('/').map(Number);
	return new Date(y, m - 1, d);
}

export function useRoundModalForm({
	round,
	rounds,
	roundTypes,
	onSave,
	onSubmitInvalid,
}: UseRoundModalFormProps) {
	const currentYear = new Date().getFullYear();
	const [form, setForm] = useState<RoundForm>({
		name: round?.name ?? '',
		year: round?.year ?? currentYear,
		round_number: round?.round_number ?? 1,
		round_type_id: round?.round_type_id ?? '',
		start_date: round?.start_date ?? '',
		end_date: round?.end_date ?? '',
		status: round?.status ?? 'draft',
		level_ids: round?.level_ids ?? [],
		deadlines: [],
	});
	const [errors, setErrors] = useState<FormErrors>({});
	const [loading, setLoading] = useState(false);
	const [saveError, setSaveError] = useState('');

	// Tạo mới: chọn loại đợt ⇒ gợi ý sẵn cấp độ đã cấu hình cho loại đợt đó,
	// cho tới khi người dùng tự tick/bỏ tick cấp độ.
	const levelsTouched = useRef(!!round);
	useEffect(() => {
		if (levelsTouched.current || !form.round_type_id) return;
		let cancelled = false;
		getRoundTypeLevelIds(form.round_type_id)
			.then((ids) => {
				if (!cancelled && !levelsTouched.current)
					setForm((p) => ({ ...p, level_ids: ids }));
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, [form.round_type_id]);

	const set = <K extends keyof RoundForm>(field: K, val: RoundForm[K]) => {
		if (field === 'level_ids') levelsTouched.current = true;
		setForm((p) => {
			const next = { ...p, [field]: val };
			if (
				!round &&
				(field === 'year' ||
					field === 'round_number' ||
					field === 'round_type_id')
			) {
				const typeName = roundTypes.find(
					(t) => t.id === next.round_type_id,
				)?.name;
				next.name = typeName
					? `Đợt ${next.round_number} - ${typeName} - Năm ${next.year}`
					: `Đợt ${next.round_number} năm ${next.year}`;
			}
			return next;
		});
		if (errors[field as string])
			setErrors((p) => {
				const n = { ...p };
				delete n[field as string];
				return n;
			});
	};

	const duplicateRound = rounds.some(
		(r) =>
			r.id !== round?.id &&
			r.year === form.year &&
			r.round_number === form.round_number,
	);

	const validate = (): boolean => {
		const e: FormErrors = {};
		if (!form.name.trim()) e.name = 'Vui lòng nhập tên đợt';
		if (!form.round_type_id) e.round_type_id = 'Vui lòng chọn loại đợt';
		if (!form.start_date) e.start_date = 'Vui lòng chọn ngày bắt đầu';
		if (!form.end_date) e.end_date = 'Vui lòng chọn ngày kết thúc';
		const s = parseDate(form.start_date),
			e2 = parseDate(form.end_date);
		if (s && e2 && e2 <= s) e.end_date = 'Ngày kết thúc phải sau ngày bắt đầu';
		if (s && e2) {
			const outside = form.deadlines.some((d) =>
				[d.start_date, d.deadline_date].some((x) => {
					const dt = x ? parseDate(x) : null;
					return dt && (dt < s || dt > e2);
				}),
			);
			if (outside)
				e.deadlines =
					'Có mốc thời gian nằm ngoài khoảng thời gian của đợt — hãy sửa lại mốc hoặc ngày của đợt';
		}
		if (duplicateRound)
			e.round_number = `Đợt ${form.round_number} năm ${form.year} đã tồn tại`;
		setErrors(e);
		return Object.keys(e).length === 0;
	};

	const handleSubmit = async () => {
		if (!validate()) {
			onSubmitInvalid();
			return;
		}
		setLoading(true);
		setSaveError('');
		try {
			await onSave(form);
		} catch (err) {
			setSaveError(err instanceof Error ? err.message : 'Lưu thất bại');
		} finally {
			setLoading(false);
		}
	};

	const years = Array.from({ length: 6 }, (_, i) => currentYear + 1 - i);

	return { form, errors, loading, saveError, set, duplicateRound, handleSubmit, years };
}
