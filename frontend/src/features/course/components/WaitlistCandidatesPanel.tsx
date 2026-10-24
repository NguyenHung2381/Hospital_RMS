import { useCallback, useEffect, useState } from 'react';
import { ChevDSvg, UserPlusSvg } from '@/assets/icons';
import { Button } from '@/shared/components';
import { usePermission } from '@/shared/hooks/usePermission';
import { showToast } from '@/shared/utils/feedback';
import { formatDateOr } from '@/shared/utils/formatDate';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { getWaitlistCandidates, transferWaitlisted, type WaitlistClass } from '../api/courseApi';
import styles from './WaitlistCandidatesPanel.module.css';

/**
 * "Người chờ từ đợt trước" (GĐ4, quyết định 12c): nội viện vào danh sách chờ khi lớp đợt
 * trước đầy. Đợt mới cùng chương trình không tự kéo người sang — khối này gợi ý, phòng Đào
 * tạo chọn rồi bấm chuyển (ai chờ lâu đứng trước, không vượt chỗ trống của lớp).
 */
export function WaitlistCandidatesPanel({ courseId, onMoved }: { courseId: string; onMoved: () => void }) {
	const canMove = usePermission().has('courses:approve');
	const [classes, setClasses] = useState<WaitlistClass[]>([]);
	const [open, setOpen] = useState(false);
	const [picked, setPicked] = useState<Set<string>>(() => new Set());
	const [busy, setBusy] = useState(false);

	const load = useCallback(
		() =>
			getWaitlistCandidates(courseId)
				.then((r) => {
					setClasses(r);
					// Bỏ chọn người không còn trong danh sách (đã được chuyển ở nơi khác)
					const ids = new Set(r.flatMap((k) => k.candidates.map((c) => c.id)));
					setPicked((s) => new Set([...s].filter((id) => ids.has(id))));
				})
				.catch(() => setClasses([])),
		[courseId],
	);
	useEffect(() => {
		void load();
	}, [load]);
	useRealtimeUpdate('course_enrollment', load);

	const total = classes.reduce((n, k) => n + k.candidates.length, 0);
	if (!total) return null;

	const toggle = (id: string) =>
		setPicked((s) => {
			const n = new Set(s);
			if (n.has(id)) n.delete(id);
			else n.add(id);
			return n;
		});
	// Chọn nhanh: người chờ lâu nhất, vừa đủ chỗ trống của lớp
	const pickFirst = (k: WaitlistClass) =>
		setPicked((s) => {
			const n = new Set([...s].filter((id) => !k.candidates.some((c) => c.id === id)));
			k.candidates.slice(0, k.room ?? k.candidates.length).forEach((c) => n.add(c.id));
			return n;
		});

	const move = async () => {
		setBusy(true);
		try {
			const r = await transferWaitlisted(courseId, [...picked]);
			showToast(
				r.full ? 'info' : 'success',
				`Đã chuyển ${r.moved} học viên vào đợt này${r.full ? ` · ${r.full} người không chuyển được vì lớp đã đủ sĩ số` : ''}`,
			);
			setPicked(new Set());
			onMoved();
			void load();
		} catch (err) {
			showToast('error', err instanceof Error ? err.message : 'Chuyển học viên thất bại');
		} finally {
			setBusy(false);
		}
	};

	return (
		<section className={styles.panel}>
			<button type='button' className={styles.head} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
				<UserPlusSvg className={styles.icon} />
				<span className={styles.title}>Người chờ từ đợt trước ({total})</span>
				<span className={styles.sub}>Nội viện đã vào danh sách chờ vì lớp đợt trước đầy — chọn để chuyển sang đợt này</span>
				<ChevDSvg className={`${styles.chev} ${open ? styles.chevOpen : ''}`} />
			</button>
			{open && (
				<div className={styles.body}>
					{classes.map((k) => (
						<div key={k.program_id} className={styles.group}>
							<div className={styles.groupHead}>
								<b>{k.program_code ? `${k.program_code} — ${k.program_name}` : k.program_name}</b>
								<span className={k.room === 0 ? styles.full : styles.muted}>
									{k.room == null ? 'Không giới hạn sĩ số' : k.room === 0 ? 'Lớp đã đủ sĩ số' : `Còn ${k.room} chỗ`}
									{k.started && ' · lớp đã khai giảng'}
								</span>
								{canMove && k.room !== 0 && (
									<button type='button' className={styles.link} onClick={() => pickFirst(k)}>
										Chọn {Math.min(k.room ?? k.candidates.length, k.candidates.length)} người chờ lâu nhất
									</button>
								)}
							</div>
							<ul className={styles.list}>
								{k.candidates.map((c) => (
									<li key={c.id}>
										<label className={styles.row}>
											<input
												type='checkbox'
												checked={picked.has(c.id)}
												disabled={!canMove || busy}
												onChange={() => toggle(c.id)}
											/>
											<span className={styles.pos}>#{c.waitlist_position}</span>
											<span className={styles.name}>{c.trainee_name}</span>
											<span className={styles.muted}>
												{[c.trainee_phone, `chờ từ ${c.from_course_name}`, formatDateOr(c.decided_at, '')]
													.filter(Boolean)
													.join(' · ')}
											</span>
										</label>
									</li>
								))}
							</ul>
						</div>
					))}
					{canMove && (
						<div className={styles.actions}>
							<Button size='sm' icon={<UserPlusSvg />} loading={busy} disabled={!picked.size} onClick={() => void move()}>
								Chuyển {picked.size || ''} học viên vào đợt này
							</Button>
						</div>
					)}
				</div>
			)}
		</section>
	);
}
