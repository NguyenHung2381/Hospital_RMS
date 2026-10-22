import type { ReactNode } from 'react';
import { formatDate } from '../../../shared/utils/formatDate';
import { genderLabel } from '../../../shared/utils/gender';
import type { Trainee } from '../types/trainee.type';
import ds from '../pages/TraineeDetail.module.css';
import { TraineeAccountSection } from './TraineeAccountSection';

function InfoItem({ label, value, full }: { label: string; value: ReactNode; full?: boolean }) {
	const empty = value == null || value === '';
	return (
		<div className={`${ds.infoItem} ${full ? ds.infoItemFull : ''}`}>
			<span className={ds.factLabel}>{label}</span>
			<span className={empty ? ds.infoEmpty : ds.infoValue}>{empty ? '—' : value}</span>
		</div>
	);
}

const date = (v: string | null) => (v ? formatDate(v) : undefined);

function Section({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className={ds.infoSection}>
			<h3 className={ds.infoSectionTitle}>{title}</h3>
			<div className={ds.infoGrid}>{children}</div>
		</section>
	);
}

/**
 * Tab "Thông tin cá nhân": toàn bộ trường của hồ sơ, nhóm Định danh / Liên hệ / Văn bằng / Hành nghề / Đơn vị cử.
 * Nút "Chỉnh sửa thông tin" nằm trên header trang.
 */
export function TraineeInfoTab({
	trainee,
	canManageAccount = false,
	onChanged = () => {},
}: {
	trainee: Trainee;
	canManageAccount?: boolean;
	onChanged?: () => void;
}) {
	return (
		<div className={ds.infoSections}>
			<Section title='Định danh'>
				<InfoItem label='Mã học viên' value={trainee.id} />
				<InfoItem label='Mã học viên (sổ cũ)' value={trainee.legacy_code} />
				<InfoItem label='Ngày sinh' value={date(trainee.dob)} />
				<InfoItem label='Giới tính' value={genderLabel(trainee.gender)} />
				<InfoItem label='Nơi sinh (tỉnh)' value={trainee.birth_province} />
				<InfoItem label='Số CCCD/CMND' value={trainee.national_id} />
				<InfoItem label='Ngày cấp' value={date(trainee.national_id_issued_date)} />
				<InfoItem label='Nơi cấp' value={trainee.national_id_issued_place} />
				<InfoItem label='Trạng thái' value={trainee.is_active ? 'Hoạt động' : 'Ngừng hoạt động'} />
			</Section>
			<Section title='Liên hệ'>
				<InfoItem label='Điện thoại' value={trainee.phone} />
				<InfoItem label='Email' value={trainee.email} />
				<InfoItem label='Địa chỉ' value={trainee.address} full />
				<InfoItem label='Địa chỉ thường trú' value={trainee.permanent_address} full />
			</Section>
			<Section title='Văn bằng'>
				<InfoItem label='Trình độ chuyên môn' value={trainee.qualification} />
				<InfoItem label='Trường đào tạo' value={trainee.graduated_school} />
				<InfoItem label='Năm tốt nghiệp' value={trainee.graduated_year} />
				<InfoItem label='Ngày tốt nghiệp' value={date(trainee.graduated_date)} />
				<InfoItem label='Ngày cấp bằng' value={date(trainee.degree_issued_date)} />
			</Section>
			<Section title='Hành nghề'>
				<InfoItem label='Đối tượng học viên' value={trainee.trainee_type_name} />
				<InfoItem label='Chức vụ' value={trainee.position} />
			</Section>
			<Section title='Đơn vị cử'>
				<InfoItem label='Là nhân viên bệnh viện' value={trainee.is_employee ? 'Có' : 'Không'} />
				<InfoItem label='Khoa / Phòng' value={trainee.department_name} />
				<InfoItem label='Đơn vị công tác' value={trainee.workplace} full />
			</Section>
			<TraineeAccountSection
				trainee={trainee}
				canManage={canManageAccount}
				onChanged={onChanged}
			/>
			{trainee.notes && (
				<Section title='Ghi chú'>
					<InfoItem label='Ghi chú' value={trainee.notes} full />
				</Section>
			)}
		</div>
	);
}
