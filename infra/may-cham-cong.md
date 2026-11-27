# Triển khai máy chấm công vân tay (ADMS / iclock)

Hướng dẫn đưa tính năng máy chấm công lên máy chủ production (`172.16.25.21`, `https://nckh.bvnghean.vn`), cài máy chấm công và kiểm tra từng luồng. Code nằm ở `backend/src/modules/attendanceDevices/`, migration `backend/database/migrations/2027-01-05_may_cham_cong.sql`.

## Đường đi dữ liệu

```
Máy chấm công (192.168.103.x)
   │  HTTPS, máy tự mở kết nối — server KHÔNG cần vào được mạng của máy
   ▼
Proxy HTTPS của viện (192.168.34.20, nckh.bvnghean.vn)
   ▼
172.16.25.21:8081 → nginx (container frontend, location /iclock/)
   ▼
backend :3001 → /iclock/cdata, /iclock/getrequest, /iclock/devicecmd, /iclock/ping
```

- **Máy → server:** lượt chấm, mẫu vân tay mới.
- **Server → máy:** máy tự hỏi lệnh khoảng 10–30 giây một lần; server trả lệnh thêm/xoá học viên, chép vân tay, kéo lại lượt chấm.
- Server chỉ nhận dữ liệu của máy **đã được duyệt** trên trang *Máy chấm công*. Máy lạ được ghi *Chờ duyệt*, dữ liệu của nó nằm lại trong máy cho tới khi duyệt.
- Giao thức của máy không có mật khẩu: máy chỉ gửi **số serial** (in trên tem máy). Vì vậy server chỉ nhận `/iclock` từ **mạng nội bộ của viện** và tự **tạm khoá** máy khi một số serial gửi từ hai nơi — xem mục 3.1.

---

## 1. Trước khi triển khai

### 1.1. Commit đúng phần máy chấm công

Các file thuộc tính năng này:

| Nhóm | File |
|---|---|
| CSDL | `backend/database/migrations/2027-01-05_may_cham_cong.sql`, `2027-01-06_may_cham_cong_day_tay.sql` |
| Backend mới | `backend/src/modules/attendanceDevices/*`, `backend/src/jobs/attendanceDeviceJob.js`, `backend/test/attendanceDevices/*` |
| Backend sửa | `backend/src/app.js`, `backend/src/jobs/index.js`, `backend/src/permissions/catalogAdmin.js`, `backend/src/permissions/routePolicy.js`, `backend/src/modules/settings/systemSettingService.js`, `backend/src/modules/training/courses/courseAttendanceService.js`, `backend/src/modules/training/courses/courseEnrollmentService.js`, `backend/test/contract/routes.snapshot.txt` (chỉ các dòng `attendance-devices` / `iclock`) |
| Frontend mới | `frontend/src/features/attendance-device/*`, `frontend/src/assets/svg/fingerprint.svg` |
| Frontend sửa | `frontend/nginx.conf`, `frontend/src/assets/icons/index.ts`, `frontend/src/app/router/privateRoutes.tsx` (chỉ route `/admin/attendance-devices`), `frontend/src/layouts/AdminLayout/nav.tsx`, `frontend/src/features/course/components/AttendanceModal.tsx`, `frontend/src/features/course/components/EnrollmentsTab.tsx`, `frontend/src/features/course/pages/Courses.module.css`, `frontend/src/features/course/types/course.type.ts`, `frontend/src/features/settings/pages/SystemSettings.tsx`, `frontend/src/shared/types/permissions.generated.ts` |
| Tài liệu | `infra/may-cham-cong.md` (file này) |

Kiểm tra trên máy dev trước khi đẩy lên:

```bash
cd backend
npm test                 # toàn bộ unit test
npm run check:routes     # mọi route đều khai báo phân quyền
npm run test:contract    # snapshot route khớp
npm run lint
cd ../frontend
npx tsc -b && npx eslint .
```

### 1.2. Bật log thô cho lần chạy đầu (khuyến nghị)

Máy chấm công dùng firmware "Ver 6.60", có thể gửi dữ liệu khác chút so với dự kiến. Lần đầu nên ghi nguyên văn những gì máy gửi lên để đối chiếu.

**Trên máy chủ**, thêm vào `backend/.env.production` (trong `DEPLOY_DIR`, mặc định `/data/code/Hospital_RMS`):

