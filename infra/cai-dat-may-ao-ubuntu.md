# Cài đặt Hospital RMS trên máy ảo Ubuntu 26.04 (2 ổ đĩa, PostgreSQL cài riêng)

Hướng dẫn từng bước dựng bản **production** trên một máy ảo, từ lúc cài hệ điều hành tới lúc mở được trang web và tự triển khai bằng CI/CD. Mọi thao tác sau bước cài Ubuntu đều làm **qua SSH** từ máy tính của bạn.

| Ổ | Dung lượng | Dùng cho |
|---|---|---|
| Ổ 1 | 50 GB | Ubuntu 26.04 + chương trình PostgreSQL |
| Ổ 2 | 50 GB | Mount tại `/data`: source code, dữ liệu Docker (image, file upload, log), dữ liệu + backup PostgreSQL |

```
Trình duyệt ──► :8081 frontend (Nginx, container) ──► backend:3001 (container) ──► redis, clamav (container)
                                                          │
                                                          └──► PostgreSQL 18 (cài thẳng trên Ubuntu, cổng 5432)
```

PostgreSQL **không** chạy trong Docker. Container backend gọi về máy host qua tên `host.docker.internal` (đã khai báo sẵn trong `docker-compose.prod.yml`).

> **Vì sao để Docker và dữ liệu PostgreSQL trên ổ 2?** Ổ hệ điều hành chỉ 50 GB. Image Docker, cache build, file người dùng upload, dữ liệu và file backup của PostgreSQL đều tăng dần. Để chung với hệ điều hành thì sớm muộn ổ 1 đầy và máy treo. Ổ 2 chứa toàn bộ phần dữ liệu, ổ 1 chỉ còn hệ điều hành và chương trình.

> **Đang có dữ liệu trên SQL Server cũ?** Hệ thống giờ chỉ chạy PostgreSQL. Dữ liệu cũ được chuyển sang 1 lần từ **file backup `.bak`** ở bước 12.2, không cần cài SQL Server lên máy này (script tự dựng SQL Server tạm trong Docker rồi xoá).

PostgreSQL 18 có bản chính thức cho cả Ubuntu 24.04 và 26.04 (kho PGDG). Ubuntu 24.04 LTS cũng dùng được với đúng các bước dưới đây.

---

## Cài bằng 1 lệnh

`scripts/setup-server.sh` làm tự động các bước **4 → 15** dưới đây. Bạn chỉ cần làm tay bước 1–3 (tạo máy ảo, cài Ubuntu, SSH bằng khoá).

**Trên máy của bạn**, chép script lên máy ảo (repo private nên chưa clone được trên máy ảo):

```bash
scp scripts/setup-server.sh rms:~
```

**Trên máy ảo:**

```bash
tmux new -s rms
bash ~/setup-server.sh
```

Script hỏi vài câu ở đầu rồi tự chạy hết (lần đầu 20–40 phút, phần lâu nhất là build image):

| Câu hỏi | Ý nghĩa |
|---|---|
| Ổ dùng làm `/data` | Script liệt kê các ổ **chưa phân vùng, chưa có dữ liệu** và bắt gõ lại tên ổ trước khi format. Ổ đã có phân vùng/dữ liệu thì không bao giờ bị format. `none` = để `/data` trên ổ hệ điều hành |
| Cách truy cập web | `ip` (thử bằng `http://<IP-VM>:8081`), `proxy` (reverse proxy HTTPS của bệnh viện ở máy khác), `letsencrypt` (dựng HTTPS ngay trên máy ảo) |
| Số worker, ClamAV | Mặc định theo số vCPU và RAM của máy |
| Có dữ liệu của hệ thống cũ không | `n` (mặc định) = hệ thống mới, DB trống. `y` (gõ `c` / `có` cũng được) thì hỏi tiếp loại dữ liệu: `1` bản backup PostgreSQL (file dump `.dump` / `.sql`, có thể `.gz`, mục 14.2) hoặc `2` file `.bak` SQL Server (bước 7). Đặt sẵn `DB_MODE=new` / `restore` / `transfer` thì không hỏi |

**Cài từ đầu bằng dữ liệu cũ** (trả lời `y` ở câu trên): không phải gõ đường dẫn file. Chép bản backup PostgreSQL, `uploads.tar.gz` (file người dùng đã upload) và `secrets.tar.gz` (khoá 2FA + JWT, đóng gói theo mục C.6 [chuyen-du-lieu-sang-postgresql.md](chuyen-du-lieu-sang-postgresql.md)) vào **`/data/backup/import/`** — trước khi chạy (máy có sẵn `/data`) hoặc trong lúc chạy (bước `disk` tạo thư mục). Bước `database` / `files` tự tìm ở đó, liệt kê để chọn theo số; chưa có bản backup thì script chờ bạn chép. Thiếu `uploads` / `secrets` thì bỏ qua, nạp sau bằng bước `import`.

```bash
scp rms_hospital_<ngày>.dump uploads.tar.gz secrets.tar.gz rms:/data/backup/import/
```

| Khoá SSH bằng mật khẩu | Chỉ hỏi khi `~/.ssh/authorized_keys` đã có khoá (bước 3.5) |

Giữa chừng script dừng chờ 1 lần: in **deploy key** để bạn thêm vào GitHub (bước 10), thêm xong nhấn Enter.

Kết quả:

