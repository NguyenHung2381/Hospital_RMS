/**
 * zipStoreWriter.js — ghi file ZIP dạng luồng, không nén (STORE), tên file UTF-8.
 *
 * Dùng cho các gói file đã tự nén sẵn (PDF, ảnh): nén thêm không được gì mà tốn
 * CPU. Ghi thẳng từng file ra `out` (vd Express res) ngay khi có, không giữ cả
 * gói trong bộ nhớ — xuất vài trăm giấy chứng nhận ~1–2MB/file không làm phình
 * RAM của worker.
 *
 * Không hỗ trợ ZIP64: tối đa 65.535 file và tổng < 4GB (vượt thì báo lỗi).
 */
const zlib = require('zlib');
const { once } = require('events');

const MAX_U32 = 0xffffffff;
const UTF8_FLAG = 0x0800;

// Giờ DOS (giờ VN, độ phân giải 2 giây)
const dosDateTime = (d) => {
	const vn = new Date(d.getTime() + 7 * 3600 * 1000);
	const time = (vn.getUTCHours() << 11) | (vn.getUTCMinutes() << 5) | (vn.getUTCSeconds() >> 1);
	const date =
		((vn.getUTCFullYear() - 1980) << 9) | ((vn.getUTCMonth() + 1) << 5) | vn.getUTCDate();
	return { time, date };
};

class ZipStoreWriter {
	/** @param {import('stream').Writable} out */
	constructor(out) {
		this.out = out;
		this.offset = 0;
		/** @type {{ name: Buffer, crc: number, size: number, offset: number, time: number, date: number }[]} */
		this.entries = [];
	}

	async #write(buf) {
		if (this.out.destroyed) throw new Error('Kết nối tải file đã đóng');
		this.offset += buf.length;
		if (!this.out.write(buf)) await once(this.out, 'drain');
	}

	/**
	 * @param {string} name  đường dẫn trong gói (dùng "/")
	 * @param {Buffer | Uint8Array} data
	 */
	async add(name, data) {
		const nameBuf = Buffer.from(name, 'utf8');
		if (
			this.entries.length >= 0xffff ||
			this.offset + data.length + 30 + nameBuf.length > MAX_U32
		) {
			throw new Error('Gói ZIP quá lớn (tối đa 65.535 file, 4GB)');
		}
		const crc = zlib.crc32(data) >>> 0;
		const { time, date } = dosDateTime(new Date());
		const h = Buffer.alloc(30);
		h.writeUInt32LE(0x04034b50, 0);
		h.writeUInt16LE(20, 4); // version needed
		h.writeUInt16LE(UTF8_FLAG, 6);
		h.writeUInt16LE(0, 8); // STORE
		h.writeUInt16LE(time, 10);
		h.writeUInt16LE(date, 12);
		h.writeUInt32LE(crc, 14);
		h.writeUInt32LE(data.length, 18);
		h.writeUInt32LE(data.length, 22);
		h.writeUInt16LE(nameBuf.length, 26);
		h.writeUInt16LE(0, 28);
		this.entries.push({ name: nameBuf, crc, size: data.length, offset: this.offset, time, date });
		await this.#write(Buffer.concat([h, nameBuf]));
		await this.#write(Buffer.from(data.buffer, data.byteOffset, data.length));
	}

	/** Ghi mục lục + kết thúc gói, đóng `out`. */
	async finish() {
		const cdStart = this.offset;
		for (const e of this.entries) {
			const c = Buffer.alloc(46);
			c.writeUInt32LE(0x02014b50, 0);
			c.writeUInt16LE(20, 4); // version made by
			c.writeUInt16LE(20, 6); // version needed
			c.writeUInt16LE(UTF8_FLAG, 8);
			c.writeUInt16LE(0, 10);
			c.writeUInt16LE(e.time, 12);
			c.writeUInt16LE(e.date, 14);
			c.writeUInt32LE(e.crc, 16);
			c.writeUInt32LE(e.size, 20);
			c.writeUInt32LE(e.size, 24);
			c.writeUInt16LE(e.name.length, 28);
			// extra, comment, disk, internal attr = 0; external attr = 0
			c.writeUInt32LE(e.offset, 42);
			await this.#write(Buffer.concat([c, e.name]));
		}
		const end = Buffer.alloc(22);
		end.writeUInt32LE(0x06054b50, 0);
		end.writeUInt16LE(this.entries.length, 8);
		end.writeUInt16LE(this.entries.length, 10);
		end.writeUInt32LE(this.offset - cdStart, 12);
		end.writeUInt32LE(cdStart, 16);
		await this.#write(end);
		this.out.end();
	}
}

module.exports = { ZipStoreWriter };
