import { useEffect, useState } from 'react';
import { catalogApi } from '../api/catalogApi';

export interface PracticeCatalogs {
	/** Lĩnh vực chuyên môn */
	fields: { id: string; name: string }[];
	/** Hình thức hành nghề */
	forms: { id: string; name: string }[];
	/** Đơn vị cử đi */
	units: { id: string; name: string }[];
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'vi');

/** 3 danh mục của hồ sơ thực hành GPHN (Danh mục đào tạo), xếp A→Z. */
export function usePracticeCatalogs(): PracticeCatalogs {
	const [data, setData] = useState<PracticeCatalogs>({ fields: [], forms: [], units: [] });
	useEffect(() => {
		let cancelled = false;
		Promise.all([
			catalogApi.list('professional-fields'),
			catalogApi.list('practice-forms'),
			catalogApi.list('sending-units'),
		])
			.then(([f, p, u]) => {
				if (cancelled) return;
				setData({ fields: f.data.sort(byName), forms: p.data.sort(byName), units: u.data.sort(byName) });
			})
			.catch(() => {});
		return () => {
			cancelled = true;
		};
	}, []);
	return data;
}
