import { useEffect, useState } from 'react';
import AdminLayout from '../../../layouts/AdminLayout';
import { Button, Card } from '../../../shared/components';
import { notify } from '../../../shared/utils/feedback';
import { settingsApi } from '../api/settingsApi';
import styles from './SystemSettings.module.css';

type Field = {
	key: string;
	label: string;
	hint?: string;
	type?: 'bool' | 'text' | 'number' | 'password' | 'select' | 'textarea';
	options?: [string, string][];
	placeholder?: string;
	/** Mặc định của backend khi chưa cấu hình gì (chỉ cho bool). */
	defaultOn?: boolean;
	/** Nhãn bên cạnh công tắc, tuỳ trạng thái. */
	onText?: string;
	offText?: string;
};

type Section = {
	id: string;
	title: string;
	sub: string;
	groups: { title?: string; fields: Field[] }[];
};

const SECTIONS: Section[] = [
	{
		id: 'security',
		title: 'Bảo mật & Tài khoản',
		sub: '2FA, quên mật khẩu, cảnh báo',
		groups: [
			{
				title: 'Xác thực 2 lớp (TOTP)',
				fields: [
					{
						key: 'REQUIRE_2FA_FOR_ADMINS',
						label: 'Bắt buộc 2FA cho quản trị',
						hint: 'Áp dụng cho superuser và vai trò có quyền nhạy cảm (tạo/sửa người dùng, phân quyền, cấu hình).',
						type: 'bool',
						defaultOn: true,
						onText: 'Đang bắt buộc',
						offText: 'Không bắt buộc',
					},
					{
						key: 'TWOFA_GRACE_DAYS',
						label: 'Thời gian chuyển tiếp (ngày)',
						hint: 'Quá hạn mà chưa bật 2FA thì bị chặn mọi chức năng. Mặc định 14 ngày.',
						type: 'number',
						placeholder: '14',
					},
				],
			},
			{
				title: 'Mật khẩu & cảnh báo',
				fields: [
					{
						key: 'PASSWORD_RESET_ENABLED',
						label: 'Cho phép quên mật khẩu (OTP)',
						hint: 'Tắt thì nút "Quên mật khẩu" không dùng được. OTP gửi qua email nên cần bật Email.',
						type: 'bool',
						defaultOn: true,
						onText: 'Đang cho phép',
						offText: 'Đã tắt',
					},
					{
						key: 'ALERT_EMAILS',
						label: 'Email nhận cảnh báo bảo mật',
						hint: 'Phân cách bằng dấu phẩy. Để trống = gửi cho mọi superuser có email.',
						type: 'textarea',
						placeholder: 'it@benhvien.vn, antoan@benhvien.vn',
					},
				],
			},
		],
	},
	{
		id: 'mail',
		title: 'Email (SMTP)',
		sub: 'Máy chủ gửi thư, gửi thử',
		groups: [
			{
				fields: [
					{
						key: 'MAIL_ENABLED',
						label: 'Bật gửi email',
						hint: 'Công tắc tổng. Tắt = chỉ ghi log máy chủ, không gửi thật cho mọi chức năng (kể cả OTP).',
						type: 'bool',
						onText: 'Đang bật',
						offText: 'Đang tắt',
					},
				],
			},
			{
				title: 'Gửi email cho chức năng',
				// Mặc định khớp backend mailService.EVENT_DEFAULTS
				fields: (
					[
						['TOPIC_RESULT', 'Kết quả duyệt đề tài', 'Phê duyệt / từ chối / yêu cầu bổ sung — gửi chủ nhiệm và thành viên.', true],
						['TOPIC_SUBMITTED', 'Có đề tài mới cần duyệt', 'Gửi người có quyền duyệt khi đề tài được nộp.', false],
						['ACCOUNT_GRANTED', 'Cấp tài khoản thành viên đề tài', 'Báo thành viên mới, khoa và chủ nhiệm (không kèm mật khẩu).', false],
						['DEADLINE_REMINDER', 'Nhắc deadline đợt NCKH', 'Trước hạn và khi quá hạn các mốc của đợt.', true],
						['COURSE_ENROLLMENT', 'Kết quả đăng ký khóa học', 'Gửi học viên khi đăng ký được duyệt / chờ / từ chối.', true],
						['SEMINAR_BADGE', 'Thẻ đại biểu hội nghị', 'Gửi kèm QR điểm danh sau khi đăng ký hội nghị công khai.', true],
						['PASSWORD_EXPIRY', 'Nhắc đổi mật khẩu', 'Khi mật khẩu lâu chưa đổi.', true],
						['SECURITY_ALERT', 'Cảnh báo bảo mật', 'Gửi tới "Email nhận cảnh báo bảo mật" (tab Bảo mật).', true],
						['BROADCAST', 'Thông báo chung', 'Thông báo quản trị gửi tới toàn viện / khoa / cá nhân.', false],
					] as const
				).map(([k, label, hint, defaultOn]) => ({
					key: `MAIL_EVENT_${k}`,
					label,
					hint,
					type: 'bool' as const,
					defaultOn,
					onText: 'Gửi email',
					offText: 'Không gửi email',
				})),
			},
			{
				title: 'Máy chủ',
				fields: [
					{ key: 'SMTP_HOST', label: 'SMTP host', placeholder: 'smtp.gmail.com' },
					{ key: 'SMTP_PORT', label: 'SMTP port', type: 'number', placeholder: '587' },
					{
						key: 'SMTP_SECURE',
						label: 'Kiểu kết nối',
						type: 'select',
						options: [
							['', 'STARTTLS (thường port 587)'],
							['ssl', 'SSL/TLS (thường port 465)'],
						],
					},
				],
			},
			{
				title: 'Tài khoản gửi',
				fields: [
					{ key: 'SMTP_USER', label: 'Tài khoản', placeholder: 'no-reply@benhvien.vn' },
					{ key: 'SMTP_PASS', label: 'Mật khẩu / App password', hint: 'Được che sau khi lưu. Để nguyên nếu không đổi.', type: 'password' },
					{ key: 'SMTP_FROM_NAME', label: 'Tên người gửi', placeholder: 'Hệ thống Quản lý NCKH' },
				],
			},
			{
				title: 'Liên kết',
				fields: [
					{
						key: 'PUBLIC_BASE_URL',
						label: 'URL gốc hệ thống',
						hint: 'Dùng tạo link tra cứu trong email.',
						placeholder: 'https://rms.benhvien.vn',
					},
				],
			},
		],
	},
	{
		id: 'modules',
		title: 'Module chức năng',
		sub: 'Bật/tắt từng phân hệ',
		groups: [
			{
				fields: [
					{ key: 'MODULE_RESEARCH', label: 'Nghiên cứu khoa học', hint: 'Đề tài, đợt, hội đồng chấm, phê duyệt, danh mục phân loại.', type: 'bool', defaultOn: true, onText: 'Đang bật', offText: 'Đã tắt' },
					{ key: 'MODULE_TRAINING', label: 'Đào tạo', hint: 'Kế hoạch, chương trình, khóa học, học viên, giảng viên, ngân hàng câu hỏi.', type: 'bool', defaultOn: true, onText: 'Đang bật', offText: 'Đã tắt' },
					{ key: 'MODULE_SEMINAR', label: 'Hội nghị & CME', hint: 'Hội thảo, sổ cấp CME, ghi nhận CME độc lập.', type: 'bool', defaultOn: true, onText: 'Đang bật', offText: 'Đã tắt' },
					{ key: 'MODULE_SURVEY', label: 'Khảo sát', type: 'bool', defaultOn: true, onText: 'Đang bật', offText: 'Đã tắt' },
				],
			},
		],
	},
	{
		id: 'cme',
		title: 'CME',
		sub: 'Ngưỡng tín chỉ liên tục',
		groups: [
			{
				fields: [
					{ key: 'CME_CYCLE_YEARS', label: 'Chu kỳ tính ngưỡng (năm)', hint: 'Số năm của một chu kỳ CME.', type: 'number', placeholder: '5' },
					{ key: 'CME_MIN_HOURS', label: 'Giờ tín chỉ tối thiểu / chu kỳ', hint: 'Dùng cho cảnh báo thiếu tín chỉ.', type: 'number', placeholder: '120' },
				],
			},
		],
	},
];

