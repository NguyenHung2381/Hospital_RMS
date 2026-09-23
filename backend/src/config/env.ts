import { z } from 'zod';

/**
 * Xác thực biến môi trường bằng Zod — thay thế tương đương cho mảng
 * `REQUIRED_ENV` thủ công trong `app.js`. CHƯA được gọi từ `app.js` ở Giai
 * đoạn 0: `app.js`/`server.js` chạy bằng `node` thuần (script `dev`/
 * `start:prod` không đổi để không phá vỡ runtime hiện tại), và `require()`
 * của Node không tự nạp được file `.ts`. Việc nối module này vào luồng khởi
 * động thật sẽ làm cùng lúc với việc chuyển `app.js`/`server.js` sang
 * TypeScript (Giai đoạn 1) — khi đó runtime đổi sang `tsx`/bản build, và
 * require/import file `.ts` mới hoạt động được.
 *
 * Cho tới lúc đó, `app.js` vẫn giữ nguyên khối `REQUIRED_ENV` cũ — đây là bản
 * chuẩn bị, xác thực đúng bằng `npm run typecheck`.
 */

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    DB_USER: z.string().min(1, 'DB_USER là bắt buộc'),
    DB_PASSWORD: z.string().min(1, 'DB_PASSWORD là bắt buộc'),
    JWT_SECRET: z.string().min(1, 'JWT_SECRET là bắt buộc'),
    JWT_REFRESH_SECRET: z.string().min(1, 'JWT_REFRESH_SECRET là bắt buộc'),
    SWAGGER_USER: z.string().min(1, 'SWAGGER_USER là bắt buộc'),
    SWAGGER_PASS: z.string().min(1, 'SWAGGER_PASS là bắt buộc'),
    CORS_ORIGIN: z.string().optional(),
    DB_ENCRYPT: z.string().optional(),
  })
  .passthrough();

export type Env = z.infer<typeof envSchema>;

/**
 * Đọc `process.env`, dừng ngay (`process.exit(1)`) nếu thiếu biến bắt buộc —
 * giữ đúng hành vi fail-fast của khối `REQUIRED_ENV` gốc trong `app.js`.
 */
export function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    console.error(`❌ Thiếu biến môi trường bắt buộc: ${missing}. Xem backend/.env.example.`);
    process.exit(1);
  }

  const env = parsed.data;

  if (env.NODE_ENV === 'production' && !env.CORS_ORIGIN) {
    console.error('❌ Thiếu biến môi trường CORS_ORIGIN ở production. Xem backend/.env.example.');
    process.exit(1);
  }

  if (env.NODE_ENV === 'production') {
    if (env.DB_ENCRYPT !== 'true') {
      console.warn(
        '⚠️  DB_ENCRYPT khác "true" ở production — kết nối tới SQL Server không được mã hoá.',
      );
    }
    if ((env.DB_USER || '').toLowerCase() === 'sa') {
      console.warn(
        '⚠️  DB_USER=sa ở production — nên dùng 1 SQL login riêng, chỉ cấp quyền trên DB RMS_HOSPITAL.',
      );
    }
  }

  return env;
}
