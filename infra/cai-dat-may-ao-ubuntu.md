# Cài đặt Hospital RMS trên máy ảo Ubuntu (2 ổ đĩa, SQL Server cài riêng)

Hướng dẫn dựng **production** từ đầu trên một máy ảo, điều khiển hoàn toàn qua SSH:

| Ổ | Dung lượng | Dùng cho |
|---|---|---|
| Ổ 1 (`/dev/sda`) | 50 GB | Hệ điều hành Ubuntu + chương trình SQL Server |
| Ổ 2 (`/dev/sdb`) | 50 GB | Mount tại `/data`: source code, dữ liệu Docker (image, file upload, log), file dữ liệu + backup SQL Server |

```
Trình duyệt ──► :8084 frontend (Nginx, container) ──► backend:3001 (container) ──► redis, clamav (container)
                                                          │
                                                          └──► SQL Server 2022 (cài thẳng trên Ubuntu, :1433)
```

SQL Server **không** chạy trong Docker. Container backend gọi về máy host qua `host.docker.internal` (đã khai báo sẵn trong `docker-compose.prod.yml`).

> Vì sao để cả Docker và dữ liệu SQL Server trên ổ 2? Ổ hệ điều hành chỉ 50 GB. Image Docker (node, nginx, clamav…), cache build, file người dùng upload và file `.mdf/.ldf` của SQL Server đều tăng dần theo thời gian — để trên ổ 1 là sớm muộn đầy ổ hệ điều hành và máy treo. Ổ 2 chứa toàn bộ phần "dữ liệu", ổ 1 chỉ còn hệ điều hành.

---

## Mục lục

