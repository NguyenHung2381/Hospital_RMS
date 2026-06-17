import { SpinnerRingSvg } from '@/assets/icons';
import logo from '../assets/logo.png';

export default function PageLoading() {
	return (
		<div
			style={{
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				justifyContent: 'center',
				height: '100vh',
				background: '#f8faff',
				gap: 20,
			}}
		>
			{/* Spinner ring + circular logo */}
			<div className='spinner-wrapper'>
				<SpinnerRingSvg className='spinner-ring' width={110} height={110} />
				<img
					src={logo}
					alt='Loading'
					className='logo-circle'
				/>
			</div>

			{/* Text + dots */}
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 6,
					color: '#6366f1',
					fontWeight: 500,
					fontSize: 14,
				}}
			>
				<span>Đang tải dữ liệu</span>
				<span className='dot dot-1'>.</span>
				<span className='dot dot-2'>.</span>
				<span className='dot dot-3'>.</span>
			</div>

			<style>{`
				.spinner-wrapper {
					position: relative;
					width: 110px;
					height: 110px;
					display: flex;
					align-items: center;
					justify-content: center;
				}

				.spinner-ring {
					position: absolute;
					inset: 0;
					animation: spin 1.2s linear infinite;
				}
				@keyframes spin {
					to { transform: rotate(360deg); }
				}

				.logo-circle {
					width: 72px;
					height: 72px;
					border-radius: 50%;
					object-fit: cover;
					background: #fff;
					box-shadow: 0 2px 12px rgba(99,102,241,0.15);
				}

				.dot {
					font-size: 20px;
					line-height: 1;
					color: #6366f1;
					animation: dotFade 1.4s infinite ease-in-out;
				}
				.dot-1 { animation-delay: 0s; }
				.dot-2 { animation-delay: 0.2s; }
				.dot-3 { animation-delay: 0.4s; }
				@keyframes dotFade {
					0%, 80%, 100% { opacity: 0.2; }
					40%           { opacity: 1; }
				}
			`}</style>
		</div>
	);
}