```bash
ICLOCK_DEBUG_RAW=true
```

Làm **trước** khi triển khai thì container mới tự nhận biến này, không phải khởi động lại lần nữa. Log thô có PIN và giờ chấm của học viên, nên **chỉ bật vài ngày** rồi tắt (mục 6).

---

## 2. Triển khai

### 2.1. Qua CI/CD (cách thường dùng)

1. Merge/push vào `main`.
2. `ci.yml` build image, triển khai staging, rồi chờ người duyệt môi trường `production` (Actions → workflow đang chạy → *Review deployments* → *Approve*).
3. `scripts/deploy.sh` trên máy chủ tự làm:
   - backup DB (`pg_dump` vào `MIGRATION_BACKUP_DIR`),
   - chạy migration `2027-01-05_may_cham_cong.sql` bằng `rms_migrate`,
   - đổi container, kiểm tra `/health`; hỏng thì tự quay lại bản cũ.

Không cần làm gì thêm cho nginx: `location /iclock/` nằm sẵn trong image frontend.

### 2.2. Chạy tay (GitHub sự cố)

```bash
cd /data/code/Hospital_RMS
scripts/deploy.sh <commit SHA 40 ký tự> ghcr.io/<owner>
```

Chi tiết các biến môi trường của script: [cai-dat-may-ao-ubuntu.md](cai-dat-may-ao-ubuntu.md) mục 14.1 và 15.

---

## 3. Kiểm tra sau triển khai

Chạy **trên máy chủ**:

```bash
cd /data/code/Hospital_RMS
# Migration đã chạy
tail -n 5 logs/deploy-history.log
# Backend nhận đường /iclock/ (qua nginx của container frontend)
curl -s http://127.0.0.1:8081/iclock/ping; echo        # phải in: OK
```

Từ **một máy tính cùng mạng với máy chấm công** (`192.168.103.x`), mở trình duyệt:

```
https://nckh.bvnghean.vn/iclock/ping
```

Thấy chữ `OK` là proxy của viện đã chuyển đúng đường `/iclock/` vào hệ thống. Thấy trang lỗi hoặc trang web của hệ thống thì xem mục 7.

### 3.1. Chặn giả số serial (bắt buộc kiểm)

Ai biết số serial của một máy đã duyệt và gọi được tới `/iclock/` thì lấy được mẫu vân tay, tạo được lượt chấm giả. Có ba lớp chặn:

1. **Chỉ nhận từ mạng nội bộ.** Backend chỉ nhận `/iclock` từ dải `ICLOCK_ALLOWED_CIDRS` (mặc định `192.168.0.0/16`). Dải máy chủ `172.16.0.0/12`, Docker và Internet đều bị trả `403`. Riêng `/iclock/ping` vẫn mở (chỉ trả `OK`).
2. **Tạm khoá khi một serial gửi từ hai nơi.** Máy chuyển chỗ chỉ đổi IP một lần. Nếu IP cũ lại gửi lên trong 10 phút sau khi đổi, tức có máy thứ hai dùng cùng serial, hệ thống chuyển máy sang **Tạm khoá**, ghi *Nhật ký bảo mật* và gửi email cảnh báo cho quản trị.
3. **Giữ lệnh khi máy vừa đổi IP.** Trong 5 phút sau khi đổi IP, server chưa gửi lệnh (vân tay, tên học viên) xuống máy. Mỗi số serial gọi tối đa 240 lần/phút.

**Điều kiện để lớp 1 và 2 chạy đúng: backend phải thấy IP thật của máy**, không phải IP của proxy viện. Đặt trong `.env` gốc (biến của container frontend) và `backend/.env.production`:

```bash
# .env — nginx tin X-Forwarded-For từ proxy của viện (cai-dat-may-ao-ubuntu.md mục 13.3)
TRUSTED_PROXIES=192.168.34.20
# backend/.env.production — request mang IP của chính proxy = chưa có IP thật ⇒ chặn
ICLOCK_PROXY_IPS=192.168.34.20
```

Sau khi triển khai, mở trang *Máy chấm công*: cột IP của từng máy phải là IP riêng của máy (`192.168.103.x`…). Nếu máy nào cũng bị chặn (`403`) và *Nhật ký bảo mật* có `iclock_ip_blocked` ghi "mang IP của proxy" thì `TRUSTED_PROXIES` chưa đúng.

