☁️ ServerQuu - Multi-Drive Cloud Storage Aggregator

ServerQuu adalah platform Virtual File System (VFS) dan Cloud Storage Aggregator berbasis Node.js yang dirancang untuk menggabungkan beberapa akun Google Drive menjadi satu sistem penyimpanan virtual yang mudah dikelola. ServerQuu dapat berjalan secara mandiri di Termux (Android) sehingga sangat cocok digunakan pada perangkat lama atau server pribadi berdaya rendah.

---

✨ Fitur Utama

- 📁 Agregasi multi-akun Google Drive
- ☁️ Virtual File System (VFS)
- 📱 Berjalan langsung di Android menggunakan Termux
- 🔒 Login menggunakan PIN
- 📊 Pencatatan aktivitas (logs)
- ⚡ Ringan dan hemat daya
- 🌐 Dapat diakses secara online menggunakan Cloudflare Tunnel
- 🔐 HTTPS gratis tanpa port forwarding

---

🚀 Instalasi

1. Persiapan Lingkungan

Jalankan perintah berikut di aplikasi Termux:

pkg update && pkg upgrade -y
pkg install nodejs git -y

2. Clone Repository

git clone https://github.com/ZulhanPedia/ServerQuu
cd ServerQuu
npm install

«Catatan: Letakkan file logo kustom dengan nama "logo.png" ke dalam folder "static/" agar logo dapat ditampilkan dengan sempurna pada antarmuka ServerQuu.»

---

⚙️ Konfigurasi

config.json (Konfigurasi Akun Google Drive)

Seluruh kredensial Google Drive disimpan pada file ini agar tidak terekspos melalui browser.

[
  {
    "id": 1,
    "email": "akun_utama@gmail.com",
    "client_id": "CLIENT_ID_GOOGLE_ANDA",
    "client_secret": "CLIENT_SECRET_GOOGLE_ANDA",
    "refresh_token": "REFRESH_TOKEN_AKUN_TERSEBUT"
  }
]

---

db.json (Database Virtual)

Buat file "db.json" pada direktori utama proyek dengan isi awal berikut:

{
  "pin": "1234",
  "files": [],
  "logs": []
}

---

🔑 Mendapatkan Kredensial Google Drive API

A. Membuat Client ID & Client Secret

1. Buka Google Cloud Console.
2. Buat project baru (misalnya: ServerQuu-Aggregator).
3. Aktifkan Google Drive API.
4. Masuk ke menu OAuth Consent Screen.
5. Pilih tipe pengguna External.
6. Isi nama aplikasi, email dukungan, dan email developer.
7. Pada bagian Test Users, tambahkan seluruh akun Google Drive yang akan digunakan.
8. Masuk ke menu Credentials.
9. Klik Create Credentials → OAuth Client ID.
10. Pilih Desktop Application.
11. Simpan dan catat nilai Client ID serta Client Secret.

---

B. Mendapatkan Refresh Token

1. Buka Google OAuth Playground.
2. Klik ikon ⚙️ (Settings).
3. Aktifkan Use your own OAuth credentials.
4. Masukkan Client ID dan Client Secret yang telah dibuat.
5. Pada kolom Scope masukkan:

https://www.googleapis.com/auth/drive

6. Klik Authorize APIs.
7. Login menggunakan akun Google Drive.
8. Berikan seluruh izin yang diminta.
9. Klik Exchange authorization code for tokens.
10. Salin nilai Refresh Token dan masukkan ke dalam "config.json".

---

▶️ Menjalankan Server

Jalankan aplikasi menggunakan:

node server.js

Secara default aplikasi akan berjalan pada:

http://localhost:3000

PIN login bawaan:

1234

Disarankan untuk segera mengganti PIN setelah instalasi pertama.

---

🌐 Menghubungkan ke Internet dengan Cloudflare Tunnel

Dengan Cloudflare Tunnel, ServerQuu dapat diakses dari mana saja menggunakan domain pribadi tanpa membuka port router dan tanpa IP publik.

1. Hubungkan Domain ke Cloudflare

Pastikan domain Anda telah terdaftar dan menggunakan Name Server Cloudflare.

---

2. Instal Cloudflared

pkg install cloudflared -y

---

3. Login ke Cloudflare

cloudflared tunnel login

☁️ ServerQuu

Privat • Aman • Terpercaya

ServerQuu adalah platform Virtual File System (VFS) dan Multi-Drive Cloud Storage Aggregator berbasis Node.js yang memungkinkan Anda menggabungkan beberapa akun Google Drive ke dalam satu sistem penyimpanan virtual yang terpusat.

Dirancang khusus agar dapat berjalan secara ringan di Termux (Android), ServerQuu sangat cocok digunakan pada perangkat lama, HP cadangan, atau server pribadi berdaya rendah.

---

✨ Fitur Utama

- ☁️ Agregasi banyak akun Google Drive
- 📂 Virtual File System (VFS)
- 📱 Berjalan langsung di Android melalui Termux
- 🔒 Sistem keamanan berbasis PIN
- 📊 Pencatatan aktivitas dan log
- ⚡ Ringan dan hemat sumber daya
- 🌐 Dapat diakses dari mana saja menggunakan Cloudflare Tunnel
- 🔐 HTTPS gratis tanpa port forwarding
- 🏠 Cocok untuk server pribadi dan backup data

