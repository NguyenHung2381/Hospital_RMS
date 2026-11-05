import type React from 'react';
import styles from './AuthLayout.module.css';

/* Bộ icon nét mảnh (24×24, stroke = currentColor) cho nền trang đăng nhập:
   y tế · nghiên cứu khoa học · đào tạo. Chỉ để trang trí (aria-hidden). */
const ICONS = {
	microscope: (
		<>
			<path d='M6 18h8' />
			<path d='M3 22h18' />
			<path d='M14 22a7 7 0 1 0 0-14h-1' />
			<path d='M9 14h2' />
			<path d='M9 12a2 2 0 0 1-2-2V6h6v4a2 2 0 0 1-2 2Z' />
			<path d='M12 6V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v3' />
		</>
	),
	dna: (
		<>
			<path d='M6 3c0 4.5 12 6.5 12 9s-12 4.5-12 9' />
			<path d='M18 3c0 4.5-12 6.5-12 9s12 4.5 12 9' />
			<path d='M8.5 6h7M9.5 9.5h5M9.5 14.5h5M8.5 18h7' />
		</>
	),
	flask: (
		<>
			<path d='M9 3h6' />
			<path d='M10 3v6.5L4.6 18.2A2 2 0 0 0 6.3 21h11.4a2 2 0 0 0 1.7-2.8L14 9.5V3' />
			<path d='M7 15h10' />
		</>
	),
	stethoscope: (
		<>
			<path d='M5 3H4v6a5 5 0 0 0 10 0V3h-1' />
			<path d='M9 14v1.5a4.5 4.5 0 0 0 9 0V13' />
			<circle
				cx='18'
				cy='11'
				r='2'
			/>
		</>
	),
	heartPulse: (
		<>
			<path d='M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.2a4.2 4.2 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20Z' />
			<path d='M6 12.5h3l1.5-2.5 2.5 5 1.5-2.5H18' />
		</>
	),
	gradCap: (
		<>
			<path d='M2 9.5 12 4.5l10 5-10 5Z' />
			<path d='M6 11.5v4.5c0 1.6 2.7 3 6 3s6-1.4 6-3v-4.5' />
			<path d='M22 9.5v5' />
		</>
	),
	book: (
		<>
			<path d='M2 5.5A1.5 1.5 0 0 1 3.5 4H9a3 3 0 0 1 3 3v13a2.5 2.5 0 0 0-2.5-2.5H2Z' />
			<path d='M22 5.5A1.5 1.5 0 0 0 20.5 4H15a3 3 0 0 0-3 3v13a2.5 2.5 0 0 1 2.5-2.5H22Z' />
		</>
	),
	pill: (
		<>
			<path d='M10.5 20.5a5 5 0 0 1-7-7l6-6a5 5 0 0 1 7 7Z' />
			<path d='m7 10 7 7' />
		</>
	),
	syringe: (
		<>
			<path d='m17 3 4 4' />
			<path d='m19 5-3 3' />
			<path d='M16 8 6.5 17.5l-2-2L14 6Z' />
			<path d='M5.5 16.5 3 19' />
			<path d='m9 11 2 2M11.5 8.5l2 2' />
		</>
	),
	cross: <path d='M9 3h6v6h6v6h-6v6H9v-6H3V9h6Z' />,
	atom: (
		<>
			<circle
				cx='12'
				cy='12'
				r='1.5'
			/>
			<ellipse
				cx='12'
				cy='12'
				rx='10'
				ry='4'
			/>
			<ellipse
				cx='12'
				cy='12'
				rx='10'
				ry='4'
				transform='rotate(60 12 12)'
			/>
			<ellipse
				cx='12'
				cy='12'
				rx='10'
				ry='4'
				transform='rotate(120 12 12)'
			/>
		</>
	),
	testTube: (
		<>
			<path d='M8 2h8' />
			<path d='M9.5 2v15a2.5 2.5 0 0 0 5 0V2' />
			<path d='M9.5 12h5' />
		</>
	),
	bulb: (
		<>
			<path d='M9 18h6M10 21h4' />
			<path d='M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3Z' />
		</>
	),
	award: (
		<>
			<circle
				cx='12'
				cy='9'
				r='5.5'
			/>
			<path d='M8.5 13.3 7 21l5-3 5 3-1.5-7.7' />
		</>
	),
} satisfies Record<string, React.ReactNode>;

type IconName = keyof typeof ICONS;

interface Placement {
	icon: IconName;
	/** vị trí theo % panel */
	top: string;
	left: string;
	/** cạnh icon, px */
	size: number;
	rotate: number;
	/** độ trễ / chu kỳ trôi, giây */
	delay: number;
	duration: number;
	/** ẩn trên dải xếp chồng (tablet/điện thoại) */
	desktopOnly?: boolean;
}

