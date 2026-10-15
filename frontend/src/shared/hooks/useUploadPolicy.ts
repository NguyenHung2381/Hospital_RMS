import { useEffect, useState } from 'react';
import { BASE_URL } from '../api/endpoints';

export interface UploadPolicy {
	/** Đuôi tài liệu được nhận, vd ['.pdf', '.docx'] */
	extensions: string[];
	/** Dung lượng tối đa mỗi file (MB) */
	maxSizeMB: number;
}

// Mặc định khớp backend utils/uploadPolicy.js — dùng tới khi tải xong
const DEFAULT: UploadPolicy = {
	extensions: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.rar', '.zip'],
	maxSizeMB: 50,
};
const VIDEO_AUDIO = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v', '.mp3', '.wav', '.m4a', '.aac'];

let cache: UploadPolicy | null = null;
let inflight: Promise<UploadPolicy> | null = null;

// Endpoint công khai (không cần đăng nhập) — dùng chung cho cổng công khai và trang nội bộ
const fetchPolicy = () =>
	(inflight ??= fetch(`${BASE_URL}/api/v1/public/upload-policy`)
		.then((r) => r.json())
		.then((j) => (cache = j.data as UploadPolicy))
		.catch(() => DEFAULT) // server vẫn chặn file sai định dạng/dung lượng
		.finally(() => (inflight = null)));

/** Gọi khi admin vừa đổi cấu hình để lần dùng sau tải lại. */
export const resetUploadPolicy = () => {
	cache = null;
};

const extOf = (name: string) => {
	const i = name.lastIndexOf('.');
	return i >= 0 ? name.slice(i).toLowerCase() : '';
};

/**
 * Định dạng & dung lượng file tài liệu được nhận (Cấu hình hệ thống → Tải lên).
 * allowMedia: route nhận thêm video/audio bài giảng (giới hạn dung lượng riêng ở server).
 * check(file) trả thông báo lỗi hoặc null.
 */
export function useUploadPolicy({ allowMedia = false } = {}) {
	const [policy, setPolicy] = useState<UploadPolicy>(cache ?? DEFAULT);
	useEffect(() => {
		let alive = true;
		fetchPolicy().then((p) => alive && setPolicy(p));
		return () => {
			alive = false;
		};
	}, []);
	const extensions = allowMedia ? [...policy.extensions, ...VIDEO_AUDIO] : policy.extensions;
	const check = (file: File): string | null => {
		if (!extensions.includes(extOf(file.name))) return `"${file.name}" không đúng định dạng cho phép (${policy.extensions.join(', ')})`;
		if (!allowMedia && file.size > policy.maxSizeMB * 1048576) return `"${file.name}" vượt quá ${policy.maxSizeMB}MB`;
		return null;
	};
	return { ...policy, extensions, accept: extensions.join(','), check };
}
