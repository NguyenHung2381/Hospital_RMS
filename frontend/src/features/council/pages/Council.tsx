import { RowActions } from '@/shared/components/Table/TableToolbar';
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
	UploadSvg,
	UserSvg,
} from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import { Badge } from '@/shared/components';
import { BulkButton, SelectCheckbox } from '../../../shared/components/Table/RowSelect';
import sel from '../../../shared/components/Table/RowSelect.module.css';
import tbl from '@/shared/components/Table/Table.module.css';
import { SkeletonTable } from '../../../shared/components/Loading';
import { AutoAssignModal } from '../components/AutoAssignModal';
import {
	CouncilBulkDeleteModal,
	CouncilBulkEditModal,
} from '../components/CouncilBulkModal';
import { CouncilDeleteModal } from '../components/CouncilDeleteModal';
import { CouncilDetailModal } from '../components/CouncilDetailModal';
import { CouncilFormModal } from '../components/CouncilFormModal';
import { CouncilImportModal } from '../components/CouncilImportModal';
import { exportCouncilSchedule } from '../api/councilApi';
import { useCouncils } from '../hooks/useCouncils';
import { SEAT_ROLES, STATUS_LABELS, type Council } from '../types/council.type';
import styles from './Council.module.css';
import { useClientPaging } from '@/shared/hooks/useClientPaging';
import { Pagination } from '@/shared/components/Table/Pagination';

export default function Council() {
	const d = useCouncils();
	const [expanded, setExpanded] = useState<Set<string>>(new Set());

	// Gom hội đồng theo đợt, đợt mới nhất (năm giảm dần, số đợt giảm dần) lên đầu
	const groups = useMemo(() => {
		const map = new Map<string, Council[]>();
		for (const c of d.councils) {
			const arr = map.get(c.round_id) ?? [];
			arr.push(c);
			map.set(c.round_id, arr);
		}
		const roundById = new Map(d.rounds.map((r) => [r.id, r]));
		return [...map.entries()]
			.map(([roundId, items]) => ({
				roundId,
				label: items[0].round_name ?? roundId,
				items,
			}))
			.sort((a, b) => {
				const ra = roundById.get(a.roundId);
				const rb = roundById.get(b.roundId);
				return (
					(rb?.year ?? 0) - (ra?.year ?? 0) ||
					(rb?.round_number ?? 0) - (ra?.round_number ?? 0)
				);
			});
	}, [d.councils, d.rounds]);
	// Phân trang theo đợt: mỗi đợt là một nhóm hàng, không cắt đôi nhóm giữa 2 trang
	const pg = useClientPaging(groups);

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
				className={`${styles.btnCreateCouncil} ${styles.btnAmber}`}
				onClick={() => d.setModal('auto-assign')}
			>
				<RefreshSvg /> Tự động phân công
			</button>
			<button
				className={styles.btnCreateCouncil}
				onClick={() => d.setModal('import')}
			>
				<UploadSvg /> Nhập Excel
			</button>
			<button
				className={`${styles.btnCreateCouncil} ${styles.btnGreen}`}
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

			{/* ── TABLE CARD ── */}
			<div className={styles.tableCard}>
				<div className={styles.tableHeader}>
					<div className={styles.tableHeaderLeft}>
						<span className={styles.tableTitle}>Danh sách hội đồng</span>
						{d.selected.size > 0 ? (
							<span className={styles.tableCount}>
								Đã chọn {d.selected.size}
								<BulkButton onClick={() => d.setModal('bulk-edit')}>
									<EditSvg /> Sửa đồng loạt
								</BulkButton>
								<BulkButton
									danger
									onClick={() => d.setModal('bulk-delete')}
								>
									<TrashSvg /> Xoá đã chọn
								</BulkButton>
								<button
									type='button'
									className={styles.clearSelectionBtn}
									onClick={d.clearSelection}
								>
									Bỏ chọn
								</button>
							</span>
						) : (
							<span className={styles.tableCount}>
								{d.councils.length} hội đồng
							</span>
						)}
					</div>
					<div className={styles.tableControls}>
						<select
							className={styles.filterSelect}
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
							className={styles.filterSelect}
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
					</div>
				</div>

				<div className={styles.tableWrap}>
				<table className={styles.table}>
					<thead>
						<tr>
							<th className={`${styles.th} ${sel.checkCol}`}>
								<SelectCheckbox
									title='Chọn tất cả'
									checked={d.allSelected}
									indeterminate={d.selected.size > 0}
									onChange={d.toggleSelectAll}
								/>
							</th>
							<th className={`${styles.th} ${tbl.thIdx}`}>STT</th>
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
							<SkeletonTable
								rows={8}
								cols={9}
							/>
						) : d.councils.length === 0 ? (
							<tr>
								<td colSpan={9}>
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
							pg.paged.map((g) => {
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
												className={`${styles.td} ${sel.checkCol}`}
												onClick={(e) => e.stopPropagation()}
											>
												<SelectCheckbox
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
												colSpan={8}
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
											g.items.map((c, i) => (
								<tr
									key={c.id}
									className={`${styles.tr} ${d.selected.has(c.id) ? sel.rowSelected : ''}`}
									onClick={() => {
										d.setActiveCouncil(c);
										d.setModal('detail');
									}}
								>
									<td
										className={`${styles.td} ${sel.checkCol}`}
										onClick={(e) => e.stopPropagation()}
									>
										<SelectCheckbox
											checked={d.selected.has(c.id)}
											onChange={() => d.toggleSelect(c.id)}
										/>
									</td>
									<td className={`${styles.td} ${tbl.tdIdx}`}>{i + 1}</td>
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
											<Badge
												tone={
													(c.member_count ?? 0) >= SEAT_ROLES.length
														? 'green'
														: 'amber'
												}
											>
												{c.member_count ?? 0}/{SEAT_ROLES.length}
											</Badge>
											{c.members_summary ? (
												<ul className={styles.memberList}>
													{c.members_summary
														.split(/,\s+(?=(?:CT|TK|PB1|PB2|TV): )/)
														.map((m) => {
															const i = m.indexOf(': ');
															const role = i > 0 ? m.slice(0, i) : '';
															return (
																<li
																	key={m}
																	className={`${styles.memberItem} ${styles[`role${role}`] ?? ''}`}
																>
																	<UserSvg />
																	{role && (
																		<span className={styles.memberRole}>
																			{role}
																		</span>
																	)}
																	<span className={styles.memberName}>
																		{i > 0 ? m.slice(i + 2) : m}
																	</span>
																</li>
															);
														})}
												</ul>
											) : (
												<span className={styles.emptyDash}>
													Chưa xếp thành viên
												</span>
											)}
										</div>
									</td>
									<td className={styles.td}>
										<div className={styles.statCell}>
											<TopicSvg />
											{c.topic_count ?? 0}
										</div>
									</td>
									<td className={styles.td}>
										<Badge tone={c.status === 'finalized' ? 'green' : 'amber'}>
											{STATUS_LABELS[c.status]}
										</Badge>
									</td>
									<td
										className={`${styles.td} ${styles.tdActions}`}
										onClick={(e) => e.stopPropagation()}
									>
										<RowActions
											onEdit={() => {
												d.setActiveCouncil(c);
												d.setModal('edit');
											}}
											onDelete={() => {
												d.setActiveCouncil(c);
												d.setModal('delete');
											}}
										/>
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
				<Pagination
					{...pg.pagination}
					itemLabel='đợt'
				/>
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
			{d.modal === 'import' && (
				<CouncilImportModal
					rounds={d.rounds}
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
		</AdminLayout>
	);
}
