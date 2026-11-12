import { useMemo, useState } from 'react';
import { BadgeSvg, CheckSvg, ChevRSvg, FilePdfSvg, PlusSvg, UploadSvg, UsersSvg } from '@/assets/icons';
import { Badge } from '@/shared/components';
import { Pagination } from '@/shared/components/Table/Pagination';
import { BulkBar, BulkButton, SelectCheckbox } from '@/shared/components/Table/RowSelect';
import sel from '@/shared/components/Table/RowSelect.module.css';
import tbl from '@/shared/components/Table/Table.module.css';
import { SearchInput } from '@/shared/components/Table/TableToolbar';
import { useClientPaging } from '@/shared/hooks/useClientPaging';
import { useRowSelection } from '@/shared/hooks/useRowSelection';
import { formatDateTimeVN } from '@/shared/utils/formatDate';
import { removeDiacritics } from '@/shared/utils/helper';
import { cx } from '@/shared/utils/cx';
import { RequiredAbsenteesCard } from '../RequiredAbsenteesCard';
import sem from '../../pages/Seminar.module.css';
import {
	PARTICIPATION_LABELS,
	type ParticipationType,
	type Seminar,
	type SeminarParticipant,
} from '../../types/seminar.type';
import s from './Detail.module.css';
import { CmeStatusBadge } from './ParticipantDrawer';
import { cmeEligible, fullName, testPassed, testScore, unitOf } from './detailUtils';
import type { TabProps } from './types';

const ROLES: { key: 'all' | ParticipationType; label: string }[] = [
	{ key: 'all', label: 'Tất cả' },
	{ key: 'attendee', label: 'Đại biểu' },
	{ key: 'speaker', label: 'Báo cáo viên' },
	{ key: 'trainee', label: 'Học viên' },
];

const fold = (v: string) => removeDiacritics(v).toLowerCase();

/**
 * Tab "Người tham gia": bảng gọn (họ tên + khoa/phòng, điểm danh, bài kiểm tra, CME);
 * bấm 1 dòng mở drawer đầy đủ thông tin + thao tác. Chọn nhiều dòng để cấp CME / xóa hàng loạt.
 */
