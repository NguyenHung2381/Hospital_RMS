import type { ReactNode } from 'react';
import {
	BadgeSvg,
	CheckSvg,
	ClipboardCheckSvg,
	EditSvg,
	FilePdfSvg,
	FileTextSvg,
	QrSvg,
	TrashSvg,
	UserSvg,
	WarnSvg,
	XSvg,
} from '@/assets/icons';
import { Badge, Drawer, DrawerFields, DrawerSection } from '@/shared/components';
import { CustomFieldsView, hasCustomValues, type FormConfig } from '@/shared/formConfig';
import { cx } from '@/shared/utils/cx';
import { formatDateTimeVN } from '@/shared/utils/formatDate';
import { genderLabel } from '@/shared/utils/gender';
import sem from '../../pages/Seminar.module.css';
import {
	CME_STATUS_LABELS,
	PARTICIPATION_LABELS,
	SOURCE_LABELS,
	type Seminar,
	type SeminarParticipant,
} from '../../types/seminar.type';
import s from './Detail.module.css';
import { cmeBlockReason, cmeEligible, fmtDate, fullName, testMax, testPassed, testScore } from './detailUtils';
import type { DetailActions, SeminarPerms } from './types';

export function CmeStatusBadge({ p }: { p: SeminarParticipant }) {
	return (
		<Badge tone={p.cme_status === 'signed' ? 'green' : p.cme_status === 'issued' ? 'blue' : 'gray'}>
			{CME_STATUS_LABELS[p.cme_status]}
		</Badge>
	);
}