- Mật khẩu `rms_migrate` / `rms_app` tự sinh, **không in ra màn hình**: nằm ở `~/.pgpass` và `/data/code/Hospital_RMS/backend/.env.production`. Chép vào nơi quản lý mật khẩu của viện.
- Câu trả lời lưu ở `~/.config/rms-setup.env`, log ở `~/rms-setup.log`.
- **Chạy lại an toàn**: lỗi ở bước nào thì sửa rồi chạy lại, các bước đã xong được bỏ qua; không ghi đè file `.env`, không format lại ổ, không đổi mật khẩu đã có.

```bash
bash ~/setup-server.sh --list             # tên các bước
bash ~/setup-server.sh https              # chỉ chạy lại 1 bước, vd sau khi trỏ domain
REBUILD=1 bash ~/setup-server.sh build start
bash ~/setup-server.sh import             # nạp dữ liệu mới từ file backup / .tar.gz (mục 14.2)
```

File dump / `.tar.gz` nạp xong bị **xoá khỏi đĩa** (chứa toàn bộ dữ liệu và khoá 2FA). Muốn giữ: đặt `KEEP_IMPORT_FILES=1` trước lệnh.

Hai tài khoản quản trị `superadmin` (toàn quyền) và `admin` (quyền nghiệp vụ, đổi tên bằng biến `ADMIN_USERNAME` / `LIMITED_ADMIN_USERNAME`; DB `restore` giữ tài khoản của bản backup): **mật khẩu tạm in 1 lần** ở bước *Vai trò hệ thống và tài khoản quản trị*, bắt đổi ở lần đăng nhập đầu. Mật khẩu này cũng nằm trong `~/rms-setup.log` (chỉ chủ file đọc được) và hết tác dụng sau khi bạn đổi.

Script **không** làm: IP tĩnh (4.2), GitHub runner cho CI/CD (15). Chạy không hỏi (đặt sẵn mọi câu trả lời bằng biến môi trường): xem đầu file script.

Phần còn lại của tài liệu giải thích từng bước script làm, để làm tay hoặc xử lý khi script báo lỗi.

---

## Mục lục

