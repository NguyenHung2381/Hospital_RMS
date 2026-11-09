# Frontend — Hospital RMS

React 19 + TypeScript SPA, build bằng Vite. Cài đặt và chạy: [README gốc](../README.md).

```bash
npm run dev       # Vite dev server http://localhost:5173, proxy /api và /uploads sang backend
npm run build     # tsc -b + vite build → dist/ (bundle JS làm rối bằng javascript-obfuscator, không có source map)
npm run lint      # ESLint
```

`.env` (tuỳ chọn): `VITE_API_PORT` do backend tự ghi mỗi lần khởi động; `VITE_API_BASE_URL` chỉ đặt khi deploy client ở domain khác API.

## Cấu trúc

```
src/
├── app/
│   ├── providers/          # AntdProvider, QueryProvider, PermissionSync
│   └── router/             # publicRoutes, privateRoutes, guards, LazyRoute, routePrefetch
├── features/<tên>/         # mỗi feature: api / components / hooks / pages / types / utils
│                           #   portal/ = cổng người dùng (/user/*), public/ = cổng công khai, trainee-portal/ = cổng học viên
├── layouts/                # AdminLayout, UserLayout, TraineeLayout, PublicLayout, AuthLayout + hooks/useRealtime
├── shared/
│   ├── api/                # axios, interceptors (tự làm mới token khi 401), endpoints
│   ├── components/         # UI kit dùng chung (bảng dưới)
│   ├── hooks/              # usePermission, useModules, useClientPaging, useUploadPolicy...
│   ├── types/              # permissions.generated.ts (sinh từ backend)
│   └── utils/              # permissions.ts, formatDate, sanitizeHtml, saveBlob...
└── styles/
```

Thư viện chính: Ant Design 6, TanStack Query 5 (server state), React Router 7 (lazy route + prefetch, guard theo quyền), Recharts, dnd-kit, html5-qrcode, Leaflet, DOMPurify, docx-preview / mammoth / pdfjs-dist (xem tài liệu).

## Quy ước

### Phân quyền trên giao diện

Dùng `<RequirePermission perm="...">` (route), `<Can>`, `usePermission()`, `scopeOf()` với kiểu `PermissionKey` sinh từ catalog quyền của backend (`npm run gen:perm-types` trong `backend`) — gõ sai tên quyền là lỗi biên dịch. Quy tắc giống backend (`shared/utils/permissions.ts`: có đúng quyền mới được, `manage` không phải wildcard) nhưng chỉ để ẩn/hiện; backend luôn tự kiểm tra. Quyền được làm mới từ `GET /users/me` khi mở ứng dụng và khi vai trò/tài khoản thay đổi (SSE), không cần đăng nhập lại.

### Realtime: một kết nối SSE cho mỗi tab

Luôn dùng `useRealtimeUpdate(entities, callback)` ([`layouts/hooks/useRealtime.ts`](src/layouts/hooks/useRealtime.ts)). Hook đăng ký vào **một** `EventSource` dùng chung tới `GET /api/v1/events?ticket=<vé>` (vé 60 giây, dùng 1 lần, xin qua `POST /api/v1/events/ticket`). Không tự tạo `EventSource`: mỗi panel một kết nối sẽ vượt giới hạn 6 kết nối HTTP/1.1 mỗi origin của trình duyệt và làm treo các request khác.

### UI kit (`shared/components`)

Import qua barrel: `import { Badge, EmptyState, Pagination } from '@/shared/components'`.

| Thành phần | Dùng cho |
|---|---|
| `<Badge tone dot>` | Nhãn trạng thái. `tone`: `green \| blue \| amber \| gray \| red \| pink \| purple \| teal`. Config trạng thái của feature khai báo `tone: BadgeTone` thay vì tên class |
| `<EmptyState>` / `<TableEmpty colSpan>` | Khối "chưa có dữ liệu" (`TableEmpty` đã bọc sẵn `<tr><td>`) |
| `<Card>` + `Card.Header` / `Card.Body` | Khung card có header icon |
| `<Pagination>` | Phân trang (`hideSizeSelect`, `infoText`) |
| `Table.module.css` | Style gốc cho bảng. Feature dùng `composes: … from '@/shared/components/Table/Table.module.css'`, không tự định nghĩa lại `.tableWrap/.th/.td/.tr/.emptyState` |
| `Modal`, `Button`, `Input/*`, `Loading` / `Skeleton`, `FileViewerModal`, `QrScanner`, `Can`, `Excel` | Có sẵn |

- Không tự viết lại Badge, phân trang hay empty-state trong feature. Cần biến thể thì truyền `className`/`style`.
- `docx-preview` và `RichTextEditor` nặng: import trực tiếp theo đường dẫn, không qua barrel.
- `animation: spin` không dùng được trong CSS Module (keyframe bị scope hoá) — dùng `Loading` / `InlineLoading`.

### CSP

Bản production chạy sau Nginx với CSP chặn thật (`frontend/nginx.conf`, `map $csp_policy`): script ngoài danh sách cho phép, script nội tuyến, `eval` đều bị chặn. Thêm thư viện / dịch vụ ngoài (font, bản đồ, captcha...) phải thêm nguồn vào CSP. Không chèn `<script>` nội tuyến vào trang hay cửa sổ `window.open('')` (cửa sổ này thừa hưởng CSP của trang).