Các biến tuỳ chỉnh (`backend/.env.production`, khởi động lại backend sau khi sửa):

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `ICLOCK_ALLOWED_CIDRS` | `192.168.0.0/16` | Dải IP được gửi `/iclock`, cách nhau dấu phẩy. Nên thu hẹp về đúng các dải có đặt máy |
| `ICLOCK_PROXY_IPS` | (trống) | IP của proxy viện — request mang IP này bị chặn |
| `ICLOCK_IP_FLIP_MIN` | `10` | IP cũ quay lại trong bấy nhiêu phút sau khi đổi IP ⇒ tạm khoá |
| `ICLOCK_IP_HOLD_MIN` | `5` | Số phút giữ lệnh sau khi máy đổi IP |
| `ICLOCK_SN_RATE_LIMIT` | `240` | Số lượt gọi tối đa mỗi phút của một số serial |

**Máy bị Tạm khoá:** máy giữ lượt chấm trong máy, không mất. Quản trị kiểm tra máy thật vẫn ở đúng chỗ, tìm thiết bị lạ theo hai IP ghi ở dòng lý do, rồi bấm **Mở khoá**. Máy giả còn gửi thì máy sẽ bị khoá lại.

Còn hở: người **trong mạng viện** biết số serial vẫn giả được máy lúc máy thật đang tắt (vd. ban đêm). Muốn chặn hẳn cần mã bí mật riêng cho từng máy (chưa làm, phải thử trên máy thật).

### 3.2. Kiểm tra trên web

Trên web, đăng nhập tài khoản quản trị hệ thống:

- Menu *Ca & điểm danh học viên* có mục **Máy chấm công**.
- *Cấu hình hệ thống → Đào tạo* có nhóm **Máy chấm công vân tay**.
- *Cấu hình hệ thống → Phân hệ*: phân hệ **Đào tạo** phải đang bật (tắt thì máy chấm công nhận lỗi `MODULE_DISABLED`).

---

## 4. Cài máy chấm công

### 4.1. Máy chủ đám mây

Trên máy: **Menu → Truyền thông (COMM) → Cài đặt máy chủ đám mây**

| Mục | Giá trị |
|---|---|
| Kiểu máy chủ | Tự động tải dữ liệu |
| Khởi động tên miền | ON |
| Địa chỉ máy chủ | `nckh.bvnghean.vn` (không gõ `https://`) |
| Cổng máy chủ (nếu có) | `443` |
| Cho phép máy chủ ủy nhiệm | OFF |
| HTTPS | ON |

### 4.2. Mạng

Hệ thống nhận diện máy bằng **số serial (SN)**, không theo IP, và máy gửi lên theo **tên miền**. Vì vậy IP của máy đổi hay máy chuyển sang khoa/toà nhà khác đều không ảnh hưởng, chỉ cần nơi mới ra được `nckh.bvnghean.vn`.

Ở mục **Mạng / Ethernet** của máy, nên **bật DHCP** (IP động): máy tự nhận IP, Gateway và DNS đúng của mạng nơi đặt máy, mang đi đâu cũng không phải cài lại.

Mạng nào không có DHCP thì đặt tay (vd. mạng 192.168.103.x):

| Mục | Giá trị |
|---|---|
| Gateway | `192.168.103.254` |
| DNS 1 | `192.168.10.31` |
| DNS 2 | `192.168.10.32` |

Lấy giá trị của mạng khác từ một máy tính cùng mạng bằng `ipconfig /all`. Chuyển máy đi nơi khác thì sửa **Vị trí đặt máy** trên trang Máy chấm công cho dễ quản lý. Không cần duyệt lại máy.

### 4.3. Ngày giờ

Đặt đúng giờ, múi giờ +7. Máy lệch giờ thì lượt chấm ghép sai buổi.

### 4.4. Mã người dùng trên máy

Mã người dùng (PIN) = **mã học viên bỏ chữ HV**: `HV20260123` → `20260123`. Học viên đang học được hệ thống **tự gửi xuống máy**, không cần nhập tay. Chỉ cần đăng ký vân tay cho học viên trên máy.

