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

Ikuti proses otorisasi melalui browser hingga file sertifikat berhasil dibuat.

---

4. Buat Tunnel Baru

cloudflared tunnel create serverquu-tunnel

Simpan UUID tunnel yang ditampilkan.

---

5. Buat File Konfigurasi Tunnel

nano ~/.cloudflared/config.yml

Isi dengan konfigurasi berikut:

tunnel: <UUID-TUNNEL-ANDA>
credentials-file: /data/data/com.termux/files/home/.cloudflared/<UUID-TUNNEL-ANDA>.json

ingress:
  - hostname: drive.domainanda.com
    service: http://localhost:3000
  - service: http_status:404

Simpan file lalu keluar dari editor.

---

6. Buat DNS Record Otomatis

cloudflared tunnel route dns serverquu-tunnel drive.domainanda.com

---

7. Jalankan Tunnel di Background

nohup cloudflared tunnel run serverquu-tunnel > /dev/null 2>&1 &

Sekarang ServerQuu dapat diakses secara aman menggunakan domain pribadi Anda:

https://drive.domainanda.com

---

📂 Struktur Berkas

ServerQuu/
├── static/
│   └── logo.png
├── config.json
├── db.json
├── server.js
├── package.json
└── node_modules/

---

🛡️ Keamanan

- Kredensial tidak disimpan di browser.
- Mendukung HTTPS melalui Cloudflare Tunnel.
- Login menggunakan PIN.
- Data akun disimpan secara lokal.
- Tidak memerlukan port forwarding.

---

🤝 Kontribusi

Kontribusi, perbaikan bug, dan pengembangan fitur baru sangat diterima. Silakan lakukan fork repository ini dan kirimkan Pull Request.

---

📜 Lisensi

Copyright © 2026 ZulhanPedia

Author: Izzuddin Badawi
Branding: ZulhanPedia

Dibuat dengan ❤️ menggunakan Node.js, Google Drive API, Cloudflare Tunnel, dan Termux.
