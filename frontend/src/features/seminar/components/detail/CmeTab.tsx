import { useMemo } from 'react';
import { BadgeSvg, CheckSvg, FilePdfSvg, InfoSvg, UserCheckSvg, WarnSvg } from '@/assets/icons';
import { cx } from '@/shared/utils/cx';
import sem from '../../pages/Seminar.module.css';
import s from './Detail.module.css';
import { Kpi } from './OverviewTab';
import { CmeStatusBadge } from './ParticipantDrawer';
import { PersonList } from './PersonList';
import { cmeBlockReason, cmeEligible, fmtDate } from './detailUtils';
import type { TabProps } from './types';

/** Tab "Chứng nhận CME": cấp số, ký nhận, xuất giấy chứng nhận. */
export function CmeTab({ seminar: sm, participants, counts, perms, actions }: TabProps) {
	const numbered = useMemo(
		() =>
			participants
				.filter((p) => p.cme_seq != null)
				.sort((a, b) => (a.cme_year ?? 0) - (b.cme_year ?? 0) || (a.cme_seq ?? 0) - (b.cme_seq ?? 0)),
		[participants],
	);
	const ready = useMemo(() => participants.filter((p) => p.cme_seq == null && cmeEligible(p, sm)), [participants, sm]);
	const blocked = useMemo(() => participants.filter((p) => p.cme_seq == null && !cmeEligible(p, sm)), [participants, sm]);
	const signable = numbered.filter((p) => p.cme_status !== 'signed');
	const withCert = numbered.filter((p) => !!p.cme_certificate_no);
	const canAct = perms.canCme && sm.grants_cme;

	return (
		<div className={s.stack}>
			{!sm.grants_cme && (
				<div className={s.notice}>
					<InfoSvg />
					<span>
						Hội nghị chưa bật “Có cấp CME” — bật ở <b>Danh sách hội thảo → Sửa</b> để cấp số và xuất giấy chứng
						nhận.
					</span>
				</div>
			)}

			<div className={s.kpis}>
				<Kpi
					icon={<BadgeSvg />}
					label='Đã cấp số CME'
					value={counts.cmeIssued}
					of={counts.total}
					sub={sm.cme_default_credits ? `${sm.cme_default_credits} tín chỉ / người (mặc định)` : undefined}
				/>
				<Kpi
					icon={<CheckSvg />}
					label='Đã ký nhận'
					value={counts.cmeSigned}
					of={counts.cmeIssued}
				/>
				<Kpi
					icon={<UserCheckSvg />}
					label='Đủ điều kiện, chờ cấp'
					value={counts.cmeReady}
				/>
				<Kpi
					icon={<WarnSvg />}
					label='Chưa đủ điều kiện'
					value={counts.cmeBlocked}
					sub='tự đăng ký nhưng chưa điểm danh / chưa đạt bài kiểm tra'
				/>
			</div>

			{perms.canCme && (
				<section className={s.card}>
					<div className={s.cardHead}>
						<div>
							<div className={s.cardTitle}>Thao tác CME</div>
							<div className={s.cardSub}>
								Cấp số cho mọi người đủ điều kiện, hoặc chọn từng người ở tab Người tham gia.
							</div>
						</div>
						<div className={s.cardActions}>
							<button
								className={sem.btnGhost}
								onClick={() => actions.openCertificates(withCert, 0)}
								disabled={!sm.grants_cme}
								title={
									sm.grants_cme
										? 'Tải mẫu PDF và xuất giấy chứng nhận CME (mỗi người 1 file)'
										: 'Hội nghị chưa bật "Có cấp CME" — bật ở Danh sách hội thảo → Sửa'
								}
							>
								<FilePdfSvg /> Giấy chứng nhận
							</button>
							<button
								className={sem.btnGhost}
								onClick={() => actions.markSigned(signable.map((p) => p.id))}
								disabled={!canAct || !signable.length}
							>
								<CheckSvg /> Đánh dấu đã ký ({signable.length})
							</button>
							<button
								className={sem.btnPrimary}
								onClick={() => actions.issueCme(ready, 0)}
								disabled={!canAct || !ready.length}
							>
								<BadgeSvg /> Cấp CME cho {ready.length} người đủ điều kiện
							</button>
						</div>
					</div>
				</section>
			)}

			<section className={s.card}>
				<div className={s.cardTitle}>Đã cấp số ({numbered.length})</div>
				<PersonList
					items={numbered}
					onOpen={actions.openParticipant}
					empty='Chưa cấp số CME cho ai.'
					right={(p) => (
						<span className={cx(s.nowrap)}>
							<span
								className={sem.muted}
								style={{ marginRight: 8 }}
							>
								{[
									p.cme_certificate_no && `Số ${p.cme_certificate_no}`,
									p.cme_credits != null && `${p.cme_credits} TC`,
									p.cme_issued_date && fmtDate(p.cme_issued_date),
								]
									.filter(Boolean)
									.join(' · ')}
							</span>
							<CmeStatusBadge p={p} />
						</span>
					)}
				/>
			</section>

			{blocked.length > 0 && (
				<section className={s.card}>
					<div className={s.cardTitle}>Chưa đủ điều kiện ({blocked.length})</div>
					<PersonList
						items={blocked}
						onOpen={actions.openParticipant}
						limit={20}
						empty=''
						right={(p) => <span className={sem.badText}>{cmeBlockReason(p, sm)}</span>}
					/>
				</section>
			)}
		</div>
	);
}
