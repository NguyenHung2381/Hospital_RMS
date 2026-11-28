import { FormField } from '@/shared/components/Input/FormField';
import React, { useEffect, useId, useState } from 'react';
import { Modal, ModalActions } from '@/shared/components';
import m from '@/shared/components/Modal/Modal.module.css';
import { catalogApi } from '../api/catalogApi';
import { apiClient } from '@/shared/api/axios';
import { EMPTY_FORM, TAB_CONFIG } from '../hooks/useCatalog';
import type { CatalogFormData, CatalogItem, CatalogTab, LevelOption } from '../types/catalog.type';
import styles from './CatalogFormModal.module.css';
import { patternApi, type ShiftPattern } from '@/features/staff-attendance/api/shiftApi';
import {
	ATTENDANCE_MODE,
	ATTENDANCE_MODE_ORDER,
	type AttendanceMode,
} from '@/shared/utils/attendanceMode';
import {
	TRAINING_METHOD,
	TRAINING_METHOD_ORDER,
	parseMethodList,
	type TrainingMethod,
} from '@/shared/utils/attendanceMethods';

export function CatalogFormModal({
	mode,
	item,
	tab,
	onClose,
	onSave,
	loading,
}: {
	mode: 'add' | 'edit';
	item?: CatalogItem;
	tab: CatalogTab;
	onClose: () => void;
	onSave: (d: CatalogFormData) => void;
	loading: boolean;
}) {
	const cfg = TAB_CONFIG[tab];
	const label = cfg.label.toLowerCase();
	const isRoundType = tab === 'round-types';
	const isDocType = tab === 'trainee-document-types';
	const isTrainingType = tab === 'training-types';
	const uid = useId();
	const [form, setForm] = useState<CatalogFormData>(
		item ? { name: item.name, description: item.description ?? '' } : EMPTY_FORM,
	);
	// ── Loại giấy tờ: mã, thứ tự, loại khóa bắt buộc nộp ──
	const [docCode, setDocCode] = useState('');
	const [docOrder, setDocOrder] = useState(String(item?.display_order ?? 0));
	const [requiredFor, setRequiredFor] = useState<string[]>(
		(item?.required_for_types ?? '').split(',').map((x) => x.trim()).filter(Boolean),
	);
	const [trainingTypes, setTrainingTypes] = useState<LevelOption[]>([]);
	useEffect(() => {
		if (!isDocType) return;
		apiClient
			.get<{ data: LevelOption[] }>('/training-types?limit=0')
			.then((r) => setTrainingTypes(r.data))
			.catch(() => {});
	}, [isDocType]);
	const [errors, setErrors] = useState<Partial<Record<keyof CatalogFormData, string>>>({});

	// ── Loại hình đào tạo: kiểu chấm công + mẫu ca tuần mặc định ──
	const [attMode, setAttMode] = useState<AttendanceMode>(item?.attendance_mode ?? 'both');
	const [patternId, setPatternId] = useState<number | null>(item?.shift_pattern_id ?? null);
	// null = chưa tải / không có quyền xem mẫu ca (phân hệ Ca & điểm danh) ⇒ ẩn ô chọn mẫu
	const [patterns, setPatterns] = useState<ShiftPattern[] | null>(null);
	useEffect(() => {
		if (!isTrainingType) return;
		let alive = true;
		patternApi
			.list()
			.then((ps) => alive && setPatterns(ps))
			.catch(() => {});
		return () => {
			alive = false;
		};
	}, [isTrainingType]);
	const usesShifts = attMode === 'shift' || attMode === 'both';
	// Phương thức điểm danh được phép — chưa cấu hình (null) = mọi phương thức
	const [methods, setMethods] = useState<TrainingMethod[]>(
		parseMethodList(item?.attendance_methods) ?? TRAINING_METHOD_ORDER,
	);
	const toggleMethod = (k: TrainingMethod) =>
		setMethods((prev) =>
			prev.includes(k) ? prev.filter((x) => x !== k) : TRAINING_METHOD_ORDER.filter((x) => x === k || prev.includes(x)),
		);

	// ── Cấp độ cho phép (chỉ tab "Loại đợt") ──
	const [levels, setLevels] = useState<LevelOption[]>([]);
	const [levelIds, setLevelIds] = useState<string[]>([]);

	useEffect(() => {
		if (!isRoundType) return;
		let alive = true;
		catalogApi
			.allLevels()
			.then((ls) => alive && setLevels(ls))
			.catch(() => {});
		if (mode === 'edit' && item) {
			catalogApi
				.roundTypeLevels(item.id)
				.then((ids) => alive && setLevelIds(ids))
				.catch(() => {});
		}
		return () => {
			alive = false;
		};
	}, [isRoundType, mode, item]);

	const toggleLevel = (id: string) =>
		setLevelIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

	const set =
		(k: keyof CatalogFormData) =>
		(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
			setForm((f) => ({ ...f, [k]: e.target.value }));
			setErrors((er) => ({ ...er, [k]: '' }));
		};

	const handleSave = () => {
		if (!form.name.trim()) {
			setErrors({ name: `Vui lòng nhập tên ${label}` });
			return;
		}
		if (isDocType) {
			if (docCode && !/^[a-z0-9_]{1,30}$/.test(docCode)) {
				setErrors({ name: 'Mã chỉ gồm chữ thường không dấu, số, dấu gạch dưới' });
				return;
			}
			onSave({
				...form,
				...(mode === 'add' && docCode ? { id: docCode } : {}),
				required_for_types: requiredFor.length ? requiredFor.join(',') : null,
				display_order: Number(docOrder) || 0,
			});
			return;
		}
		if (isTrainingType) {
			onSave({
				...form,
				attendance_mode: attMode,
				// Tick đủ ⇒ backend lưu NULL (theo hệ thống)
				attendance_methods: methods,
				// Chưa tải được danh sách mẫu ⇒ không đụng tới mẫu đang gán
				...(patterns ? { shift_pattern_id: usesShifts ? patternId : null } : {}),
			});
			return;
		}
		onSave(isRoundType ? { ...form, level_ids: levelIds } : form);
	};

	return (
		<Modal
			open
			onClose={onClose}
			icon={<cfg.icon />}
			title={mode === 'add' ? `Thêm ${label}` : `Chỉnh sửa ${label}`}
			subtitle={mode === 'add' ? `Thêm ${label} mới vào hệ thống` : `Cập nhật — ${item?.name}`}
			footer={
				<ModalActions
					onCancel={onClose}
					onConfirm={handleSave}
					loading={loading}
					confirmLabel={mode === 'add' ? `Thêm ${label}` : 'Lưu thay đổi'}
				/>
			}
		>
			<div className={m.stack}>
				<FormField
					label={<>Tên {label}</>}
					required
					error={errors.name}
				>
					<input
						className={`${m.formInput} ${errors.name ? m.inputError : ''}`}
						value={form.name}
						onChange={set('name')}
						placeholder={cfg.placeholder}
					/>
				</FormField>
				<FormField label='Mô tả'>
					<textarea
						className={m.formTextarea}
						value={form.description}
						onChange={set('description')}
						rows={3}
						placeholder='Mô tả ngắn...'
					/>
				</FormField>

				{isTrainingType && (
					<>
						<fieldset className={styles.modeGroup}>
							<legend className={m.formLabel}>Kiểu chấm công</legend>
							<div className={styles.hint}>
								Áp dụng cho mọi khóa học thuộc loại hình này. Khóa nào cần khác thì chọn riêng ở form khóa học.
							</div>
							<div className={styles.modeList}>
								{ATTENDANCE_MODE_ORDER.map((k) => (
									<label
										key={k}
										className={styles.modeCard}
									>
										<input
											type='radio'
											name={`${uid}-attendance-mode`}
											value={k}
											checked={attMode === k}
											onChange={() => setAttMode(k)}
										/>
										<span className={styles.modeText}>
											<span className={styles.modeTitle}>{ATTENDANCE_MODE[k].label}</span>
											<span className={styles.modeHint}>{ATTENDANCE_MODE[k].hint}</span>
										</span>
									</label>
								))}
							</div>
						</fieldset>
						{attMode !== 'none' && (
							<fieldset className={styles.modeGroup}>
								<legend className={m.formLabel}>Phương thức điểm danh được phép</legend>
								<div className={styles.hint}>
									Giảng viên luôn điểm danh tay được. Phương thức đang tắt ở Cấu hình hệ thống → Điểm danh thì không dùng được dù có tick.
								</div>
								<div className={styles.modeList}>
									{TRAINING_METHOD_ORDER.map((k) => {
										const applies = TRAINING_METHOD[k].modes.includes(attMode);
										return (
											<label
												key={k}
												className={`${styles.modeCard} ${applies ? '' : styles.modeCardOff}`}
											>
												<input
													type='checkbox'
													checked={methods.includes(k)}
													onChange={() => toggleMethod(k)}
												/>
												<span className={styles.modeText}>
													<span className={styles.modeTitle}>{TRAINING_METHOD[k].label}</span>
													<span className={styles.modeHint}>
														{applies
															? TRAINING_METHOD[k].hint
															: `Không áp dụng với kiểu "${ATTENDANCE_MODE[attMode].label.toLowerCase()}".`}
													</span>
												</span>
											</label>
										);
									})}
								</div>
							</fieldset>
						)}
						{usesShifts && patterns && (
							<FormField label='Mẫu ca tuần mặc định'>
								<select
									className={m.formInput}
									value={patternId ?? ''}
									onChange={(e) => setPatternId(e.target.value ? Number(e.target.value) : null)}
								>
									<option value=''>
										Mẫu mặc định toàn viện
										{patterns.find((p) => p.is_default) ? ` (${patterns.find((p) => p.is_default)!.name})` : ''}
									</option>
									{patterns.map((p) => (
										<option
											key={p.id}
											value={p.id}
										>
											{p.name}
										</option>
									))}
								</select>
								<div className={styles.hint}>
									Khóa học thuộc loại hình này mà chưa gán mẫu riêng (trang Ca &amp; mẫu ca tuần) sẽ dùng mẫu này.
								</div>
							</FormField>
						)}
					</>
				)}

				{isDocType && (
					<>
						{mode === 'add' && (
							<FormField label='Mã (không bắt buộc)'>
								<input
									className={m.formInput}
									value={docCode}
									onChange={(e) => setDocCode(e.target.value.trim().toLowerCase())}
									placeholder='VD: health_check — bỏ trống để tự sinh'
								/>
							</FormField>
						)}
						<FormField label='Thứ tự hiển thị'>
							<input
								className={m.formInput}
								type='number'
								min={0}
								value={docOrder}
								onChange={(e) => setDocOrder(e.target.value)}
							/>
						</FormField>
						<div className={m.formGroup}>
							<span
								id={`${uid}-required-for`}
								className={m.formLabel}
							>
								Bắt buộc nộp với học viên khóa loại
							</span>
							<div className={styles.hint}>
								Học viên ghi danh khóa thuộc loại được tick sẽ thấy giấy tờ này trong checklist "cần nộp". Bỏ trống = không bắt buộc.
							</div>
							<div
								className={styles.levels}
								role='group'
								aria-labelledby={`${uid}-required-for`}
							>
								{trainingTypes.map((tt) => (
									<label
										key={tt.id}
										className={styles.level}
									>
										<input
											type='checkbox'
											checked={requiredFor.includes(tt.id)}
											onChange={() =>
												setRequiredFor((prev) =>
													prev.includes(tt.id) ? prev.filter((x) => x !== tt.id) : [...prev, tt.id],
												)
											}
										/>
										{tt.name}
									</label>
								))}
							</div>
						</div>
					</>
				)}

				{isRoundType && (
					<div className={m.formGroup}>
						<span
							id={`${uid}-levels`}
							className={m.formLabel}
						>
							Cấp độ đề tài cho phép
						</span>
						<div className={styles.hint}>
							Form đăng ký đề tài chỉ hiện các cấp độ được tick ở đây. Bỏ trống = cho phép tất cả.
						</div>
						<div
							className={styles.levels}
							role='group'
							aria-labelledby={`${uid}-levels`}
						>
							{levels.length === 0 && <span className={styles.empty}>Chưa có cấp độ nào trong hệ thống.</span>}
							{levels.map((lv) => (
								<label
									key={lv.id}
									className={styles.level}
								>
									<input
										type='checkbox'
										checked={levelIds.includes(lv.id)}
										onChange={() => toggleLevel(lv.id)}
									/>
									{lv.name}
								</label>
							))}
						</div>
					</div>
				)}
			</div>
		</Modal>
	);
}
