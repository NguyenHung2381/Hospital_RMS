# Cài đặt Hospital RMS trên máy ảo Ubuntu 26.04 (2 ổ đĩa, SQL Server cài riêng)

Hướng dẫn từng bước dựng bản **production** trên một máy ảo, từ lúc cài hệ điều hành tới lúc mở được trang web. Mọi thao tác sau bước cài Ubuntu đều làm **qua SSH** từ máy tính của bạn.

| Ổ | Dung lượng | Dùng cho |
|---|---|---|
| Ổ 1 | 50 GB | Ubuntu 26.04 + chương trình SQL Server |
| Ổ 2 | 50 GB | Mount tại `/data`: source code, dữ liệu Docker (image, file upload, log), file dữ liệu + backup SQL Server |

```
Trình duyệt ──► :8084 frontend (Nginx, container) ──► backend:3001 (container) ──► redis, clamav (container)
                                                          │
                                                          └──► SQL Server 2025 (cài thẳng trên Ubuntu, cổng 1433)
```

SQL Server **không** chạy trong Docker. Container backend gọi về máy host qua tên `host.docker.internal` (đã khai báo sẵn trong `docker-compose.prod.yml`).

> Khi chuyển sang PostgreSQL: PostgreSQL cũng cài thẳng trên máy này theo [cai-dat-postgresql.md](cai-dat-postgresql.md), cùng cách container gọi ra host.

> **Vì sao để Docker và dữ liệu SQL Server trên ổ 2?** Ổ hệ điều hành chỉ 50 GB. Image Docker, cache build, file người dùng upload, file `.mdf/.ldf` và file backup của SQL Server đều tăng dần. Để chung với hệ điều hành thì sớm muộn ổ 1 đầy và máy treo. Ổ 2 chứa toàn bộ phần dữ liệu, ổ 1 chỉ còn hệ điều hành và chương trình.

---

## ⚠️ Đọc trước: SQL Server và Ubuntu 26.04

Tới tháng 10/2026, **Microsoft chưa phát hành SQL Server cho Ubuntu 26.04**. Trên kho `packages.microsoft.com`, thư mục `ubuntu/26.04/mssql-server-preview` còn trống. Kho `ubuntu/26.04/prod` chỉ có công cụ client (`mssql-tools18`, `msodbcsql18`). Bản mới nhất được hỗ trợ là **SQL Server 2025 trên Ubuntu 24.04**.

Hướng dẫn này cài **gói SQL Server 2025 dành cho Ubuntu 24.04 lên Ubuntu 26.04**. Mọi thư viện mà gói này khai báo cần (`libc++1`, `libunwind8`, `libldap2`, `openssl 3`…) đều có trong kho của Ubuntu 26.04, nên `apt` cài được. Tuy vậy:

