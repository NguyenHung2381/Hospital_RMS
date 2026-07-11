import { Fragment, useMemo, useState } from 'react';
import {
	CheckSvg,
	ChevRSvg,
	ClipboardCheckSvg,
	DownloadSvg,
	EditSvg,
	RefreshSvg,
	RoundSvg,
	TopicSvg,
	TrashSvg,
	XSvg,
} from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import { AutoAssignModal } from '../components/AutoAssignModal';
import {
	CouncilBulkDeleteModal,
	CouncilBulkEditModal,
} from '../components/CouncilBulkModal';
import { CouncilDeleteModal } from '../components/CouncilDeleteModal';
import { CouncilDetailModal } from '../components/CouncilDetailModal';
import { CouncilFormModal } from '../components/CouncilFormModal';
import { exportCouncilSchedule } from '../api/councilApi';
import { useCouncils } from '../hooks/useCouncils';
import { SEAT_ROLES, STATUS_LABELS } from '../types/council.type';
import styles from './Council.module.css';

export default function Council() {
	const d = useCouncils();
	const [expanded, setExpanded] = useState<Set<string>>(new Set());

	// Gom hội đồng theo đợt, giữ thứ tự xuất hiện trong danh sách
	const groups = useMemo(() => {
		const map = new Map<string, typeof d.councils>();
		for (const c of d.councils) {
			const arr = map.get(c.round_id) ?? [];
			arr.push(c);
			map.set(c.round_id, arr);
		}
		return [...map.entries()].map(([roundId, items]) => ({
			roundId,
			label: items[0].round_name ?? roundId,
			items,
		}));
	}, [d.councils]);

	const [exportingRound, setExportingRound] = useState<string | null>(null);
	const exportRound = async (roundId: string) => {
		setExportingRound(roundId);
		try {
			const blob = await exportCouncilSchedule({ round_id: roundId });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `lich-bao-ve-${roundId}.xlsx`;
			a.click();
			URL.revokeObjectURL(url);
		} catch (e) {
			alert(e instanceof Error ? e.message : 'Xuất Excel thất bại');
		} finally {
			setExportingRound(null);
		}
	};

	const toggleExpand = (roundId: string) =>
		setExpanded((prev) => {
			const next = new Set(prev);
			if (next.has(roundId)) next.delete(roundId);
			else next.add(roundId);
			return next;
		});

	const headerActions = (
		<div className={styles.headerActions}>
			<button
				className={styles.btnCreateCouncil}
				onClick={() => d.setModal('auto-assign')}
			>
				<RefreshSvg /> Tự động phân công
			</button>
			<button
				className={styles.btnCreateCouncil}
				onClick={() => d.setModal('add')}
			>
				<RefreshSvg /> Tạo hội đồng
			</button>
		</div>
	);

	return (
		<AdminLayout
			pageTitle='Quản lý Hội đồng chấm đề cương'
			pageSubtitle='Thành lập hội đồng và phân công đề tài để chấm'
			headerActions={headerActions}
		>
			{/* ── STATS ── */}
			<div className={styles.statsRow}>
				{[
					{ value: d.stats.total, label: 'Tổng hội đồng', cls: 'green', icon: <ClipboardCheckSvg /> },
					{ value: d.stats.draft, label: 'Đang nháp', cls: 'amber', icon: <EditSvg /> },
					{ value: d.stats.finalized, label: 'Đã chốt', cls: 'blue', icon: <CheckSvg /> },
					{ value: d.stats.topicSum, label: 'Đề tài đã gán', cls: 'gray', icon: <TopicSvg /> },
				].map((s) => (
					<div
						key={s.label}
						className={`${styles.statCard} ${styles[s.cls as keyof typeof styles]}`}
					>
						<div
							className={`${styles.statIcon} ${styles[`icon${s.cls.charAt(0).toUpperCase()}${s.cls.slice(1)}` as keyof typeof styles]}`}
						>
							{s.icon}
						</div>
						<div>
							<div className={styles.statValue}>{s.value}</div>
							<div className={styles.statLabel}>{s.label}</div>
						</div>
					</div>
				))}
			</div>

			{/* ── TOOLBAR ── */}
			<div className={styles.toolbar}>
				<select
					className={styles.formSelect}
					value={d.roundFilter}
					onChange={(e) => d.setRoundFilter(e.target.value)}
				>
					<option value='all'>Tất cả đợt nghiên cứu</option>
					{d.rounds.map((r) => (
						<option
							key={r.id}
							value={r.id}
						>
							{r.name} ({r.year})
						</option>
					))}
				</select>
				<select
					className={styles.formSelect}
					value={d.statusFilter}
					onChange={(e) =>
						d.setStatusFilter(e.target.value as typeof d.statusFilter)
					}
				>
					<option value='all'>Tất cả trạng thái</option>
					{Object.entries(STATUS_LABELS).map(([v, label]) => (
						<option
							key={v}
							value={v}
						>
							{label}
						</option>
					))}
				</select>
				{d.selected.size > 0 && (
					<div className={styles.bulkBar}>
						<span className={styles.bulkCount}>Đã chọn {d.selected.size}</span>
						<button
							className={styles.bulkBtn}
							onClick={() => d.setModal('bulk-edit')}
						>
							<EditSvg /> Sửa đồng loạt
						</button>
						<button
							className={`${styles.bulkBtn} ${styles.bulkBtnDanger}`}
							onClick={() => d.setModal('bulk-delete')}
						>
							<TrashSvg /> Xoá đã chọn
						</button>
						<button
							className={styles.bulkBtn}
							onClick={d.clearSelection}
						>
							<XSvg /> Bỏ chọn
						</button>
					</div>
				)}
				<span className={styles.resultCount}>{d.councils.length} hội đồng</span>
			</div>

			{/* ── TABLE ── */}
			<div className={styles.tableWrap}>
				<table className={styles.table}>
					<thead>
						<tr>
							<th className={`${styles.th} ${styles.thCheck}`}>
								<input
									type='checkbox'
									className={styles.rowCheckbox}
									title='Chọn tất cả'
									checked={d.allSelected}
									onChange={d.toggleSelectAll}
								/>
							</th>
							<th className={styles.th}>Hội đồng</th>
							<th className={styles.th}>Hệ chuyên môn</th>
							<th className={styles.th}>Địa điểm</th>
							<th className={styles.th}>Thành viên</th>
							<th className={styles.th}>Số đề tài</th>
							<th className={styles.th}>Trạng thái</th>
							<th className={`${styles.th} ${styles.thRight}`}>Thao tác</th>
						</tr>
					</thead>
					<tbody>
						{d.isLoadingData ? (
							<tr>
								<td colSpan={8}>
									<div className={styles.emptyState}>
										<div className={styles.emptyDesc}>Đang tải dữ liệu...</div>
									</div>
								</td>
							</tr>
						) : d.councils.length === 0 ? (
							<tr>
								<td colSpan={8}>
									<div className={styles.emptyState}>
										<div className={styles.emptyTitle}>
											Chưa có hội đồng nào
										</div>
										<div className={styles.emptyDesc}>
											Tạo hội đồng mới hoặc thử thay đổi bộ lọc
										</div>
									</div>
								</td>
							</tr>
						) : (
							groups.map((g) => {
								const open = expanded.has(g.roundId);
								const allInRound = g.items.every((c) =>
									d.selected.has(c.id),
								);
								return (
									<Fragment key={g.roundId}>
										<tr
											className={styles.groupRow}
											onClick={() => toggleExpand(g.roundId)}
										>
											<td
												className={`${styles.td} ${styles.thCheck}`}
												onClick={(e) => e.stopPropagation()}
											>
												<input
													type='checkbox'
													className={styles.rowCheckbox}
													title='Chọn cả đợt'
													checked={allInRound}
													onChange={() =>
														d.setManySelected(
															g.items.map((c) => c.id),
															!allInRound,
														)
													}
												/>
											</td>
											<td
												colSpan={7}
												className={styles.groupCell}
											>
												<span
													className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`}
												>
													<ChevRSvg />
												</span>
												<span className={styles.groupIcon}>
													<RoundSvg />
												</span>
												{g.label}
												<span className={styles.groupCount}>
													{g.items.length} hội đồng
												</span>
												<button
													className={styles.btnExportRound}
													title='Xuất Excel lịch bảo vệ đợt này'
													disabled={exportingRound === g.roundId}
													onClick={(e) => {
														e.stopPropagation();
														exportRound(g.roundId);
													}}
												>
													<DownloadSvg />
													{exportingRound === g.roundId
														? 'Đang xuất…'
														: 'Xuất Excel'}
												</button>
											</td>
										</tr>
										{open &&
											g.items.map((c) => (
								<tr
									key={c.id}
									className={`${styles.tr} ${d.selected.has(c.id) ? styles.trSelected : ''}`}
									onClick={() => {
										d.setActiveCouncil(c);
										d.setModal('detail');
									}}
								>
									<td
										className={`${styles.td} ${styles.thCheck}`}
										onClick={(e) => e.stopPropagation()}
									>
										<input
											type='checkbox'
											className={styles.rowCheckbox}
											checked={d.selected.has(c.id)}
											onChange={() => d.toggleSelect(c.id)}
										/>
									</td>
									<td className={styles.td}>
										<div className={styles.councilName}>{c.name}</div>
										<div className={styles.councilSub}>{c.id}</div>
									</td>
									<td className={styles.td}>
										{c.specialty_group ?? (
											<span className={styles.emptyDash}>—</span>
										)}
									</td>
									<td className={styles.td}>
										{c.location ?? <span className={styles.emptyDash}>—</span>}
									</td>
									<td className={styles.td}>
										<div
											className={styles.memberCell}
											title={c.members_summary || 'Chưa xếp thành viên'}
										>
											<span
												className={`${styles.badge} ${(c.member_count ?? 0) >= SEAT_ROLES.length ? styles.badgeFinalized : styles.badgeDraft}`}
											>
												{c.member_count ?? 0}/{SEAT_ROLES.length}
											</span>
											<span className={styles.memberNames}>
												{c.members_summary || (
													<span className={styles.emptyDash}>
														Chưa xếp thành viên
													</span>
												)}
											</span>
										</div>
									</td>
									<td className={styles.td}>
										<div className={styles.statCell}>
											<TopicSvg />
											{c.topic_count ?? 0}
										</div>
									</td>
									<td className={styles.td}>
										<span
											className={`${styles.badge} ${c.status === 'finalized' ? styles.badgeFinalized : styles.badgeDraft}`}
										>
											{STATUS_LABELS[c.status]}
										</span>
									</td>
									<td
										className={`${styles.td} ${styles.tdActions}`}
										onClick={(e) => e.stopPropagation()}
									>
										<button
											className={`${styles.actionBtn} ${styles.actionEdit}`}
											title='Chỉnh sửa'
											onClick={() => {
												d.setActiveCouncil(c);
												d.setModal('edit');
											}}
										>
											<EditSvg />
										</button>
										<button
											className={`${styles.actionBtn} ${styles.actionDelete}`}
											title='Xoá'
											onClick={() => {
												d.setActiveCouncil(c);
												d.setModal('delete');
											}}
										>
											<TrashSvg />
										</button>
									</td>
								</tr>
											))}
									</Fragment>
								);
							})
						)}
					</tbody>
				</table>
			</div>

			{/* ── MODALS ── */}
			{d.modal === 'auto-assign' && (
				<AutoAssignModal
					rounds={d.rounds}
					existingCouncils={d.allCouncils}
					onClose={() => d.setModal(null)}
					onDone={d.refreshData}
				/>
			)}
			{d.modal === 'add' && (
				<CouncilFormModal
					mode='add'
					rounds={d.rounds}
					onClose={() => d.setModal(null)}
					onSave={d.handleCreate}
					loading={d.loading}
				/>
			)}
			{d.modal === 'edit' && d.activeCouncil && (
				<CouncilFormModal
					mode='edit'
					council={d.activeCouncil}
					rounds={d.rounds}
					onClose={() => {
						d.setModal(null);
						d.setActiveCouncil(null);
					}}
					onSave={d.handleEdit}
					loading={d.loading}
				/>
			)}
			{d.modal === 'delete' && d.activeCouncil && (
				<CouncilDeleteModal
					council={d.activeCouncil}
					onClose={() => {
						d.setModal(null);
						d.setActiveCouncil(null);
					}}
					onConfirm={d.handleDelete}
					loading={d.loading}
				/>
			)}
			{d.modal === 'detail' && d.activeCouncil && (
				<CouncilDetailModal
					councilId={d.activeCouncil.id}
					onClose={() => {
						d.setModal(null);
						d.setActiveCouncil(null);
					}}
					onChanged={d.refreshData}
				/>
			)}
			{d.modal === 'bulk-edit' && (
				<CouncilBulkEditModal
					count={d.selected.size}
					onClose={() => d.setModal(null)}
					onSave={d.handleBulkEdit}
					loading={d.loading}
				/>
			)}
			{d.modal === 'bulk-delete' && (
				<CouncilBulkDeleteModal
					count={d.selected.size}
					onClose={() => d.setModal(null)}
					onConfirm={d.handleBulkDelete}
					loading={d.loading}
				/>
			)}
			{/* ── TOAST ── */}
			{d.toast && (
				<div
					className={`${styles.toast} ${d.toast.type === 'success' ? styles.toastSuccess : styles.toastError}`}
				>
					{d.toast.type === 'success' ? <CheckSvg /> : <XSvg />}
					{d.toast.msg}
				</div>
			)}
		</AdminLayout>
	);
}
