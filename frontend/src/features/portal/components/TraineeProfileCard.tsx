import { useEffect, useState } from 'react';
import { ClipboardSvg } from '@/assets/icons';
import { formatDateVN } from '@/shared/utils/formatDate';
import { genderLabel } from '@/shared/utils/gender';
import { traineeRecordApi, type TraineeSelfProfile } from '../../trainee/api/traineeRecordApi';
import styles from '../pages/Profile.module.css';

type Field = [label: string, value: string | number | null | undefined];

/**
 * Hồ sơ học viên của chính mình — chỉ đọc, cùng dữ liệu phòng Đào tạo đang lưu
 * (bảng trainees). Tài khoản không có hồ sơ học viên hoặc module Đào tạo tắt ⇒ không hiện.
 */
export default function TraineeProfileCard() {
	const [p, setP] = useState<TraineeSelfProfile | null>(null);
	useEffect(() => {
		traineeRecordApi
			.myProfile()
			.then(setP)
			.catch(() => setP(null));
	}, []);
	if (!p) return null;

	const sections: { title: string; fields: Field[] }[] = [
		{
			title: 'Thông tin cá nhân',
			fields: [
				['Họ và tên', p.full_name],
				['Ngày sinh', formatDateVN(p.dob)],
				['Giới tính', genderLabel(p.gender)],
				['Nơi sinh', p.birth_province],
				['Số CCCD', p.national_id],
				['Ngày cấp · nơi cấp', [formatDateVN(p.national_id_issued_date), p.national_id_issued_place].filter(Boolean).join(' · ')],
				['Điện thoại', p.phone],
				['Email', p.email],
				['Địa chỉ hiện tại', p.address],
				['Hộ khẩu thường trú', p.permanent_address],
			],
		},
		{
			title: 'Học vấn và công tác',
			fields: [
				['Đối tượng học viên', p.trainee_type_name],
				['Trình độ chuyên môn', p.qualification],
				['Trường tốt nghiệp', p.graduated_school],
				['Năm tốt nghiệp', p.graduated_year],
				['Ngày cấp bằng', formatDateVN(p.degree_issued_date ?? p.graduated_date)],
				['Nơi công tác', p.workplace],
				['Chức vụ', p.position],
				['Khoa theo dõi', p.department_name],
			],
		},
	];

	return (
		<div className={styles.detailCard}>
			<div className={styles.detailCardHeader}>
				<div
					className={styles.detailCardIcon}
					style={{ background: 'var(--tone-green-bg)', color: 'var(--tone-green-fg)' }}
				>
					<ClipboardSvg />
				</div>
				<div>
					<div className={styles.detailCardTitle}>Hồ sơ học viên</div>
					<div className={styles.detailCardSub}>
						Thông tin phòng Đào tạo đang lưu. Nếu có chỗ sai, hãy báo phòng Đào tạo để chỉnh lại.
					</div>
				</div>
			</div>
			{sections.map((s) => (
				<section
					key={s.title}
					aria-label={s.title}
				>
					<h3 className={styles.traineeSection}>{s.title}</h3>
					<div className={styles.detailGrid}>
						{s.fields.map(([label, value]) => (
							<div
								key={label}
								className={styles.detailItem}
							>
								<div className={styles.detailLabel}>{label}</div>
								<div className={styles.detailValue}>{value || value === 0 ? value : '—'}</div>
							</div>
						))}
					</div>
				</section>
			))}
		</div>
	);
}
