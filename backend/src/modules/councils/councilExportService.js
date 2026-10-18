const { httpError } = require('../../utils/httpError');
const repo = require('./councilExportRepository');

// Dữ liệu "Lịch bảo vệ đề cương" của 1 đợt: đề tài kèm nhóm nghiên cứu, ghế
// hội đồng và ghế thay thế theo đề tài (exports/councilScheduleWorkbook.js áp).
const groupBy = (rows, key) => {
	const map = new Map();
	for (const r of rows) {
		if (!map.has(r[key])) map.set(r[key], []);
		map.get(r[key]).push(r);
	}
	return map;
};
// key → (role → dòng): mỗi vai trò 1 ghế, dòng sau ghi đè dòng trước như cũ
const indexByRole = (rows, key) => {
	const map = new Map();
	for (const r of rows) {
		if (!map.has(r[key])) map.set(r[key], new Map());
		map.get(r[key]).set(r.role, r);
	}
	return map;
};

const getDefenseSchedule = async (roundId) => {
	const round = await repo.findRound(roundId);
	if (!round) throw httpError(404, 'Không tìm thấy đợt nghiên cứu');
	const topics = await repo.listTopics(roundId);
	if (!topics.length) throw httpError(404, 'Đợt này chưa có đề tài nào được gán hội đồng');
	const [members, seats, subs] = await Promise.all([
		repo.listMembers(roundId),
		repo.listSeats(roundId),
		repo.listSubstitutes(roundId),
	]);
	return {
		round,
		topics,
		membersByTopic: groupBy(members, 'topic_id'),
		seatsByCouncil: indexByRole(seats, 'council_id'),
		subsByTopic: indexByRole(subs, 'topic_id'),
	};
};

module.exports = { getDefenseSchedule };