0. [Yêu cầu máy ảo](#0-yêu-cầu-máy-ảo)
1. [Kết nối SSH](#1-kết-nối-ssh)
2. [Chuẩn bị Ubuntu](#2-chuẩn-bị-ubuntu)
3. [Ổ thứ 2: phân vùng và mount `/data`](#3-ổ-thứ-2-phân-vùng-và-mount-data)
4. [Cài SQL Server 2022 (không dùng Docker)](#4-cài-sql-server-2022-không-dùng-docker)
5. [Khôi phục database và tạo login cho ứng dụng](#5-khôi-phục-database-và-tạo-login-cho-ứng-dụng)
6. [Cài Docker Engine (dữ liệu trên ổ 2)](#6-cài-docker-engine-dữ-liệu-trên-ổ-2)
7. [Cài Node.js (tuỳ chọn)](#7-cài-nodejs-tuỳ-chọn)
8. [Lấy source code về ổ 2](#8-lấy-source-code-về-ổ-2)
9. [Tạo file cấu hình](#9-tạo-file-cấu-hình)
10. [Build, chạy migration, khởi động](#10-build-chạy-migration-khởi-động)
11. [Firewall](#11-firewall)
12. [HTTPS (khuyến nghị)](#12-https-khuyến-nghị)
13. [Cập nhật phiên bản](#13-cập-nhật-phiên-bản)
14. [Sao lưu](#14-sao-lưu)
15. [Xử lý sự cố](#15-xử-lý-sự-cố)

---

## 0. Yêu cầu máy ảo

| | Tối thiểu | Khuyến nghị |
|---|---|---|
| Hệ điều hành | **Ubuntu Server 22.04 LTS** (64-bit) | như bên trái |
| CPU | 4 vCPU | 8 vCPU |
| RAM | 8 GB | 12–16 GB |
| Ổ đĩa | 2 × 50 GB như bảng trên | |

- **Dùng Ubuntu 22.04**, không dùng 24.04: SQL Server 2022 chỉ hỗ trợ chính thức Ubuntu 20.04/22.04. Nếu bắt buộc phải 24.04 thì cài SQL Server 2025 (Microsoft hỗ trợ 24.04 cho bản này) — các bước bên dưới giống hệt, chỉ đổi đường dẫn repo `22.04` → `24.04` và `mssql-server-2022` → `mssql-server-2025`.
- RAM ước tính: SQL Server ~3 GB (giới hạn ở bước 4), ClamAV (quét virus file upload) ~1,5 GB, backend ~300 MB/worker, Redis + Nginx < 250 MB, hệ điều hành ~1 GB. Máy chỉ có 8 GB thì để `WEB_CONCURRENCY=2` (bước 9), hoặc tắt ClamAV.
- Lúc cài Ubuntu: chọn **cài OpenSSH server**, cài hệ điều hành vào ổ 50 GB thứ nhất, **không đụng tới ổ thứ 2**.
- Máy ảo nên có IP tĩnh trong LAN (đặt ở router/DHCP reservation hoặc netplan). Dưới đây gọi là `<IP-VM>`.

---

## 1. Kết nối SSH

Từ máy của bạn (Windows 10/11 có sẵn `ssh` trong PowerShell; macOS/Linux dùng Terminal):

```bash
ssh <user>@<IP-VM>
```

Nên dùng khoá SSH thay mật khẩu. Trên **máy của bạn**:

```bash
ssh-keygen -t ed25519 -C "rms-admin"
```

Copy khoá công khai lên VM (macOS/Linux):

```bash
ssh-copy-id <user>@<IP-VM>
```

Trên Windows PowerShell không có `ssh-copy-id`, dùng lệnh này thay thế:

```powershell
type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh <user>@<IP-VM> "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

Đăng nhập lại bằng khoá thành công rồi mới tắt đăng nhập bằng mật khẩu (trên VM):

```bash
sudo sed -i 's/^#\?PasswordAuthentication .*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo systemctl restart ssh
```

> Giữ nguyên cửa sổ SSH đang mở khi restart `ssh`, mở thêm cửa sổ mới thử đăng nhập. Hỏng thì vẫn còn cửa sổ cũ để sửa.

**Lệnh chạy lâu** (build Docker, restore DB) nên chạy trong `tmux` để mất mạng SSH giữa chừng không bị huỷ lệnh:

```bash
tmux new -s rms        # mở phiên; thoát tạm: Ctrl+B rồi D
tmux attach -t rms     # vào lại sau khi SSH lại
```

---

## 2. Chuẩn bị Ubuntu

```bash
sudo apt-get update && sudo apt-get -y upgrade
sudo apt-get install -y curl wget gnupg ca-certificates git ufw tmux htop unzip parted
sudo timedatectl set-timezone Asia/Ho_Chi_Minh
sudo reboot
```

Swap 4 GB trên ổ 1 (đỡ bị kill tiến trình khi RAM thiếu lúc build):

```bash
sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## 3. Ổ thứ 2: phân vùng và mount `/data`

Xem tên ổ. Ổ 2 là ổ **50G chưa có phân vùng, chưa có MOUNTPOINTS** (thường `sdb`, trên một số hypervisor là `vdb`/`nvme1n1`):

```bash
lsblk -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINTS
```

> ⚠️ Kiểm tra thật kỹ tên ổ. Các lệnh dưới **xoá sạch** ổ được chọn. Ở đây giả sử là `/dev/sdb`.

```bash
DISK=/dev/sdb
sudo parted -s $DISK mklabel gpt mkpart data ext4 0% 100%
sudo mkfs.ext4 -L data ${DISK}1
sudo mkdir -p /data
UUID=$(sudo blkid -s UUID -o value ${DISK}1)
echo "UUID=$UUID /data ext4 defaults,noatime,nofail 0 2" | sudo tee -a /etc/fstab
sudo systemctl daemon-reload
sudo mount -a
df -h /data          # phải thấy ~49G mount tại /data
```

Tạo cấu trúc thư mục:

```bash
sudo mkdir -p /data/code /data/docker /data/mssql/{data,log,backup} /data/backup
sudo chown $USER:$USER /data/code /data/backup
```

| Thư mục | Nội dung |
|---|---|
| `/data/code/Hospital_RMS` | Source code (git clone) + file `.env` |
| `/data/docker` | Toàn bộ dữ liệu Docker: image, container, **volume** (file upload, log hoạt động, JWT secret, khoá 2FA) |
| `/data/mssql/data`, `/data/mssql/log` | File `.mdf` / `.ldf` của database |
| `/data/mssql/backup` | File `.bak` (restore lần đầu, backup định kỳ, backup trước migration) |
| `/data/backup` | Bản sao lưu volume Docker |

Reboot thử một lần để chắc `/data` tự mount: `sudo reboot`, SSH lại, `df -h /data`.

---

## 4. Cài SQL Server 2022 (không dùng Docker)

### 4.1. Cài gói

```bash
curl -fsSL https://packages.microsoft.com/keys/microsoft.asc | sudo gpg --dearmor -o /usr/share/keyrings/microsoft-prod.gpg
curl -fsSL https://packages.microsoft.com/config/ubuntu/22.04/mssql-server-2022.list | sudo tee /etc/apt/sources.list.d/mssql-server-2022.list
sudo apt-get update
sudo apt-get install -y mssql-server
```

### 4.2. Collation (đọc trước khi setup)

Collation của **server** nên trùng với collation của database cũ (nếu khác, câu lệnh dùng bảng tạm `#temp` có thể lỗi *Cannot resolve the collation conflict*). Trên SQL Server cũ, chạy:

```sql
SELECT SERVERPROPERTY('Collation') AS server_collation,
       DATABASEPROPERTYEX('RMS_HOSPITAL','Collation') AS db_collation;
```

Mặc định trên Linux là `SQL_Latin1_General_CP1_CI_AS`. Nếu DB cũ dùng collation khác (vd `Vietnamese_CI_AS`), đặt biến `MSSQL_COLLATION` ở bước setup bên dưới.

### 4.3. Setup

```bash
sudo MSSQL_COLLATION=SQL_Latin1_General_CP1_CI_AS /opt/mssql/bin/mssql-conf setup
```

- Chọn **edition**:
  - `Express` (miễn phí): giới hạn **10 GB mỗi database**, 4 core, ~1,4 GB RAM cho buffer. Đủ nếu DB nhỏ.
  - `Developer` (miễn phí): **chỉ để dev/test, không được dùng production**.
  - `Standard`/`Enterprise`: cần bản quyền (license key).
- Đồng ý điều khoản, đặt **mật khẩu `sa`** mạnh (≥ 8 ký tự, có hoa, thường, số, ký tự đặc biệt). Ghi lại cẩn thận.

### 4.4. Chuyển dữ liệu sang ổ 2, giới hạn RAM

```bash
sudo chown -R mssql:mssql /data/mssql
sudo /opt/mssql/bin/mssql-conf set filelocation.defaultdatadir   /data/mssql/data
sudo /opt/mssql/bin/mssql-conf set filelocation.defaultlogdir    /data/mssql/log
sudo /opt/mssql/bin/mssql-conf set filelocation.defaultbackupdir /data/mssql/backup
# RAM tối đa cho SQL Server (MB). Máy 8 GB: 3072; máy 16 GB: 6144
sudo /opt/mssql/bin/mssql-conf set memory.memorylimitmb 3072
# Cổng TCP cố định (mặc định đã là 1433, đặt rõ cho chắc)
sudo /opt/mssql/bin/mssql-conf set network.tcpport 1433
sudo systemctl restart mssql-server
systemctl status mssql-server --no-pager     # phải là active (running)
sudo systemctl enable mssql-server           # tự chạy khi khởi động máy
```

> SQL Server trên Linux luôn bật TCP/IP và SQL Authentication (đăng nhập bằng user/mật khẩu) — không cần bật như trên Windows. Database mới / restore sẽ nằm ở `/data/mssql/...`. Database hệ thống (`master`, `msdb`…) vẫn ở ổ 1, chúng rất nhỏ.

### 4.5. Công cụ dòng lệnh `sqlcmd`

```bash
curl -fsSL https://packages.microsoft.com/config/ubuntu/22.04/prod.list | sudo tee /etc/apt/sources.list.d/mssql-release.list
sudo apt-get update
sudo ACCEPT_EULA=Y apt-get install -y mssql-tools18 unixodbc-dev
echo 'export PATH="$PATH:/opt/mssql-tools18/bin"' >> ~/.bashrc
source ~/.bashrc
sqlcmd -S localhost -U sa -C -Q "SELECT @@VERSION"
```

(`-C` = tin chứng chỉ tự ký của SQL Server.)

### 4.6. Dùng SSMS / Azure Data Studio từ máy của bạn (không mở cổng 1433 ra LAN)

Mở **SSH tunnel** trên máy của bạn rồi để cửa sổ đó mở:

```bash
ssh -N -L 14330:localhost:1433 <user>@<IP-VM>
```

Trong SSMS: Server name `localhost,14330`, Authentication *SQL Server Authentication*, tick **Trust server certificate**.

---

## 5. Khôi phục database và tạo login cho ứng dụng

> Repo **không có** script tạo schema gốc (bảng `users`, `topics`…). Các file trong `backend/database/migrations/` chỉ là thay đổi bổ sung. Database phải được khôi phục từ file **`.bak`** (hoặc script schema gốc) lấy từ nhóm phát triển / server cũ.

### 5.1. Đưa file `.bak` lên VM

Từ máy của bạn:

```bash
scp RMS_HOSPITAL.bak <user>@<IP-VM>:/tmp/
```

Trên VM:

```bash
sudo mv /tmp/RMS_HOSPITAL.bak /data/mssql/backup/
sudo chown mssql:mssql /data/mssql/backup/RMS_HOSPITAL.bak
```

### 5.2. Restore

Xem tên logic của các file trong bản backup (cột `LogicalName`):

```bash
sqlcmd -S localhost -U sa -C -Q "RESTORE FILELISTONLY FROM DISK = N'/data/mssql/backup/RMS_HOSPITAL.bak'"
```

Restore, thay `RMS_HOSPITAL` và `RMS_HOSPITAL_log` bằng đúng `LogicalName` vừa thấy:

```bash
sqlcmd -S localhost -U sa -C -Q "
RESTORE DATABASE [RMS_HOSPITAL]
FROM DISK = N'/data/mssql/backup/RMS_HOSPITAL.bak'
WITH MOVE N'RMS_HOSPITAL'     TO N'/data/mssql/data/RMS_HOSPITAL.mdf',
     MOVE N'RMS_HOSPITAL_log' TO N'/data/mssql/log/RMS_HOSPITAL_log.ldf',
     RECOVERY, STATS = 10"
```

> Bản `.bak` tạo từ SQL Server **mới hơn** (vd 2025) không restore được vào 2022. Bản cũ hơn thì được.

### 5.3. Tạo login riêng cho ứng dụng

Production **không dùng `sa`** cho ứng dụng. Nếu nhóm phát triển có `scripts/create-app-login.sql` thì dùng file đó. Không có thì chạy (đổi mật khẩu):

```bash
sqlcmd -S localhost -U sa -C -I
```

```sql
-- Login ứng dụng: chỉ đọc/ghi dữ liệu + gọi stored procedure trên RMS_HOSPITAL
CREATE LOGIN rms_app WITH PASSWORD = N'<MAT_KHAU_MANH_1>', CHECK_POLICY = ON, DEFAULT_DATABASE = RMS_HOSPITAL;
GO
USE RMS_HOSPITAL;
GO
IF USER_ID(N'rms_app') IS NULL CREATE USER rms_app FOR LOGIN rms_app;
ELSE ALTER USER rms_app WITH LOGIN = rms_app;   -- DB restore từ server cũ đã có user này
GO
ALTER ROLE db_datareader ADD MEMBER rms_app;
ALTER ROLE db_datawriter ADD MEMBER rms_app;
GRANT EXECUTE TO rms_app;
GO

-- Login chỉ dùng khi chạy migration (cần ALTER + BACKUP)
USE master;
GO
CREATE LOGIN rms_migrate WITH PASSWORD = N'<MAT_KHAU_MANH_2>', CHECK_POLICY = ON, DEFAULT_DATABASE = RMS_HOSPITAL;
GO
USE RMS_HOSPITAL;
GO
IF USER_ID(N'rms_migrate') IS NULL CREATE USER rms_migrate FOR LOGIN rms_migrate;
ELSE ALTER USER rms_migrate WITH LOGIN = rms_migrate;
GO
ALTER ROLE db_owner ADD MEMBER rms_migrate;
GO
EXIT
```

Kiểm tra login ứng dụng:

```bash
sqlcmd -S localhost -U rms_app -C -d RMS_HOSPITAL -Q "SELECT COUNT(*) FROM dbo.users"
```

---

## 6. Cài Docker Engine (dữ liệu trên ổ 2)

**Trước khi cài**, cấu hình Docker lưu mọi thứ ở `/data/docker` và giới hạn log container:

```bash
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json > /dev/null <<'EOF'
{
  "data-root": "/data/docker",
  "log-driver": "json-file",
  "log-opts": { "max-size": "20m", "max-file": "5" }
}
EOF
```

Cài từ repo chính thức của Docker (bản `docker.io` của Ubuntu có Compose quá cũ — dự án cần **Compose ≥ 2.24**):

```bash
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
```

Thoát SSH và đăng nhập lại (để nhóm `docker` có hiệu lực), rồi kiểm tra:

```bash
docker info | grep "Docker Root Dir"     # phải là /data/docker
docker compose version                    # >= v2.24
docker run --rm hello-world
```

> Lỡ cài Docker trước khi tạo `daemon.json`: `sudo systemctl stop docker docker.socket`, tạo file như trên, `sudo rsync -a /var/lib/docker/ /data/docker/`, `sudo systemctl start docker`, kiểm tra lại rồi mới xoá `/var/lib/docker`.

---

## 7. Cài Node.js (tuỳ chọn)

Bản production build và chạy hoàn toàn **trong Docker** (image `node:24-alpine`), máy host **không cần** Node.js. Chỉ cài khi muốn chạy script của dự án ngay trên host (vd `npm run migrate`, import dữ liệu) hoặc chạy bản dev không Docker:

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v && npm -v
```

---

## 8. Lấy source code về ổ 2

Repo là private. Cách gọn nhất là tạo **deploy key** (chỉ đọc) cho VM:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/rms_deploy -N "" -C "rms-vm-deploy"
cat ~/.ssh/rms_deploy.pub
```

Copy dòng in ra vào GitHub: repo → *Settings* → *Deploy keys* → *Add deploy key* (không tick *Allow write access*). Sau đó:

```bash
cat >> ~/.ssh/config <<'EOF'
Host github.com
  IdentityFile ~/.ssh/rms_deploy
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config

cd /data/code
git clone git@github.com:NguyenHung2381/Hospital_RMS.git
cd Hospital_RMS
```

Từ đây mọi lệnh `docker compose` chạy trong `/data/code/Hospital_RMS`.

---

## 9. Tạo file cấu hình

Có **3 file**, đều nằm ngoài git (đã có trong `.gitignore`):

| File | Ai đọc | Nội dung |
|---|---|---|
| `.env` (cạnh `docker-compose.prod.yml`) | Docker Compose | Domain, cổng, số worker, bật/tắt ClamAV |
| `backend/.env` | Backend | Cấu hình chung: địa chỉ DB, SMTP… |
| `backend/.env.production` | Backend (ghi đè `backend/.env`) | Mật khẩu: login DB, Swagger, secret ký link upload |

### 9.1. `backend/.env`

```bash
cd /data/code/Hospital_RMS
cp backend/.env.example backend/.env
nano backend/.env
```

Sửa các dòng sau (file mẫu để `DB_PORT=1413`, **phải đổi thành 1433**):

```env
DB_SERVER=host.docker.internal
DB_PORT=1433
DB_DATABASE=RMS_HOSPITAL
DB_TRUST_SERVER_CERT=true
# Địa chỉ web dùng trong link của email
APP_URL=https://nckh.bvnghean.vn
```

- `DB_USER` / `DB_PASSWORD` trong file này để nguyên, file `.env.production` sẽ ghi đè.
- `JWT_SECRET` / `JWT_REFRESH_SECRET` để nguyên giá trị mẫu `change-me…`: container tự sinh secret thật và lưu trong volume `server_secrets`.
- Gửi email thật: đặt `MAIL_ENABLED=true` và các biến `SMTP_*`.

### 9.2. `backend/.env.production`

```bash
cat > backend/.env.production <<EOF
DB_USER=rms_app
DB_PASSWORD=<MAT_KHAU_MANH_1>
DB_TRUST_SERVER_CERT=true
SWAGGER_PASS=$(openssl rand -hex 16)
UPLOAD_URL_SECRET=$(openssl rand -hex 32)
EOF
chmod 600 backend/.env backend/.env.production
```

> Mật khẩu có ký tự `$`, `` ` `` hoặc `\`: mở file bằng `nano` sửa lại cho đúng, vì heredoc ở trên sẽ diễn giải các ký tự này.

**Chưa có HTTPS, đang thử bằng `http://<IP-VM>:8084`?** Thêm dòng `COOKIE_SECURE=false` vào file này. Ở production cookie đăng nhập mặc định có cờ `Secure`, trình duyệt không lưu cookie đó qua HTTP, nên phiên đăng nhập mất sau ~15 phút. Có HTTPS rồi thì **xoá dòng này**.

### 9.3. `.env` cạnh `docker-compose.prod.yml`

```bash
cat > .env <<'EOF'
# Origin chính xác trình duyệt dùng (scheme + domain + cổng nếu có)
CORS_ORIGIN=https://nckh.bvnghean.vn
# Thử bằng IP khi chưa có domain:
# CORS_ORIGIN=http://<IP-VM>:8084

# Số worker backend: số vCPU trừ 2 (máy 4 vCPU → 2), tối thiểu 1
WEB_CONCURRENCY=2

# Cổng web. Có reverse proxy HTTPS trên CÙNG máy (bước 12) thì đổi thành 127.0.0.1:8084
FRONTEND_BIND=8084

# Tắt quét virus khi RAM < 8 GB (bỏ dấu # dòng dưới, rồi chạy up với --scale clamav=0)
# CLAMAV_HOST=
EOF
```

**Đổi domain** thì sửa thêm `server_name` trong `frontend/nginx.conf` cho khớp (truy cập bằng IP vẫn chạy vì đây là server block duy nhất).

---

## 10. Build, chạy migration, khởi động

Chạy trong `tmux` (bước 1), lần build đầu mất 5–15 phút:

```bash
cd /data/code/Hospital_RMS
docker compose -f docker-compose.prod.yml build
```

### 10.1. Migration database

Kiểm tra trạng thái trước, bằng login `rms_migrate` (có quyền ALTER/BACKUP):

```bash
docker compose -f docker-compose.prod.yml run --rm --no-deps -T \
  -e DB_USER=rms_migrate -e DB_PASSWORD='<MAT_KHAU_MANH_2>' \
  backend node scripts/migrate.js status
```

Đọc kết quả:

- **Có bảng `schema_migrations`** (DB lấy từ server đã từng chạy migration): chạy file còn thiếu. `MIGRATION_BACKUP_DIR` khiến script tự backup DB vào `/data/mssql/backup` trước khi đổi schema:

  ```bash
  docker compose -f docker-compose.prod.yml run --rm --no-deps -T \
    -e DB_USER=rms_migrate -e DB_PASSWORD='<MAT_KHAU_MANH_2>' \
    -e MIGRATION_BACKUP_DIR=/data/mssql/backup \
    backend node scripts/migrate.js
  ```

- **Báo "Chưa có bảng schema_migrations"**: DB được nâng cấp tay. Hỏi nhóm phát triển DB đó đã có đủ thay đổi của code hiện tại chưa. Nếu **đã đủ**, đánh dấu tất cả là đã chạy (chỉ làm **1 lần**):

  ```bash
  docker compose -f docker-compose.prod.yml run --rm --no-deps -T \
    -e DB_USER=rms_migrate -e DB_PASSWORD='<MAT_KHAU_MANH_2>' \
    backend node scripts/migrate.js baseline
  ```

  Nếu chưa đủ thì **không chạy `baseline`** (sẽ bỏ qua các thay đổi còn thiếu); chạy lệnh migrate thường ở trên, các file migration đều idempotent.

### 10.2. Khởi động

```bash
docker compose -f docker-compose.prod.yml up -d
# RAM thấp, đã đặt CLAMAV_HOST= ở bước 9.3:
# docker compose -f docker-compose.prod.yml up -d --scale clamav=0

docker compose -f docker-compose.prod.yml ps              # backend phải "healthy" sau ~1 phút
docker compose -f docker-compose.prod.yml logs -f backend # Ctrl+C để thoát
```

Kiểm tra ngay trên VM:

```bash
curl http://127.0.0.1:3001/health       # backend sống
curl http://127.0.0.1:3001/health/db    # backend nối được SQL Server
curl -I http://localhost:8084           # frontend: HTTP/1.1 200
```

Mở trình duyệt: `http://<IP-VM>:8084` (hoặc domain sau khi làm bước 12).

> ClamAV cần ~1 phút nạp CSDL virus sau khi khởi động. Trong lúc đó upload file bị từ chối (503), đợi rồi thử lại.

Mọi container có `restart: unless-stopped` → tự chạy lại khi reboot VM (Docker và SQL Server đều đã `enable`).

---

## 11. Firewall

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
# Cho container Docker gọi SQL Server trên host (dải mạng Docker)
sudo ufw allow from 172.16.0.0/12 to any port 1433 proto tcp
sudo ufw enable
sudo ufw status verbose
```

- **Không** mở `1433` ra LAN. Quản trị DB thì dùng SSH tunnel (bước 4.6).
- ⚠️ **Docker tự mở cổng publish, bỏ qua UFW.** Cổng `8084` vẫn truy cập được từ mạng dù UFW không có rule. Muốn chặn thì đặt `FRONTEND_BIND=127.0.0.1:8084` (khi proxy HTTPS ở cùng máy), hoặc chặn ở firewall của hypervisor / mạng. Backend (`127.0.0.1:3001`) chỉ mở trên loopback nên không lộ ra ngoài.

---

## 12. HTTPS (khuyến nghị)

Nếu bệnh viện đã có reverse proxy HTTPS chung (IIS ARR, nginx, F5…) thì trỏ nó về `http://<IP-VM>:8084`, gửi kèm header `X-Forwarded-For` và `X-Forwarded-Proto: https`, và đặt `TRUSTED_PROXIES=<IP proxy>` trong `.env` (bước 9.3). Xem thêm README mục *Bước 3b: Nối với reverse proxy HTTPS*.

Nếu dựng HTTPS **ngay trên VM** (domain đã trỏ về VM, VM nhận được kết nối cổng 80/443 từ Internet để Let's Encrypt xác thực):

```bash
sudo apt-get install -y nginx certbot python3-certbot-nginx
sudo tee /etc/nginx/sites-available/rms > /dev/null <<'EOF'
server {
    listen 80;
    server_name nckh.bvnghean.vn;
    client_max_body_size 300m;

    location / {
        proxy_pass http://127.0.0.1:8084;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Forwarded-For   $remote_addr;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Connection        "";
        # SSE (thông báo realtime)
        proxy_buffering off;
        proxy_read_timeout 1h;
    }
}
EOF
sudo ln -s /etc/nginx/sites-available/rms /etc/nginx/sites-enabled/rms
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
sudo ufw allow 'Nginx Full'
sudo certbot --nginx -d nckh.bvnghean.vn
```

Sau đó trong `.env` (bước 9.3) đặt `FRONTEND_BIND=127.0.0.1:8084` và `CORS_ORIGIN=https://nckh.bvnghean.vn`, xoá `COOKIE_SECURE=false` khỏi `backend/.env.production` (nếu đã thêm), rồi:

```bash
docker compose -f docker-compose.prod.yml up -d
```

Dùng chứng chỉ nội bộ của bệnh viện thay Let's Encrypt: bỏ lệnh `certbot`, tự thêm `listen 443 ssl;` + `ssl_certificate` / `ssl_certificate_key` vào file cấu hình trên.

---

## 13. Cập nhật phiên bản

```bash
cd /data/code/Hospital_RMS
git pull
docker compose -f docker-compose.prod.yml build
# migration trước khi đổi container (bản cũ vẫn chạy nếu migration lỗi)
docker compose -f docker-compose.prod.yml run --rm --no-deps -T \
  -e DB_USER=rms_migrate -e DB_PASSWORD='<MAT_KHAU_MANH_2>' \
  -e MIGRATION_BACKUP_DIR=/data/mssql/backup \
  backend node scripts/migrate.js
docker compose -f docker-compose.prod.yml up -d
docker image prune -f
docker builder prune -f --filter until=168h     # dọn cache build cũ hơn 7 ngày
```

> `scripts/deploy.ps1` và workflow CI/CD (`.github/CICD.md`) viết cho server Windows chạy PowerShell. Trên VM Ubuntu này cập nhật bằng các lệnh ở trên.

> ⚠️ **Không bao giờ chạy `docker compose -f docker-compose.prod.yml down -v`**: cờ `-v` xoá volume → mất toàn bộ file upload, log hoạt động, khoá 2FA.

---

## 14. Sao lưu

Mọi dữ liệu đều nằm trên ổ 2, nhưng **bản sao lưu phải được chép ra máy khác** (NAS, server backup, snapshot ổ đĩa ở hypervisor) — hỏng ổ 2 là mất cả dữ liệu lẫn backup.

### 14.1. Database (hằng ngày)

Tạo script backup (đổi mật khẩu `sa`; có thể thay bằng login `rms_migrate`):

```bash
sudo tee /usr/local/bin/rms-backup-db.sh > /dev/null <<'EOF'
#!/bin/sh
set -e
DAY=$(date +%F)
/opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$SA_PASSWORD" -C -b -Q \
  "BACKUP DATABASE [RMS_HOSPITAL] TO DISK = N'/data/mssql/backup/RMS_HOSPITAL_$DAY.bak' WITH COMPRESSION, INIT, CHECKSUM"
# Giữ 14 ngày
find /data/mssql/backup -name 'RMS_HOSPITAL_*.bak' -mtime +14 -delete
EOF
sudo chmod 700 /usr/local/bin/rms-backup-db.sh
```

> `WITH COMPRESSION` không có trên bản Express — bỏ chữ `COMPRESSION,` nếu dùng Express.

Lên lịch 23:30 hằng ngày (`sudo crontab -e`, thêm dòng):

```
30 23 * * * SA_PASSWORD='<MAT_KHAU_SA>' /usr/local/bin/rms-backup-db.sh >> /var/log/rms-backup.log 2>&1
```

### 14.2. Volume Docker (file upload + secret)

```bash
cd /data/backup
docker run --rm -v hospital_rms_server_uploads:/data:ro -v /data/backup:/backup alpine \
  tar czf /backup/uploads-$(date +%F).tar.gz -C /data .
docker run --rm -v hospital_rms_server_secrets:/data:ro -v /data/backup:/backup alpine \
  tar czf /backup/secrets-$(date +%F).tar.gz -C /data .
```

Volume `hospital_rms_server_secrets` chứa **khoá giải mã 2FA** (`totp.key`): phải sao lưu **cùng lịch với DB** và cất kỹ như mật khẩu. Mất khoá này thì mọi người dùng đã bật 2FA phải thiết lập lại.

### 14.3. Theo dõi dung lượng

```bash
df -h / /data
docker system df
sudo du -sh /data/mssql/* /data/docker/volumes/* 2>/dev/null | sort -h
```

---

## 15. Xử lý sự cố

| Hiện tượng | Kiểm tra / cách xử lý |
|---|---|
| Backend log `Failed to connect to host.docker.internal:1433` | `systemctl status mssql-server`; `sudo ss -ltnp \| grep 1433` (phải nghe `0.0.0.0:1433`); rule UFW cho `172.16.0.0/12` (bước 11); `DB_PORT=1433` trong `backend/.env` (file mẫu để `1413`). |
| Backend log `Login failed for user 'rms_app'` | Sai mật khẩu trong `backend/.env.production`, hoặc user DB chưa gắn với login sau khi restore: chạy lại khối `ALTER USER rms_app WITH LOGIN = rms_app` ở bước 5.3. |
| Backend thoát ngay, báo thiếu biến | Thiếu `DB_USER`/`DB_PASSWORD`/`CORS_ORIGIN`. Xem `docker compose -f docker-compose.prod.yml logs backend`. |
| Đăng nhập được nhưng vài phút sau bị đăng xuất | Đang truy cập bằng HTTP: thêm `COOKIE_SECURE=false` (bước 9.2) hoặc dựng HTTPS (bước 12). |
| Trình duyệt báo lỗi CORS | `CORS_ORIGIN` trong `.env` chưa đúng origin đang dùng (gồm `http`/`https` và cổng). Sửa rồi `up -d`. |
| SQL Server không khởi động sau khi đổi thư mục | `sudo journalctl -u mssql-server -n 50`; thường do quyền: `sudo chown -R mssql:mssql /data/mssql`. |
| `/data` không có sau reboot | `cat /etc/fstab`, `sudo mount -a` xem lỗi; kiểm tra UUID bằng `sudo blkid`. |
| Build bị `Killed` / máy treo khi build | Thiếu RAM: thêm swap (bước 2), tạm dừng ClamAV `docker compose -f docker-compose.prod.yml stop clamav` khi build. |
| Ổ đầy | `docker image prune -a`, `docker builder prune`, xoá `.bak` cũ trong `/data/mssql/backup`. |
| Upload báo 503 "quét virus" | ClamAV chưa nạp xong (~1 phút) hoặc đã bị dừng: `docker compose -f docker-compose.prod.yml logs clamav`. |
| Compose báo lỗi ở `env_file` | Compose cũ hơn 2.24 — cài Docker theo bước 6, không dùng gói `docker.io`/`docker-compose` của Ubuntu. |

Xem thêm bảng *Xử lý sự cố Docker* trong `README.md`.

---

**Nguồn tham khảo**

- Microsoft — [Cài SQL Server trên Ubuntu](https://learn.microsoft.com/en-us/sql/linux/quickstart-install-connect-ubuntu)
- Microsoft — [Cấu hình SQL Server trên Linux bằng mssql-conf](https://learn.microsoft.com/en-us/sql/linux/sql-server-linux-configure-mssql-conf)
- Docker — [Cài Docker Engine trên Ubuntu](https://docs.docker.com/engine/install/ubuntu/)
