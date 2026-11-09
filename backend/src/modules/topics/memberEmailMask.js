const { hasPermission } = require('../../permissions/authz');
const { maskEmail } = require('../../utils/maskEmail');

// Che email thành viên đề tài khi trả về cho người gọi.
//
// Vì sao: GET /users/search cố ý chỉ trả email đã che để không ai vét được danh bạ
// email của viện. Nhưng POST/PUT thành viên và POST /topics/legacy tự điền email
// THẬT từ mã NV (memberAccountEmail) rồi trả lại — người có topics:update nhưng
// không có users:read (vd. topic_leader) dò được email của bất kỳ nhân viên nào.
// Nên mọi chỗ trả danh sách thành viên đều qua đây: người không có users:read chỉ
// thấy email đã che, trừ dòng của chính mình. Ghi vào DB vẫn lưu email đầy đủ
// (gửi thư dùng bản đầy đủ).
const canSeeMemberEmails = (actor) => hasPermission(actor, 'users', 'read');

// Dạng do maskEmail sinh ra: 1–2 ký tự đầu + "***@miền".
const MASKED = /^[^@\s*]{1,2}\*\*\*@/;
// Client có thể gửi lại đúng giá trị đã che (form sửa thành viên nạp email từ API) —
// không được ghi đè email thật bằng bản đã che.
const isMaskedEmail = (email) => typeof email === 'string' && MASKED.test(email.trim());

const maskMember = (m, actor) => {
	if (!m || !m.email || canSeeMemberEmails(actor)) return m;
	if (m.user_id != null && m.user_id === actor?.id) return m;
	return { ...m, email: maskEmail(m.email) };
};

const maskMembers = (members, actor) =>
	Array.isArray(members) ? members.map((m) => maskMember(m, actor)) : members;

// Đề tài có danh sách members (getById / legacy create)
const maskTopicMembers = (topic, actor) =>
	topic && Array.isArray(topic.members)
		? { ...topic, members: maskMembers(topic.members, actor) }
		: topic;

// Kết quả getForExport: mỗi đề tài có members[].email
const maskExportTopics = (topics, actor) =>
	canSeeMemberEmails(actor) ? topics : (topics || []).map((t) => maskTopicMembers(t, actor));

module.exports = {
	canSeeMemberEmails,
	isMaskedEmail,
	maskMember,
	maskMembers,
	maskTopicMembers,
	maskExportTopics,
};