export function ParticipantsTab({
	seminar: sm,
	participants,
	perms,
	actions,
	ht,
	openId,
	onRefresh,
	onBulkDelete,
	busy,
}: TabProps & {
	openId: string | null;
	onRefresh: () => void;
	onBulkDelete: (ids: string[]) => Promise<void>;
	busy: boolean;
}) {
	const [role, setRole] = useState<'all' | ParticipationType>('all');
	const [q, setQ] = useState('');
	const hosted = sm.scope === 'hosted';
	const hasTest = !!sm.test_questions;

	const roleCount = useMemo(() => {
		const m: Record<string, number> = { all: participants.length };
		for (const p of participants) m[p.participation_type] = (m[p.participation_type] ?? 0) + 1;
		return m;
	}, [participants]);

	const filtered = useMemo(() => {
		const needle = fold(q.trim());
		return participants.filter((p) => {
			if (role !== 'all' && p.participation_type !== role) return false;
			if (!needle) return true;
			const hay = [
				p.full_name,
				p.title_prefix,
				p.phone,
				p.email,
				p.organization,
				p.user_department_name,
				p.department_raw,
				p.cme_certificate_no,
				p.staff_number ?? p.user_staff_number,
			]
				.filter((x) => x != null && x !== '')
				.join(' ');
			return fold(hay).includes(needle);
		});
	}, [participants, role, q]);

	const pg = useClientPaging(filtered);
	const rowSel = useRowSelection(pg.paged.map((p) => p.id));
	const selected = filtered.filter((p) => rowSel.isSelected(p.id));
	const issuable = selected.filter((p) => p.cme_seq == null && cmeEligible(p, sm));
	const notEligible = selected.filter((p) => p.cme_seq == null).length - issuable.length;
	const signable = selected.filter((p) => p.cme_seq != null && p.cme_status !== 'signed');
	const certTargets = selected.filter((p) => !!p.cme_certificate_no);

	const changeRole = (r: typeof role) => {
		setRole(r);
		rowSel.clearSelection();
	};

	return (
		<>
			<div className={sem.tableCard}>
				<div className={sem.tableHeader}>
					<div className={sem.tableHeaderLeft}>
						<span className={sem.tableTitle}>Người tham gia</span>
						<span className={sem.tableCount}>
							{filtered.length !== participants.length
								? `${filtered.length}/${participants.length} người`
								: `${participants.length} người`}
						</span>
					</div>
					<div className={sem.tableControls}>
						{perms.canImport && (
							<button
								className={sem.btnGhost}
								onClick={actions.openImport}
							>
								<UploadSvg /> Nhập Excel
							</button>
						)}
						{perms.canUpdate && ht && (
							<button
								className={sem.btnGhost}
								onClick={actions.openStaff}
							>
								<UsersSvg /> Thêm theo khoa
							</button>
						)}
						{perms.canUpdate && (
							<button
								className={sem.btnPrimary}
								onClick={actions.addParticipant}
							>
								<PlusSvg /> Thêm người
							</button>
						)}
					</div>
				</div>

				<div className={s.filterRow}>
					<div
						className={s.segment}
						role='tablist'
						aria-label='Lọc theo vai trò'
					>
						{ROLES.map((r) => (
							<button
								key={r.key}
								type='button'
								role='tab'
								aria-selected={role === r.key}
								className={role === r.key ? s.segActive : undefined}
								onClick={() => changeRole(r.key)}
							>
								{r.label}
								<small>{roleCount[r.key] ?? 0}</small>
							</button>
						))}
					</div>
					<SearchInput
						value={q}
						onChange={(v) => {
							setQ(v);
							pg.setPage(1);
						}}
						placeholder='Tìm tên, khoa, SĐT…'
					/>
				</div>

				<div className={sem.tableWrap}>
					<BulkBar
						rowSel={rowSel}
						itemLabel='người'
						loading={busy}
						onBulkDelete={async (ids) => {
							await onBulkDelete(ids);
							rowSel.clearSelection();
						}}
						extraActions={
							perms.canCme &&
							sm.grants_cme && (
								<>
									<BulkButton
										onClick={() => actions.issueCme(issuable, notEligible, rowSel.clearSelection)}
										disabled={!issuable.length}
									>
										<BadgeSvg /> Cấp CME ({issuable.length})
									</BulkButton>
									<BulkButton
										onClick={() => actions.markSigned(signable.map((p) => p.id))}
										disabled={!signable.length}
									>
										<CheckSvg /> Đã ký ({signable.length})
									</BulkButton>
									<BulkButton
										onClick={() => actions.openCertificates(certTargets, selected.length)}
										disabled={!certTargets.length}
									>
										<FilePdfSvg /> Giấy chứng nhận ({certTargets.length})
									</BulkButton>
								</>
							)
						}
					/>
					<table className={sem.table}>
						<thead>
							<tr>
								<th className={sel.checkCol}>
									<SelectCheckbox
										title='Chọn tất cả'
										checked={rowSel.allPageSelected}
										indeterminate={rowSel.somePageSelected && !rowSel.allPageSelected}
										onChange={rowSel.toggleSelectAll}
									/>
								</th>
								<th className={cx(tbl.thIdx, s.hideSm)}>STT</th>
								<th>Họ tên</th>
								{hosted && <th>Điểm danh</th>}
								{hosted && hasTest && <th>Bài kiểm tra</th>}
								{sm.grants_cme && <th>CME</th>}
								<th
									className={sem.thRight}
									aria-label='Mở chi tiết'
								/>
							</tr>
						</thead>
						<tbody>
							{filtered.length === 0 ? (
								<tr>
									<td colSpan={10}>
										<div className={sem.emptyState}>
											<div className={sem.emptyDesc}>
												{participants.length ? 'Không có người phù hợp bộ lọc' : 'Chưa có người nào'}
											</div>
										</div>
									</td>
								</tr>
							) : (
								pg.paged.map((p, i) => (
									<tr
										key={p.id}
										className={cx(
											s.rowClick,
											rowSel.isSelected(p.id) && sel.rowSelected,
											openId === p.id && s.rowOpen,
										)}
										onClick={() => actions.openParticipant(p.id)}
									>
										<td
											className={sel.checkCol}
											onClick={(e) => e.stopPropagation()}
										>
											<SelectCheckbox
												title='Chọn'
												checked={rowSel.isSelected(p.id)}
												onChange={() => rowSel.toggleSelect(p.id)}
											/>
										</td>
										<td className={cx(sem.tdIdx, s.hideSm)}>{pg.offset + i + 1}</td>
										<td>
											<button
												type='button'
												className={s.nameBtn}
												onClick={(e) => {
													e.stopPropagation();
													actions.openParticipant(p.id);
												}}
											>
												{fullName(p)}
											</button>
											{p.is_foreign && (
												<Badge
													tone='amber'
													style={{ marginLeft: 6 }}
												>
													NN
												</Badge>
											)}
											<div className={s.sub}>
												{[unitOf(p), role === 'all' ? PARTICIPATION_LABELS[p.participation_type] : null]
													.filter(Boolean)
													.join(' · ') || '—'}
											</div>
										</td>
										{hosted && (
											<td className={s.nowrap}>
												<CheckinCell p={p} />
											</td>
										)}
										{hosted && hasTest && (
											<td className={s.nowrap}>
												<TestCell
													s={sm}
													p={p}
												/>
											</td>
										)}
										{sm.grants_cme && (
											<td className={s.nowrap}>
												<CmeStatusBadge p={p} />
												{p.cme_certificate_no && <div className={s.sub}>Số {p.cme_certificate_no}</div>}
											</td>
										)}
										<td className={sem.tdRight}>
											<span className={s.chev}>
												<ChevRSvg />
											</span>
										</td>
									</tr>
								))
							)}
						</tbody>
					</table>
				</div>
				<Pagination
					{...pg.pagination}
					itemLabel='người'
				/>
			</div>

			{ht && !!sm.required_departments?.length && (
				<RequiredAbsenteesCard
					seminarId={sm.id}
					version={sm}
					canAdd={perms.canUpdate}
					onAdded={onRefresh}
				/>
			)}
		</>
	);
}

