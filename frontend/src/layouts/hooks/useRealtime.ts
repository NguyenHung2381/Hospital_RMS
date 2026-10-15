import { useEffect, useLayoutEffect, useRef } from 'react';
import { BASE_URL, invalidateApiCache } from '../../shared/api/axios';
import { refreshQueued } from '../../shared/api/interceptors';
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
	// Dữ liệu trên server vừa đổi — bỏ cache GET để các trang tải lại bản mới.
	// Xoá sạch chứ không chỉ entity đó: danh mục nhúng dữ liệu chéo (research-rounds
	// có số đề tài + tên loại đợt) nên xoá theo entity sẽ trả về bản cũ.
	invalidateApiCache();
	for (const sub of subscribers) {
		if (entity === 'all' || sub.entities.includes(entity)) dirty.add(sub);
	}
	if (dirty.size && !flushTimer) flushTimer = setTimeout(flush, NOTIFY_COALESCE_MS);
}

// Một thao tác thường phát liền nhiều entity (vd 'topic' rồi 'council'); hook
// nghe nhiều entity (useNotifications, useUserHome...) sẽ tải lại mỗi lần một
// → gom các sự kiện tới trong cửa sổ ngắn, mỗi subscriber chỉ tải lại 1 lần.
const NOTIFY_COALESCE_MS = 150;
const dirty = new Set<Subscriber>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function flush() {
	flushTimer = null;
	const subs = [...dirty];
	dirty.clear();
	for (const sub of subs) if (subscribers.has(sub)) sub.notify();
}

// Nối lại khi kết nối bị đóng hẳn (401 token hết hạn, 502 lúc backend khởi
// động lại...) — EventSource chỉ tự nối lại khi mạng rớt, còn response lỗi thì
// nó bỏ cuộc luôn. Backoff tăng dần để không dội request vào server.
const RECONNECT_MIN_MS = 5_000;
const RECONNECT_MAX_MS = 60_000;
let reconnectDelay = RECONNECT_MIN_MS;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function clearReconnect() {
	if (reconnectTimer) clearTimeout(reconnectTimer);
	reconnectTimer = null;
}

function scheduleReconnect() {
	if (reconnectTimer || subscribers.size === 0) return;
	reconnectTimer = setTimeout(() => {
		reconnectTimer = null;
		closeConnection();
		void ensureConnection();
	}, reconnectDelay);
	reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
}

function closeConnection() {
	clearReconnect();
	if (!source) return;
	source.removeEventListener('update', handleUpdate as EventListener);
	source.close();
	source = null;
	sourceToken = null;
}

// Xin vé mở kết nối (POST /events/ticket, sống 60s, dùng 1 lần). EventSource
// không gắn được header Authorization nên thông tin xác thực phải nằm trên URL
// — URL bị ghi vào access log của proxy, nên đưa vé dùng 1 lần thay vì access
// token thật. Access token hết hạn (401) thì làm mới rồi thử lại 1 lần.
async function fetchTicket(): Promise<string | null> {
	for (let attempt = 0; attempt < 2; attempt++) {
		const token = attempt === 0 ? getToken() : await refreshQueued();
		if (!token) return null;
		const res = await fetch(`${BASE_URL}/api/v1/events/ticket`, {
			method: 'POST',
			headers: { Authorization: `Bearer ${token}` },
		});
		if (res.status === 401) continue;
		if (!res.ok) return null;
		const json = await res.json().catch(() => null);
		return (json?.data?.ticket as string) ?? null;
	}
	return null;
}

let connecting = false;

/** Mở kết nối SSE chia sẻ nếu chưa có, hoặc mở lại khi phiên đã đổi. */
async function ensureConnection() {
	const token = getToken();
	if (!token) {
		closeConnection();
		return;
	}
	if ((source && sourceToken === token) || connecting) return;

	closeConnection();
	connecting = true;
	let ticket: string | null = null;
	try {
		ticket = await fetchTicket();
	} catch {
		ticket = null;
	} finally {
		connecting = false;
	}
	// Trong lúc chờ vé: không còn ai đăng ký, hoặc tab khác đã mở kết nối
	if (subscribers.size === 0 || source) return;
	if (!ticket) {
		scheduleReconnect();
		return;
	}

	source = new EventSource(`${BASE_URL}/api/v1/events?ticket=${encodeURIComponent(ticket)}`);
	// Nhận diện phiên theo access token hiện tại (có thể vừa được làm mới)
	sourceToken = getToken();
	source.addEventListener('update', handleUpdate as EventListener);
	source.onopen = () => {
		reconnectDelay = RECONNECT_MIN_MS;
	};
	source.onerror = () => {
		// CONNECTING: trình duyệt tự nối lại (chờ theo `retry:` server gửi).
		// CLOSED: server trả lỗi → tự lên lịch nối lại với token mới nhất.
		if (source?.readyState === EventSource.CLOSED) scheduleReconnect();
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
		void ensureConnection();

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