const FIELDS = SECTIONS.flatMap((s) => s.groups.flatMap((g) => g.fields));
type Values = Record<string, string>;

export default function SystemSettings() {
	const [saved, setSaved] = useState<Values>({});
	const [form, setForm] = useState<Values>({});
	const [env, setEnv] = useState<Values>({}); // giá trị đang áp dụng từ .env khi chưa đặt qua UI
	const [tab, setTab] = useState(SECTIONS[0].id);
	const [showPass, setShowPass] = useState(false);
	const [hasPass, setHasPass] = useState(false);
	const [saving, setSaving] = useState(false);
	const [testTo, setTestTo] = useState('');
	const [testing, setTesting] = useState(false);

	const load = () =>
		settingsApi
			.list()
			.then((rows) => {
				const v: Values = {};
				const e: Values = {};
				for (const f of FIELDS) {
					const r = rows.find((x) => x.setting_key === f.key);
					if (f.type === 'bool') {
						v[f.key] = r?.effective === 'true' || r?.effective === 'false' ? r.effective : String(!!f.defaultOn);
					} else {
						v[f.key] = r?.value ?? '';
						if (!r?.value && r?.effective) e[f.key] = r.effective;
					}
					if (f.key === 'SMTP_PASS') setHasPass(!!r?.has_value);
				}
				setSaved(v);
				setForm(v);
				setEnv(e);
			})
			.catch(() => notify.error('Không thể tải cấu hình'));

	useEffect(() => {
		load();
	}, []);

	const isDirty = (f: Field) => form[f.key] !== saved[f.key];
	const dirty = FIELDS.filter(isDirty);
	const set = (key: string, value: string) => setForm((p) => ({ ...p, [key]: value }));
	const on = (key: string) => saved[key] === 'true';

	const save = async () => {
		setSaving(true);
		try {
			for (const f of dirty) await settingsApi.update(f.key, form[f.key]);
			notify.success(`Đã lưu ${dirty.length} thay đổi`);
			await load();
		} catch (e) {
			notify.error(e instanceof Error ? e.message : 'Lưu thất bại');
		} finally {
			setSaving(false);
		}
	};

	const sendTest = async () => {
		setTesting(true);
		try {
			await settingsApi.testMail(testTo.trim());
			notify.success(`Đã gửi email thử tới ${testTo.trim()}`);
		} catch (e) {
			notify.error(e instanceof Error ? e.message : 'Gửi thử thất bại');
		} finally {
			setTesting(false);
		}
	};

	const stats = [
		{ label: '2FA quản trị', value: on('REQUIRE_2FA_FOR_ADMINS') ? 'Bắt buộc' : 'Không bắt buộc', ok: on('REQUIRE_2FA_FOR_ADMINS') },
		{ label: 'Gửi email', value: on('MAIL_ENABLED') ? 'Đang bật' : 'Đang tắt', ok: on('MAIL_ENABLED') },
		{ label: 'Quên mật khẩu', value: on('PASSWORD_RESET_ENABLED') ? 'Cho phép' : 'Đã tắt', ok: on('PASSWORD_RESET_ENABLED') },
		{
			label: 'SMTP',
			value: saved.SMTP_HOST || env.SMTP_HOST ? saved.SMTP_HOST || env.SMTP_HOST : 'Chưa cấu hình',
			ok: !!(saved.SMTP_HOST || env.SMTP_HOST),
		},
	];

	const renderControl = (f: Field) => {
		if (f.type === 'bool') {
			const checked = form[f.key] === 'true';
			return (
				<label className={styles.switch}>
					<input type='checkbox' checked={checked} onChange={(e) => set(f.key, String(e.target.checked))} />
					<span className={styles.track} />
					{checked ? f.onText ?? 'Bật' : f.offText ?? 'Tắt'}
				</label>
			);
		}
		if (f.type === 'select') {
			return (
				<select id={f.key} className={styles.input} value={form[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)}>
					{f.options!.map(([v, l]) => (
						<option key={v} value={v}>
							{l}
						</option>
					))}
				</select>
			);
		}
		if (f.type === 'textarea') {
			return (
				<textarea
					id={f.key}
					className={styles.input}
					rows={2}
					placeholder={env[f.key] ?? f.placeholder}
					value={form[f.key] ?? ''}
					onChange={(e) => set(f.key, e.target.value)}
				/>
			);
		}
		const isPass = f.type === 'password';
		return (
			<div className={styles.inline}>
				<input
					id={f.key}
					className={styles.input}
					type={isPass && !showPass ? 'password' : f.type === 'number' ? 'number' : 'text'}
					autoComplete='off'
					placeholder={isPass ? (hasPass ? 'Đã đặt — nhập để thay đổi' : '') : (env[f.key] ?? f.placeholder)}
					value={form[f.key] ?? ''}
					onChange={(e) => set(f.key, e.target.value)}
					onFocus={(e) => isPass && e.target.value === '••••••' && set(f.key, '')}
				/>
				{isPass && (
					<Button variant='ghost' size='sm' type='button' onClick={() => setShowPass((s) => !s)}>
						{showPass ? 'Ẩn' : 'Hiện'}
					</Button>
				)}
				{!isPass && env[f.key] && !form[f.key] && <span className={styles.src} title='Giá trị đang lấy từ file .env'>.env</span>}
			</div>
		);
	};

	const section = SECTIONS.find((s) => s.id === tab)!;

	return (
		<AdminLayout pageTitle='Cấu hình hệ thống' pageSubtitle='Bật/tắt chức năng bảo mật, email SMTP, ngưỡng CME — áp dụng không cần khởi động lại'>
			<div className={styles.summary}>
				{stats.map((s) => (
					<div className={styles.stat} key={s.label}>
						<span className={`${styles.dot} ${s.ok ? styles.dotOn : ''}`} />
						<div>
							<div className={styles.statLabel}>{s.label}</div>
							<div className={styles.statValue}>{s.value}</div>
						</div>
					</div>
				))}
			</div>

			<div className={styles.layout}>
				<nav className={styles.tabs}>
					{SECTIONS.map((s) => (
						<button key={s.id} type='button' className={`${styles.tab} ${s.id === tab ? styles.tabActive : ''}`} onClick={() => setTab(s.id)}>
							<span className={styles.tabTitle}>
								{s.title}
								{s.groups.some((g) => g.fields.some(isDirty)) && <span className={styles.changed} title='Có thay đổi chưa lưu' />}
							</span>
							<span className={styles.tabSub}>{s.sub}</span>
						</button>
					))}
				</nav>

				<div>
					<Card>
						<Card.Header title={section.title} sub={section.sub} />
						<Card.Body>
							{section.groups.map((g, i) => (
								<div className={styles.group} key={i}>
									{g.title && <div className={styles.groupTitle}>{g.title}</div>}
									{g.fields.map((f) => (
										<div className={styles.row} key={f.key}>
											<label className={styles.label} htmlFor={f.key}>
												{f.label}
												{f.hint && <span className={styles.hint}>{f.hint}</span>}
											</label>
											{renderControl(f)}
										</div>
									))}
								</div>
							))}

							{section.id === 'mail' && (
								<div className={styles.testBox}>
									<div className={styles.label}>
										Gửi email thử
										<span className={styles.hint}>Dùng cấu hình đã lưu, bỏ qua công tắc "Bật gửi email". Lưu thay đổi trước khi thử.</span>
									</div>
									<div className={styles.inline} style={{ marginTop: 8 }}>
										<input
											className={styles.input}
											type='email'
											placeholder='email-nhan@benhvien.vn'
											value={testTo}
											onChange={(e) => setTestTo(e.target.value)}
										/>
										<Button variant='secondary' loading={testing} disabled={!testTo.trim() || dirty.length > 0} onClick={sendTest}>
											Gửi thử
										</Button>
									</div>
								</div>
							)}
						</Card.Body>
					</Card>

					<div className={styles.saveBar}>
						<span className={styles.saveText}>{dirty.length ? `${dirty.length} thay đổi chưa lưu` : 'Không có thay đổi'}</span>
						{dirty.length > 0 && (
							<Button variant='ghost' onClick={() => setForm(saved)}>
								Hoàn tác
							</Button>
						)}
						<Button loading={saving} disabled={!dirty.length} onClick={save}>
							Lưu thay đổi
						</Button>
					</div>
				</div>
			</div>
		</AdminLayout>
	);
}
