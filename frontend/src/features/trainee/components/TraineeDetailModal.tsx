import { useRef, useState } from 'react';
import {
	BookOpenSvg,
	EditSvg,
	FileTextSvg,
	PlusSvg,
	TrashSvg,
	UserCheckSvg,
	XSvg,
} from '@/assets/icons';
import { type DetailTab, useTraineeDetail } from '../hooks/useTraineeDetail';
import { GENDER_OPTIONS, type EnrollmentStatus, type Trainee } from '../types/trainee.type';
import { formatDate } from '../../../shared/utils/formatDate';
import styles from '../pages/Trainees.module.css';

const TABS: { key: DetailTab; label: string; icon: React.ReactNode }[] = [
	{ key: 'general', label: 'Thông tin chung', icon: <UserCheckSvg /> },
	{ key: 'documents', label: 'Hồ sơ học viên', icon: <FileTextSvg /> },
	{ key: 'enrollments', label: 'Chương trình đào tạo', icon: <BookOpenSvg /> },
];

const DOC_TYPE_LABEL: Record<string, string> = {
	national_id: 'CCCD/CMND',
	degree: 'Bằng cấp',
	other: 'Khác',
};

const ENROLLMENT_STATUS_CFG: Record<EnrollmentStatus, { label: string; color: string; bg: string }> = {
	pending: { label: 'Chờ duyệt', color: '#633806', bg: '#faeeda' },
	approved: { label: 'Đã duyệt', color: '#085028', bg: '#e1f5ea' },
	rejected: { label: 'Từ chối', color: '#791f1f', bg: '#fcebeb' },
	waitlisted: { label: 'Danh sách chờ', color: '#3c3489', bg: '#eeedfe' },
};

function InfoItem({ label, value, full }: { label: string; value: React.ReactNode; full?: boolean }) {
	return (
		<div className={`${styles.infoItem} ${full ? styles.infoItemFull : ''}`}>
			<span className={styles.infoLabel}>{label}</span>
			<span className={styles.infoValue}>{value ?? '—'}</span>
		</div>
	);
}