1. [Yêu cầu máy ảo](#1-yêu-cầu-máy-ảo)
2. [Cài Ubuntu 26.04 Server](#2-cài-ubuntu-2604-server)
3. [Thiết lập SSH](#3-thiết-lập-ssh)
4. [Cập nhật hệ thống, IP tĩnh, múi giờ, swap](#4-cập-nhật-hệ-thống-ip-tĩnh-múi-giờ-swap)
5. [Chia ổ thứ 2 và mount `/data`](#5-chia-ổ-thứ-2-và-mount-data)
6. [Cài PostgreSQL 18 (ngoài Docker)](#6-cài-postgresql-18-ngoài-docker)
7. [Đưa file backup SQL Server lên máy ảo (nếu chuyển dữ liệu cũ)](#7-đưa-file-backup-sql-server-lên-máy-ảo-nếu-chuyển-dữ-liệu-cũ)
8. [Cài Docker Engine (dữ liệu trên ổ 2)](#8-cài-docker-engine-dữ-liệu-trên-ổ-2)
9. [Cài Node.js (tuỳ chọn)](#9-cài-nodejs-tuỳ-chọn)
10. [Lấy source code về ổ 2](#10-lấy-source-code-về-ổ-2)
11. [Tạo file cấu hình](#11-tạo-file-cấu-hình)
12. [Build, dựng database, khởi động](#12-build-dựng-database-khởi-động)
13. [Firewall và HTTPS](#13-firewall-và-https)
14. [Vận hành: cập nhật, sao lưu, theo dõi ổ đĩa](#14-vận-hành-cập-nhật-sao-lưu-theo-dõi-ổ-đĩa)
15. [Tự triển khai bằng CI/CD (GitHub runner)](#15-tự-triển-khai-bằng-cicd-github-runner)
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

RAM ước tính: PostgreSQL ~3–4 GB (`shared_buffers` + cache, bước 6), ClamAV (quét virus file upload) ~1,5 GB, backend ~300 MB mỗi worker, Redis + Nginx < 250 MB, hệ điều hành ~1 GB. Máy 8 GB thì để `WEB_CONCURRENCY=2` (bước 11.3) và chép `infra/postgresql/rms-ram-8gb.conf` (PostgreSQL ~2,5–3 GB, xem [cai-dat-postgresql.md](cai-dat-postgresql.md) mục 3), RAM ít hơn nữa thì tắt ClamAV.

Lúc chuyển dữ liệu cũ từ file `.bak` (bước 12.2), máy cần thêm ~2 GB RAM trống cho SQL Server tạm trong Docker: tạm dừng ClamAV trong lúc chuyển nếu máy chỉ có 8 GB.

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
sudo mkdir -p /data/code /data/docker /data/backup/db /data/backup/files
sudo chown $USER:$USER /data/code /data/backup /data/backup/db /data/backup/files
ls -la /data
```

| Thư mục | Nội dung |
|---|---|
| `/data/code/Hospital_RMS` | Source code (git clone) + file `.env` |
| `/data/docker` | Toàn bộ dữ liệu Docker: image, container, **volume** (file upload, log hoạt động, JWT secret, khoá 2FA) |
| `/data/pgsql` | Dữ liệu PostgreSQL (tạo ở bước 6) |
| `/data/backup/db` | Bản `pg_dump` hằng ngày + trước mỗi lần migration; file `.bak` SQL Server lúc chuyển dữ liệu |
| `/data/backup/files` | Bản sao lưu volume Docker |

### 5.5. Kiểm tra tự mount sau khi khởi động lại

```bash
sudo reboot
```

SSH lại rồi chạy `df -h /data`. Còn thấy `/data` là xong.

---

## 6. Cài PostgreSQL 18 (ngoài Docker)

Làm theo [cai-dat-postgresql.md](cai-dat-postgresql.md) **mục 1 → 5**: cài gói từ kho PGDG, tạo cluster ở `/data/pgsql`, chép cấu hình `infra/postgresql/rms.conf` + `pg_hba.rms.conf`, mở firewall cho mạng Docker, tạo role `rms_migrate` / `rms_app` và DB `rms_hospital`. Các file cấu hình nằm trong repo, nên **lấy source code trước** (bước 10) rồi quay lại đây, hoặc chép riêng thư mục `infra/postgresql/` lên máy.

**Chưa** chạy mục 6 của tài liệu đó (dựng schema): việc này làm ở bước 12.2, bằng image backend.

PostgreSQL phải khởi động **sau** khi `/data` đã mount:

```bash
sudo mkdir -p /etc/systemd/system/postgresql@18-main.service.d
sudo tee /etc/systemd/system/postgresql@18-main.service.d/data-mount.conf > /dev/null <<'EOF'
[Unit]
RequiresMountsFor=/data/pgsql
EOF
sudo systemctl daemon-reload
systemctl status postgresql@18-main --no-pager      # active (running)
```

Lưu mật khẩu `rms_migrate` vào file pgpass của bạn để các lệnh `psql` / `pg_dump` (và `scripts/deploy.sh`) không phải gõ hay truyền mật khẩu qua dòng lệnh:

```bash
install -m 600 /dev/null ~/.pgpass
nano ~/.pgpass      # thêm dòng: 127.0.0.1:5432:*:rms_migrate:<MAT_KHAU_MIGRATE>
psql -h 127.0.0.1 -U rms_migrate -d rms_hospital -c "SELECT version();"
```

Quản trị DB từ máy bạn (pgAdmin, DBeaver) mà không mở cổng 5432 ra LAN: dùng SSH tunnel, **trên máy của bạn**:

```bash
ssh -N -L 15432:127.0.0.1:5432 rms
```

Rồi kết nối tới `127.0.0.1:15432`, user `rms_migrate`, DB `rms_hospital`.

---

## 7. Đưa file backup SQL Server lên máy ảo (nếu chuyển dữ liệu cũ)

Bỏ qua mục này nếu dựng hệ thống mới, chưa có dữ liệu.

Trên SQL Server cũ, server phải đang chạy **bản code cuối còn hỗ trợ SQL Server (commit `dd0f62e`)** và đã chạy hết migration của bản đó. Lấy bản backup đầy đủ, không làm gián đoạn lịch backup đang có:

```sql
BACKUP DATABASE [RMS_HOSPITAL] TO DISK = N'D:\Backup\RMS_HOSPITAL_chuyen_pg.bak'
WITH COPY_ONLY, CHECKSUM, INIT;
```

**Trên máy của bạn**, chép file lên máy ảo:

```bash
scp RMS_HOSPITAL_chuyen_pg.bak rms:/data/backup/db/
```

Rồi trên máy ảo, chỉ cho chủ file đọc (file chứa toàn bộ dữ liệu bệnh viện):

```bash
chmod 600 /data/backup/db/RMS_HOSPITAL_chuyen_pg.bak
```

Ổ `/data` cần trống ≈ **3 lần** kích thước file `.bak` (file gốc + DB restore tạm + dữ liệu PostgreSQL). Việc chuyển chạy ở bước 12.2, sau khi đã build image.

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
| `backend/.env.production` | Backend (ghi đè `backend/.env`) | Mật khẩu: role DB, Swagger, khoá ký link upload |

### 11.1. `backend/.env`

```bash
cd /data/code/Hospital_RMS
cp backend/.env.example backend/.env
nano backend/.env
```

Các dòng DB trong file mẫu đã đúng cho PostgreSQL cài trên chính máy này, kiểm tra lại:

```env
DB_SERVER=host.docker.internal
DB_PORT=5432
DB_DATABASE=rms_hospital
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
SWAGGER_PASS=$(openssl rand -hex 16)
UPLOAD_URL_SECRET=$(openssl rand -hex 32)
EOF
nano backend/.env.production        # kiểm tra lại mật khẩu DB
chmod 600 backend/.env backend/.env.production
```

> Mật khẩu chứa ký tự `$`, `` ` `` hoặc `\` sẽ bị shell diễn giải trong lệnh `cat` trên. Mở `nano` sửa lại cho đúng nguyên văn.

**Chưa có HTTPS, đang thử bằng `http://<IP-VM>:8081`?** Thêm dòng `COOKIE_SECURE=false` vào file này. Ở production cookie đăng nhập mặc định có cờ `Secure`, trình duyệt không lưu cookie đó qua HTTP nên bạn bị đăng xuất sau ~15 phút. Có HTTPS rồi thì **xoá dòng này**.

### 11.3. `.env` cạnh `docker-compose.prod.yml`

```bash
cat > .env <<'EOF'
# Địa chỉ CHÍNH XÁC trình duyệt dùng để vào web (http/https + domain + cổng nếu có)
CORS_ORIGIN=https://nckh.bvnghean.vn
# Đang thử bằng IP, chưa có domain:
# CORS_ORIGIN=http://<IP-VM>:8081

# Số worker backend = số vCPU trừ 2 (máy 4 vCPU → 2), tối thiểu 1
WEB_CONCURRENCY=2

# Cổng web. Có reverse proxy HTTPS ngay trên máy này (bước 13.3) thì đổi thành 127.0.0.1:8081
FRONTEND_BIND=8081

# Tắt quét virus khi RAM < 8 GB: bỏ dấu # dòng dưới, rồi up với --scale clamav=0
# CLAMAV_HOST=
EOF
nano .env
```

Đổi domain thì sửa thêm `server_name` trong `frontend/nginx.conf` cho khớp (truy cập bằng IP vẫn chạy vì đó là server block duy nhất).

---

## 12. Build, dựng database, khởi động

### 12.1. Build image

Chạy trong `tmux`. Lần đầu mất 5–15 phút (tải image Node/Nginx, cài thư viện, build frontend):

```bash
cd /data/code/Hospital_RMS
docker compose -f docker-compose.prod.yml build
```

### 12.2. Dựng database

Chọn **1 trong 2** trường hợp. Mật khẩu `rms_migrate` truyền qua biến môi trường (`-e DB_PASSWORD` không kèm giá trị = lấy từ biến cùng tên của shell), không ghi lên dòng lệnh:

```bash
read -rsp "Mật khẩu rms_migrate: " DB_PASSWORD && export DB_PASSWORD && echo
```

**a) Hệ thống mới, chưa có dữ liệu**: tạo bảng theo dõi rồi chạy baseline + mọi migration.

```bash
docker compose -f docker-compose.prod.yml run --rm --no-deps -T \
  -e DB_USER=rms_migrate -e DB_PASSWORD \
  backend node scripts/migrate.js init
```

**b) Chuyển dữ liệu từ file backup SQL Server** (đã chép ở bước 7): **không** chạy `migrate init`, để DB `rms_hospital` rỗng. Chạy trong `tmux`:

```bash
docker compose -f docker-compose.prod.yml up -d redis    # tạo mạng Docker của stack
PG_TARGET_PASSWORD="$DB_PASSWORD" \
  backend/scripts/pg-transfer/transfer-from-bak.sh /data/backup/db/RMS_HOSPITAL_chuyen_pg.bak
```

Script dựng 1 container SQL Server tạm (không mở cổng ra ngoài), restore file, kiểm tra dữ liệu (`precheck`), chép sang PostgreSQL (`load`), đối chiếu số dòng + checksum từng bảng (`verify`), rồi xoá container tạm. Báo `❌` ở bước nào thì dừng ở bước đó; đọc [chuyen-du-lieu-sang-postgresql.md](chuyen-du-lieu-sang-postgresql.md) để xử lý, diễn tập và lên kế hoạch ngày chuyển thật.

Sau đó, với cả 2 trường hợp, chạy các migration còn lại rồi kiểm tra trạng thái (mọi file phải có `✓`). Sau khi chuyển dữ liệu, bảng `schema_migrations` còn rỗng nên các file trong `backend/database/migrations/` chạy lần đầu; chúng chạy lại được an toàn.

```bash
for cmd in up status; do
  docker compose -f docker-compose.prod.yml run --rm --no-deps -T \
    -e DB_USER=rms_migrate -e DB_PASSWORD \
    backend node scripts/migrate.js $cmd
done
```

Hệ thống mới (trường hợp a) chưa có vai trò nào, chưa ai đăng nhập được. Tạo 8 vai trò hệ thống (quyền mặc định ở `backend/database/seed/system-roles.json`) và tài khoản quản trị đầu tiên:

```bash
docker compose -f docker-compose.prod.yml run --rm --no-deps -T \
  -e DB_USER=rms_migrate -e DB_PASSWORD \
  backend node scripts/init-system.js --username=admin
unset DB_PASSWORD
```

Lệnh in **mật khẩu tạm 1 lần duy nhất**: chép lại, đăng nhập và đổi mật khẩu trong 7 ngày. Quên hoặc quá hạn: chạy lại lệnh trên với thêm `--reset-admin` (cấp mật khẩu tạm mới, mở khoá, đăng xuất mọi phiên). Lệnh chạy lại an toàn: vai trò đã có thì không đụng tới quyền, đã có quản trị thì không tạo thêm, nên chạy ở trường hợp b) cũng không sao.

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
curl -s http://127.0.0.1:3001/health/db ; echo     # backend nối được PostgreSQL
curl -sI http://localhost:8081 | head -1           # HTTP/1.1 200 OK
```

Trên máy bạn, mở trình duyệt: `http://<IP-VM>:8081` (hoặc domain sau bước 13.3).

ClamAV cần ~1 phút nạp CSDL virus sau khi khởi động. Trong lúc đó upload file bị từ chối (503), đợi rồi thử lại.

### 12.5. Thử khởi động lại máy

```bash
sudo reboot
```

SSH lại sau ~1 phút:

```bash
systemctl is-active postgresql@18-main docker
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
# Cho container Docker gọi PostgreSQL trên host (dải mạng nội bộ của Docker).
# Đã làm ở bước 6 (cai-dat-postgresql.md mục 4) thì bỏ qua 2 dòng này.
sudo ufw allow from 172.16.0.0/12 to any port 5432 proto tcp
sudo ufw deny 5432/tcp
sudo ufw reload
sudo ufw status verbose
```

- **Không** mở cổng `5432` ra LAN. Quản trị DB thì dùng SSH tunnel (cuối bước 6).
- Chỉ cho SSH từ dải mạng quản trị (tuỳ chọn, chặt hơn): `sudo ufw allow from 192.168.1.0/24 to any port 22 proto tcp`, rồi `sudo ufw delete allow OpenSSH`.

### 13.2. Docker mở cổng không qua UFW — chặn bằng `scripts/firewall-ports.sh`

Docker tự mở các cổng publish bằng iptables riêng (chain FORWARD), **bỏ qua UFW**: `ufw deny 8081` không có tác dụng, máy nào trong LAN cũng gọi thẳng được `8081`. Script `scripts/firewall-ports.sh` chèn rule vào chain `DOCKER-USER` (Docker xét trước rule của nó): chỉ cặp `cổng@nguồn` được khai mới vào được container, **mọi cổng publish khác bị chặn** từ máy khác (kể cả cổng lỡ publish thêm sau này). Truy cập từ chính máy ảo (`127.0.0.1:8081`) không bị ảnh hưởng. `setup-server.sh` tự chạy bước này (bước `ports`).

```bash
cd /data/code/Hospital_RMS
sudo bash scripts/firewall-ports.sh                                   # xem cổng đang mở + cảnh báo, không đổi gì
sudo bash scripts/firewall-ports.sh apply --allow "8081@10.0.0.5"     # proxy HTTPS ở máy khác: chỉ IP proxy
sudo bash scripts/firewall-ports.sh apply --allow "8081@any"          # đang thử bằng http://<IP-VM>:8081
sudo bash scripts/firewall-ports.sh apply --allow ""                  # proxy HTTPS ngay trên máy ảo (13.3)
sudo bash scripts/firewall-ports.sh remove                            # gỡ, trả về như Docker mặc định
```

- Cấu hình lưu ở `/etc/rms/docker-ports.conf`; service `rms-firewall-ports` nạp lại rule mỗi lần Docker khởi động (reboot không mất).
- Lệnh xem (`status`) trả mã `2` khi có cảnh báo: cổng Docker mở cho mọi máy, UFW tắt, dịch vụ lạ lắng nghe trên mạng, LAN trùng dải `172.16.0.0/12` của Docker (khi đó máy trong LAN tới được `5432`).
- Vẫn nên giữ `TRUSTED_PROXIES=<IP proxy>` trong `.env` (nginx tự trả 403 cho máy khác) và `FRONTEND_BIND=127.0.0.1:8081` khi proxy ở cùng máy — nhiều lớp chặn.
- Kiểm tra lại từ **máy khác** trong LAN: `nmap -Pn -p 1-65535 <IP-VM>` — chỉ nên thấy `22` (và `80/443` nếu dựng 13.3, `8081` từ máy proxy).

Backend (`127.0.0.1:3001`) chỉ mở trên loopback, Redis và ClamAV không publish cổng.

### 13.3. HTTPS ngay trên máy ảo (tuỳ chọn)

Nếu bệnh viện đã có reverse proxy HTTPS chung (IIS ARR, nginx, F5…) thì trỏ nó về `http://<IP-VM>:8081`, gửi kèm `X-Forwarded-For` và `X-Forwarded-Proto: https`. Xem README mục *Bước 3b: Nối với reverse proxy HTTPS*.

Tự dựng HTTPS trên máy ảo (domain đã trỏ về máy, nhận được kết nối 80/443 từ Internet để Let's Encrypt xác thực):

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo tee /etc/nginx/sites-available/rms > /dev/null <<'EOF'
server {
    listen 80;
    server_name nckh.bvnghean.vn;
    client_max_body_size 300m;

    location / {
        proxy_pass http://127.0.0.1:8081;
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

Rồi sửa `.env`: `FRONTEND_BIND=127.0.0.1:8081`, `CORS_ORIGIN=https://nckh.bvnghean.vn`. Xoá `COOKIE_SECURE=false` khỏi `backend/.env.production` nếu đã thêm. Áp dụng:

```bash
cd /data/code/Hospital_RMS
docker compose -f docker-compose.prod.yml up -d
```

Dùng chứng chỉ nội bộ của bệnh viện thay Let's Encrypt: bỏ lệnh `certbot`, tự thêm `listen 443 ssl;`, `ssl_certificate`, `ssl_certificate_key` vào file cấu hình trên.

---

## 14. Vận hành: cập nhật, sao lưu, theo dõi ổ đĩa

### 14.1. Cập nhật phiên bản ứng dụng

Đã bật CI/CD (mục 15): merge vào `main` là tự triển khai, không cần làm gì trên máy ảo. Chạy tay (hoặc khi GitHub sự cố), có 2 cách:

- **Image đã build trên CI** (khuyến nghị): `scripts/deploy.sh <commit SHA> ghcr.io/<owner>`. Script kéo image, backup DB rồi chạy migration, khởi động bản mới, kiểm tra sức khoẻ, hỏng thì tự quay lại bản cũ. Rollback tay = chạy lại với SHA của bản cũ (xem `logs/deploy-history.log`).
- **Build ngay trên máy ảo:**

  ```bash
  cd /data/code/Hospital_RMS
  git pull
  docker compose -f docker-compose.prod.yml build
  # Backup + migration TRƯỚC khi đổi container: lỗi thì dừng, bản cũ vẫn chạy
  pg_dump -Fc -h 127.0.0.1 -U rms_migrate -d rms_hospital \
    -f /data/backup/db/rms_hospital_premigrate_$(date +%Y%m%d_%H%M%S).dump
  read -rsp "Mật khẩu rms_migrate: " DB_PASSWORD && export DB_PASSWORD && echo
  docker compose -f docker-compose.prod.yml run --rm --no-deps -T \
    -e DB_USER=rms_migrate -e DB_PASSWORD \
    backend node scripts/migrate.js
  unset DB_PASSWORD
  docker compose -f docker-compose.prod.yml up -d
  docker image prune -f
  docker builder prune -f --filter until=168h      # dọn cache build cũ hơn 7 ngày
  ```

> ⚠️ **Không bao giờ chạy `docker compose -f docker-compose.prod.yml down -v`.** Cờ `-v` xoá volume: mất toàn bộ file upload, log hoạt động, khoá 2FA.

### 14.2. Sao lưu database hằng ngày

Bản tối thiểu: `pg_dump` mỗi đêm, chạy bằng user hệ thống `postgres` (đăng nhập kiểu *peer*, không cần file mật khẩu). Cần khôi phục tới thời điểm bất kỳ thì dùng pgBackRest ([cai-dat-postgresql.md](cai-dat-postgresql.md) mục 7).

```bash
sudo install -d -o postgres -g postgres -m 750 /data/backup/db/daily
sudo tee /usr/local/bin/rms-backup-db.sh > /dev/null <<'EOF'
#!/bin/sh
set -e
DIR=/data/backup/db/daily
FILE="$DIR/rms_hospital_$(date +%F).dump"
sudo -u postgres pg_dump -Fc -d rms_hospital -f "$FILE.tmp"
mv "$FILE.tmp" "$FILE"
# Kiểm tra file đọc được (liệt kê mục lục)
sudo -u postgres pg_restore -l "$FILE" > /dev/null
# Giữ 14 bản gần nhất
find "$DIR" -name 'rms_hospital_20*.dump' -mtime +14 -delete
echo "$(date '+%F %T') backup OK $(du -h "$FILE" | cut -f1)"
EOF
sudo chmod 700 /usr/local/bin/rms-backup-db.sh
sudo /usr/local/bin/rms-backup-db.sh       # chạy thử
ls -lh /data/backup/db/daily
```

Lên lịch 23:30 mỗi đêm:

```bash
echo '30 23 * * * root /usr/local/bin/rms-backup-db.sh >> /var/log/rms-backup.log 2>&1' | sudo tee /etc/cron.d/rms-backup-db
```

Khôi phục (ra DB khác để kiểm tra, không đè DB đang chạy):

```bash
sudo -u postgres createdb -T template0 rms_restore_test
sudo -u postgres pg_restore -d rms_restore_test --no-owner /data/backup/db/daily/rms_hospital_<ngày>.dump
```

**Dựng máy MỚI từ bản sao lưu** (máy cũ hỏng, hoặc chuyển sang máy khác): chạy `setup-server.sh`,
trả lời **có dữ liệu cũ → `1` bản backup PostgreSQL** (hoặc đặt sẵn `DB_MODE=restore`), chép 3 file của máy cũ vào `/data/backup/import/` — 1 lần chạy làm hết,
không cần bước `import`:

```bash
# trên máy có bản sao lưu (NAS / máy cũ)
scp rms_hospital_<ngày>.dump uploads-<ngày>.tar.gz secrets-<ngày>.tar.gz <user>@<IP-mới>:/data/backup/import/
# trên máy mới
DB_MODE=restore bash ~/setup-server.sh     # /data chưa có: chạy trước, script chờ ở bước database
```

- File dump: `.dump` (`pg_dump -Fc`, như bản hằng đêm ở trên), `-Ft`, hoặc `.sql`; nén `.gz` cũng
  được (script nhận dạng theo nội dung, không theo đuôi).
- Bước `database` khôi phục bằng superuser `postgres` (`rms_migrate` không khôi phục được
  `COMMENT ON EXTENSION pg_stat_statements`), giữ nguyên chủ sở hữu + quyền của `rms_app`, trong
  1 transaction: lỗi giữa chừng thì DB không đổi, sửa rồi chạy lại `bash ~/setup-server.sh database files start`.
  Sau đó chạy migration mới hơn bản backup (nếu có). Tài khoản giữ nguyên như bản backup, không tạo tài khoản quản trị mới.
- Bước `files` giải nén `uploads.tar.gz` / `secrets.tar.gz` vào volume mới (mục C.6
  [chuyen-du-lieu-sang-postgresql.md](chuyen-du-lieu-sang-postgresql.md)). Thiếu `secrets` thì người đã bật 2FA phải thiết lập lại.
- DB phải trống (máy mới cài). Hệ thống đang chạy thì dùng bước `import` ở dưới.
- Nạp xong, file dump / `.tar.gz` bị xoá (`KEEP_IMPORT_FILES=1` để giữ).

**Cập nhật dữ liệu trên hệ thống đang chạy** (nạp bản backup mới hơn, chép file upload từ máy
khác…): chép file vào `/data/backup/import/` rồi chạy bước `import` — bước này chỉ chạy khi gọi tên:

```bash
# trên máy có file
scp rms_hospital_<ngày>.dump uploads.tar.gz secrets.tar.gz <user>@<IP>:/data/backup/import/
# trên máy chủ
bash ~/setup-server.sh import
```

- Script liệt kê file theo loại, mới nhất trước, chọn theo số (`0` = không dùng). Nhận dạng theo
  nội dung: bản backup PostgreSQL (như trên) / `.tar.gz` có chữ `secret` trong tên là khoá 2FA + JWT /
  `.tar.gz` còn lại là file upload. File khác bị bỏ qua.
- Chọn bản backup = **thay toàn bộ DB**: dừng backend, sao lưu DB đang dùng vào
  `/data/backup/db/truoc-import/`, đổi tên DB cũ sang bên, khôi phục vào DB mới, chạy migration,
  khởi động. Lỗi ở bất kỳ bước nào (file hỏng, migration lỗi, backend không lên) thì tự trả lại DB cũ
  và giữ file. Thành công thì bỏ DB cũ (còn bản sao lưu) và **xoá file đã chọn**.
- `uploads.tar.gz` ghép vào file đang có (trùng tên thì ghi đè); `secrets.tar.gz` thay khoá đang có
  (khoá cũ chép sang `.truoc-import-<thời điểm>/` trong volume).
- Chạy không hỏi: `IMPORT_DUMP=… IMPORT_UPLOADS=none IMPORT_SECRETS=none ASSUME_YES=1 bash ~/setup-server.sh import`
  (`ASSUME_YES=1` mà không đặt biến thì lấy file mới nhất mỗi loại). Thư mục khác: `IMPORT_DIR=…`.
- Máy dev: chép file vào thư mục `import/` ở gốc repo rồi `npm run setup:dev -- --import`
  (hoặc `--import="E:\thu-muc"`); DB đang dùng sao lưu vào `import/sao-luu/`, `--keep-files` để giữ file.

### 14.3. Sao lưu file upload và khoá bí mật

```bash
docker run --rm -v hospital_rms_server_uploads:/data:ro -v /data/backup/files:/backup alpine \
  tar czf /backup/uploads-$(date +%F).tar.gz -C /data .
docker run --rm -v hospital_rms_server_secrets:/data:ro -v /data/backup/files:/backup alpine \
  tar czf /backup/secrets-$(date +%F).tar.gz -C /data .
ls -lh /data/backup/files
```

Volume `hospital_rms_server_secrets` chứa **khoá giải mã 2FA** (`totp.key`). Phải sao lưu **cùng lịch với DB** và cất kỹ như mật khẩu. Mất khoá này thì mọi người dùng đã bật 2FA phải thiết lập lại.

### 14.4. Chép bản sao lưu ra ngoài máy ảo

Mọi thứ đang nằm trên ổ 2. **Hỏng ổ 2 là mất cả dữ liệu lẫn backup.** Chép định kỳ sang NAS / máy chủ backup, hoặc bật snapshot ổ đĩa ở hypervisor. Ví dụ, **trên máy bạn** hoặc máy backup:

```bash
rsync -av rms:/data/backup/ ./rms-backup/
```

(`/data/backup/db/daily` thuộc user `postgres`: thêm `<user>` vào nhóm `postgres` để đọc được: `sudo usermod -aG postgres <user>`, rồi SSH lại.)

### 14.5. Theo dõi dung lượng

```bash
df -h / /data
docker system df
sudo du -sh /data/pgsql /data/backup/* /data/docker/volumes/* 2>/dev/null | sort -h
```

Nên để ổ 2 dưới 80%. Gần đầy thì dọn image (`docker image prune -a`), dọn bản backup cũ (kể cả file `.bak` SQL Server sau khi đã chuyển xong), hoặc tăng dung lượng ổ 2 ở hypervisor rồi mở rộng phân vùng:

```bash
sudo apt install -y cloud-guest-utils
sudo growpart /dev/sdb 1          # nvme: sudo growpart /dev/nvme1n1 1
sudo resize2fs /dev/sdb1          # nvme: /dev/nvme1n1p1
df -h /data
```

---

## 15. Tự triển khai bằng CI/CD (GitHub runner)

`.github/workflows/deploy.yml` chạy `scripts/deploy.sh` trên **self-hosted runner** cài ngay trên máy ảo. Runner tự kết nối ra GitHub để nhận việc, nên máy ảo không cần mở cổng nào từ Internet. Chi tiết pipeline: [.github/CICD.md](../.github/CICD.md).

### 15.1. Cài runner

Tạo user riêng cho runner, có quyền dùng Docker, đọc được thư mục code:

```bash
sudo useradd -m -s /bin/bash -G docker github-runner
sudo chown -R github-runner:github-runner /data/code/Hospital_RMS
```

Trên GitHub: repo → *Settings* → *Actions* → *Runners* → *New self-hosted runner* → *Linux*. Làm theo các lệnh GitHub đưa ra, **chạy bằng user `github-runner`** (`sudo -iu github-runner`), ở bước `./config.sh` thêm nhãn của môi trường:

```bash
./config.sh --url https://github.com/<owner>/Hospital_RMS --token <TOKEN> \
  --labels rms-production --name rms-vm-prod --unattended
```

Rồi cài thành dịch vụ (thoát về user của bạn):

```bash
cd /home/github-runner/actions-runner
sudo ./svc.sh install github-runner
sudo ./svc.sh start
sudo ./svc.sh status
```

### 15.2. Cấu hình môi trường trên GitHub

Repo → *Settings* → *Environments* → `production`:

| Loại | Tên | Giá trị |
|---|---|---|
| Variable | `DEPLOY_DIR` | `/data/code/Hospital_RMS` (nơi có `backend/.env`, `backend/.env.production`, `.env`) |
| Variable | `MIGRATION_BACKUP_DIR` | `/data/backup/db` |
| Variable | `APP_URL` | `https://nckh.bvnghean.vn` |
| Secret | `MIGRATION_DB_USER` | `rms_migrate` |
| Secret | `MIGRATION_DB_PASSWORD` | mật khẩu `rms_migrate` |

Bật *Required reviewers* cho `production` để mỗi lần triển khai phải có người duyệt.

`MIGRATION_BACKUP_DIR` phải ghi được bởi `github-runner`: `sudo chown github-runner /data/backup/db`. `pg_dump` đã có sẵn trên máy (cài cùng PostgreSQL).

### 15.3. Kiểm tra

Actions → *Deploy* → *Run workflow*, chọn `production`, nhập SHA đầy đủ của commit đang chạy (`git rev-parse HEAD`). Xem log job; lịch sử triển khai trên máy ở `/data/code/Hospital_RMS/logs/deploy-history.log`.

### 15.4. Đổi JWT secret định kỳ

```bash
cd /data/code/Hospital_RMS
scripts/rotate-jwt-secrets.sh --register        # 4 tuần/lần, 02:30 sáng Chủ nhật (crontab)
crontab -l                                      # xem lịch
tail logs/jwt-rotate.log
```

Mỗi lần đổi, mọi người dùng phải đăng nhập lại. Gỡ lịch: `scripts/rotate-jwt-secrets.sh --unregister`.

---

## 16. Xử lý sự cố

| Hiện tượng | Kiểm tra / cách xử lý |
|---|---|
| `ssh: connect to host ... Connection refused` | Trên console máy ảo: `systemctl status ssh`, `sudo ufw status` (phải có `OpenSSH ALLOW`). |
| `Permission denied (publickey)` | Khoá chưa lên máy ảo hoặc sai file khoá. Vào bằng console, kiểm tra `~/.ssh/authorized_keys` (quyền thư mục `700`, file `600`). |
| `/data` không có sau reboot | `cat /etc/fstab`, `sudo mount -a` xem lỗi. So UUID bằng `sudo blkid`. |
| PostgreSQL không khởi động | `sudo journalctl -u postgresql@18-main -n 50 --no-pager`, `sudo tail -50 /var/log/postgresql/postgresql-18-main.log`. Thường do quyền thư mục (`/data/pgsql` phải thuộc `postgres`, quyền `700`) hoặc `shared_buffers` quá lớn so với RAM. |
| Backend log `connect ECONNREFUSED ...:5432` / timeout | `sudo ss -ltnp \| grep 5432` (phải nghe `0.0.0.0:5432`); rule UFW cho `172.16.0.0/12` (13.1); `DB_SERVER=host.docker.internal` trong `backend/.env`. |
| Backend log `no pg_hba.conf entry for host "172.x.x.x"` | Chưa chép `infra/postgresql/pg_hba.rms.conf` lên đầu `pg_hba.conf`, hoặc chưa `systemctl reload postgresql@18-main`. |
| Backend log `password authentication failed for user "rms_app"` | Sai mật khẩu trong `backend/.env.production`. Đặt lại: `sudo -u postgres psql -c "\password rms_app"`. |
| `transfer-from-bak.sh` báo `Chưa có mạng Docker hospital_rms_default` | Chạy `docker compose -f docker-compose.prod.yml up -d redis` trước (bước 12.2 b). |
| `transfer-from-bak.sh` báo DB nguồn chưa chạy migration | File `.bak` lấy từ bản code cũ: deploy commit `dd0f62e` lên SQL Server cũ, chạy hết migration, rồi backup lại (bước 7). |
| `deploy.sh` báo `FAILED-BACKUP` | Thiếu `pg_dump` hoặc user runner không ghi được `MIGRATION_BACKUP_DIR` (15.2). |
| Backend thoát ngay, báo thiếu biến | Thiếu `DB_USER` / `DB_PASSWORD` / `CORS_ORIGIN`. Xem `docker compose -f docker-compose.prod.yml logs backend`. |
| Đăng nhập được, vài phút sau bị đăng xuất | Đang vào bằng HTTP: thêm `COOKIE_SECURE=false` (11.2) hoặc dựng HTTPS (13.3). |
| Trình duyệt báo lỗi CORS | `CORS_ORIGIN` trong `.env` chưa đúng địa chỉ đang dùng (gồm `http`/`https` và cổng). Sửa rồi `up -d`. |
| `permission denied ... docker.sock` | Chưa SSH lại sau `usermod -aG docker`. Thoát và đăng nhập lại. |
| Build bị `Killed` / máy treo khi build | Thiếu RAM: kiểm tra swap (4.5), tạm dừng ClamAV `docker compose -f docker-compose.prod.yml stop clamav` khi build. |
| Ổ đầy | `docker image prune -a`, `docker builder prune`, xoá bản backup cũ trong `/data/backup`, hoặc mở rộng ổ 2 (14.5). |
| Upload báo 503 "quét virus" | ClamAV chưa nạp xong (~1 phút) hoặc đã dừng: `docker compose -f docker-compose.prod.yml logs clamav`. |
| Compose báo lỗi ở `env_file` | Compose cũ hơn 2.24: cài Docker theo bước 8, không dùng gói `docker.io` / snap. |

Xem thêm bảng *Xử lý sự cố Docker* trong `README.md`.

---

**Nguồn tham khảo**

- PostgreSQL: [Cài trên Ubuntu (kho PGDG)](https://www.postgresql.org/download/linux/ubuntu/), [pg_dump](https://www.postgresql.org/docs/18/app-pgdump.html)
- GitHub: [Self-hosted runner](https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/adding-self-hosted-runners), [Chạy runner thành dịch vụ](https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/configuring-the-self-hosted-runner-application-as-a-service)
- Docker: [Cài Docker Engine trên Ubuntu](https://docs.docker.com/engine/install/ubuntu/)
