const clients = new Set();

const addClient = (res) => {
	clients.add(res);
};

const removeClient = (res) => {
	clients.delete(res);
};

// Gộp sự kiện trùng phát ra liên tiếp: import Excel N dòng hay xoá hàng loạt N
// bản ghi gọi broadcast N lần cho cùng 1 entity → mọi tab đang mở tải lại
// danh sách N lần. Trong cửa sổ COALESCE_MS chỉ gửi 1 lần (ở cuối cửa sổ, sau
// khi dữ liệu đã ghi xong), đổi lại độ trễ realtime ~200ms không đáng kể.
const COALESCE_MS = 200;
const pending = new Set();

const broadcast = (event, data) => {
	const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
	if (pending.has(payload)) return;
	pending.add(payload);
	setTimeout(() => {
		pending.delete(payload);
		send(payload);
	}, COALESCE_MS);
};

const send = (payload) => {
	for (const client of clients) {
		try {
			client.write(payload);
		} catch {
			// Client đã ngắt kết nối nhưng chưa kịp fire 'close' event
			clients.delete(client);
		}
	}
};

module.exports = { addClient, removeClient, broadcast };
