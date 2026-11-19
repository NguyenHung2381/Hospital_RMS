import { useRef, useState } from 'react';
import { DocSvg, FileTextSvg, UsersSvg } from '@/assets/icons';
import { Badge, Button, Card } from '@/shared/components';
import { FileViewerModal } from '@/shared/components/FileViewerModal';
import { formatDateVN } from '@/shared/utils/formatDate';
import { fileSlug, saveBlob } from '@/shared/utils/saveBlob';
import { showToast } from '@/shared/utils/feedback';
import { ENROLLMENT_STATUS_CFG } from '../../course/types/course.type';
import { ENROLLMENT_STATUS_TONE } from '../../course/api/registrationApi';
import {
	downloadDepartmentProposal,
	downloadMyApplication,
	myApplicationUrl,
	uploadMyRegistrationDossier,
	type MyCourseRegistration,
	type MyDepartmentProposal,
} from '../api/meApi';
import styles from '../pages/SelfService.module.css';
import own from './MyCourseRegistrations.module.css';
import tbl from '@/shared/components/Table/Table.module.css';

type Viewer = { url: string; name: string; isWord: boolean };

const statusBadge = (s: MyCourseRegistration['enrollment_status']) =>
	s && <Badge tone={ENROLLMENT_STATUS_TONE[s] ?? 'gray'}>{ENROLLMENT_STATUS_CFG[s]?.label ?? s}</Badge>;

const classTitle = (course: string | null, program: string | null) =>
	[course ?? 'Khóa học', program].filter(Boolean).join(' · ');

/** "Đơn đăng ký của tôi": đơn đã gửi qua form /dang-ky-khoa-hoc, việc còn phải làm, tải / xem đơn,
 *  nộp PDF đơn + tờ trình đã duyệt (nội viện). */
export function MyRegistrationsCard({ items, onChanged }: { items: MyCourseRegistration[]; onChanged: () => void }) {
	const [viewer, setViewer] = useState<Viewer | null>(null);
	const [busy, setBusy] = useState<string | null>(null);
	const fileRef = useRef<HTMLInputElement>(null);
	const target = useRef<MyCourseRegistration | null>(null);
	const todoCount = items.reduce((n, r) => n + r.todo.length, 0);

	const download = async (r: MyCourseRegistration) => {
		setBusy(`dl-${r.enrollment_id}`);
		try {
			saveBlob(await downloadMyApplication(r.enrollment_id), `don-dang-ky_${fileSlug(r.course_name ?? 'khoa-hoc')}_${r.registration_code}.docx`);
		} catch (err) {
			showToast('error', err instanceof Error ? err.message : 'Không tải được đơn đăng ký');
		} finally {
			setBusy(null);
		}
	};

	const pickFile = (r: MyCourseRegistration) => {
		target.current = r;
		fileRef.current?.click();
	};

	const upload = async (file: File) => {
		const r = target.current;
		if (!r) return;
		if (!/\.pdf$/i.test(file.name)) {
			showToast('error', 'Hồ sơ chỉ nhận file PDF (đơn + tờ trình đã duyệt gộp 1 file).');
			return;
		}
		setBusy(`up-${r.enrollment_id}`);
		try {
			await uploadMyRegistrationDossier(r.enrollment_id, file);
			showToast('success', 'Đã nộp hồ sơ, chờ Trung tâm Đào tạo đối chiếu.');
			onChanged();
		} catch (err) {
			showToast('error', err instanceof Error ? err.message : 'Nộp hồ sơ thất bại');
		} finally {
			setBusy(null);
		}
	};

	return (
		<Card>
			<Card.Header
				icon={<FileTextSvg />}
				title='Đơn đăng ký của tôi'
				sub={
					<>
						{items.length} đơn
						{todoCount > 0 && (
							<>
								{' · '}
								<Badge tone='pink'>{todoCount} việc cần bạn làm</Badge>
							</>
						)}
					</>
				}
			/>
			<Card.Body>
				<div className={styles.list}>
					{items.map((r) => {
						const open = r.enrollment_status !== 'rejected';
						return (
							<div
								key={r.enrollment_id}
								className={styles.item}
							>
								<div className={styles.itemHead}>
									<div className={styles.itemTitle}>{classTitle(r.course_name, r.program_name)}</div>
									<div className={styles.badges}>{statusBadge(r.enrollment_status)}</div>
								</div>
								<div className={styles.meta}>
									<span>
										Mã đăng ký: <b>{r.registration_code}</b>
									</span>
									{r.created_at && (
										<span>
											Gửi ngày: <b>{formatDateVN(r.created_at)}</b>
										</span>
									)}
									<span>{r.source === 'internal' ? 'Nội viện' : 'Ngoại viện'}</span>
									{r.dossier_uploaded_at && (
										<span>
											Đã nộp hồ sơ: <b>{formatDateVN(r.dossier_uploaded_at)}</b>
										</span>
									)}
								</div>
								{r.todo.map((t) => (
									<div
										key={t}
										className={own.todo}
									>
										{t}
									</div>
								))}
								{r.waiting.length > 0 && <div className={own.waiting}>{r.waiting.join(' · ')}</div>}
								<div className={own.actions}>
									<Button
										size='sm'
										variant='secondary'
										onClick={() =>
											setViewer({
												url: myApplicationUrl(r.enrollment_id),
												name: `Đơn đăng ký — ${r.registration_code}`,
												isWord: true,
											})
										}
									>
										Xem đơn
									</Button>
									<Button
										size='sm'
										variant='secondary'
										loading={busy === `dl-${r.enrollment_id}`}
										onClick={() => void download(r)}
									>
										<DocSvg /> Tải đơn (.docx)
									</Button>
									{r.dossier && (
										<Button
											size='sm'
											variant='secondary'
											onClick={() => setViewer({ url: r.dossier!.file_url, name: r.dossier!.file_name, isWord: false })}
										>
											Xem hồ sơ đã nộp
										</Button>
									)}
									{r.source === 'internal' && open && (
										<Button
											size='sm'
											variant={r.needs_dossier ? 'primary' : 'secondary'}
											loading={busy === `up-${r.enrollment_id}`}
											onClick={() => pickFile(r)}
										>
											{r.dossier ? 'Nộp lại hồ sơ PDF' : 'Nộp hồ sơ PDF'}
										</Button>
									)}
								</div>
							</div>
						);
					})}
				</div>
				{items.some((r) => r.source === 'internal') && (
					<div className={own.hint}>
						Nội viện: tải đơn, in và ký → khoa lập tờ trình (tải ở mục "Đăng ký cùng lớp trong khoa") → trình Ban Giám đốc duyệt →
						scan đơn và tờ trình đã duyệt thành 1 file PDF rồi bấm "Nộp hồ sơ PDF".
					</div>
				)}
				<input
					ref={fileRef}
					type='file'
					accept='application/pdf,.pdf'
					className={own.hiddenInput}
					onChange={(e) => {
						const f = e.target.files?.[0];
						e.target.value = '';
						if (f) void upload(f);
					}}
				/>
			</Card.Body>
			{viewer && (
				<FileViewerModal
					file={viewer}
					onClose={() => setViewer(null)}
				/>
			)}
		</Card>
	);
}