**Đẩy tay:** ở trang **Tất cả học viên**, chọn học viên → **Đẩy xuống máy chấm công** (hoặc biểu tượng vân tay trên từng dòng). Dùng khi học viên chưa thuộc khoá đang học mà cần có trên máy sớm (vd. đăng ký vân tay trước ngày khai giảng hơn 7 ngày). Học viên được giữ trên máy theo cài đặt *Dọn học viên khỏi máy sau* (mặc định 30 ngày) kể từ lúc đẩy; hết hạn mà vẫn không có khoá đang học thì tự được dọn. Cần quyền *Quản lý máy chấm công*.

Học viên **đã có sẵn trên máy** (nhập tay từ trước):

| Trường hợp | Hệ thống làm gì |
|---|---|
| Đúng mã (vd. `20260123`) | Chỉ cập nhật **tên**. Vân tay, mật khẩu, thẻ từ, quyền trên máy giữ nguyên. Vân tay đã đăng ký được lấy về khi duyệt máy (mục 5.1) để chép sang máy kia. |
| Khác mã (vd. `123`) | Máy có 2 người dùng; lượt chấm bằng mã `123` hiện ở *Lượt chấm → Chưa khớp*. Hệ thống không xoá mã `123` (chỉ xoá người do nó tạo) — xoá tay trên máy, học viên đăng ký vân tay lại. |

Nên xoá các học viên nhập tay sai quy ước mã **trước** khi duyệt máy.

---

## 5. Duyệt máy, cấp quyền, kiểm tra từng luồng

### 5.1. Duyệt máy

1. Lưu cấu hình trên máy, chờ 1–2 phút.
2. Trên web: **Máy chấm công** → máy hiện nhãn hồng **Chờ duyệt** kèm số serial.
3. Đối chiếu số serial với máy (*Menu → Thông tin hệ thống → Thông tin thiết bị*). Đúng máy của viện thì bấm **Duyệt máy**, đặt tên và vị trí.

Sau khi duyệt, server bắt đầu nhận lượt chấm, gửi học viên đang học xuống máy, và gửi lệnh **lấy vân tay có sẵn** (máy gửi lại toàn bộ người dùng + vân tay; server chỉ giữ vân tay của học viên đang học, bỏ qua người khác). Vân tay học viên đã đăng ký trên máy từ trước nhờ đó được chép sang máy kia. Làm lại với máy thứ 2.

Cần lấy lại vân tay sau này (vd. học viên đăng ký vân tay trước khi được duyệt vào khoá): bấm nút **Lấy vân tay có sẵn trên máy** (biểu tượng vân tay) ở dòng của máy.

> Thấy máy lạ (số serial không phải của viện) ở trạng thái Chờ duyệt thì **không duyệt**, xoá đi. Server không nhận dữ liệu của máy chưa duyệt.

### 5.2. Cấp quyền

Quyền mới chưa gán cho vai trò nào, nên lúc đầu chỉ siêu quản trị thấy trang. Vào **Vai trò**, nhóm **Máy chấm công**:

| Quyền | Dùng cho |
|---|---|
| Xem máy chấm công | Xem máy, lượt chấm, lệnh đồng bộ |
| Quản lý máy chấm công | Duyệt máy, sửa, đồng bộ lại, kéo lại lượt chấm, ghép lại; nút *Đồng bộ máy chấm công* trong khoá học |

### 5.3. Kiểm tra từng luồng

| Kiểm tra | Cách làm | Kết quả đúng |
|---|---|---|
| Máy kết nối | Trang Máy chấm công, cột *Kết nối* | Chấm xanh **Đang kết nối** |
| Gửi học viên xuống máy | Tab **Lệnh đồng bộ** | Các lệnh *Thêm/cập nhật …* chuyển **Xong**; trên máy thấy tên học viên (tiếng Việt có dấu) |
| Tên lỗi font | Nhìn tên trên màn hình máy | Lỗi font thì sửa máy → bật **Gửi tên không dấu** |
| Lượt chấm | Một học viên có buổi học hôm nay chấm vân tay trong khoảng 30 phút trước giờ bắt đầu | Tab **Lượt chấm → Đã ghép** có lượt đó; bảng điểm danh buổi học hiện *Máy chấm công · giờ chấm* |
| Lượt không khớp | Tab **Lượt chấm → Chưa khớp** | Lý do: *Không khớp học viên* (sai mã) hoặc *Không có buổi học* (ngoài giờ) |
| Chép vân tay | Học viên đăng ký vân tay ở máy 1, chờ 1–2 phút, chấm ở máy 2 | Máy 2 nhận vân tay; tab Lệnh có *Chép vân tay ngón …* **Xong** |

