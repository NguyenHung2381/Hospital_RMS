// Tên đăng nhập tài khoản học viên: "<chữ cái đầu họ tên>_<số thứ tự 4 chữ số>",
// vd Nguyễn Văn An → NVA_0001, người tiếp theo cùng viết tắt → NVA_0002.
// Số thứ tự đếm RIÊNG theo từng viết tắt và chỉ trong tài khoản học viên —
// username nhân viên cùng dạng (NVA_0123 = chữ cái đầu + MNV) không đẩy số lên,
// chỉ bị nhảy qua khi trùng đúng tên. Dùng chung cho traineeAccountService
// (cấp mới) và scripts/rename-trainee-usernames.js (đổi tên tài khoản cũ).
const { buildMemberUsername } = require('../../topics/topicMemberService');

const INDEX_DIGITS = 4;

// buildMemberUsername không truyền mã số ⇒ chỉ phần chữ cái đầu (đã bỏ dấu, bỏ học hàm)
const traineeUsernamePrefix = (fullName) => buildMemberUsername(fullName, null);

const formatTraineeUsername = (prefix, index) =>
	`${prefix}_${String(index).padStart(INDEX_DIGITS, '0')}`;

// Số thứ tự của username nếu đúng dạng "<prefix>_NNNN", ngược lại null
const traineeUsernameIndex = (username, prefix) => {
	const s = String(username);
	if (s.length !== prefix.length + 1 + INDEX_DIGITS) return null;
	if (s.slice(0, prefix.length + 1).toUpperCase() !== `${prefix}_`.toUpperCase()) return null;
	const digits = s.slice(prefix.length + 1);
	return /^\d+$/.test(digits) ? Number(digits) : null;
};

// Số thứ tự kế tiếp: lớn nhất trong traineeUsernames + 1, nhảy qua username đã có
// (takenUsernames: Set chữ HOA của MỌI username trong bảng users).
const nextTraineeUsername = (prefix, traineeUsernames, takenUsernames) => {
	let index = 0;
	for (const u of traineeUsernames) index = Math.max(index, traineeUsernameIndex(u, prefix) ?? 0);
	let username;
	do {
		index += 1;
		username = formatTraineeUsername(prefix, index);
	} while (takenUsernames.has(username.toUpperCase()));
	return username;
};

module.exports = {
	traineeUsernamePrefix,
	formatTraineeUsername,
	traineeUsernameIndex,
	nextTraineeUsername,
};
