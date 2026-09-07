import { useEffect, useState } from 'react';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { getRounds } from '../api/roundApi';

/**
 * Có đợt nào đang MỞ cửa sổ "Đăng ký đề tài" ngay bây giờ không?
 *
 * Dùng để ẩn/hiện mục "Đăng ký đề tài" ở cổng người dùng: chỉ hiển thị khi có
 * ít nhất một đợt `active` mà mốc `topic_registration` đang mở (server tính sẵn
 * cờ `registration_open`; đợt chưa cấu hình mốc này coi như luôn mở).
 *
 * `open` mặc định `true` (fail-open) trong lúc tải / khi lỗi mạng — việc chặn
 * cứng vẫn do server đảm nhiệm khi tạo đề tài.
 */
export function useRegistrationOpen(enabled = true): {
	open: boolean;
	loading: boolean;
} {
	const [open, setOpen] = useState(true);
	const [ready, setReady] = useState(false);
	const [tick, setTick] = useState(0);

	useRealtimeUpdate(['round'], () => setTick((t) => t + 1));

	useEffect(() => {
		if (!enabled) return;
		let alive = true;
		getRounds({ limit: 20 })
			.then((res) => {
				if (!alive) return;
				const active = (res.data ?? []).filter((r) => r.status === 'active');
				setOpen(
					active.length > 0 &&
						active.some((r) => r.registration_open !== false),
				);
			})
			.catch(() => {
				if (alive) setOpen(true);
			})
			.finally(() => {
				if (alive) setReady(true);
			});
		return () => {
			alive = false;
		};
	}, [enabled, tick]);

	return { open, loading: enabled && !ready };
}
