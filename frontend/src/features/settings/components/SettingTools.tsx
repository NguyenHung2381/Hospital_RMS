// Công cụ hỗ trợ hiện cuối một nhóm cấu hình (Group.tool trong config/sections.ts).
// Mỗi công cụ tự giữ state của mình — trang cấu hình chỉ truyền giá trị form cần dùng.
import { useEffect, useRef, useState } from 'react';
import { Button } from '../../../shared/components';
import { InfoSvg } from '../../../assets/icons';
import { notify } from '../../../shared/utils/feedback';
import { getMyAttendance } from '../../portal/api/meApi';
import { settingsApi, type HolidayPreview as HolidayPreviewData, type HolidaySuggestion } from '../api/settingsApi';
import { cx } from '../../../shared/utils/cx';
import RadiusMap from './RadiusMap';
import styles from '../pages/SystemSettings.module.css';

const errText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

/** Gửi thư thử bằng cấu hình SMTP ĐÃ LƯU. */
export function MailTestTool({ dirty }: { dirty: boolean }) {
	const [to, setTo] = useState('');
	const [sending, setSending] = useState(false);
	const send = async () => {
		setSending(true);
		try {
			await settingsApi.testMail(to.trim());
			notify.success(`Đã gửi email thử tới ${to.trim()}`);
		} catch (e) {
			notify.error(errText(e, 'Gửi thử thất bại'));
		} finally {
			setSending(false);
		}
	};
	return (
		<div className={styles.toolRow}>
			<input
				className={styles.input}
				type='email'
				aria-label='Địa chỉ email nhận thư thử'
				placeholder='email-nhan@benhvien.vn'
				value={to}
				onChange={(e) => setTo(e.target.value)}
				onKeyDown={(e) => e.key === 'Enter' && to.trim() && !dirty && send()}
			/>
			<Button variant='secondary' loading={sending} disabled={!to.trim() || dirty} onClick={send}>
				Gửi thử
			</Button>
			{dirty && <span className={styles.toolHint}>Lưu thay đổi trước khi gửi thử</span>}
		</div>
	);
}

/** PING + quét thử tới ClamAV ĐÃ LƯU. */
export function ClamavTestTool({ host, dirty }: { host: string; dirty: boolean }) {
	const [testing, setTesting] = useState(false);
	const test = async () => {
		setTesting(true);
		try {
			await settingsApi.testClamav();
			notify.success('Kết nối ClamAV thành công — đang quét file tải lên');
		} catch (e) {
			notify.error(errText(e, 'Kiểm tra thất bại'));
		} finally {
			setTesting(false);
		}
	};
	return (
		<div className={styles.toolRow}>
			<Button variant='secondary' loading={testing} disabled={!host || dirty} onClick={test}>
				Kiểm tra kết nối
			</Button>
			<span className={dirty || !host ? styles.toolHint : styles.toolNote}>
				{dirty
					? 'Lưu thay đổi trước khi kiểm tra'
					: host
						? 'Gửi lệnh PING và quét thử một đoạn dữ liệu sạch tới ClamAV đã lưu.'
						: 'Đang tắt — điền máy chủ ClamAV và lưu để bật quét virus.'}
			</span>
		</div>
	);
}

type AttendanceHelperProps = {
	/** Giá trị ĐANG NHẬP (chưa lưu cũng được) của ATTENDANCE_LOCATION / _RADIUS_M / _ALLOWED_IPS */
	location: string;
	radius: string;
	ips: string;
	onChange: (key: 'ATTENDANCE_LOCATION' | 'ATTENDANCE_ALLOWED_IPS', value: string) => void;
};

