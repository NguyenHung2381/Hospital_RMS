const clients = new Set();

const addClient = (res) => {
	clients.add(res);
};

const removeClient = (res) => {
	clients.delete(res);
};

const broadcast = (event, data) => {
	const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
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
