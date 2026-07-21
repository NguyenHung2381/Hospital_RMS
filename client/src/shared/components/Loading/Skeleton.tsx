import React from 'react';
import styles from './Loading.module.css';

interface SkeletonProps {
	width?: string | number;
	height?: string | number;
	variant?: 'rect' | 'circle';
	className?: string;
	style?: React.CSSProperties;
}

export function Skeleton({
	width,
	height,
	variant = 'rect',
	className = '',
	style,
}: SkeletonProps) {
	const customStyle: React.CSSProperties = {
		width,
		height,
		borderRadius: variant === 'circle' ? '50%' : undefined,
		...style,
	};

	return (
		<div
			className={`${styles.skeleton} ${className}`}
			style={customStyle}
		/>
	);
}

interface SkeletonTableProps {
	rows?: number;
	cols?: number;
}

export function SkeletonTable({ rows = 5, cols = 5 }: SkeletonTableProps) {
	// height fixed to match real row height (avatar cell ~40px + 16px*2 padding) — otherwise the
	// swap from skeleton to real rows resizes the whole table and tanks CLS
	return (
		<>
			{Array.from({ length: rows }).map((_, rIdx) => (
				<tr
					key={rIdx}
					style={{ height: 72 }}
				>
					{Array.from({ length: cols }).map((_, cIdx) => (
						<td
							key={cIdx}
							style={{ padding: '16px 20px' }}
						>
							<Skeleton
								height={16}
								width={cIdx === 0 ? '40%' : cIdx === 1 ? '85%' : '60%'}
								style={{ verticalAlign: 'middle' }}
							/>
						</td>
					))}
				</tr>
			))}
		</>
	);
}

interface SkeletonCardProps {
	count?: number;
}

export function SkeletonCard({ count = 3 }: SkeletonCardProps) {
	return (
		<>
			{Array.from({ length: count }).map((_, idx) => (
				<div
					key={idx}
					style={{
						padding: '24px',
						background: 'var(--color-white)',
						borderRadius: '12px',
						border: '1px solid var(--color-gray-200)',
						display: 'flex',
						flexDirection: 'column',
						gap: '16px',
						minHeight: '180px',
					}}
				>
					<div
						style={{
							display: 'flex',
							justifyContent: 'space-between',
							alignItems: 'center',
						}}
					>
						<Skeleton
							width='30%'
							height={20}
						/>
						<Skeleton
							width='20%'
							height={24}
							style={{ borderRadius: '12px' }}
						/>
					</div>
					<Skeleton
						width='85%'
						height={22}
					/>
					<div
						style={{
							display: 'flex',
							flexDirection: 'column',
							gap: '8px',
							marginTop: '4px',
						}}
					>
						<Skeleton
							width='60%'
							height={14}
						/>
						<Skeleton
							width='50%'
							height={14}
						/>
					</div>
					<div
						style={{
							marginTop: 'auto',
							display: 'flex',
							justifyContent: 'space-between',
							borderTop: '1px solid var(--color-gray-100)',
							paddingTop: '12px',
						}}
					>
						<Skeleton
							width='40%'
							height={16}
						/>
						<Skeleton
							width='15%'
							height={16}
						/>
					</div>
				</div>
			))}
		</>
	);
}