/** Trạng thái đăng ký / điểm danh trên 1 ô */
export function CheckinCell({ p }: { p: SeminarParticipant }) {
	if (p.checked_in_at)
		return (
			<span title={`Điểm danh lúc ${formatDateTimeVN(p.checked_in_at)}`}>
				<Badge
					tone='green'
					dot
				>
					Đã điểm danh
				</Badge>
			</span>
		);
	if (p.ticket_code)
		return (
			<Badge
				tone='blue'
				dot
			>
				Đã đăng ký
			</Badge>
		);
	return <span className={sem.muted}>Chưa điểm danh</span>;
}

/** Kết quả bài kiểm tra trên 1 ô */
export function TestCell({ s: sm, p }: { s: Seminar; p: SeminarParticipant }) {
	if (p.test_submitted_at) {
		const ok = testPassed(sm, p);
		return (
			<span
				className={s.score}
				title={`Đúng ${p.test_correct}/${p.test_total} câu`}
			>
				<b>{testScore(p)}</b>/{p.test_max_score ?? p.test_total}
				{sm.test_pass_score != null && (
					<span
						className={ok ? sem.okText : sem.badText}
						style={{ marginLeft: 6 }}
					>
						{ok ? 'Đạt' : 'Chưa đạt'}
					</span>
				)}
			</span>
		);
	}
	if (p.test_started_at) return <span className={sem.muted}>Đang làm</span>;
	return <span className={sem.muted}>—</span>;
}