/** Drawer bên phải: đầy đủ thông tin + thao tác trên 1 người tham dự. */
export function ParticipantDrawer({
	seminar: sm,
	participant: p,
	perms,
	actions,
	partCfg,
	busy,
	onClose,
}: {
	seminar: Seminar;
	participant: SeminarParticipant | null;
	perms: SeminarPerms;
	actions: DetailActions;
	/** Cấu hình trường tùy chỉnh form đăng ký công khai */
	partCfg: FormConfig;
	busy: boolean;
	onClose: () => void;
}) {
	if (!p) return null;
	const hosted = sm.scope === 'hosted';
	const hasTest = !!sm.test_questions;
	const eligible = cmeEligible(p, sm);
	const block = cmeBlockReason(p, sm);
	const cmeOps = perms.canCme && sm.grants_cme;
	const staffNo = p.staff_number ?? p.user_staff_number;
	const passed = p.test_submitted_at ? testPassed(sm, p) : null;

	return (
		<Drawer
			open
			onClose={onClose}
			ariaLabel={`Người tham dự ${fullName(p)}`}
			title={fullName(p)}
			subtitle={[p.user_department_name || p.department_raw, p.organization].filter(Boolean).join(' · ') || undefined}
			headerExtra={
				<>
					<Badge tone='teal'>{PARTICIPATION_LABELS[p.participation_type]}</Badge>
					<Badge tone={p.source === 'internal' ? 'blue' : 'gray'}>{SOURCE_LABELS[p.source]}</Badge>
					{p.is_foreign && <Badge tone='amber'>Nước ngoài</Badge>}
					{sm.grants_cme && <CmeStatusBadge p={p} />}
				</>
			}
			footer={
				perms.canUpdate ? (
					<>
						<button
							className={s.btnDangerGhost}
							onClick={() => actions.deleteParticipant(p)}
							disabled={busy}
						>
							<TrashSvg /> Xóa khỏi danh sách
						</button>
						<button
							className={sem.btnPrimary}
							onClick={() => actions.editParticipant(p)}
						>
							<EditSvg /> Sửa thông tin
						</button>
					</>
				) : undefined
			}
		>
			<DrawerSection
				title='Thông tin cá nhân'
				icon={<UserSvg />}
			>
				<DrawerFields
					items={[
						['Học hàm / học vị', p.title_prefix],
						['Mã nhân viên', staffNo != null ? String(staffNo) : null],
						['Ngày sinh', p.dob ? fmtDate(p.dob) : p.dob_text],
						['Giới tính', genderLabel(p.gender)],
						['Trình độ chuyên môn', p.qualification_raw],
						['Khoa / phòng', p.user_department_name || p.department_raw],
						['Đơn vị công tác', p.organization],
						[
							'Điện thoại',
							p.phone && (
								<a
									href={`tel:${p.phone}`}
									className={sem.linkTitle}
								>
									{p.phone}
								</a>
							),
						],
						[
							'Email',
							p.email && (
								<a
									href={`mailto:${p.email}`}
									className={sem.linkTitle}
								>
									{p.email}
								</a>
							),
						],
						['Tài khoản hệ thống', p.user_id ? p.user_full_name || 'Đã liên kết' : null],
					]}
				/>
				<CustomFieldsBlock
					cfg={partCfg}
					p={p}
				/>
				{p.notes && <p className={sem.overviewNote}>{p.notes}</p>}
			</DrawerSection>

			{hosted && (
				<DrawerSection
					title='Đăng ký & điểm danh'
					icon={<ClipboardCheckSvg />}
					actions={
						p.ticket_code && (
							<button
								className={sem.btnGhost}
								onClick={() => actions.showTicket(p)}
								title='Mở lại vé khi người tham dự mất vé'
							>
								<QrSvg /> Vé QR
							</button>
						)
					}
				>
					<ol className={s.timeline}>
						<Step
							done
							title={p.ticket_code ? 'Tự đăng ký qua QR' : 'Ban tổ chức thêm vào danh sách'}
							note={p.ticket_code ? `Mã vé ${p.ticket_code}` : 'Không cần điểm danh để được cấp CME'}
						/>
						<Step
							done={!!p.checked_in_at}
							title={p.checked_in_at ? 'Đã điểm danh' : 'Chưa điểm danh'}
							note={p.checked_in_at ? formatDateTimeVN(p.checked_in_at) : undefined}
						/>
					</ol>
				</DrawerSection>
			)}

			{hosted && hasTest && (
				<DrawerSection
					title='Bài kiểm tra'
					icon={<FileTextSvg />}
				>
					{p.test_submitted_at ? (
						<DrawerFields
							items={[
								[
									'Điểm',
									<span className={s.score}>
										<b>{testScore(sm, p)}</b>/{testMax(sm, p)}
									</span>,
								],
								['Số câu đúng', `${p.test_correct ?? 0}/${p.test_total ?? 0} câu`],
								[
									'Kết quả',
									sm.test_pass_score == null ? (
										'Đã nộp (không đặt điểm đạt)'
									) : (
										<span className={passed ? sem.okText : sem.badText}>
											{passed ? 'Đạt' : 'Chưa đạt'} (điểm đạt {sm.test_pass_score})
										</span>
									),
								],
								['Bắt đầu làm', p.test_started_at ? formatDateTimeVN(p.test_started_at) : null],
								['Nộp bài lúc', formatDateTimeVN(p.test_submitted_at)],
							]}
						/>
					) : (
						<span className={sem.muted}>
							{p.test_started_at ? `Đang làm — bắt đầu ${formatDateTimeVN(p.test_started_at)}` : 'Chưa làm bài'}
						</span>
					)}
				</DrawerSection>
			)}

			{(sm.grants_cme || p.cme_seq != null) && (
				<DrawerSection
					title='Chứng nhận CME'
					icon={<BadgeSvg />}
				>
					{p.cme_seq == null && p.cme_credits != null && (
						<DrawerFields items={[['Số tín chỉ (khi cấp)', `${p.cme_credits} tín chỉ`]]} />
					)}
					{p.cme_seq != null ? (
						<DrawerFields
							items={[
								['Trạng thái', <CmeStatusBadge p={p} />],
								['Số chứng nhận', p.cme_certificate_no],
								['Năm · số thứ tự', `${p.cme_year ?? '—'} · ${String(p.cme_seq).padStart(4, '0')}`],
								['Số tín chỉ', p.cme_credits != null ? `${p.cme_credits} tín chỉ` : null],
								['Ngày cấp', p.cme_issued_date ? fmtDate(p.cme_issued_date) : null],
							]}
						/>
					) : block ? (
						<div className={s.notice}>
							<WarnSvg />
							<span>Chưa đủ điều kiện cấp CME: {block}.</span>
						</div>
					) : (
						<div className={cx(s.notice, s.noticeOk)}>
							<CheckSvg />
							<span>Đủ điều kiện — chưa cấp số.</span>
						</div>
					)}

					{cmeOps && (
						<div className={s.drawerActions}>
							{p.cme_seq == null && (
								<button
									className={sem.btnPrimary}
									onClick={() => actions.issueCme([p], 0)}
									disabled={!eligible || busy}
								>
									<BadgeSvg /> Cấp số CME
								</button>
							)}
							{p.cme_seq != null && p.cme_status !== 'signed' && (
								<button
									className={sem.btnGhost}
									onClick={() => actions.markSigned([p.id])}
									disabled={busy}
								>
									<CheckSvg /> Đánh dấu đã ký
								</button>
							)}
							{p.cme_certificate_no && (
								<button
									className={sem.btnGhost}
									onClick={() => actions.openCertificates([p], 1)}
								>
									<FilePdfSvg /> Giấy chứng nhận
								</button>
							)}
							{p.cme_seq != null && (
								<button
									className={s.btnDangerGhost}
									onClick={() => actions.revokeCme(p)}
									disabled={busy}
								>
									<XSvg /> Thu hồi số CME
								</button>
							)}
						</div>
					)}
				</DrawerSection>
			)}
		</Drawer>
	);
}

function Step({ done, fail, title, note }: { done: boolean; fail?: boolean; title: string; note?: ReactNode }) {
	return (
		<li className={cx(s.step, done && s.stepDone, fail && s.stepFail)}>
			<span className={s.stepDot}>{done ? <CheckSvg /> : fail ? <XSvg /> : null}</span>
			<span className={s.stepText}>
				{title}
				{note && <small>{note}</small>}
			</span>
		</li>
	);
}

// Trường tùy chỉnh (form đăng ký công khai) — cùng lưới với thông tin cá nhân
function CustomFieldsBlock({ cfg, p }: { cfg: FormConfig; p: SeminarParticipant }) {
	if (!hasCustomValues(cfg, p.custom)) return null;
	return (
		<dl className={sem.detailGrid}>
			<CustomFieldsView
				cfg={cfg}
				data={p.custom}
				labelClassName={s.sub}
			/>
		</dl>
	);
}
