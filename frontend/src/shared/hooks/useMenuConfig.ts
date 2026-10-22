import { useEffect, useState } from 'react';
import { apiClient } from '../api/axios';
import type { ModuleKey } from './useModules';

/** Cổng có menu bật/tắt được ở Cấu hình hệ thống → key MENU_HIDDEN_<LAYOUT>. */
export type MenuLayout = 'admin' | 'user' | 'trainee';
export type HiddenMenus = Record<MenuLayout, string[]>;

/** Danh sách mục menu của 1 cổng — để trang Cấu hình hệ thống vẽ công tắc. */
export type MenuCatalog = {
	section: string;
	items: {
		key: string;
		label: string;
		/** Mục thuộc module này — module tắt thì mục cũng ẩn dù bật ở đây. */
		module?: ModuleKey;
		/** Không cho tắt (trang chủ của cổng, Cấu hình hệ thống — tắt là tự khoá mình). */
		locked?: boolean;
	}[];
}[];

const NONE: HiddenMenus = { admin: [], user: [], trainee: [] };
let cache: HiddenMenus | null = null;
let inflight: Promise<HiddenMenus> | null = null;

const fetchMenus = () =>
	(inflight ??= apiClient
		.get<HiddenMenus>('/modules/menus')
		.then((m) => (cache = { ...NONE, ...m }))
		.catch(() => NONE) // lỗi mạng: không ẩn gì
		.finally(() => (inflight = null)));

/** Gọi sau khi lưu Cấu hình hệ thống để lần render sau tải lại. */
export const resetMenuConfig = () => {
	cache = null;
};

/** Key các mục menu quản trị đã tắt ở cổng `layout`, bỏ qua mục bị khoá. */
export function useHiddenMenus(layout: MenuLayout, catalog: MenuCatalog): Set<string> {
	const [menus, setMenus] = useState<HiddenMenus>(cache ?? NONE);
	useEffect(() => {
		let alive = true;
		fetchMenus().then((m) => alive && setMenus(m));
		return () => {
			alive = false;
		};
	}, []);
	const locked = new Set(catalog.flatMap((g) => g.items.filter((i) => i.locked).map((i) => i.key)));
	return new Set(menus[layout].filter((k) => !locked.has(k)));
}