export function TraineeDetailModal({
	trainee,
	initialTab = 'general',
	onClose,
	onEdit,
}: {
	trainee: Trainee;
	initialTab?: DetailTab;
	onClose: () => void;
	onEdit: () => void;
}) {
	const d = useTraineeDetail(trainee.id, initialTab);
	const [docType, setDocType] = useState('national_id');
	const fileInputRef = useRef<HTMLInputElement>(null);

	const genderLabel = GENDER_OPTIONS.find((g) => g.value === trainee.gender)?.label;

	return (
		<div
			className={styles.modalBackdrop}
			onClick={(e) => e.target === e.currentTarget && onClose()}
		>
			<div className={styles.detailModal}>
				<div className={styles.modalHeader}>
					<div className={styles.modalHeaderIcon}>
						<UserCheckSvg />
					</div>
					<div>
						<div className={styles.modalTitle}>{trainee.full_name}</div>
						<div className={styles.modalSub}>
							{trainee.trainee_type_name ?? 'Chưa phân loại'}
							{trainee.department_name ? ` · ${trainee.department_name}` : ''}
						</div>
					</div>
					<button
						className={styles.modalClose}
						onClick={onClose}
					>
						<XSvg />
					</button>
				</div>

				<div className={styles.detailTabs}>
					{TABS.map((t) => (
						<button
							key={t.key}
							className={`${styles.detailTabBtn} ${d.tab === t.key ? styles.detailTabBtnActive : ''}`}
							onClick={() => d.setTab(t.key)}
						>
							{t.icon} {t.label}
						</button>
					))}
				</div>

				<div className={styles.detailBody}>
					{d.error && <div className={styles.errorBanner}>{d.error}</div>}

					{d.tab === 'general' ? (
						<>
							<div className={styles.infoSection}>
								<div className={styles.infoSectionTitle}>Thông tin cá nhân</div>
								<div className={styles.infoGrid}>
									<InfoItem
										label='Ngày sinh'
										value={trainee.dob ? formatDate(trainee.dob) : undefined}
									/>
									<InfoItem label='Giới tính' value={genderLabel} />
									<InfoItem label='Số CCCD/CMND' value={trainee.national_id} />
									<InfoItem
										label='Ngày cấp'
										value={
											trainee.national_id_issued_date
												? formatDate(trainee.national_id_issued_date)
												: undefined
										}
									/>
									<InfoItem label='Nơi cấp' value={trainee.national_id_issued_place} />
									<InfoItem
										label='Trạng thái'
										value={trainee.is_active ? 'Hoạt động' : 'Ngừng hoạt động'}
									/>
									<InfoItem label='Địa chỉ' value={trainee.address} full />
									<InfoItem label='Địa chỉ thường trú' value={trainee.permanent_address} full />
								</div>
							</div>

							<div className={styles.infoSection}>
								<div className={styles.infoSectionTitle}>Liên hệ</div>
								<div className={styles.infoGrid}>
									<InfoItem label='Điện thoại' value={trainee.phone} />
									<InfoItem label='Email' value={trainee.email} />
								</div>
							</div>

							<div className={styles.infoSection}>
								<div className={styles.infoSectionTitle}>Chuyên môn & công tác</div>
								<div className={styles.infoGrid}>
									<InfoItem label='Đối tượng học viên' value={trainee.trainee_type_name} />
									<InfoItem label='Khoa / Phòng' value={trainee.department_name} />
									<InfoItem
										label='Là nhân viên bệnh viện'
										value={trainee.is_employee ? 'Có' : 'Không'}
									/>
									<InfoItem label='Đơn vị công tác' value={trainee.workplace} />
									<InfoItem label='Chức vụ' value={trainee.position} />
									<InfoItem label='Trình độ chuyên môn' value={trainee.qualification} />
									<InfoItem label='Trường đào tạo' value={trainee.graduated_school} />
									<InfoItem label='Năm tốt nghiệp' value={trainee.graduated_year} />
								</div>
							</div>

							{trainee.notes && (
								<div className={styles.infoSection}>
									<div className={styles.infoSectionTitle}>Ghi chú</div>
									<div className={styles.infoGrid}>
										<InfoItem
											label='Ghi chú'
											value={trainee.notes}
											full
										/>
									</div>
								</div>
							)}

							<div
								className={styles.infoSection}
								style={{ display: 'flex', justifyContent: 'flex-end' }}
							>
								<button
									className={styles.btnGhost}
									onClick={onEdit}
								>
									<EditSvg /> Chỉnh sửa thông tin
								</button>
							</div>
						</>
					) : d.tab === 'documents' ? (
						<>
							<div className={styles.subToolbar}>
								<select
									className={styles.subSelect}
									value={docType}
									onChange={(e) => setDocType(e.target.value)}
								>
									<option value='national_id'>CCCD/CMND</option>
									<option value='degree'>Bằng cấp</option>
									<option value='other'>Khác</option>
								</select>
								<input
									type='file'
									ref={fileInputRef}
									className={styles.subInput}
								/>
								<button
									className={styles.btnCancel}
									style={{ flex: 'unset', padding: '7px 14px' }}
									disabled={d.busy}
									onClick={async () => {
										const file = fileInputRef.current?.files?.[0];
										if (!file) return;
										await d.addDocument(file, docType);
										if (fileInputRef.current) fileInputRef.current.value = '';
									}}
								>
									<PlusSvg /> Tải lên
								</button>
							</div>

							{d.loading ? (
								<div className={styles.subEmpty}>Đang tải...</div>
							) : d.documents.length === 0 ? (
								<div className={styles.subEmpty}>Chưa có hồ sơ nào được tải lên.</div>
							) : (
								<div className={styles.subList}>
									{d.documents.map((doc) => (
										<div
											key={doc.id}
											className={styles.subRow}
										>
											<div className={styles.subRowMain}>
												<a
													href={doc.file_url}
													target='_blank'
													rel='noreferrer'
													className={styles.docLink}
												>
													{doc.file_name}
												</a>
												<div className={styles.subRowMeta}>
													{DOC_TYPE_LABEL[doc.doc_type] ?? doc.doc_type}
												</div>
											</div>
											<button
												className={styles.actionBtn}
												title='Xoá'
												disabled={d.busy}
												onClick={() => d.removeDocument(doc.id)}
											>
												<TrashSvg />
											</button>
										</div>
									))}
								</div>
							)}
						</>
					) : (
						<>
							{d.loading ? (
								<div className={styles.subEmpty}>Đang tải...</div>
							) : d.enrollments.length === 0 ? (
								<div className={styles.subEmpty}>Học viên chưa đăng ký khóa học nào.</div>
							) : (
								<div className={styles.subList}>
									{d.enrollments.map((en) => {
										const cfg = ENROLLMENT_STATUS_CFG[en.status];
										return (
											<div
												key={en.id}
												className={styles.subRow}
											>
												<div className={styles.subRowMain}>
													<div className={styles.subRowName}>{en.course_name}</div>
													<div className={styles.subRowMeta}>
														{en.program_names ?? 'Chưa gán chương trình đào tạo'} · Đăng ký{' '}
														{formatDate(en.registered_at)}
														{en.decided_at ? ` · Duyệt ${formatDate(en.decided_at)}` : ''}
													</div>
												</div>
												<span
													className={styles.badge}
													style={{ background: cfg.bg, color: cfg.color }}
												>
													{cfg.label}
												</span>
											</div>
										);
									})}
								</div>
							)}
						</>
					)}
				</div>
			</div>
		</div>
	);
}
