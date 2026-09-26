// Giới hạn số tác vụ nặng CPU (bcrypt ~200ms/lần) chạy cùng lúc trong 1 tiến
// trình. Không giới hạn thì một đợt request đăng nhập dồn dập (kể cả từ nhiều
// IP, lọt qua rate-limit theo IP) xếp hàng hết threadpool của libuv — mọi thao
// tác khác cần threadpool (đọc file upload, DNS, zlib...) chờ theo, cả server
// như bị treo. Có giới hạn: tối đa `max` tác vụ chạy, `queue` tác vụ chờ, còn
// lại bị từ chối NGAY bằng 503 — kẻ tấn công chỉ làm chậm được đăng nhập chứ
// không kéo sập các API khác.
const BUSY_ERROR = {
	statusCode: 503,
	message: 'Hệ thống đang bận, vui lòng thử lại sau giây lát',
	retryAfterSeconds: 5,
};

const createGate = ({ max, queue }) => {
	let running = 0;
	const waiting = [];

	const release = () => {
		running -= 1;
		const next = waiting.shift();
		if (next) next();
	};

	// Chạy fn() khi còn chỗ; hàng đợi đầy thì reject BUSY_ERROR (không gọi fn).
	const run = (fn) =>
		new Promise((resolve, reject) => {
			const start = () => {
				running += 1;
				Promise.resolve()
					.then(fn)
					.then(resolve, reject)
					.finally(release);
			};
			if (running < max) return start();
			if (waiting.length >= queue) return reject(BUSY_ERROR);
			waiting.push(start);
		});

	const stats = () => ({ running, waiting: waiting.length });
	// run() lúc này sẽ bị từ chối — cho nhánh "giả vờ" làm việc (vd chờ thay bcrypt
	// với username không tồn tại) trả 503 y như nhánh thật, không lộ khác biệt.
	const saturated = () => running >= max && waiting.length >= queue;

	return { run, stats, saturated };
};

// Cổng dùng chung cho mọi lần so/băm mật khẩu của luồng đăng nhập. Mặc định
// max = UV_THREADPOOL_SIZE (bcrypt native chạy trên threadpool) để không chiếm
// hết threadpool; hàng đợi 50 ≈ 50 × 200ms / max ≈ 1–3 giây chờ tối đa.
const passwordGate = createGate({
	max: Number(process.env.LOGIN_MAX_CONCURRENT) || Math.max(2, (Number(process.env.UV_THREADPOOL_SIZE) || 4) - 1),
	queue: Number(process.env.LOGIN_MAX_QUEUE) || 50,
});

module.exports = { createGate, passwordGate, BUSY_ERROR };
