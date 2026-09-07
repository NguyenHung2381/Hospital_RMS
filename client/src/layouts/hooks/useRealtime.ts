import { useEffect, useLayoutEffect, useRef } from 'react';
import { BASE_URL } from '../../shared/api/axios';
import { getToken } from '../../shared/utils/storage';

/**
 * Hook để lắng nghe các sự kiện cập nhật thời gian thực từ server (SSE).
 *
 * Toàn bộ ứng dụng chỉ mở **một** kết nối `EventSource` duy nhất cho mỗi tab —
 * mọi lần gọi hook đều đăng ký (subscribe) vào cùng một kết nối chia sẻ ở cấp
 * module. Trước đây mỗi lần gọi hook mở riêng một `EventSource`; một trang chứa
 * nhiều hook (layout + trang + các panel) có thể mở 5–6 kết nối, và mở song song
 * cổng admin lẫn cổng người dùng thì vượt giới hạn 6 kết nối HTTP/1.1 trên mỗi
 * origin của trình duyệt → mọi request còn lại (API, chunk JS, ảnh) bị xếp hàng
 * vô thời hạn khiến toàn hệ thống "treo, không tải được gì".
 */

type Subscriber = {
	entities: string[];
	notify: () => void;
};

const subscribers = new Set<Subscriber>();

let source: EventSource | null = null;
let sourceToken: string | null = null;

function handleUpdate(e: MessageEvent) {
	let entity: string;
	try {
		entity = JSON.parse(e.data).entity;
	} catch (err) {
		console.error('[Realtime] Parse error:', err);
		return;
	}
	for (const sub of subscribers) {
		if (entity === 'all' || sub.entities.includes(entity)) {
			sub.notify();
		}
	}
}

function closeConnection() {
	if (!source) return;
	source.removeEventListener('update', handleUpdate as EventListener);
	source.close();
	source = null;
	sourceToken = null;
}

/** Mở kết nối SSE chia sẻ nếu chưa có, hoặc mở lại khi token đã đổi. */
function ensureConnection() {
	const token = getToken();
	if (!token) {
		closeConnection();
		return;
	}
	if (source && sourceToken === token) return;

	closeConnection();

	// ponytail: token nằm trong query string vì EventSource không cho set header
	// Authorization — có thể lộ token qua access log của server/proxy. Nếu cần
	// siết chặt hơn, nâng cấp sang cơ chế ticket ngắn hạn (endpoint riêng cấp
	// 1 ticket dùng 1 lần cho /events) thay vì access token thật.
	source = new EventSource(`${BASE_URL}/api/v1/events?token=${token}`);
	sourceToken = token;
	source.addEventListener('update', handleUpdate as EventListener);
	source.onerror = () => {
		// EventSource tự động thử kết nối lại khi readyState === CONNECTING.
	};
}

export function useRealtimeUpdate(
	entities: string | string[],
	callback: () => void,
) {
	const callbackRef = useRef(callback);
	useLayoutEffect(() => {
		callbackRef.current = callback;
	});

	const entityKey = Array.isArray(entities) ? entities.join(',') : entities;

	useEffect(() => {
		const sub: Subscriber = {
			entities: entityKey.split(','),
			notify: () => callbackRef.current(),
		};
		subscribers.add(sub);
		ensureConnection();

		return () => {
			subscribers.delete(sub);
			// Hoãn việc đóng kết nối: khi điều hướng giữa các trang, hook cũ
			// unmount rồi hook mới mount ngay trong cùng một tick — không nên
			// dựng lại kết nối SSE nếu vẫn còn (hoặc sắp có) người đăng ký.
			queueMicrotask(() => {
				if (subscribers.size === 0) closeConnection();
			});
		};
	}, [entityKey]); // callback được đọc qua ref — không cần vào deps
}
