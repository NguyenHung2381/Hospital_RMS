import type { CourseRegistrationRules } from '../../api/publicApi';
import s from '../../pages/CourseRegisterPublic.module.css';

interface Props {
	rules: CourseRegistrationRules | null;
	loadError: string;
	onRetry: () => void;
	accepted: boolean;
	onAccept: (v: boolean) => void;
	error?: string;
}

// Bước 2: đọc nội quy lớp học và cam kết thực hiện
export function StepRules({ rules, loadError, onRetry, accepted, onAccept, error }: Props) {
	if (!rules) {
		return loadError ? (
			<div
				className={s.serverError}
				role='alert'
			>
				<span>
					{loadError}{' '}
					<button
						type='button'
						className={s.linkBtn}
						onClick={onRetry}
					>
						Thử lại
					</button>
				</span>
			</div>
		) : (
			<p className={s.muted}>Đang tải nội quy lớp học...</p>
		);
	}
	return (
		<>
			<div
				className={s.rulesBox}
				tabIndex={0}
				role='region'
				aria-label='Nội quy lớp học — dùng phím mũi tên để cuộn'
			>
				<ol className={s.rulesList}>
					{rules.rules.map((r, i) => (
						<li key={i}>{r}</li>
					))}
				</ol>
			</div>
			<label
				id='f-rules'
				className={s.agreeRow}
			>
				<input
					type='checkbox'
					className={s.agreeBox}
					checked={accepted}
					onChange={(e) => onAccept(e.target.checked)}
					aria-invalid={error ? true : undefined}
				/>
				<span>Tôi đã đọc và cam kết thực hiện đầy đủ các nội quy lớp học nêu trên.</span>
			</label>
			{error && (
				<div
					className={s.fieldError}
					role='alert'
				>
					{error}
				</div>
			)}
		</>
	);
}
