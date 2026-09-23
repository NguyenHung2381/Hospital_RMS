import { ChevDSvg, CheckSmSvg } from '@/assets/icons';
import type { Department } from '../../department/types/department.type';
import type { User } from '../../user/types/user.type';
import styles from '../pages/AdminNotifications.module.css';

interface DeptTargetPickerProps {
	loadingUsers: boolean;
	filteredDepts: Department[];
	usersByDept: Record<string, User[]>;
	deptSearch: string;
	expandedDepts: Set<string>;
	toggleDeptExpanded: (deptId: string) => void;
	getDeptState: (deptId: string) => 'all' | 'some' | 'none';
	toggleDeptSelection: (deptId: string) => void;
	targetIds: string[];
	toggleUserInDept: (userId: string) => void;
}

export function DeptTargetPicker({
	loadingUsers,
	filteredDepts,
	usersByDept,
	deptSearch,
	expandedDepts,
	toggleDeptExpanded,
	getDeptState,
	toggleDeptSelection,
	targetIds,
	toggleUserInDept,
}: DeptTargetPickerProps) {
	if (loadingUsers) {
		return (
			<div className={styles.deptTreeList}>
				<div className={styles.emptyDeptText}>Đang tải...</div>
			</div>
		);
	}

	if (filteredDepts.length === 0) {
		return (
			<div className={styles.deptTreeList}>
				<div className={styles.emptyDeptText}>Không tìm thấy kết quả</div>
			</div>
		);
	}

	const q = deptSearch.trim().toLowerCase();

	return (
		<div className={styles.deptTreeList}>
			{filteredDepts.map((dept) => {
				const deptUsers = usersByDept[dept.id] ?? [];
				const deptNameMatches = !q || dept.name.toLowerCase().includes(q);
				const visibleUsers = deptNameMatches
					? deptUsers
					: deptUsers.filter(
							(u) =>
								u.full_name.toLowerCase().includes(q) ||
								u.username.toLowerCase().includes(q),
						);
				const autoExpand = q.length > 0 && !deptNameMatches && visibleUsers.length > 0;
				const isExpanded = expandedDepts.has(dept.id) || autoExpand;
				const state = getDeptState(dept.id);
				const selCount = deptUsers.filter((u) => targetIds.includes(u.id)).length;

				return (
					<div
						key={dept.id}
						className={styles.deptNode}
					>
						<div className={styles.deptNodeHead}>
							{/* Expand toggle */}
							<button
								type='button'
								className={styles.expandBtn}
								onClick={() => toggleDeptExpanded(dept.id)}
							>
								<ChevDSvg
									style={{
										width: 12,
										height: 12,
										transition: 'transform 180ms',
										transform: isExpanded ? 'none' : 'rotate(-90deg)',
									}}
								/>
							</button>

							{/* Dept checkbox */}
							<span
								className={`${styles.treeCheckBox} ${state === 'all' ? styles.treeCheckOn : state === 'some' ? styles.treeCheckPartial : ''}`}
								onClick={() => toggleDeptSelection(dept.id)}
								role='checkbox'
								aria-checked={state === 'all' ? true : state === 'some' ? 'mixed' : false}
							>
								{state === 'all' && (
									<CheckSmSvg
										style={{
											width: 9,
											height: 7,
											color: '#fff',
										}}
									/>
								)}
								{state === 'some' && <span className={styles.partialDash} />}
							</span>

							{/* Name + count */}
							<span
								className={styles.deptNodeName}
								onClick={() => toggleDeptSelection(dept.id)}
							>
								{dept.name}
							</span>
							<span className={styles.deptNodeCount}>
								{selCount}/{deptUsers.length}
							</span>
						</div>

						{/* Users */}
						{isExpanded && (
							<div className={styles.deptNodeUsers}>
								{visibleUsers.length === 0 ? (
									<div className={styles.deptNodeEmpty}>
										{deptUsers.length === 0 ? 'Chưa có người dùng' : 'Không tìm thấy'}
									</div>
								) : (
									visibleUsers.map((u) => {
										const isSel = targetIds.includes(u.id);
										return (
											<label
												key={u.id}
												className={`${styles.userNode} ${isSel ? styles.userNodeOn : ''}`}
											>
												<input
													type='checkbox'
													hidden
													checked={isSel}
													onChange={() => toggleUserInDept(u.id)}
												/>
												<span
													className={`${styles.treeCheckBox} ${isSel ? styles.treeCheckOn : ''}`}
												>
													{isSel && (
														<CheckSmSvg
															style={{
																width: 9,
																height: 7,
																color: '#fff',
															}}
														/>
													)}
												</span>
												<span className={styles.userNodeName}>{u.full_name}</span>
												<span className={styles.userNodeSub}>{u.username}</span>
											</label>
										);
									})
								)}
							</div>
						)}
					</div>
				);
			})}
		</div>
	);
}