/* Bám 2 mép trái/phải + 4 góc, chừa cột giữa cho logo/chữ/form */
const LEFT_PANEL: Placement[] = [
	{ icon: 'microscope', top: '7%', left: '6%', size: 46, rotate: -12, delay: 0, duration: 9 },
	{ icon: 'dna', top: '24%', left: '13%', size: 38, rotate: 18, delay: 1.2, duration: 11, desktopOnly: true },
	{ icon: 'flask', top: '44%', left: '4%', size: 40, rotate: -8, delay: 0.6, duration: 10, desktopOnly: true },
	{ icon: 'heartPulse', top: '64%', left: '11%', size: 44, rotate: 10, delay: 2, duration: 12, desktopOnly: true },
	{ icon: 'gradCap', top: '84%', left: '5%', size: 48, rotate: -6, delay: 0.3, duration: 10 },
	{ icon: 'stethoscope', top: '6%', left: '85%', size: 48, rotate: 14, delay: 0.9, duration: 11 },
	{ icon: 'atom', top: '26%', left: '90%', size: 40, rotate: 0, delay: 2.4, duration: 14, desktopOnly: true },
	{ icon: 'book', top: '46%', left: '84%', size: 42, rotate: 8, delay: 1.5, duration: 10, desktopOnly: true },
	{ icon: 'syringe', top: '66%', left: '91%', size: 36, rotate: -20, delay: 0.4, duration: 9, desktopOnly: true },
	{ icon: 'award', top: '85%', left: '85%', size: 44, rotate: 6, delay: 1.8, duration: 12 },
	{ icon: 'cross', top: '15%', left: '30%', size: 22, rotate: 0, delay: 3, duration: 8, desktopOnly: true },
	{ icon: 'pill', top: '92%', left: '42%', size: 28, rotate: 30, delay: 1, duration: 9, desktopOnly: true },
	{ icon: 'testTube', top: '12%', left: '68%', size: 28, rotate: 22, delay: 2.2, duration: 10, desktopOnly: true },
	{ icon: 'bulb', top: '93%', left: '62%', size: 26, rotate: -10, delay: 0.7, duration: 11, desktopOnly: true },
];

const RIGHT_PANEL: Placement[] = [
	{ icon: 'flask', top: '9%', left: '9%', size: 40, rotate: -10, delay: 0.5, duration: 11 },
	{ icon: 'heartPulse', top: '36%', left: '5%', size: 36, rotate: 8, delay: 1.6, duration: 12, desktopOnly: true },
	{ icon: 'book', top: '70%', left: '8%', size: 40, rotate: -6, delay: 0.2, duration: 10, desktopOnly: true },
	{ icon: 'dna', top: '22%', left: '89%', size: 38, rotate: 16, delay: 2.1, duration: 13, desktopOnly: true },
	{ icon: 'microscope', top: '56%', left: '90%', size: 40, rotate: 10, delay: 0.9, duration: 11, desktopOnly: true },
	{ icon: 'gradCap', top: '88%', left: '86%', size: 40, rotate: 4, delay: 1.3, duration: 10 },
];

function IconLayer({ items, variant }: { items: Placement[]; variant: 'light' | 'dark' }) {
	return (
		<div
			className={`${styles.bgIcons} ${variant === 'light' ? styles.bgIconsLight : styles.bgIconsDark}`}
			aria-hidden='true'
		>
			{items.map((p, i) => (
				<svg
					key={i}
					className={`${styles.bgIcon} ${p.desktopOnly ? styles.bgIconDesktop : ''}`}
					viewBox='0 0 24 24'
					fill='none'
					stroke='currentColor'
					strokeWidth='1.5'
					strokeLinecap='round'
					strokeLinejoin='round'
					style={
						{
							top: p.top,
							left: p.left,
							width: p.size,
							height: p.size,
							'--rot': `${p.rotate}deg`,
							animationDelay: `${p.delay}s`,
							animationDuration: `${p.duration}s`,
						} as React.CSSProperties
					}
				>
					{ICONS[p.icon]}
				</svg>
			))}
		</div>
	);
}

/** Lớp icon trắng trên panel xanh */
export function LeftPanelIcons() {
	return (
		<IconLayer
			items={LEFT_PANEL}
			variant='light'
		/>
	);
}

/** Lớp icon xanh rất nhạt trên nền form */
export function RightPanelIcons() {
	return (
		<IconLayer
			items={RIGHT_PANEL}
			variant='dark'
		/>
	);
}