/** Đồng nghiệp đăng ký cùng lớp (theo khoa) + tải Tờ trình của khoa. Người đăng ký chỉ thấy
 *  nhóm của mình; tài khoản khoa / trưởng khoa thấy mọi nhóm của khoa. */
export function DepartmentProposalsCard({ groups }: { groups: MyDepartmentProposal[] }) {
	const [busy, setBusy] = useState<string | null>(null);
	const keyOf = (g: MyDepartmentProposal) => `${g.course_id}|${g.program_id ?? ''}|${g.department_id}`;

	const download = async (g: MyDepartmentProposal) => {
		setBusy(keyOf(g));
		try {
			saveBlob(
				await downloadDepartmentProposal(g),
				`to-trinh_${fileSlug(g.department_name)}_${fileSlug(g.program_name ?? g.course_name)}.docx`,
			);
		} catch (err) {
			showToast('error', err instanceof Error ? err.message : 'Không tạo được tờ trình');
		} finally {
			setBusy(null);
		}
	};

	return (
		<Card>
			<Card.Header
				icon={<UsersSvg />}
				title='Đăng ký cùng lớp trong khoa'
				sub='Danh sách để khoa lập tờ trình cử cán bộ đi học'
			/>
			<Card.Body>
				<div className={styles.list}>
					{groups.map((g) => (
						<div
							key={keyOf(g)}
							className={styles.item}
						>
							<div className={styles.itemHead}>
								<div>
									<div className={styles.itemTitle}>{classTitle(g.course_name, g.program_name)}</div>
									<div className={styles.meta}>
										<span>
											Khoa: <b>{g.department_name}</b>
										</span>
										<span>
											Số người: <b>{g.people.length}</b>
										</span>
										{(g.start_date || g.end_date) && (
											<span>
												Thời gian:{' '}
												<b>
													{formatDateVN(g.start_date) || '…'} – {formatDateVN(g.end_date) || '…'}
												</b>
											</span>
										)}
									</div>
								</div>
								<Button
									size='sm'
									loading={busy === keyOf(g)}
									disabled={busy !== null && busy !== keyOf(g)}
									onClick={() => void download(g)}
								>
									<DocSvg /> Tải tờ trình của khoa
								</Button>
							</div>
							<div className={styles.tableWrap}>
								<table className={styles.table}>
									<thead>
										<tr>
											<th className={tbl.thIdx}>STT</th>
											<th>MNV</th>
											<th>Họ tên</th>
											<th>Trình độ</th>
											<th>Trạng thái</th>
											<th>Hồ sơ nộp bổ sung</th>
										</tr>
									</thead>
									<tbody>
										{g.people.map((p, i) => (
											<tr key={p.enrollment_id}>
												<td className={tbl.tdIdx}>{i + 1}</td>
												<td>{p.staff_number ?? '—'}</td>
												<td>
													<span className={tbl.cellTitle}>{p.full_name}</span>
													{p.is_me && <span className={own.me}> (bạn)</span>}
												</td>
												<td>{p.qualification ?? '—'}</td>
												<td>{statusBadge(p.enrollment_status)}</td>
												<td>{p.proposal_checked ? 'Đã đối chiếu' : p.has_dossier ? 'Đã nộp' : 'Chưa nộp'}</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						</div>
					))}
				</div>
			</Card.Body>
		</Card>
	);
}
