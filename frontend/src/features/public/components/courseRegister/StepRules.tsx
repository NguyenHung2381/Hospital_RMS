import { useCallback, useEffect, useRef, useState } from 'react';
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

// Mục "Nội quy lớp học" (sát cuối trang): đọc hết nội quy rồi mới tích được ô cam kết.
// Câu cam kết lấy nguyên văn từ máy chủ — đúng câu sẽ lưu vào bản ghi xác nhận điện tử.
export function StepRules({ rules, loadError, onRetry, accepted, onAccept, error }: Props) {
	const boxRef = useRef<HTMLDivElement>(null);
	const [readAll, setReadAll] = useState(false);

	// Đã cuộn tới cuối (hoặc nội quy ngắn, không cần cuộn)
	const checkEnd = useCallback(() => {
		const el = boxRef.current;
		if (el && el.scrollTop + el.clientHeight >= el.scrollHeight - 8) setReadAll(true);
	}, []);
	useEffect(() => {
		checkEnd();
		window.addEventListener('resize', checkEnd);
		return () => window.removeEventListener('resize', checkEnd);
	}, [checkEnd, rules]);

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
	// Bản nháp đã tích từ trước thì không bắt đọc lại
	const canAccept = readAll || accepted;
	return (
		<>
			<p className={s.rulesMeta}>Nội quy lớp học — phiên bản {rules.version}</p>
			<div
				ref={boxRef}
				className={s.rulesBox}
				tabIndex={0}
				role='region'
				aria-label='Nội quy lớp học — dùng phím mũi tên để cuộn'
				onScroll={checkEnd}
			>
				<ol className={s.rulesList}>
					{rules.rules.map((r, i) => (
						<li key={i}>{r}</li>
					))}
				</ol>
				<p className={s.rulesEnd}>— Hết nội quy —</p>
			</div>
			{!canAccept && (
				<p
					className={s.hint}
					aria-live='polite'
				>
					Cuộn đọc hết nội quy để tích ô cam kết bên dưới.
				</p>
			)}
			<label
				id='f-rules'
				className={`${s.agreeRow} ${canAccept ? '' : s.agreeRowDisabled}`}
			>
				<input
					type='checkbox'
					className={s.agreeBox}
					checked={accepted}
					disabled={!canAccept}
					onChange={(e) => onAccept(e.target.checked)}
					aria-invalid={error ? true : undefined}
				/>
				<span>{rules.consent.commitments.rules}</span>
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