Lượt chấm trước khi có buổi học hoặc trước khi học viên được duyệt vào khoá sẽ được tự ghép lại (5 phút/lần, trong 7 ngày). Có thể bấm **Ghép lại** ở tab Lượt chấm để ghép ngay.

Cách ghép điểm danh chỉnh ở *Cấu hình hệ thống → Đào tạo → Máy chấm công vân tay*:

| Cài đặt | Mặc định |
|---|---|
| Chấm sớm nhất (trước giờ bắt đầu) | 30 phút |
| Tính đi muộn sau (giờ bắt đầu) | 15 phút |
| Dọn học viên khỏi máy sau (khoá kết thúc) | 30 ngày |
| Chép vân tay giữa các máy | Bật |

Lượt chấm **không ghi đè** điểm danh giảng viên đã nhập tay và **không sửa** điểm đã khoá.

---

## 6. Đọc log, gửi kết quả, tắt log thô

Xem log máy chấm công trên máy chủ:

```bash
cd /data/code/Hospital_RMS
docker compose -p hospital_rms -f docker-compose.prod.yml logs --since 2h backend \
  | grep -E "iclock|attendanceDevices" > /tmp/iclock.log
less /tmp/iclock.log
```

Những dòng cần chú ý:

| Dòng log | Ý nghĩa |
|---|---|
| `Máy chấm công mới <SN> … chờ duyệt` | Máy đã kết nối được |
| `<SN> handshake {"pushver":"…"}` | Phiên bản giao thức của máy, quyết định tên lệnh gửi xuống |
| `<SN> INFO: Ver 6.60 …` | Firmware, số người dùng, số vân tay, phiên bản thuật toán vân tay |
| `<SN> POST ATTLOG …`, `POST OPERLOG …` | Nội dung lượt chấm / vân tay máy gửi lên |
| `<SN>: gửi N lệnh`, `N lệnh lỗi …` | Lệnh xuống máy; lỗi thì kèm mã lệnh |

Gửi file `/tmp/iclock.log` cho người phát triển (log có PIN và giờ chấm của học viên — gửi qua kênh nội bộ, không đăng công khai) để đối chiếu định dạng firmware.

Đối chiếu xong thì **tắt log thô**: xoá dòng `ICLOCK_DEBUG_RAW=true` trong `backend/.env.production`, rồi:

```bash
cd /data/code/Hospital_RMS
docker compose -p hospital_rms -f docker-compose.prod.yml up -d backend
```

(`deploy.sh` đã gắn tag mặc định cho bản đang chạy, nên lệnh này dùng đúng image hiện tại.)

---

## 7. Xử lý sự cố

