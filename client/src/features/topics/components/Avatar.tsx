import { getInitials } from '../../../shared/utils/helper';
import styles from '../pages/TopicMembers.module.css';

interface AvatarProps {
	name: string;
	cls: string;
	size?: 'sm' | 'md' | 'lg';
}

export function Avatar({ name, cls, size = 'md' }: AvatarProps) {
	const initials = getInitials(name);
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