/** Điền nhanh IP / tọa độ khi đang ở bệnh viện + bản đồ xem trước vùng điểm danh. */
export function AttendanceHelper({ location, radius, ips, onChange }: AttendanceHelperProps) {
	const [myIp, setMyIp] = useState<string | null>(null);
	const [locating, setLocating] = useState(false);
	useEffect(() => {
		getMyAttendance()
			.then((r) => setMyIp(r.client_ip ?? ''))
			.catch(() => setMyIp(''));
	}, []);

	const addMyIp = () => {
		const cur = ips.split(/[\s,;]+/).filter(Boolean);
		if (myIp && !cur.includes(myIp)) onChange('ATTENDANCE_ALLOWED_IPS', [...cur, myIp].join(', '));
	};
	const useCurrentLocation = () => {
		if (!navigator.geolocation) return notify.error('Trình duyệt không hỗ trợ định vị (cần HTTPS)');
		setLocating(true);
		navigator.geolocation.getCurrentPosition(
			({ coords }) => {
				onChange('ATTENDANCE_LOCATION', `${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}`);
				notify.success(`Đã lấy vị trí (sai số ±${Math.round(coords.accuracy)}m) — nhớ bấm Lưu`);
				setLocating(false);
			},
			(e) => {
				notify.error(
					e.code === 1
						? 'Bạn đã chặn quyền vị trí cho trang này'
						: e.code === 2
							? 'Thiết bị không xác định được vị trí — bật Dịch vụ định vị của hệ điều hành (Windows: Cài đặt → Quyền riêng tư → Vị trí)'
							: 'Lấy vị trí quá lâu — thử lại hoặc nhập tọa độ từ Google Maps',
				);
				setLocating(false);
			},
			{ enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
		);
	};

	const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(location);
	const [lat, lng] = m ? [Number(m[1]), Number(m[2])] : [NaN, NaN];
	const hasPoint = Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
	const r = Number(radius) > 0 ? Number(radius) : 200;
	return (
		<div className={styles.helper}>
			<InfoSvg className={styles.helperIcon} />
			<div className={styles.helperText}>
				IP máy chủ đang thấy từ máy bạn: <b>{myIp === null ? 'đang kiểm tra…' : myIp || 'không rõ'}</b>. Nếu bạn đang ở bệnh viện, bấm để điền nhanh:
			</div>
			<div className={styles.toolRow}>
				<Button variant='secondary' size='sm' disabled={!myIp} onClick={addMyIp}>
					Thêm IP hiện tại
				</Button>
				<Button variant='secondary' size='sm' loading={locating} onClick={useCurrentLocation}>
					Dùng vị trí hiện tại
				</Button>
			</div>
			<div className={styles.mapBox}>
				<RadiusMap
					className={styles.mapFrame}
					lat={hasPoint ? lat : null}
					lng={hasPoint ? lng : null}
					radius={r}
					onPick={(a, b) => onChange('ATTENDANCE_LOCATION', `${a.toFixed(6)}, ${b.toFixed(6)}`)}
				/>
				<span className={styles.toolNote}>
					Bấm lên bản đồ để chọn tọa độ bệnh viện (nhớ bấm Lưu).
					{hasPoint && (
						<>
							{' '}Chấm đỏ = tọa độ đang chọn, vòng xanh = vùng điểm danh hợp lệ (bán kính {r}m) —{' '}
							<a href={`https://www.google.com/maps?q=${lat},${lng}`} target='_blank' rel='noreferrer'>
								mở bằng Google Maps
							</a>
						</>
					)}
				</span>
			</div>
		</div>
	);
}

const DOW = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const thisYearVN = () => new Date(Date.now() + 7 * 3600_000).getUTCFullYear();
const dmy = (s: string) => `${s.slice(8)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
const sourceName = (url: string) => {
	try {
		const host = new URL(url).hostname;
		return host === 'calendar.google.com' ? 'lịch Google' : host;
	} catch {
		return 'lịch ngoài';
	}
};
const fmtTime = (iso: string) =>
	new Date(iso).toLocaleString('vi-VN', {
		timeZone: 'Asia/Ho_Chi_Minh',
		hour: '2-digit',
		minute: '2-digit',
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
	});

/**
 * Ghi một gợi ý vào ô "Thêm / bỏ ngày nghỉ": gỡ mục cũ của đúng ngày đó (thêm hay bỏ) rồi nối
 * `DD/MM/YYYY` (thêm) hoặc `-DD/MM/YYYY` (bỏ). Mục hằng năm (DD/MM) để nguyên.
 */
const applyHolidayToken = (text: string, date: string, action: 'add' | 'remove') => {
	const d = dmy(date);
	const [dd, mm, yyyy] = d.split('/');
	// Khớp cả 2/1/2026 lẫn 02/01/2026, có hoặc không có dấu "-"
	const same = new RegExp(`^-?\\s*0?${+dd}/0?${+mm}/${yyyy}$`);
	const kept = text
		.split(/[\n,;]+/)
		.map((t) => t.trim())
		.filter((t) => t && !same.test(t));
	return [...kept, action === 'add' ? d : `-${d}`].join(', ');
};

type HolidayPreviewProps = {
	auto: boolean;
	text: string;
	/** Ghi lại ô TRAINING_HOLIDAYS (khi chấp nhận gợi ý từ lịch đồng bộ) */
	onTextChange: (text: string) => void;
};

/**
 * Bảng ngày nghỉ của 1 năm theo giá trị ĐANG NHẬP (công tắc tự tính + ô thêm/bỏ) — để đối chiếu
 * với thông báo nghỉ lễ của Chính phủ trước khi lưu. Máy chủ tính (lịch âm ở utils/vnHolidays.js).
 * Có bản đồng bộ lịch Google (modules/settings/holidaySync.js) thì hiện thêm các ngày khác biệt
 * kèm nút Thêm / Bỏ — bấm chỉ sửa ô nhập, Lưu mới có hiệu lực.
 */
export function HolidayPreview({ auto, text, onTextChange }: HolidayPreviewProps) {
	const base = thisYearVN();
	const [year, setYear] = useState(base);
	const [data, setData] = useState<HolidayPreviewData | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [syncing, setSyncing] = useState(false);
	const [reload, setReload] = useState(0);
	const seq = useRef(0);
	useEffect(() => {
		const id = ++seq.current;
		const t = window.setTimeout(() => {
			settingsApi
				.previewHolidays(year, auto, text)
				.then((r) => id === seq.current && (setData(r), setError(null)))
				.catch((e) => id === seq.current && setError(errText(e, 'Không tải được danh sách ngày nghỉ')));
		}, 350); // gõ liên tục trong ô thì chờ dừng tay mới tính lại
		return () => window.clearTimeout(t);
	}, [year, auto, text, reload]);

	const syncNow = async () => {
		setSyncing(true);
		try {
			const r = await settingsApi.syncHolidays();
			if (r.error) notify.error(`Đồng bộ thất bại: ${r.error}`);
			else notify.success(`Đã tải ${r.count} ngày nghỉ từ lịch nguồn`);
			setReload((n) => n + 1);
		} catch (e) {
			notify.error(errText(e, 'Đồng bộ thất bại'));
		} finally {
			setSyncing(false);
		}
	};
	const accept = (list: HolidaySuggestion[]) =>
		onTextChange(list.reduce((t, s) => applyHolidayToken(t, s.date, s.action), text));

	const items = data?.days ?? null;
	const sync = data?.sync ?? null;
	const sugs = sync?.suggestions ?? [];
	const dowOf = (s: string) => new Date(`${s}T00:00:00Z`).getUTCDay();
	const weekday = (s: string) => ![0, 6].includes(dowOf(s));
	const effective = (items ?? []).filter((h) => !h.removed && weekday(h.date)).length;
	const src = sync ? sourceName(sync.source) : '';
	return (
		<div className={styles.holidayBox}>
			<div className={styles.holidayHead}>
				<span className={styles.holidayTitle}>Xem trước ngày nghỉ</span>
				<div className={styles.segment} role='tablist' aria-label='Năm xem trước'>
					{[base, base + 1].map((y) => (
						<button
							key={y}
							type='button'
							role='tab'
							aria-selected={y === year}
							className={cx(styles.segBtn, y === year && styles.segOn)}
							onClick={() => setYear(y)}
						>
							{y}
							{y === year && sugs.length > 0 && <span className={styles.syncCount}>{sugs.length}</span>}
						</button>
					))}
				</div>
				{items && <span className={styles.toolNote}>{effective} ngày làm việc được nghỉ</span>}
			</div>

			{/* Đối chiếu với lịch đồng bộ */}
			<div className={styles.syncBar}>
				<span className={styles.toolNote}>
					{!sync
						? 'Chưa đối chiếu với lịch ngoài.'
						: sync.fetched_at
							? `Đối chiếu ${src} · tải lúc ${fmtTime(sync.fetched_at)}`
							: `Chưa tải được ${src}.`}
				</span>
				<Button variant='secondary' size='sm' loading={syncing} onClick={syncNow}>
					Đồng bộ ngay
				</Button>
			</div>
			{sync?.error && (
				<span className={styles.toolHint}>
					Lần tải gần nhất{sync.error_at ? ` (${fmtTime(sync.error_at)})` : ''} lỗi: {sync.error}
				</span>
			)}
			{sync?.fetched_at && !sync.covered && (
				<span className={styles.toolNote}>Lịch nguồn chưa có dữ liệu năm {year}.</span>
			)}
			{sync?.fetched_at && sync.covered && !sugs.length && (
				<span className={styles.syncOk}>
					Khớp với {src} ở các ngày làm việc còn lại của năm {year}.
				</span>
			)}
			{sugs.length > 0 && (
				<div className={styles.syncBox}>
					<div className={styles.syncHead}>
						<b>
							{sugs.length} ngày khác với {src}
						</b>
						<button type='button' className={styles.linkBtn} onClick={() => accept(sugs)}>
							Chấp nhận tất cả
						</button>
					</div>
					<ul className={styles.syncList}>
						{sugs.map((s) => (
							<li key={s.date} className={styles.syncRow}>
								<span className={styles.holidayDate}>
									{DOW[dowOf(s.date)]} {s.date.slice(8)}/{s.date.slice(5, 7)}
								</span>
								<span className={styles.holidayName}>
									{s.action === 'add' ? `Lịch nguồn nghỉ: ${s.name}` : `Lịch nguồn không nghỉ (đang tính: ${s.name})`}
								</span>
								<Button variant='secondary' size='sm' onClick={() => accept([s])}>
									{s.action === 'add' ? 'Thêm' : 'Bỏ'}
								</Button>
							</li>
						))}
					</ul>
					<span className={styles.toolNote}>Bấm chỉ ghi vào ô "Thêm / bỏ ngày nghỉ" — nhớ Lưu.</span>
				</div>
			)}

			{error ? (
				<span className={styles.error}>{error}</span>
			) : !items ? (
				<span className={styles.toolNote}>Đang tính…</span>
			) : !items.length ? (
				<span className={styles.toolNote}>Chưa có ngày nghỉ nào — bật tự tính hoặc nhập ngày ở ô trên.</span>
			) : (
				<ul className={styles.holidayList}>
					{items.map((h) => (
						<li key={h.date} className={cx(styles.holidayRow, (h.removed || !weekday(h.date)) && styles.holidayMuted)}>
							<span className={cx(styles.holidayDate, h.removed && styles.holidayRemoved)}>
								{DOW[dowOf(h.date)]} {h.date.slice(8)}/{h.date.slice(5, 7)}
							</span>
							<span className={cx(styles.holidayName, h.removed && styles.holidayRemoved)}>{h.name}</span>
							{h.removed ? (
								<span className={cx(styles.tag, styles.tagWarn)}>Đã bỏ</span>
							) : h.source === 'manual' ? (
								<span className={styles.tag}>Nhập tay</span>
							) : !weekday(h.date) ? (
								<span className={styles.tag}>Cuối tuần</span>
							) : null}
						</li>
					))}
				</ul>
			)}
			<span className={styles.toolNote}>
				Ngày chính thức do Chính phủ công bố hằng năm — khác thì thêm / bỏ ở ô trên. Chỉ ảnh hưởng ngày gợi ý cho
				lớp mới, không đổi lịch đã xếp.
			</span>
		</div>
	);
}
