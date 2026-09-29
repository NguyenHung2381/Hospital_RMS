import type { ReactNode } from 'react';
import styles from '../pages/PublicPortal.module.css';

interface Props {
	step: number;
	title: string;
	description?: ReactNode;
	/** Nhãn "Tùy chọn" cạnh tiêu đề */
	optional?: boolean;
	children: ReactNode;
}

// Một khối của form đăng ký công khai: số bước + tiêu đề + mô tả, nội dung đóng
// khung riêng để các nhóm thông tin (đề tài, chủ nhiệm, thành viên, tài liệu...)
// tách bạch, không dồn thành một mảng ô nhập liền nhau.
export function FormSection({ step, title, description, optional, children }: Props) {
	return (
		<section className={styles.section}>
			<header className={styles.sectionHead}>
				<span className={styles.stepNo}>{step}</span>
				<div>
					<h2 className={styles.sectionHeading}>
						{title}
						{optional && <span className={styles.optionalTag}>Tùy chọn</span>}
					</h2>
					{description && <p className={styles.sectionDesc}>{description}</p>}
				</div>
			</header>
			<div className={styles.sectionBody}>{children}</div>
		</section>
	);
}

export function SubGroup({ title, children }: { title: string; children: ReactNode }) {
	return (
		<div className={styles.subGroup}>
			<div className={styles.subTitle}>{title}</div>
			{children}
		</div>
	);
}
