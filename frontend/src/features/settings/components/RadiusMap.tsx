import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

type Props = {
	lat: number | null;
	lng: number | null;
	radius: number;
	/** Bấm lên bản đồ để chọn tọa độ */
	onPick?: (lat: number, lng: number) => void;
	className?: string;
};

/** Bản đồ OSM: chấm đỏ = tọa độ, vòng xanh = bán kính cho phép (m). Chưa có tọa độ → hiện toàn Việt Nam. */
export default function RadiusMap({ lat, lng, radius, onPick, className }: Props) {
	const el = useRef<HTMLDivElement>(null);
	const layers = useRef<{ map: L.Map; circle: L.Circle; dot: L.CircleMarker } | null>(null);
	const pick = useRef(onPick);
	pick.current = onPick;

	useEffect(() => {
		const map = L.map(el.current!, { scrollWheelZoom: false }).setView([16, 106], 5);
		L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
			maxZoom: 19,
			attribution: '&copy; OpenStreetMap',
		}).addTo(map);
		map.on('click', (e) => pick.current?.(e.latlng.lat, e.latlng.lng));
		layers.current = {
			map,
			circle: L.circle([0, 0], { radius: 1, color: '#16a34a', weight: 2, fillOpacity: 0.15, interactive: false }),
			dot: L.circleMarker([0, 0], { radius: 6, color: '#fff', weight: 2, fillColor: '#dc2626', fillOpacity: 1, interactive: false }),
		};
		return () => {
			map.remove();
			layers.current = null;
		};
	}, []);

	// Vẽ lại vòng; chỉ dời khung nhìn khi vòng không còn nằm gọn trong màn hình
	// (bấm chọn điểm gần đó thì bản đồ đứng yên, không nhảy).
	useEffect(() => {
		const l = layers.current;
		if (!l) return;
		if (lat === null || lng === null) {
			l.circle.remove();
			l.dot.remove();
			return;
		}
		l.circle.setLatLng([lat, lng]).setRadius(radius).addTo(l.map);
		l.dot.setLatLng([lat, lng]).addTo(l.map);
		const bounds = L.latLng(lat, lng).toBounds(radius * 2);
		const view = l.map.getBounds();
		if (!view.contains(bounds) || l.map.getZoom() < 12) l.map.fitBounds(bounds, { padding: [24, 24] });
	}, [lat, lng, radius]);

	return <div ref={el} className={className} />;
}
