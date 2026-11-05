import { useCallback, useSyncExternalStore } from 'react';

/**
 * Theo dõi một media query, cập nhật khi người dùng đổi kích thước cửa sổ.
 *   const isMobile = useMediaQuery(maxWidth('lg'));
 */
export function useMediaQuery(query: string): boolean {
	const subscribe = useCallback(
		(onChange: () => void) => {
			const mq = window.matchMedia(query);
			mq.addEventListener('change', onChange);
			return () => mq.removeEventListener('change', onChange);
		},
		[query],
	);

	return useSyncExternalStore(
		subscribe,
		() => window.matchMedia(query).matches,
		() => false,
	);
}