- Đây là cấu hình **Microsoft chưa hỗ trợ chính thức**. Gặp sự cố, Microsoft có thể từ chối hỗ trợ.
- Công cụ cấu hình `mssql-conf` viết bằng Python. Ubuntu 26.04 dùng Python 3.14, mới hơn bản 3.12 của 24.04, và Python mới đã bỏ một số module cũ. Cách này **chưa được chạy thử trên máy thật**. Bước 6.4 có hướng dẫn nhận biết nếu `mssql-conf` không chạy.
- Mỗi lần nâng cấp SQL Server (bản CU mới), nên thử trên máy test trước.
- Khi Microsoft phát hành bản cho 26.04 (có file `https://packages.microsoft.com/config/ubuntu/26.04/mssql-server-2025.list`), đổi sang kho đó theo [mục 15](#15-khi-microsoft-phát-hành-sql-server-cho-2604).

**Nếu máy ảo còn cài lại được, lựa chọn an toàn nhất cho hệ thống bệnh viện là Ubuntu 24.04 LTS** (được hỗ trợ chính thức). Các bước bên dưới gần như giống hệt, chỉ khác bước 6.1 (chỗ đó có ghi chú).

---

## Mục lục

1. [Yêu cầu máy ảo](#1-yêu-cầu-máy-ảo)
2. [Cài Ubuntu 26.04 Server](#2-cài-ubuntu-2604-server)
3. [Thiết lập SSH](#3-thiết-lập-ssh)
4. [Cập nhật hệ thống, IP tĩnh, múi giờ, swap](#4-cập-nhật-hệ-thống-ip-tĩnh-múi-giờ-swap)
5. [Chia ổ thứ 2 và mount `/data`](#5-chia-ổ-thứ-2-và-mount-data)
6. [Cài SQL Server 2025 (ngoài Docker)](#6-cài-sql-server-2025-ngoài-docker)
7. [Khôi phục database, tạo login cho ứng dụng](#7-khôi-phục-database-tạo-login-cho-ứng-dụng)
8. [Cài Docker Engine (dữ liệu trên ổ 2)](#8-cài-docker-engine-dữ-liệu-trên-ổ-2)
9. [Cài Node.js (tuỳ chọn)](#9-cài-nodejs-tuỳ-chọn)
10. [Lấy source code về ổ 2](#10-lấy-source-code-về-ổ-2)
11. [Tạo file cấu hình](#11-tạo-file-cấu-hình)
12. [Build, chạy migration, khởi động](#12-build-chạy-migration-khởi-động)
13. [Firewall và HTTPS](#13-firewall-và-https)
14. [Vận hành: cập nhật, sao lưu, theo dõi ổ đĩa](#14-vận-hành-cập-nhật-sao-lưu-theo-dõi-ổ-đĩa)
15. [Khi Microsoft phát hành SQL Server cho 26.04](#15-khi-microsoft-phát-hành-sql-server-cho-2604)
16. [Xử lý sự cố](#16-xử-lý-sự-cố)

Quy ước trong tài liệu:

- `<user>`: tài khoản Linux bạn tạo lúc cài Ubuntu. `<IP-VM>`: địa chỉ IP của máy ảo.
- Khối lệnh ghi **"Trên máy của bạn"** chạy trên máy tính bạn đang ngồi. Còn lại chạy **trên máy ảo** (trong phiên SSH).
- Thay mọi chỗ `<...>` bằng giá trị thật, bỏ luôn dấu `< >`.

---

## 1. Yêu cầu máy ảo

| | Tối thiểu | Khuyến nghị |
|---|---|---|
| CPU | 4 vCPU | 8 vCPU |
| RAM | 8 GB | 12–16 GB |
| Ổ 1 | 50 GB | |
| Ổ 2 | 50 GB, **chưa phân vùng** | |
| Mạng | 1 card, IP tĩnh trong LAN, ra được Internet (để tải gói) | |

RAM ước tính: SQL Server ~3 GB (giới hạn ở bước 6.4), ClamAV (quét virus file upload) ~1,5 GB, backend ~300 MB mỗi worker, Redis + Nginx < 250 MB, hệ điều hành ~1 GB. Máy 8 GB thì để `WEB_CONCURRENCY=2` (bước 11.3), RAM ít hơn nữa thì tắt ClamAV.

SQL Server cần CPU 64-bit (x86-64 hoặc ARM64) và tối thiểu 2 GB RAM, nếu không sẽ từ chối khởi động.

Trên hypervisor (VMware, Hyper-V, Proxmox…), gắn **cả 2 ổ trước khi cài Ubuntu**, để trình cài đặt thấy cả hai và bạn chọn đúng ổ 1.

---

## 2. Cài Ubuntu 26.04 Server

Tải ISO **Ubuntu Server 26.04 LTS** từ `ubuntu.com/download/server`, gắn vào máy ảo, khởi động từ ISO. Đi qua các màn hình của trình cài đặt:

1. **Language**: English (giao diện tiếng Anh dễ tra lỗi hơn).
2. **Keyboard**: English (US).
3. **Type of install**: *Ubuntu Server* (không chọn *minimized*).
4. **Network**: để DHCP tạm, sẽ đặt IP tĩnh ở bước 4.2. Ghi lại IP đang nhận được.
5. **Proxy / Mirror**: để mặc định (trừ khi mạng bệnh viện bắt buộc dùng proxy).
6. **Storage configuration**:
   - Chọn *Use an entire disk*, rồi chọn **ổ 50 GB thứ nhất**. Nhìn tên và dung lượng cho kỹ, hai ổ cùng 50 GB nên dễ nhầm. Thường ổ 1 là `sda` / `vda`.
   - Có thể giữ tick *Set up this disk as an LVM group*.
   - **Không đụng tới ổ thứ 2**: không format, không mount. Bước 5 sẽ làm.
   - Ở màn hình tóm tắt, kiểm tra `ubuntu-lv` mount tại `/`. Nếu dung lượng nhỏ hơn nhiều so với 50 GB (trình cài đặt hay chỉ cấp một nửa), có thể sửa ngay (*Edit* → đặt size tối đa), hoặc sửa sau ở bước 4.4.
7. **Profile**: đặt tên máy (vd `rms-prod`), tên đăng nhập `<user>`, mật khẩu mạnh.
8. **Ubuntu Pro**: *Skip for now*.
9. **SSH configuration**: **tick *Install OpenSSH server***. Để trống phần import key.
10. **Featured server snaps**: **không chọn gì cả**, đặc biệt **không chọn `docker`**. Docker bản snap lưu dữ liệu ở chỗ khác và không dùng được hướng dẫn bước 8.
11. Chờ cài xong → *Reboot now*, gỡ ISO khi được hỏi.

Đăng nhập trên console của máy ảo một lần để chắc máy lên, rồi xem IP:

```bash
ip -4 addr show
```

---

## 3. Thiết lập SSH

### 3.1. Đăng nhập lần đầu bằng mật khẩu

**Trên máy của bạn.** Windows 10/11: mở *PowerShell* hoặc *Windows Terminal* (có sẵn lệnh `ssh`). macOS/Linux: mở *Terminal*.

```bash
ssh <user>@<IP-VM>
```

Lần đầu sẽ hỏi `Are you sure you want to continue connecting (yes/no)?` → gõ `yes`, rồi nhập mật khẩu. Thấy dấu nhắc `<user>@rms-prod:~$` là đã vào. Gõ `exit` để thoát.

### 3.2. Tạo khoá SSH

**Trên máy của bạn** (làm một lần cho mỗi máy tính bạn dùng để quản trị):

```bash
ssh-keygen -t ed25519 -C "rms-admin"
```

Nhấn Enter để lưu ở chỗ mặc định (`~/.ssh/id_ed25519`). Nên đặt passphrase để bảo vệ khoá nếu mất máy.

### 3.3. Đưa khoá công khai lên máy ảo

**Trên máy của bạn**, macOS/Linux:

```bash
ssh-copy-id <user>@<IP-VM>
```

Windows PowerShell không có `ssh-copy-id`, dùng lệnh sau thay thế:

```powershell
type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh <user>@<IP-VM> "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

Thử lại `ssh <user>@<IP-VM>`: lần này **không hỏi mật khẩu đăng nhập** (chỉ hỏi passphrase của khoá nếu bạn đã đặt) là được.

### 3.4. Tạo tên tắt cho tiện

**Trên máy của bạn**, mở file `~/.ssh/config` (Windows: `C:\Users\<tên bạn>\.ssh\config`, tạo mới nếu chưa có, không có đuôi `.txt`) và thêm:

```
Host rms
    HostName <IP-VM>
    User <user>
    IdentityFile ~/.ssh/id_ed25519
    ServerAliveInterval 60
```

Từ giờ chỉ cần `ssh rms`.

### 3.5. Khoá đăng nhập bằng mật khẩu, chặn root

Chỉ làm bước này **sau khi** đăng nhập bằng khoá ở 3.3 đã chạy.

Trên máy ảo, tạo file cấu hình riêng. Tên bắt đầu bằng `00-` vì sshd lấy **giá trị gặp đầu tiên**, và trên một số máy có sẵn file `50-cloud-init.conf` bật lại đăng nhập mật khẩu:

```bash
sudo tee /etc/ssh/sshd_config.d/00-hardening.conf > /dev/null <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
MaxAuthTries 4
EOF
sudo sshd -t && echo "Cấu hình hợp lệ"
sudo systemctl restart ssh
```

> **Giữ nguyên cửa sổ SSH đang mở.** Mở cửa sổ mới, thử `ssh rms`. Vào được thì xong. Không vào được thì dùng cửa sổ cũ xoá file `00-hardening.conf` rồi `sudo systemctl restart ssh`.

Kiểm tra cấu hình đang có hiệu lực:

```bash
sudo sshd -T | grep -E 'passwordauthentication|permitrootlogin'
# passwordauthentication no
# permitrootlogin no
```

> **Mất khoá SSH thì sao?** Vẫn đăng nhập được bằng console của hypervisor (mật khẩu `<user>` vẫn dùng được ở console). Nên đưa thêm khoá của một quản trị viên khác vào `~/.ssh/authorized_keys` để dự phòng.

### 3.6. Firewall: mở SSH trước khi bật

```bash
sudo ufw allow OpenSSH
sudo ufw --force enable
sudo ufw status
```

Các rule còn lại thêm ở bước 13.

### 3.7. Chạy lệnh dài bằng `tmux`

Build Docker, restore DB có thể mất nhiều phút. Mất mạng SSH giữa chừng sẽ huỷ lệnh, trừ khi chạy trong `tmux`:

```bash
tmux new -s rms        # mở phiên mới
# ... chạy lệnh ...
# Thoát tạm, lệnh vẫn chạy: nhấn Ctrl+B, thả ra, rồi nhấn D
tmux attach -t rms     # vào lại sau khi SSH lại
```

### 3.8. Chép file giữa máy bạn và máy ảo

**Trên máy của bạn:**

```bash
scp ./RMS_HOSPITAL.bak rms:/tmp/          # máy bạn → máy ảo
scp rms:/data/backup/file.tar.gz ./        # máy ảo → máy bạn
```

Trên Windows có thể dùng **WinSCP** (giao thức SFTP, cùng khoá SSH) nếu thích kéo-thả.

---

## 4. Cập nhật hệ thống, IP tĩnh, múi giờ, swap

### 4.1. Cập nhật và cài công cụ cơ bản

```bash
sudo apt update && sudo apt -y full-upgrade
sudo apt install -y curl wget gnupg ca-certificates git ufw tmux htop unzip parted nano
```

### 4.2. Đặt IP tĩnh

Nếu IP đã được giữ cố định ở DHCP server / router thì bỏ qua bước này.

Xem tên card mạng và gateway:

```bash
ip -br link            # tên card, vd ens18 / ens160 / eth0
ip route | grep default
```

Mở file netplan đang có (tên file có thể khác):

```bash
ls /etc/netplan/
sudo nano /etc/netplan/50-cloud-init.yaml
```

Thay nội dung bằng (sửa tên card, IP, gateway, DNS theo mạng của bạn; YAML **phân biệt khoảng trắng**, chỉ dùng dấu cách, không dùng Tab):

```yaml
network:
  version: 2
  ethernets:
    ens18:
      dhcp4: false
      addresses: [192.168.1.50/24]
      routes:
        - to: default
          via: 192.168.1.1
      nameservers:
        addresses: [192.168.1.1, 8.8.8.8]
```

Áp dụng an toàn (tự quay lại cấu hình cũ sau 120 giây nếu bạn không xác nhận, tránh mất kết nối):

```bash
sudo chmod 600 /etc/netplan/*.yaml
sudo netplan try
```

Đổi IP thì phiên SSH hiện tại sẽ đứt. SSH lại bằng IP mới **trong vòng 120 giây**, chạy lại `sudo netplan try` rồi nhấn Enter để xác nhận (hoặc chạy `sudo netplan apply`). Nhớ sửa `HostName` trong `~/.ssh/config` trên máy bạn.

Nếu cấu hình được quản lý bởi cloud-init, tắt để nó không ghi đè:

```bash
echo 'network: {config: disabled}' | sudo tee /etc/cloud/cloud.cfg.d/99-disable-network-config.cfg
```

### 4.3. Múi giờ, tên máy

```bash
sudo timedatectl set-timezone Asia/Ho_Chi_Minh
timedatectl          # "System clock synchronized: yes"
```

### 4.4. Mở rộng ổ hệ điều hành (nếu cần)

```bash
df -h /
```

Nếu `/` nhỏ hơn nhiều so với ~48 GB, cấp phần còn trống của ổ 1 cho `/`:

```bash
sudo vgs                                              # cột VFree = dung lượng chưa dùng
sudo lvextend -r -l +100%FREE /dev/ubuntu-vg/ubuntu-lv
df -h /
```

### 4.5. Swap 4 GB

Đỡ bị hệ điều hành kill tiến trình khi RAM thiếu lúc build:

```bash
swapon --show                       # đã có swap thì bỏ qua bước này
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h
```

### 4.6. Tự cài bản vá bảo mật

```bash
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades     # chọn Yes
```

Khởi động lại một lần:

```bash
sudo reboot
```

---

## 5. Chia ổ thứ 2 và mount `/data`

### 5.1. Xác định đúng ổ

```bash
lsblk -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINTS,MODEL
```

Ví dụ kết quả:

```
NAME                      SIZE TYPE FSTYPE      MOUNTPOINTS
sda                        50G disk
├─sda1                      1M part
├─sda2                      2G part ext4        /boot
└─sda3                     48G part LVM2_member
  └─ubuntu--vg-ubuntu--lv  48G lvm  ext4        /
sdb                        50G disk
```

Ổ 2 là ổ **50G không có phân vùng con, không có MOUNTPOINTS** (ở đây là `sdb`; trên KVM/Proxmox thường là `vdb`, trên một số máy là `nvme1n1`).

> ⚠️ Các lệnh dưới đây **xoá sạch** ổ được chọn. Kiểm tra 2 lần. Nếu chọn nhầm ổ đang chứa `/` là mất hệ điều hành.

Gán tên ổ vào biến cho đỡ gõ sai (đổi `sdb` nếu ổ của bạn tên khác):

```bash
DISK=/dev/sdb
lsblk $DISK            # phải thấy đúng 1 dòng 50G, không có phân vùng
```

### 5.2. Tạo phân vùng và định dạng

```bash
sudo parted -s $DISK mklabel gpt
sudo parted -s -a optimal $DISK mkpart data ext4 0% 100%
sudo partprobe $DISK
lsblk $DISK            # thấy thêm sdb1 (hoặc vdb1 / nvme1n1p1)
```

Tên phân vùng: `sdb` → `sdb1`, `vdb` → `vdb1`, nhưng `nvme1n1` → `nvme1n1p1`. Đặt biến cho đúng:

```bash
PART=${DISK}1          # với ổ nvme: PART=${DISK}p1
sudo mkfs.ext4 -L data $PART
```

### 5.3. Mount cố định qua `/etc/fstab`

Dùng UUID (không dùng `/dev/sdb1`, vì tên ổ có thể đổi thứ tự sau khi khởi động lại):

```bash
sudo mkdir -p /data
UUID=$(sudo blkid -s UUID -o value $PART)
echo "UUID=$UUID"      # phải in ra một chuỗi dài, không được rỗng
echo "UUID=$UUID /data ext4 defaults,noatime,nofail 0 2" | sudo tee -a /etc/fstab
sudo systemctl daemon-reload
sudo mount -a
df -h /data            # ~49G, mount tại /data
```

`nofail`: nếu ổ 2 hỏng, máy vẫn khởi động được để bạn SSH vào sửa, thay vì kẹt ở màn hình khẩn cấp.

### 5.4. Tạo cấu trúc thư mục

```bash
sudo mkdir -p /data/code /data/docker /data/mssql/{data,log,backup} /data/backup
sudo chown $USER:$USER /data/code /data/backup
ls -la /data
```

| Thư mục | Nội dung |
|---|---|
| `/data/code/Hospital_RMS` | Source code (git clone) + file `.env` |
| `/data/docker` | Toàn bộ dữ liệu Docker: image, container, **volume** (file upload, log hoạt động, JWT secret, khoá 2FA) |
| `/data/mssql/data`, `/data/mssql/log` | File `.mdf` / `.ldf` của database |
| `/data/mssql/backup` | File `.bak`: restore lần đầu, backup hằng ngày, backup trước migration |
| `/data/backup` | Bản sao lưu volume Docker |

### 5.5. Kiểm tra tự mount sau khi khởi động lại

```bash
sudo reboot
```

SSH lại rồi chạy `df -h /data`. Còn thấy `/data` là xong.

---

## 6. Cài SQL Server 2025 (ngoài Docker)

### 6.1. Thêm kho của Microsoft

Khoá ký gói:

```bash
curl -fsSL https://packages.microsoft.com/keys/microsoft.asc | sudo gpg --dearmor -o /usr/share/keyrings/microsoft-prod.gpg
```

Kho SQL Server: **dùng kho của Ubuntu 24.04 (`noble`)** vì chưa có bản cho 26.04 (xem phần *Đọc trước*):

```bash
echo "deb [arch=amd64,arm64 signed-by=/usr/share/keyrings/microsoft-prod.gpg] https://packages.microsoft.com/ubuntu/24.04/mssql-server-2025 noble main" \
  | sudo tee /etc/apt/sources.list.d/mssql-server-2025.list
```

Kho công cụ client (`sqlcmd`): đã có bản cho 26.04:

```bash
echo "deb [arch=amd64,arm64 signed-by=/usr/share/keyrings/microsoft-prod.gpg] https://packages.microsoft.com/ubuntu/26.04/prod resolute main" \
  | sudo tee /etc/apt/sources.list.d/mssql-release.list
sudo apt update
```

> **Dùng Ubuntu 24.04 thay vì 26.04?** Thay 2 lệnh `echo` trên bằng:
> ```bash
> curl -fsSL https://packages.microsoft.com/config/ubuntu/24.04/mssql-server-2025.list | sudo tee /etc/apt/sources.list.d/mssql-server-2025.list
> curl -fsSL https://packages.microsoft.com/config/ubuntu/24.04/prod.list | sudo tee /etc/apt/sources.list.d/mssql-release.list
> sudo apt update
> ```

### 6.2. Cài gói

```bash
sudo apt install -y mssql-server
```

Nếu `apt` báo thiếu thư viện (`unmet dependencies`), chụp lại thông báo và **dừng ở đây**: cài bản 24.04 lên 26.04 không còn chạy được với bản cập nhật đó. Lúc này cần chuyển máy ảo về Ubuntu 24.04, hoặc đặt SQL Server trên một máy chủ riêng.

### 6.3. Collation (đọc trước khi chạy setup)

Collation của **server** nên trùng collation của database cũ. Nếu khác, câu lệnh dùng bảng tạm `#temp` có thể lỗi *Cannot resolve the collation conflict*. Trên SQL Server **cũ** (nơi lấy file backup), chạy:

```sql
SELECT SERVERPROPERTY('Collation') AS server_collation,
       DATABASEPROPERTYEX('RMS_HOSPITAL','Collation') AS db_collation;
```

Ghi lại giá trị `db_collation` (mặc định trên Linux là `SQL_Latin1_General_CP1_CI_AS`; DB tiếng Việt hay dùng `Vietnamese_CI_AS`).

### 6.4. Chạy setup

Thay collation bằng giá trị vừa ghi lại:

```bash
sudo env MSSQL_COLLATION=SQL_Latin1_General_CP1_CI_AS /opt/mssql/bin/mssql-conf setup
```

Trình setup hỏi lần lượt:

1. **Edition**:
   - `Express`: miễn phí, giới hạn kích thước mỗi database, CPU và RAM. Đủ cho DB nhỏ.
   - `Developer` / `Standard Developer`: miễn phí nhưng **chỉ để dev/test, không được dùng cho production**.
   - `Standard` / `Enterprise` / `Enter product key`: cần bản quyền.
2. **License terms**: gõ `Yes`.
3. **Mật khẩu `sa`**: tối thiểu 8 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt. Ghi lại cẩn thận (lưu vào trình quản lý mật khẩu).

Kiểm tra:

```bash
systemctl status mssql-server --no-pager      # active (running)
```

Nếu `mssql-conf` dừng ngay với lỗi Python (`ModuleNotFoundError`, `SyntaxError`, `Traceback ...`) thì đó là do không tương thích với Python 3.14 của Ubuntu 26.04. Không có cách sửa an toàn: chuyển máy ảo về **Ubuntu 24.04**, hoặc đặt SQL Server trên một máy chủ riêng, rồi chờ Microsoft phát hành bản cho 26.04 (mục 15).

### 6.5. Đưa dữ liệu sang ổ 2, giới hạn RAM

```bash
sudo chown -R mssql:mssql /data/mssql
sudo chmod 750 /data/mssql
sudo /opt/mssql/bin/mssql-conf set filelocation.defaultdatadir   /data/mssql/data
sudo /opt/mssql/bin/mssql-conf set filelocation.defaultlogdir    /data/mssql/log
sudo /opt/mssql/bin/mssql-conf set filelocation.defaultbackupdir /data/mssql/backup
# RAM tối đa cho SQL Server (MB). Máy 8 GB: 3072; 12 GB: 5120; 16 GB: 6144
sudo /opt/mssql/bin/mssql-conf set memory.memorylimitmb 3072
sudo /opt/mssql/bin/mssql-conf set network.tcpport 1433
sudo systemctl restart mssql-server
sudo systemctl enable mssql-server
systemctl status mssql-server --no-pager
sudo ss -ltnp | grep 1433                     # phải nghe 0.0.0.0:1433
```

SQL Server phải khởi động **sau** khi `/data` đã mount. Thêm ràng buộc này cho systemd:

```bash
sudo mkdir -p /etc/systemd/system/mssql-server.service.d
sudo tee /etc/systemd/system/mssql-server.service.d/data-mount.conf > /dev/null <<'EOF'
[Unit]
RequiresMountsFor=/data/mssql
EOF
sudo systemctl daemon-reload
```

> SQL Server trên Linux luôn bật TCP/IP và đăng nhập bằng user/mật khẩu (SQL Authentication), không cần bật thủ công như trên Windows. Database tạo mới / restore sẽ nằm ở `/data/mssql`. Database hệ thống (`master`, `msdb`…) vẫn ở ổ 1, chúng rất nhỏ.

### 6.6. Cài `sqlcmd`

```bash
sudo env ACCEPT_EULA=Y apt install -y mssql-tools18 unixodbc-dev
echo 'export PATH="$PATH:/opt/mssql-tools18/bin"' >> ~/.bashrc
source ~/.bashrc
sqlcmd -S localhost -U sa -C -Q "SELECT @@VERSION"
```

`-C` nghĩa là tin chứng chỉ tự ký của SQL Server. Lệnh hỏi mật khẩu `sa`, in ra phiên bản `Microsoft SQL Server 2025 ... on Linux (Ubuntu ...)` là được.

### 6.7. Kết nối SSMS / Azure Data Studio từ máy bạn (không mở cổng 1433 ra LAN)

**Trên máy của bạn**, mở SSH tunnel và để cửa sổ đó mở:

```bash
ssh -N -L 14330:localhost:1433 rms
```

Trong SSMS: *Server name* `localhost,14330`, *Authentication* = SQL Server Authentication, user `sa`, tick **Trust server certificate**.

---

## 7. Khôi phục database, tạo login cho ứng dụng

> Repo **không có** script tạo schema gốc (bảng `users`, `topics`…). Các file trong `backend/database/migrations/` chỉ là thay đổi bổ sung. Database phải được khôi phục từ file **`.bak`** (hoặc script schema gốc) lấy từ server cũ / nhóm phát triển.

### 7.1. Đưa file `.bak` lên máy ảo

**Trên máy của bạn:**

```bash
scp RMS_HOSPITAL.bak rms:/tmp/
```

**Trên máy ảo:**

```bash
sudo mv /tmp/RMS_HOSPITAL.bak /data/mssql/backup/
sudo chown mssql:mssql /data/mssql/backup/RMS_HOSPITAL.bak
```

### 7.2. Restore

Xem tên logic các file trong bản backup (cột `LogicalName`, thường có 1 file dữ liệu và 1 file log):

```bash
sqlcmd -S localhost -U sa -C -W -Q "RESTORE FILELISTONLY FROM DISK = N'/data/mssql/backup/RMS_HOSPITAL.bak'" | cut -c1-80
```

Restore (chạy trong `tmux` nếu DB lớn), thay `RMS_HOSPITAL` và `RMS_HOSPITAL_log` sau chữ `MOVE` bằng đúng `LogicalName` vừa thấy:

```bash
sqlcmd -S localhost -U sa -C -Q "
RESTORE DATABASE [RMS_HOSPITAL]
FROM DISK = N'/data/mssql/backup/RMS_HOSPITAL.bak'
WITH MOVE N'RMS_HOSPITAL'     TO N'/data/mssql/data/RMS_HOSPITAL.mdf',
     MOVE N'RMS_HOSPITAL_log' TO N'/data/mssql/log/RMS_HOSPITAL_log.ldf',
     RECOVERY, STATS = 10"
```

Thấy `RESTORE DATABASE successfully processed ...` là xong. SQL Server 2025 restore được backup từ các bản cũ hơn (2016, 2019, 2022…). Database được tự nâng cấp lên định dạng mới và **không restore ngược về bản cũ được nữa**.

### 7.3. Tạo login riêng cho ứng dụng và cho migration

Production **không dùng `sa`** cho ứng dụng. Nếu nhóm phát triển có `scripts/create-app-login.sql` thì dùng file đó. Không có thì tạo file tạm (sửa 2 mật khẩu):

```bash
cat > /tmp/logins.sql <<'EOF'
-- Login ứng dụng: chỉ đọc/ghi dữ liệu + gọi stored procedure trên RMS_HOSPITAL
CREATE LOGIN rms_app WITH PASSWORD = N'<MAT_KHAU_APP>', CHECK_POLICY = ON, DEFAULT_DATABASE = RMS_HOSPITAL;
GO
-- Login chỉ dùng khi chạy migration (cần quyền ALTER + BACKUP)
CREATE LOGIN rms_migrate WITH PASSWORD = N'<MAT_KHAU_MIGRATE>', CHECK_POLICY = ON, DEFAULT_DATABASE = RMS_HOSPITAL;
GO
USE RMS_HOSPITAL;
GO
-- DB restore từ server cũ có thể đã có sẵn user cùng tên: gắn lại với login mới
IF USER_ID(N'rms_app') IS NULL CREATE USER rms_app FOR LOGIN rms_app;
ELSE ALTER USER rms_app WITH LOGIN = rms_app;
IF USER_ID(N'rms_migrate') IS NULL CREATE USER rms_migrate FOR LOGIN rms_migrate;
ELSE ALTER USER rms_migrate WITH LOGIN = rms_migrate;
GO
ALTER ROLE db_datareader ADD MEMBER rms_app;
ALTER ROLE db_datawriter ADD MEMBER rms_app;
GRANT EXECUTE TO rms_app;
ALTER ROLE db_owner ADD MEMBER rms_migrate;
GO
EOF
nano /tmp/logins.sql                       # sửa 2 mật khẩu
sqlcmd -S localhost -U sa -C -I -b -f 65001 -i /tmp/logins.sql
rm /tmp/logins.sql                          # xoá vì có mật khẩu
```

Kiểm tra login ứng dụng:

```bash
sqlcmd -S localhost -U rms_app -C -d RMS_HOSPITAL -Q "SELECT COUNT(*) AS so_user FROM dbo.users"
```

---

## 8. Cài Docker Engine (dữ liệu trên ổ 2)

### 8.1. Gỡ bản Docker không chính thức (nếu có)

```bash
for p in docker.io docker-doc docker-compose docker-compose-v2 podman-docker containerd runc; do sudo apt remove -y $p 2>/dev/null; done
snap list docker 2>/dev/null && sudo snap remove --purge docker
```

### 8.2. Trỏ dữ liệu Docker sang `/data/docker` (làm **trước** khi cài)

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

`log-opts` giới hạn log mỗi container ở 5 file × 20 MB, tránh log làm đầy ổ.

### 8.3. Cài từ kho chính thức của Docker

Bản `docker.io` của Ubuntu không được dùng: dự án cần **Docker Compose ≥ 2.24**.

```bash
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
sudo tee /etc/apt/sources.list.d/docker.sources > /dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Signed-By: /etc/apt/keyrings/docker.asc
EOF
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Docker phải chờ `/data` mount xong mới khởi động:

```bash
sudo mkdir -p /etc/systemd/system/docker.service.d
sudo tee /etc/systemd/system/docker.service.d/data-mount.conf > /dev/null <<'EOF'
[Unit]
RequiresMountsFor=/data/docker
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now docker
```

Cho user hiện tại dùng Docker không cần `sudo`:

```bash
sudo usermod -aG docker $USER
exit
```

SSH lại (để quyền nhóm `docker` có hiệu lực), rồi kiểm tra:

```bash
docker info --format '{{.DockerRootDir}}'    # /data/docker
docker compose version                        # v2.24 trở lên
docker run --rm hello-world                   # in "Hello from Docker!"
```

> **Lỡ cài Docker trước khi tạo `daemon.json`?** `sudo systemctl stop docker docker.socket`, tạo file như 8.2, `sudo rsync -aHAX /var/lib/docker/ /data/docker/`, `sudo systemctl start docker`, kiểm tra `docker info` rồi mới xoá `/var/lib/docker`.

---

## 9. Cài Node.js (tuỳ chọn)

Bản production build và chạy hoàn toàn **trong Docker** (image `node:24-alpine`), máy host **không cần** Node.js. Chỉ cài khi muốn chạy script của dự án trực tiếp trên host, hoặc chạy bản dev không Docker:

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x -o /tmp/nodesource_setup.sh
sudo bash /tmp/nodesource_setup.sh
sudo apt install -y nodejs
node -v      # v24.x
npm -v
```

---

## 10. Lấy source code về ổ 2

Repo là private. Cách gọn nhất là tạo **deploy key** (khoá SSH chỉ đọc, chỉ dùng cho repo này) trên máy ảo:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/rms_deploy -N "" -C "rms-vm-deploy"
cat ~/.ssh/rms_deploy.pub
```

Copy dòng in ra (bắt đầu bằng `ssh-ed25519`). Trên GitHub: repo `NguyenHung2381/Hospital_RMS` → *Settings* → *Deploy keys* → *Add deploy key* → dán vào, **không** tick *Allow write access* → *Add key*.

Quay lại máy ảo:

```bash
cat >> ~/.ssh/config <<'EOF'
Host github.com
  IdentityFile ~/.ssh/rms_deploy
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config
ssh -T git@github.com          # gõ yes; báo "successfully authenticated" là được

cd /data/code
git clone git@github.com:NguyenHung2381/Hospital_RMS.git
cd Hospital_RMS
git log --oneline -1
```

Từ đây mọi lệnh `docker compose` chạy trong thư mục `/data/code/Hospital_RMS`.

---

## 11. Tạo file cấu hình

Có **3 file**, đều nằm ngoài git (đã có trong `.gitignore`):

| File | Ai đọc | Nội dung |
|---|---|---|
| `.env` (cạnh `docker-compose.prod.yml`) | Docker Compose | Domain, cổng, số worker, bật/tắt ClamAV |
| `backend/.env` | Backend | Cấu hình chung: địa chỉ DB, email… |
| `backend/.env.production` | Backend (ghi đè `backend/.env`) | Mật khẩu: login DB, Swagger, khoá ký link upload |

### 11.1. `backend/.env`

```bash
cd /data/code/Hospital_RMS
cp backend/.env.example backend/.env
nano backend/.env
```

Sửa các dòng sau. **File mẫu để `DB_PORT=1413`, phải đổi thành `1433`.**

```env
DB_SERVER=host.docker.internal
DB_PORT=1433
DB_DATABASE=RMS_HOSPITAL
DB_TRUST_SERVER_CERT=true
```

Bỏ dấu `#` và sửa dòng `APP_URL` (địa chỉ web, dùng cho link trong email):

```env
APP_URL=https://nckh.bvnghean.vn
```

- `DB_USER` / `DB_PASSWORD` trong file này để nguyên, `.env.production` sẽ ghi đè.
- `JWT_SECRET` / `JWT_REFRESH_SECRET` để nguyên giá trị mẫu `change-me…`: lần chạy đầu container tự sinh secret thật và lưu trong volume `server_secrets`.
- Muốn gửi email thật: đặt `MAIL_ENABLED=true` và các biến `SMTP_*`.

Lưu trong `nano`: `Ctrl+O`, Enter; thoát: `Ctrl+X`.

### 11.2. `backend/.env.production`

```bash
cat > backend/.env.production <<EOF
DB_USER=rms_app
DB_PASSWORD=<MAT_KHAU_APP>
DB_TRUST_SERVER_CERT=true
SWAGGER_PASS=$(openssl rand -hex 16)
UPLOAD_URL_SECRET=$(openssl rand -hex 32)
EOF
nano backend/.env.production        # kiểm tra lại mật khẩu DB
chmod 600 backend/.env backend/.env.production
```

> Mật khẩu chứa ký tự `$`, `` ` `` hoặc `\` sẽ bị shell diễn giải trong lệnh `cat` trên. Mở `nano` sửa lại cho đúng nguyên văn.

**Chưa có HTTPS, đang thử bằng `http://<IP-VM>:8084`?** Thêm dòng `COOKIE_SECURE=false` vào file này. Ở production cookie đăng nhập mặc định có cờ `Secure`, trình duyệt không lưu cookie đó qua HTTP nên bạn bị đăng xuất sau ~15 phút. Có HTTPS rồi thì **xoá dòng này**.

### 11.3. `.env` cạnh `docker-compose.prod.yml`

```bash
cat > .env <<'EOF'
# Địa chỉ CHÍNH XÁC trình duyệt dùng để vào web (http/https + domain + cổng nếu có)
CORS_ORIGIN=https://nckh.bvnghean.vn
# Đang thử bằng IP, chưa có domain:
# CORS_ORIGIN=http://<IP-VM>:8084

# Số worker backend = số vCPU trừ 2 (máy 4 vCPU → 2), tối thiểu 1
WEB_CONCURRENCY=2

# Cổng web. Có reverse proxy HTTPS ngay trên máy này (bước 13.3) thì đổi thành 127.0.0.1:8084
FRONTEND_BIND=8084

# Tắt quét virus khi RAM < 8 GB: bỏ dấu # dòng dưới, rồi up với --scale clamav=0
# CLAMAV_HOST=
EOF
nano .env
```

Đổi domain thì sửa thêm `server_name` trong `frontend/nginx.conf` cho khớp (truy cập bằng IP vẫn chạy vì đó là server block duy nhất).

---

## 12. Build, chạy migration, khởi động

### 12.1. Build image

Chạy trong `tmux`. Lần đầu mất 5–15 phút (tải image Node/Nginx, cài thư viện, build frontend):

```bash
cd /data/code/Hospital_RMS
docker compose -f docker-compose.prod.yml build
```

### 12.2. Migration database

Kiểm tra trạng thái trước, bằng login `rms_migrate`:

```bash
docker compose -f docker-compose.prod.yml run --rm --no-deps -T \
  -e DB_USER=rms_migrate -e DB_PASSWORD='<MAT_KHAU_MIGRATE>' \
  backend node scripts/migrate.js status
```

Đọc kết quả:

- **Có danh sách file với `✓` / `·`** (DB lấy từ server đã từng chạy migration): chạy các file còn thiếu. `MIGRATION_BACKUP_DIR` làm script tự backup DB vào `/data/mssql/backup` trước khi đổi schema:

  ```bash
  docker compose -f docker-compose.prod.yml run --rm --no-deps -T \
    -e DB_USER=rms_migrate -e DB_PASSWORD='<MAT_KHAU_MIGRATE>' \
    -e MIGRATION_BACKUP_DIR=/data/mssql/backup \
    backend node scripts/migrate.js
  ```

- **Báo `Chưa có bảng schema_migrations`**: DB được nâng cấp tay. Hỏi nhóm phát triển DB đó đã có đủ thay đổi của code hiện tại chưa.
  - **Đã đủ**: đánh dấu mọi file là đã chạy (chỉ làm **1 lần**):

    ```bash
    docker compose -f docker-compose.prod.yml run --rm --no-deps -T \
      -e DB_USER=rms_migrate -e DB_PASSWORD='<MAT_KHAU_MIGRATE>' \
      backend node scripts/migrate.js baseline
    ```

  - **Chưa đủ / không rõ**: **không chạy `baseline`** (sẽ bỏ qua các thay đổi còn thiếu). Chạy lệnh migrate thường ở trên. Các file migration đều idempotent (tự kiểm tra trước khi làm) nên chạy trên DB đã có một phần vẫn an toàn.

### 12.3. Khởi động

```bash
docker compose -f docker-compose.prod.yml up -d
# RAM thấp, đã đặt CLAMAV_HOST= ở bước 11.3:
# docker compose -f docker-compose.prod.yml up -d --scale clamav=0
```

Theo dõi:

```bash
docker compose -f docker-compose.prod.yml ps               # backend chuyển "healthy" sau ~1 phút
docker compose -f docker-compose.prod.yml logs -f backend  # Ctrl+C để thoát
```

### 12.4. Kiểm tra

Trên máy ảo:

```bash
curl -s http://127.0.0.1:3001/health ; echo        # backend sống
curl -s http://127.0.0.1:3001/health/db ; echo     # backend nối được SQL Server
curl -sI http://localhost:8084 | head -1           # HTTP/1.1 200 OK
```

Trên máy bạn, mở trình duyệt: `http://<IP-VM>:8084` (hoặc domain sau bước 13.3).

ClamAV cần ~1 phút nạp CSDL virus sau khi khởi động. Trong lúc đó upload file bị từ chối (503), đợi rồi thử lại.

### 12.5. Thử khởi động lại máy

```bash
sudo reboot
```

SSH lại sau ~1 phút:

```bash
systemctl is-active mssql-server docker
cd /data/code/Hospital_RMS && docker compose -f docker-compose.prod.yml ps
```

Mọi container có `restart: unless-stopped` nên tự chạy lại cùng Docker.

---

## 13. Firewall và HTTPS

### 13.1. Firewall UFW

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
# Cho container Docker gọi SQL Server trên host (dải mạng nội bộ của Docker)
sudo ufw allow from 172.16.0.0/12 to any port 1433 proto tcp
sudo ufw reload
sudo ufw status verbose
```

- **Không** mở cổng `1433` ra LAN. Quản trị DB thì dùng SSH tunnel (bước 6.7).
- Chỉ cho SSH từ dải mạng quản trị (tuỳ chọn, chặt hơn): `sudo ufw allow from 192.168.1.0/24 to any port 22 proto tcp`, rồi `sudo ufw delete allow OpenSSH`.

### 13.2. Lưu ý: Docker mở cổng không qua UFW

Docker tự mở các cổng publish bằng iptables riêng, **bỏ qua UFW**. Cổng `8084` vẫn vào được từ mạng dù UFW không có rule. Muốn hạn chế:

- Có reverse proxy HTTPS ngay trên máy ảo (13.3): đặt `FRONTEND_BIND=127.0.0.1:8084`. Khi đó chỉ proxy trên máy gọi được `8084`.
- Proxy ở máy khác: đặt `TRUSTED_PROXIES=<IP proxy>` trong `.env` — nginx tự trả 403 cho máy khác gọi thẳng `8084` (`ONLY_TRUSTED_PROXIES=auto`). Nên chặn thêm ở firewall của hypervisor / mạng, chỉ cho IP proxy vào `8084`.

Backend (`127.0.0.1:3001`) chỉ mở trên loopback, không lộ ra mạng.

### 13.3. HTTPS ngay trên máy ảo (tuỳ chọn)

Nếu bệnh viện đã có reverse proxy HTTPS chung (IIS ARR, nginx, F5…) thì trỏ nó về `http://<IP-VM>:8084`, gửi kèm `X-Forwarded-For` và `X-Forwarded-Proto: https`. Xem README mục *Bước 3b: Nối với reverse proxy HTTPS*.

Tự dựng HTTPS trên máy ảo (domain đã trỏ về máy, nhận được kết nối 80/443 từ Internet để Let's Encrypt xác thực):

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
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
sudo ln -sf /etc/nginx/sites-available/rms /etc/nginx/sites-enabled/rms
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
sudo ufw allow 'Nginx Full'
sudo certbot --nginx -d nckh.bvnghean.vn
```

Rồi sửa `.env`: `FRONTEND_BIND=127.0.0.1:8084`, `CORS_ORIGIN=https://nckh.bvnghean.vn`. Xoá `COOKIE_SECURE=false` khỏi `backend/.env.production` nếu đã thêm. Áp dụng:

```bash
cd /data/code/Hospital_RMS
docker compose -f docker-compose.prod.yml up -d
```

Dùng chứng chỉ nội bộ của bệnh viện thay Let's Encrypt: bỏ lệnh `certbot`, tự thêm `listen 443 ssl;`, `ssl_certificate`, `ssl_certificate_key` vào file cấu hình trên.

---

## 14. Vận hành: cập nhật, sao lưu, theo dõi ổ đĩa

### 14.1. Cập nhật phiên bản ứng dụng

```bash
cd /data/code/Hospital_RMS
git pull
docker compose -f docker-compose.prod.yml build
# Migration TRƯỚC khi đổi container: lỗi thì dừng, bản cũ vẫn chạy
docker compose -f docker-compose.prod.yml run --rm --no-deps -T \
  -e DB_USER=rms_migrate -e DB_PASSWORD='<MAT_KHAU_MIGRATE>' \
  -e MIGRATION_BACKUP_DIR=/data/mssql/backup \
  backend node scripts/migrate.js
docker compose -f docker-compose.prod.yml up -d
docker image prune -f
docker builder prune -f --filter until=168h      # dọn cache build cũ hơn 7 ngày
```

`scripts/deploy.ps1` và CI/CD (`.github/CICD.md`) viết cho server Windows dùng PowerShell. Trên máy ảo Ubuntu này cập nhật bằng các lệnh ở trên.

> ⚠️ **Không bao giờ chạy `docker compose -f docker-compose.prod.yml down -v`.** Cờ `-v` xoá volume: mất toàn bộ file upload, log hoạt động, khoá 2FA.

### 14.2. Sao lưu database hằng ngày

Lưu mật khẩu cho script backup vào một file chỉ root đọc được:

```bash
sudo install -m 600 /dev/null /root/.rms-backup.env
echo "SQL_USER=rms_migrate" | sudo tee -a /root/.rms-backup.env > /dev/null
sudo nano /root/.rms-backup.env     # thêm dòng: SQL_PASS=<MAT_KHAU_MIGRATE>
```

Script backup:

```bash
sudo tee /usr/local/bin/rms-backup-db.sh > /dev/null <<'EOF'
#!/bin/sh
set -e
. /root/.rms-backup.env
DAY=$(date +%F)
SQLCMDPASSWORD="$SQL_PASS" /opt/mssql-tools18/bin/sqlcmd -S localhost -U "$SQL_USER" -C -b -Q \
  "BACKUP DATABASE [RMS_HOSPITAL] TO DISK = N'/data/mssql/backup/RMS_HOSPITAL_$DAY.bak' WITH INIT, CHECKSUM"
# Giữ 14 bản gần nhất
find /data/mssql/backup -name 'RMS_HOSPITAL_20*.bak' -mtime +14 -delete
echo "$(date '+%F %T') backup OK"
EOF
sudo chmod 700 /usr/local/bin/rms-backup-db.sh
sudo /usr/local/bin/rms-backup-db.sh       # chạy thử
ls -lh /data/mssql/backup
```

Bản Standard/Enterprise có thể thêm `COMPRESSION,` trước `INIT` để file nhỏ hơn (bản Express không hỗ trợ).

Lên lịch 23:30 mỗi đêm:

```bash
echo '30 23 * * * root /usr/local/bin/rms-backup-db.sh >> /var/log/rms-backup.log 2>&1' | sudo tee /etc/cron.d/rms-backup-db
```

### 14.3. Sao lưu file upload và khoá bí mật

```bash
docker run --rm -v hospital_rms_server_uploads:/data:ro -v /data/backup:/backup alpine \
  tar czf /backup/uploads-$(date +%F).tar.gz -C /data .
docker run --rm -v hospital_rms_server_secrets:/data:ro -v /data/backup:/backup alpine \
  tar czf /backup/secrets-$(date +%F).tar.gz -C /data .
ls -lh /data/backup
```

Volume `hospital_rms_server_secrets` chứa **khoá giải mã 2FA** (`totp.key`). Phải sao lưu **cùng lịch với DB** và cất kỹ như mật khẩu. Mất khoá này thì mọi người dùng đã bật 2FA phải thiết lập lại.

### 14.4. Chép bản sao lưu ra ngoài máy ảo

Mọi thứ đang nằm trên ổ 2. **Hỏng ổ 2 là mất cả dữ liệu lẫn backup.** Chép định kỳ sang NAS / máy chủ backup, hoặc bật snapshot ổ đĩa ở hypervisor. Ví dụ, **trên máy bạn** hoặc máy backup:

```bash
rsync -av rms:/data/mssql/backup/ ./rms-backup/db/
rsync -av rms:/data/backup/ ./rms-backup/files/
```

(`/data/mssql/backup` thuộc user `mssql`: thêm `<user>` vào nhóm `mssql` để đọc được: `sudo usermod -aG mssql <user>`, rồi SSH lại.)

### 14.5. Theo dõi dung lượng

```bash
df -h / /data
docker system df
sudo du -sh /data/mssql/* /data/docker/volumes/* 2>/dev/null | sort -h
```

Nên để ổ 2 dưới 80%. Gần đầy thì dọn image (`docker image prune -a`), dọn `.bak` cũ, hoặc tăng dung lượng ổ 2 ở hypervisor rồi mở rộng phân vùng:

```bash
sudo apt install -y cloud-guest-utils
sudo growpart /dev/sdb 1          # nvme: sudo growpart /dev/nvme1n1 1
sudo resize2fs /dev/sdb1          # nvme: /dev/nvme1n1p1
df -h /data
```

---

## 15. Khi Microsoft phát hành SQL Server cho 26.04

Kiểm tra định kỳ:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://packages.microsoft.com/config/ubuntu/26.04/mssql-server-2025.list
```

Trả về `200` là đã có. Chuyển sang kho chính thức (dữ liệu giữ nguyên):

```bash
sudo /usr/local/bin/rms-backup-db.sh                              # backup trước
curl -fsSL https://packages.microsoft.com/config/ubuntu/26.04/mssql-server-2025.list \
  | sudo tee /etc/apt/sources.list.d/mssql-server-2025.list
sudo apt update
sudo apt install -y mssql-server
systemctl status mssql-server --no-pager
```

---

## 16. Xử lý sự cố

| Hiện tượng | Kiểm tra / cách xử lý |
|---|---|
| `ssh: connect to host ... Connection refused` | Trên console máy ảo: `systemctl status ssh`, `sudo ufw status` (phải có `OpenSSH ALLOW`). |
| `Permission denied (publickey)` | Khoá chưa lên máy ảo hoặc sai file khoá. Vào bằng console, kiểm tra `~/.ssh/authorized_keys` (quyền thư mục `700`, file `600`). |
| `/data` không có sau reboot | `cat /etc/fstab`, `sudo mount -a` xem lỗi. So UUID bằng `sudo blkid`. |
| `apt install mssql-server` báo `unmet dependencies` | Gói bản 24.04 không còn khớp với 26.04. Xem bước 6.2. |
| `mssql-conf` báo lỗi Python (`Traceback`, `ModuleNotFoundError`) | Không tương thích Python 3.14 của Ubuntu 26.04. Xem cuối bước 6.4. |
| SQL Server không khởi động | `sudo journalctl -u mssql-server -n 50 --no-pager`. Thường do quyền thư mục: `sudo chown -R mssql:mssql /data/mssql`, hoặc RAM < 2 GB. |
| Backend log `Failed to connect to host.docker.internal:1433` | `sudo ss -ltnp \| grep 1433` (phải nghe `0.0.0.0:1433`); rule UFW cho `172.16.0.0/12` (13.1); `DB_PORT=1433` trong `backend/.env` (file mẫu để `1413`). |
| Backend log `Login failed for user 'rms_app'` | Sai mật khẩu trong `backend/.env.production`, hoặc user DB chưa gắn với login sau khi restore: chạy lại phần `ALTER USER ... WITH LOGIN` ở bước 7.3. |
| Backend thoát ngay, báo thiếu biến | Thiếu `DB_USER` / `DB_PASSWORD` / `CORS_ORIGIN`. Xem `docker compose -f docker-compose.prod.yml logs backend`. |
| Đăng nhập được, vài phút sau bị đăng xuất | Đang vào bằng HTTP: thêm `COOKIE_SECURE=false` (11.2) hoặc dựng HTTPS (13.3). |
| Trình duyệt báo lỗi CORS | `CORS_ORIGIN` trong `.env` chưa đúng địa chỉ đang dùng (gồm `http`/`https` và cổng). Sửa rồi `up -d`. |
| `permission denied ... docker.sock` | Chưa SSH lại sau `usermod -aG docker`. Thoát và đăng nhập lại. |
| Build bị `Killed` / máy treo khi build | Thiếu RAM: kiểm tra swap (4.5), tạm dừng ClamAV `docker compose -f docker-compose.prod.yml stop clamav` khi build. |
| Ổ đầy | `docker image prune -a`, `docker builder prune`, xoá `.bak` cũ trong `/data/mssql/backup`, hoặc mở rộng ổ 2 (14.5). |
| Upload báo 503 "quét virus" | ClamAV chưa nạp xong (~1 phút) hoặc đã dừng: `docker compose -f docker-compose.prod.yml logs clamav`. |
| Compose báo lỗi ở `env_file` | Compose cũ hơn 2.24: cài Docker theo bước 8, không dùng gói `docker.io` / snap. |

Xem thêm bảng *Xử lý sự cố Docker* trong `README.md`.

---

**Nguồn tham khảo**

- Microsoft: [Cài SQL Server trên Ubuntu](https://learn.microsoft.com/en-us/sql/linux/install-upgrade/quickstart-install-ubuntu?view=sql-server-ver17), [Release notes SQL Server 2025 trên Linux](https://learn.microsoft.com/en-us/sql/linux/sql-server-linux-release-notes-2025?view=sql-server-ver17), [mssql-conf](https://learn.microsoft.com/en-us/sql/linux/sql-server-linux-configure-mssql-conf)
- Kho gói Microsoft: `https://packages.microsoft.com/ubuntu/26.04/` (trạng thái kiểm tra ngày 29/10/2026)
- Docker: [Cài Docker Engine trên Ubuntu](https://docs.docker.com/engine/install/ubuntu/)
