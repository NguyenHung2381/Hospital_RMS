import React, { useEffect, useRef, useState } from 'react';
import Logo from '../../assets/logo.png';
import { LeftPanelIcons, RightPanelIcons } from './AuthBgIcons';
import styles from './AuthLayout.module.css';

interface AuthLayoutProps {
	children: React.ReactNode;
}

const stats = [
	{ number: '200+', label: 'Đề tài' },
	{ number: '50+', label: 'Tiến sĩ' },
	{ number: '15+', label: 'Năm' },
];

const features = [
	'Quản lý đề tài NCKH & hội đồng xét duyệt, nghiệm thu',
	'Đào tạo liên tục: chương trình, khóa học, thực hành GPHN',
	'Quản lý học viên, giảng viên, lịch học & điểm danh',
	'Tổ chức thi, hội nghị – hội thảo và khảo sát',
	'Báo cáo, thống kê & phân quyền theo vai trò',
];

/* Đường nhịp tim (ECG) chạy ngang panel: 1 đường mờ cố định + 1 đoạn sáng
   chạy dọc theo nó. viewBox rộng 1200 để giãn theo chiều ngang panel. */
const ECG_PATH =
	'M0 60 H260 l14 -10 l12 10 H330 l10 18 l16 -66 l18 84 l12 -36 H520 l16 -12 l14 12 H760 l14 -10 l12 10 H830 l10 18 l16 -66 l18 84 l12 -36 H1020 l16 -12 l14 12 H1200';

const prefersReducedMotion = () =>
	typeof window !== 'undefined' &&
	window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/* Số đếm lên từ 0 khi trang mở ("200+" → 0…200 rồi giữ hậu tố "+") */
function CountUp({ value, delay = 0 }: { value: string; delay?: number }) {
	const match = value.match(/^(\d+)(.*)$/);
	const target = match ? Number(match[1]) : 0;
	const suffix = match ? match[2] : '';
	const [n, setN] = useState(() => (prefersReducedMotion() || !match ? target : 0));
	const raf = useRef(0);

	useEffect(() => {
		if (!match || prefersReducedMotion()) return;
		const duration = 1400;
		let start = 0;
		const timer = window.setTimeout(() => {
			const tick = (t: number) => {
				if (!start) start = t;
				const p = Math.min((t - start) / duration, 1);
				const eased = 1 - Math.pow(1 - p, 3);
				setN(Math.round(target * eased));
				if (p < 1) raf.current = requestAnimationFrame(tick);
			};
			raf.current = requestAnimationFrame(tick);
		}, delay);
		return () => {
			window.clearTimeout(timer);
			cancelAnimationFrame(raf.current);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [target, delay]);

	if (!match) return <>{value}</>;
	return (
		<>
			<span aria-hidden='true'>
				{n}
				{suffix}
			</span>
			<span className={styles.srOnly}>{value}</span>
		</>
	);
}

export default function AuthLayout({ children }: AuthLayoutProps) {
	return (
		<div className={styles.authWrapper}>
			{/* Panel trái - Branding */}
			<div className={styles.panelLeft}>
				{/* Lưới chấm mờ dần + 2 quầng sáng trôi chậm */}
				<div
					className={styles.panelGrid}
					aria-hidden='true'
				/>
				<div
					className={styles.glowOrb}
					aria-hidden='true'
				/>
				<div
					className={styles.glowOrb}
					aria-hidden='true'
				/>


				{/* Icon y tế · nghiên cứu · đào tạo trôi chậm ở 2 mép */}
				<LeftPanelIcons />

				<div className={styles.panelContent}>
					{/* Logo + sóng lan */}
					<div className={styles.logoStage}>
						<span
							className={styles.ripple}
							aria-hidden='true'
						/>
						<span
							className={styles.ripple}
							aria-hidden='true'
						/>
						<span
							className={styles.ripple}
							aria-hidden='true'
						/>
						<div className={styles.panelLogo}>
							<img
								src={Logo}
								alt='Logo Bệnh viện Hữu nghị Đa khoa Nghệ An'
							/>
						</div>
					</div>

					{/* Tiêu đề */}
					<div className={styles.panelHeading}>
						<span className={styles.panelEyebrow}>
							<span className={styles.liveDot} />
							NCKH · Đào tạo · CME
						</span>
						<h1 className={styles.panelTitle}>
							Bệnh viện <br />
							Hữu Nghị Đa Khoa <br className={styles.desktopOnly} />
							Nghệ An
						</h1>
						<p className={styles.panelSubtitle}>
							Hệ thống Quản lý Nghiên cứu Khoa học & Đào tạo
							<span className={styles.desktopOnly}>
								<br />
								<em>— Nơi tri thức y học được kiến tạo và lan tỏa</em>
							</span>
						</p>
					</div>

					{/* Tính năng nổi bật */}
					<ul className={styles.panelFeatures}>
						{features.map((f) => (
							<li
								key={f}
								className={styles.featureItem}
							>
								<span className={styles.featureCheck}>
									<svg
										viewBox='0 0 16 16'
										aria-hidden='true'
									>
										<path
											d='M3.5 8.5l3 3 6-7'
											fill='none'
											stroke='currentColor'
											strokeWidth='2'
											strokeLinecap='round'
											strokeLinejoin='round'
										/>
									</svg>
								</span>
								{f}
							</li>
						))}
					</ul>

					{/* Đường phân cách = nhịp tim (ECG) */}
					<svg
						className={styles.ecg}
						viewBox='0 0 1200 120'
						preserveAspectRatio='none'
						aria-hidden='true'
					>
						<path
							className={styles.ecgBase}
							d={ECG_PATH}
							pathLength={1}
						/>
						<path
							className={styles.ecgPulse}
							d={ECG_PATH}
							pathLength={1}
						/>
					</svg>

					{/* Thống kê */}
					<div className={styles.panelStats}>
						{stats.map((s, i) => (
							<div
								key={s.label}
								className={styles.statItem}
							>
								<div className={styles.statNumber}>
									<CountUp
										value={s.number}
										delay={500 + i * 150}
									/>
								</div>
								<div className={styles.statLabel}>{s.label}</div>
							</div>
						))}
					</div>
				</div>
			</div>

			{/* Panel phải - Nội dung (form) */}
			<div className={styles.panelRight}>
				{/* Trang trí góc */}
				<div className={styles.rightRing} />
				<div className={styles.rightRing} />
				<div className={styles.rightRing} />
				<RightPanelIcons />

				<div className={styles.formWrapper}>{children}</div>

				<div className={styles.authFooter}>
					© {new Date().getFullYear()} Bệnh viện Hữu nghị Đa khoa Nghệ An —
					Phòng CNTT
				</div>
			</div>
		</div>
	);
}
