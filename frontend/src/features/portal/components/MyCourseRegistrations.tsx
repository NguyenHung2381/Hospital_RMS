import { useRef, useState } from 'react';
import { DocSvg, FileTextSvg, UsersSvg } from '@/assets/icons';
import { Badge, Button, Card } from '@/shared/components';
import { FileViewerModal } from '@/shared/components/FileViewerModal';
import { useUploadPolicy } from '@/shared/hooks/useUploadPolicy';
import { formatDateVN } from '@/shared/utils/formatDate';
import { fileSlug, saveBlob } from '@/shared/utils/saveBlob';
import { showToast } from '@/shared/utils/feedback';
import { ENROLLMENT_STATUS_CFG } from '../../course/types/course.type';
import { ENROLLMENT_STATUS_TONE } from '../../course/api/registrationApi';
import type { RegistrationFileItem, RegistrationFileKind } from '../../public/api/publicApi';
import {
	checkRegistrationFile,
	REGISTRATION_ACCEPT,
	REGISTRATION_FILE_EXTENSIONS,
} from '../../public/utils/registrationFiles';
import {
	downloadDepartmentProposal,
	downloadMyApplication,
	myApplicationUrl,
	uploadMyRegistrationFile,
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
 *  nộp / thay từng loại hồ sơ bắt buộc (PDF, JPG hoặc PNG). */
export function MyRegistrationsCard({ items, onChanged }: { items: MyCourseRegistration[]; onChanged: () => void }) {
	const [viewer, setViewer] = useState<Viewer | null>(null);
	const [busy, setBusy] = useState<string | null>(null);
	const fileRef = useRef<HTMLInputElement>(null);
	const target = useRef<{ reg: MyCourseRegistration; item: RegistrationFileItem } | null>(null);
	const policy = useUploadPolicy();
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

	const pickFile = (reg: MyCourseRegistration, item: RegistrationFileItem) => {
		target.current = { reg, item };
		fileRef.current?.click();
	};

	const upload = async (file: File) => {
		const t = target.current;
		if (!t) return;
		const problem = checkRegistrationFile(file, REGISTRATION_FILE_EXTENSIONS, policy.maxSizeMB);
		if (problem) {
			showToast('error', problem);
			return;
		}
		setBusy(`up-${t.reg.enrollment_id}-${t.item.kind}`);
		try {
			await uploadMyRegistrationFile(t.reg.enrollment_id, t.item.kind as RegistrationFileKind, file);
			showToast('success', `Đã nộp ${t.item.label}, chờ Trung tâm Đào tạo xét duyệt.`);
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
								<ul
									className={own.files}
									aria-label={`Hồ sơ đính kèm của đơn ${r.registration_code}`}
								>
									{r.files.map((it) => {
										const rejected = it.review_status === 'rejected';
										const uploadBusy = busy === `up-${r.enrollment_id}-${it.kind}`;
										return (
											<li
												key={it.kind}
												className={own.fileRow}
											>
												<span className={own.fileLabel}>{it.label}</span>
												<span className={rejected ? own.fileBad : it.uploaded_at ? own.fileOk : own.fileMissing}>
													{it.legacy
														? 'File gộp nộp trước đây'
														: !it.uploaded_at
															? 'Chưa nộp'
															: rejected
																? 'Bị từ chối — vui lòng nộp lại'
																: `Đã nộp ${formatDateVN(it.uploaded_at)}`}
												</span>
												<span className={own.fileActions}>
													{it.file_url && (
														<Button
															size='sm'
															variant='secondary'
															onClick={() => setViewer({ url: it.file_url!, name: `${it.label} — ${r.registration_code}`, isWord: false })}
														>
															Xem
														</Button>
													)}
													{r.can_upload && !it.legacy && (
														<Button
															size='sm'
															variant={!it.uploaded_at || rejected ? 'primary' : 'secondary'}
															loading={uploadBusy}
															disabled={busy !== null && !uploadBusy}
															onClick={() => pickFile(r, it)}
														>
															{it.uploaded_at ? 'Nộp lại' : 'Nộp'}
														</Button>
													)}
												</span>
											</li>
										);
									})}
								</ul>
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
								</div>
							</div>
						);
					})}
				</div>
				{items.some((r) => r.source === 'internal') && (
					<div className={own.hint}>
						Nội viện: tải đơn, in và ký → khoa lập tờ trình (tải ở mục "Đăng ký cùng lớp trong khoa") → trình Ban giám đốc duyệt →
						nộp từng file ở danh sách trên (PDF, JPG hoặc PNG).
					</div>
				)}
				<input
					ref={fileRef}
					type='file'
					accept={REGISTRATION_ACCEPT}
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
											<th>Tờ trình đã duyệt</th>
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
												<td>{p.has_proposal ? 'Đã nộp' : 'Chưa nộp'}</td>
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