---

📋 Persyaratan

Sebelum memulai, pastikan Anda memiliki:

- Android dengan aplikasi Termux
- Node.js
- Git
- Akun Google Drive
- Domain (opsional)
- Akun Cloudflare (opsional untuk akses online)

---

🚀 Instalasi

1. Persiapan Lingkungan

Jalankan perintah berikut di Termux:

pkg update && pkg upgrade -y
pkg install nodejs git -y

2. Clone Repository

git clone https://github.com/ZulhanPedia/ServerQuu
cd ServerQuu
npm install

Logo Kustom

Jika ingin menggunakan logo sendiri, letakkan file:

logo.png

ke dalam folder:

static/

---

⚙️ Konfigurasi

config.json

Buat file "config.json" di direktori utama proyek.

File ini digunakan untuk menyimpan kredensial Google Drive secara lokal dan aman.

[
  {
    "id": 1,
    "email": "akun_utama@gmail.com",
    "client_id": "CLIENT_ID_GOOGLE_ANDA",
    "client_secret": "CLIENT_SECRET_GOOGLE_ANDA",
    "refresh_token": "REFRESH_TOKEN_AKUN_TERSEBUT"
  }
]

---

db.json

Buat file "db.json" di direktori utama proyek.

{
  "pin": "1234",
  "files": [],
  "logs": []
}

---

🔑 Konfigurasi Google Drive API

Langkah 1 — Membuat Client ID & Client Secret

1. Buka Google Cloud Console.
2. Buat project baru.
3. Aktifkan Google Drive API.
4. Masuk ke menu OAuth Consent Screen.
5. Pilih tipe pengguna External.
6. Isi informasi aplikasi.
7. Tambahkan akun Google Anda pada bagian Test Users.
8. Masuk ke menu Credentials.
9. Klik Create Credentials → OAuth Client ID.
10. Pilih Desktop Application.
11. Simpan dan catat:

- Client ID
- Client Secret

---

Langkah 2 — Mendapatkan Refresh Token

1. Buka Google OAuth Playground.
2. Klik ikon ⚙️ Settings.
3. Aktifkan Use your own OAuth credentials.
4. Masukkan Client ID dan Client Secret.

Masukkan scope berikut:

https://www.googleapis.com/auth/drive

5. Klik Authorize APIs.
6. Login menggunakan akun Google Anda.
7. Setujui seluruh izin yang diminta.
8. Klik Exchange authorization code for tokens.
9. Salin nilai Refresh Token.
10. Masukkan Refresh Token ke dalam "config.json".

---

▶️ Menjalankan Server

Jalankan ServerQuu menggunakan:

node server.js

Setelah berhasil dijalankan, buka:

http://localhost:3000

PIN login bawaan:

1234

Disarankan untuk segera mengganti PIN setelah instalasi pertama.

---

🌐 Akses Online dengan Cloudflare Tunnel

Cloudflare Tunnel memungkinkan ServerQuu diakses dari internet secara aman tanpa:

- Port Forwarding
- IP Publik
- VPS tambahan

---

1. Instal Cloudflared

pkg install cloudflared -y

---

2. Login ke Cloudflare

cloudflared tunnel login

Ikuti proses otorisasi hingga berhasil.

---

3. Buat Tunnel Baru

cloudflared tunnel create serverquu-tunnel

Simpan UUID yang diberikan.

---

4. Buat Konfigurasi Tunnel

nano ~/.cloudflared/config.yml

Isi file dengan:

tunnel: UUID-TUNNEL-ANDA
credentials-file: /data/data/com.termux/files/home/.cloudflared/UUID-TUNNEL-ANDA.json

ingress:
  - hostname: drive.domainanda.com
    service: http://localhost:3000
  - service: http_status:404

Simpan konfigurasi.

---

5. Hubungkan DNS

cloudflared tunnel route dns serverquu-tunnel drive.domainanda.com

---

6. Jalankan Tunnel

nohup cloudflared tunnel run serverquu-tunnel > /dev/null 2>&1 &

Sekarang ServerQuu dapat diakses melalui:

https://drive.domainanda.com

---

📁 Struktur Direktori

ServerQuu/
│
├── static/
│   └── logo.png
│
├── config.json
├── db.json
├── server.js
├── package.json
└── node_modules/

---

🛡️ Keamanan

ServerQuu dirancang dengan fokus pada privasi pengguna:

- Kredensial disimpan secara lokal
- Tidak ada penyimpanan data pihak ketiga
- Mendukung HTTPS melalui Cloudflare Tunnel
- Login menggunakan PIN
- Aman digunakan pada jaringan publik

---

🤝 Kontribusi

Kontribusi selalu diterima.

Jika menemukan bug atau memiliki ide pengembangan:

1. Fork repository ini
2. Buat branch baru
3. Lakukan perubahan
4. Buat Pull Request

---

📄 Lisensi

Proyek ini menggunakan lisensi MIT License.

Lihat file "LICENSE" untuk informasi lebih lanjut.

---

👨‍💻 Kredit

Author: Izzuddin Badawi

---

ServerQuu — Privat, Aman, Terpercaya ☁️
