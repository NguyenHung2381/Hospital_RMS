import { useState } from 'react';
import styles from '../pages/Courses.module.css';

/** Cụm từ đầu chung của mọi tên (theo từ), vd "Thực hành giấy phép hành nghề" — để thẻ chỉ hiện phần khác nhau. */
function commonPrefix(list: string[]): string {
	if (list.length < 2) return '';
	const words = list[0].split(' ');
	let n = words.length;
	for (const name of list) {
		const w = name.split(' ');
		let i = 0;
		while (i < n && i < w.length - 1 && w[i] === words[i]) i++;
		n = i;
	}
	return words.slice(0, n).join(' ');
}

/** Danh sách chương trình (chuỗi "a, b, c" từ API) → thẻ gọn, mặc định hiện `max` thẻ, bấm "+N" để xem hết. */
export default function ProgramTags({ names, max = 2, empty = '—' }: { names: string | null; max?: number; empty?: string }) {
	const [expanded, setExpanded] = useState(false);
	const list = (names ?? '').split(/,\s*/).filter(Boolean);
	if (!list.length) return <span className={styles.descText}>{empty}</span>;
	const prefix = commonPrefix(list);
	const shown = expanded ? list : list.slice(0, max);
	return (
		<span className={styles.programWrap}>
			{prefix && <span className={styles.programPrefix}>{prefix}</span>}
			<span className={styles.programTags}>
				{shown.map((n) => (
					<span key={n} className={styles.programTag} title={n}>
						{prefix ? n.slice(prefix.length).trim() : n}
					</span>
				))}
				{list.length > max && (
					<button
						type='button'
						className={`${styles.programTag} ${styles.programMore}`}
						title={expanded ? undefined : list.join('\n')}
						onClick={() => setExpanded((v) => !v)}
					>
						{expanded ? 'Thu gọn' : `+${list.length - max} chương trình`}
					</button>
				)}
			</span>
		</span>
	);
}