| Hiện tượng | Nguyên nhân / cách xử lý |
|---|---|
| Mọi máy đều nhận `403` / *Nhật ký bảo mật* có `iclock_ip_blocked` | Backend không thấy IP thật của máy: đặt `TRUSTED_PROXIES` và `ICLOCK_PROXY_IPS` (mục 3.1). Máy đặt ở dải ngoài `ICLOCK_ALLOWED_CIDRS` thì thêm dải đó. |
| Máy chuyển sang **Tạm khoá** | Một số serial gửi từ hai IP xen kẽ (mục 3.1). Kiểm tra rồi bấm **Mở khoá**; nếu máy bị khoá lại ngay thì đang có thiết bị lạ dùng serial này — tìm theo hai IP ở dòng lý do. |
| Máy không hiện ở trang Máy chấm công | Máy chưa tới được server. Thử `https://nckh.bvnghean.vn/iclock/ping` từ máy tính cùng mạng (mục 3). Được thì kiểm tra DNS / Gateway / giờ trên máy (mục 4). Không được thì xem dòng dưới. |
| `…/iclock/ping` ra trang web của hệ thống thay vì `OK` | Image frontend cũ chưa có `location /iclock/` — kiểm tra bản đang chạy (`logs/deploy-history.log`). |
| `…/iclock/ping` lỗi 404 / trang "Welcome to nginx" | Proxy của viện (`192.168.34.20`) không chuyển `/iclock/` vào `172.16.25.21:8081`. Nhờ IT kiểm tra cấu hình proxy cho `nckh.bvnghean.vn`. |
| Máy báo lỗi chứng chỉ / không kết nối khi HTTPS ON | Firmware cũ không hỗ trợ TLS của proxy. Tạm thời: HTTPS OFF, cổng `80` — nhờ IT cho đường `/iclock/` đi HTTP (không chuyển sang HTTPS) trên proxy. |
| Máy *Đang kết nối* nhưng tên học viên không lên máy | Tab Lệnh đồng bộ: lệnh *Chờ gửi* mãi → máy không hỏi lệnh (xem log `getrequest`); lệnh **Lỗi** → gửi log mục 6 để chỉnh tên lệnh theo firmware. Không có lệnh nào → chưa có học viên ở khoá đang học (khoá phải không ở trạng thái nháp/huỷ, đã hoặc sắp bắt đầu trong 7 ngày). |
| Lượt chấm *Không khớp học viên* | Mã trên máy không phải 8 số của mã học viên (nhập tay sai, hoặc người dùng không phải học viên). |
| Lượt chấm *Không có buổi học* | Chấm ngoài khung giờ buổi học, buổi học chưa có giờ bắt đầu, hoặc giờ trên máy lệch. |
| Lượt chấm *Giữ điểm danh tay* | Giảng viên đã lưu điểm danh tay cho buổi đó — hệ thống không ghi đè. |
| Mất lượt chấm khi máy mất mạng lâu | Trang Máy chấm công → nút **Kéo lại lượt chấm** (biểu tượng tải xuống), chọn khoảng ngày. Lượt đã có tự bỏ qua. |
| Thay máy mới / máy bị xoá dữ liệu | Duyệt máy mới; với máy cũ bị xoá dữ liệu thì bấm **Gửi lại toàn bộ học viên** (biểu tượng làm mới). |
| Vân tay không chép sang máy kia | Kiểm tra *Chép vân tay giữa các máy* đang bật; hai máy phải cùng phiên bản thuật toán vân tay (log `INFO`). |
| Học viên đăng ký vân tay trước khi được duyệt vào khoá, máy kia không có | Lúc đăng ký, học viên chưa thuộc danh sách cần có nên server không giữ vân tay. Bấm **Lấy vân tay có sẵn trên máy** ở máy học viên đã đăng ký. |
| Lấy vân tay có sẵn không về | Log có `POST OPERLOG` với dòng `FP …` / `FINGERTMP …` sau lệnh `CHECK` không. Không có thì firmware không gửi lại theo cách này — gửi log mục 6. |

## 8. Lưu ý vận hành

- **Dữ liệu sinh trắc học (Nghị định 13/2023):** khi bật *Chép vân tay giữa các máy*, server lưu mẫu vân tay của học viên. Mẫu được mã hoá AES-GCM và không API nào trả ra. Khi học viên được dọn khỏi máy, mẫu bị xoá. Viện cần **thông báo và có sự đồng ý của học viên** trước khi bật; không muốn lưu thì tắt cài đặt này (học viên đăng ký vân tay ở từng máy).
- **Khoá mã hoá** nằm trong volume `server_secrets` (file `totp.key`, dùng chung với 2FA). Mất volume này thì không giải mã được mẫu vân tay (học viên chỉ cần quét lại) và người dùng phải thiết lập lại 2FA — sao lưu theo [cai-dat-may-ao-ubuntu.md](cai-dat-may-ao-ubuntu.md) mục 14.3.
- **Lưu trữ:** lượt chấm thô giữ 1 năm, lịch sử lệnh giữ 90 ngày (job dọn 04:45 hằng ngày). Điểm danh đã ghi vào buổi học không bị xoá.
- **Rollback:** chạy lại `scripts/deploy.sh <SHA bản cũ>`. Migration chỉ thêm bảng/cột nên bản cũ vẫn chạy được trên DB mới. Bản cũ không có đường `/iclock/` nên máy nhận câu trả lời sai/lỗi và giữ dữ liệu trong máy; triển khai lại bản mới là máy gửi tiếp.
- **Chỉ xoá người server đã gửi xuống:** người dùng khác trên máy (vd. nhân viên do phần mềm khác thêm) không bao giờ bị hệ thống đụng tới.
