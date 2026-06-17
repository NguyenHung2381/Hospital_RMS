import styles from '../pages/TopicMembers.module.css';

interface AvatarProps {
	name: string;
	cls: string;
	size?: 'sm' | 'md' | 'lg';
}

export function Avatar({ name, cls, size = 'md' }: AvatarProps) {
	const initials = name
		.split(' ')
		.filter(Boolean)
		.slice(-2)
		.map((w) => w[0])
		.join('')
		.toUpperCase();
	const sizeCls =
		`avatar${size.charAt(0).toUpperCase() + size.slice(1)}` as keyof typeof styles;
	return (
		<div
			className={`${styles.avatar} ${styles[cls as keyof typeof styles]} ${styles[sizeCls]}`}
		>
			{initials}
		</div>
	);
}
