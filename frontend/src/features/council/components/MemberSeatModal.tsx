import { Modal } from '@/shared/components';
import { useEffect, useState } from 'react';
import { CheckSvg, SearchSvg, UserCheckSvg, XSvg } from '@/assets/icons';
import { getEligibleUsers } from '../api/councilApi';
import {
	SEAT_ROLE_LABELS,
	type CouncilMember,
	type EligibleUser,
	type SeatRole,
} from '../types/council.type';
import styles from '../pages/Council.module.css';

const conflictLabel = (u: EligibleUser): string | null => {
	if (u.is_external) return null;
	if (u.is_author_conflict) return 'Là thành viên đề tài hội đồng này chấm';
	if (u.is_dept_conflict) return 'Cùng khoa với đề tài đã gán cho hội đồng';
	return null;
};

// Cảnh báo theo quy định (vẫn cho chọn): chủ tịch phải trong danh sách được duyệt.
// Người ngoài viện không có cờ này — không áp dụng cảnh báo.
const roleWarning = (u: EligibleUser, role: SeatRole): string | null => {
	if (u.is_external) return null;
	if (role === 'chairman' && !u.can_chair_council)
		return 'Không thuộc danh sách được duyệt làm chủ tịch hội đồng';
	if (!u.can_sit_council)
		return 'Không thuộc danh sách được duyệt ngồi hội đồng';
	return null;
};

export function MemberSeatModal({
	councilId,
	role,
	member,
	allowExternal = true,
	onClose,
	onSave,
	onRemove,
	loading,
}: {
	councilId: string;
	role: SeatRole;
	member?: CouncilMember;
	allowExternal?: boolean;
	onClose: () => void;
	onSave: (candidate: EligibleUser) => void;
	onRemove?: () => void;
	loading: boolean;
}) {
	const [candidateType, setCandidateType] = useState<'internal' | 'external'>('internal');
	const [search, setSearch] = useState('');
	const [results, setResults] = useState<EligibleUser[]>([]);
	const [searching, setSearching] = useState(false);
	const [selected, setSelected] = useState<EligibleUser | null>(null);
	const [error, setError] = useState('');

	useEffect(() => {
		const t = setTimeout(() => {
			setSearching(true);
			getEligibleUsers(councilId, search.trim() || undefined, candidateType)
				.then(setResults)
				.catch(() => setResults([]))
				.finally(() => setSearching(false));
		}, 300);
		return () => clearTimeout(t);
	}, [councilId, search, candidateType]);

	const displayResults = results;

	const handleSave = () => {
		if (!selected) {
			setError('Vui lòng chọn một cán bộ');
			return;
		}
		onSave(selected);
	};

	return (
		<Modal
			open
			onClose={onClose}
			icon={<UserCheckSvg />}
			title={<>{member ? 'Đổi người' : 'Chọn người'} — {SEAT_ROLE_LABELS[role]}</>}
			subtitle='Tìm theo tên hoặc mã cán bộ'
			className={`${styles.modal} ${styles.modalSm}`}
			bodyClassName={styles.modalBody}
			footer={
				<>
					{member && onRemove ? (
						<button
							className={styles.btnDanger}
							onClick={onRemove}
							disabled={loading}
						>
							Bỏ ghế này
						</button>
					) : (
						<button
							className={styles.btnCancel}
							onClick={onClose}
							disabled={loading}
						>
							Huỷ
						</button>
					)}
					<button
						className={styles.btnConfirmApprove}
						onClick={handleSave}
						disabled={loading}
					>
						{loading ? <span className={styles.spinner} /> : <CheckSvg />}
						Lưu
					</button>
				</>
			}
		>
			{member && !selected && (
				<div className={`${styles.seatCard} ${styles.seatCardFilled}`}>
					<div>
						<div className={styles.seatRole}>Hiện tại</div>
						<div className={styles.seatName}>
							{member.full_name}
							{member.is_external && (
								<span className={styles.topicDept} style={{ marginLeft: 6 }}>
									Ngoài viện
								</span>
							)}
						</div>
						{(member.is_external ? member.ext_organization : member.department_name) && (
							<div className={styles.seatDept}>
								{member.is_external ? member.ext_organization : member.department_name}
							</div>
						)}
					</div>
				</div>
			)}

			<div className={styles.formGroup}>
				<label className={styles.formLabel}>
					{selected ? 'Đã chọn' : 'Tìm cán bộ'}
				</label>
				{selected ? (
					<div className={`${styles.seatCard} ${styles.seatCardFilled}`}>
						<div>
							<div className={styles.seatName}>{selected.full_name}</div>
							<div className={styles.seatDept}>
								{selected.is_external
									? (selected.organization ?? 'Ngoài viện')
									: selected.username}
							</div>
						</div>
						<button
							className={styles.seatBtn}
							onClick={() => {
								setSelected(null);
								setError('');
							}}
						>
							<XSvg />
						</button>
					</div>
				) : (
					<>
						{allowExternal && (
							<div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
								<button
									type='button'
									className={`${styles.specialtyChip} ${candidateType === 'internal' ? styles.specialtyChipActive : ''}`}
									onClick={() => setCandidateType('internal')}
								>
									Trong viện
								</button>
								<button
									type='button'
									className={`${styles.specialtyChip} ${candidateType === 'external' ? styles.specialtyChipActive : ''}`}
									onClick={() => setCandidateType('external')}
								>
									Ngoài viện
								</button>
							</div>
						)}
						<input
							className={styles.formInput}
							placeholder={
								candidateType === 'external'
									? 'Nhập tên hoặc đơn vị...'
									: 'Nhập tên hoặc mã cán bộ...'
							}
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							autoFocus
						/>
						{searching && (
							<div style={{ fontSize: 12, color: 'var(--color-gray-400)' }}>
								Đang tìm...
							</div>
						)}
						{displayResults.length > 0 && (
							<div className={styles.checkList}>
								{displayResults.map((u) => (
									<div
										key={u.id}
										className={styles.checkRow}
										onClick={() => {
											setSelected(u);
											setError('');
										}}
									>
										<SearchSvg style={{ width: 12, height: 12, flexShrink: 0 }} />
										<div>
											<div>
												{!u.is_external && u.qualification ? `${u.qualification}. ` : ''}
												{u.full_name}
												{!u.is_external && u.can_chair_council ? ' · CTHĐ' : ''}
											</div>
											<div style={{ fontSize: 11, color: 'var(--color-gray-400)' }}>
												{u.is_external
													? [u.organization, u.specialty_group, u.phone]
															.filter(Boolean)
															.join(' · ')
													: [
															u.username,
															u.staff_number,
															u.department_name,
															u.specialty_group,
														].filter(Boolean)
															.join(' · ')}
											</div>
											{conflictLabel(u) && (
												<div style={{ fontSize: 11, color: 'var(--color-red-500, #dc2626)' }}>
													⚠ {conflictLabel(u)}
												</div>
											)}
											{roleWarning(u, role) && (
												<div style={{ fontSize: 11, color: 'var(--color-orange-500, #ea580c)' }}>
													⚠ {roleWarning(u, role)}
												</div>
											)}
										</div>
									</div>
								))}
							</div>
						)}
					</>
				)}
				{error && <div className={styles.fieldError}>{error}</div>}
			</div>
		</Modal>
	);
}
