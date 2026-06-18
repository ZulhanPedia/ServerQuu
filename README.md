☁️ ServerQuu

<p align="center">
  <img src="static/logo.png" alt="ServerQuu Logo" width="200">
</p><p align="center">
  <strong>Multi-Drive Cloud Storage Aggregator</strong><br>
  Privat • Aman • Terpercaya
</p><p align="center">
  <img src="https://img.shields.io/badge/Node.js-18+-green?style=for-the-badge">
  <img src="https://img.shields.io/badge/Platform-Termux-blue?style=for-the-badge">
  <img src="https://img.shields.io/badge/Google%20Drive-API-orange?style=for-the-badge">
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge">
</p>---

📖 Tentang ServerQuu

ServerQuu adalah platform Virtual File System (VFS) dan Multi-Drive Cloud Storage Aggregator berbasis Node.js yang memungkinkan beberapa akun Google Drive digabungkan ke dalam satu sistem penyimpanan virtual.

ServerQuu dirancang khusus agar dapat berjalan dengan stabil pada Termux Android, sehingga perangkat Android lama dapat dimanfaatkan sebagai server cloud pribadi yang ringan dan hemat daya.

---

✨ Fitur

- ☁️ Multi Google Drive Aggregator
- 📂 Virtual File System (VFS)
- 📱 Berjalan di Android menggunakan Termux
- 🔒 Login menggunakan PIN
- 📊 Activity Logging
- ⚡ Ringan dan hemat daya
- 🌐 Akses online menggunakan Cloudflare Tunnel
- 🔐 HTTPS gratis tanpa port forwarding
- 🏠 Cocok untuk cloud storage pribadi

---

📋 Persyaratan

Sebelum memulai, pastikan Anda memiliki:

- Android dengan aplikasi Termux
- Node.js versi 18 atau lebih baru
- Git
- Akun Google Drive
- Akun Cloudflare (opsional)
- Domain pribadi (opsional)

---

🚀 Instalasi

1. Persiapan Lingkungan
 ```
pkg update && pkg upgrade -y
pkg install nodejs git -y
```
2. Clone Repository
```
git clone https://github.com/ZulhanPedia/ServerQuu

cd ServerQuu

npm install
```

3. Logo Kustom (Opsional)

Letakkan file berikut:

logo.png

ke dalam folder:

static/

---


🔑 Google Drive API

Membuat Client ID dan Client Secret

1. Buka Google Cloud Console.
2. Buat project baru.
3. Aktifkan Google Drive API.
4. Buka menu OAuth Consent Screen.
5. Pilih tipe pengguna External.
6. Lengkapi informasi aplikasi.
7. Tambahkan akun Google pada bagian Test Users.
8. Buka menu Credentials.
9. Klik Create Credentials → OAuth Client ID.
10. Pilih Desktop Application.
11. Simpan Client ID dan Client Secret.

---

Mendapatkan Refresh Token

1. Buka Google OAuth Playground.
2. Klik ikon Settings (⚙️).
3. Aktifkan Use your own OAuth credentials.
4. Masukkan Client ID dan Client Secret.

Gunakan scope berikut:

https://www.googleapis.com/auth/drive

5. Klik Authorize APIs.
6. Login menggunakan akun Google.
7. Berikan izin yang diminta.
8. Klik Exchange authorization code for tokens.
9. Salin Refresh Token yang dihasilkan.
10. Masukkan ke dalam file "config.json".

---

▶️ Menjalankan Server

Jalankan aplikasi:

node server.js

Server akan berjalan pada:

http://localhost:3000

PIN bawaan:

1234

Disarankan untuk segera mengganti PIN setelah instalasi pertama.

---

🌐 Cloudflare Tunnel

Instalasi Cloudflared
```

pkg install cloudflared -y
```

Login ke Cloudflare

```
cloudflared tunnel login

```
Ikuti proses otorisasi hingga berhasil.

Membuat Tunnel (bisa diganti sesuai keinginan)
```

cloudflared tunnel create servertermux  <= ganti 
```

Catat UUID yang dihasilkan.

Membuat Konfigurasi Tunnel

Buat file:

```
nano ~/.cloudflared/config.yml
```

Isi dengan konfigurasi berikut:

```yaml
tunnel: UUID-TUNNEL-ANDA
credentials-file: /data/data/com.termux/files/home/.cloudflared/UUID-TUNNEL-ANDA.json

ingress:
  - hostname: drive.domainanda.com
    service: http://localhost:3000
  - service: http_status:404
```

Membuat DNS Record
```

cloudflared tunnel route dns serverquu-tunnel drive.domainanda.com
```
Menjalankan Tunnel
```
nohup cloudflared tunnel run serverquu-tunnel > /dev/null 2>&1 &
```
Sekarang ServerQuu dapat diakses melalui:
```
https://drive.domainanda.com
```
---

📁 Struktur Direktori
```teks
ServerQuu/
├── static/
│   └── logo.png
├── config.json
├── db.json
├── server.js
├── package.json
├── package-lock.json
└── node_modules/
```
---

🛡️ Keamanan

- Kredensial disimpan secara lokal
- Tidak menggunakan penyimpanan pihak ketiga
- Mendukung HTTPS melalui Cloudflare Tunnel
- Login menggunakan PIN
- Aman digunakan pada jaringan publik
---

📄 Lisensi

Project ini menggunakan lisensi MIT License.

---

👨‍💻 Kredit

Author: Izzuddin Badawi
Branding: ZulhanPedia

Dibuat menggunakan:

- Node.js
- Google Drive API
- Cloudflare Tunnel
- Termux

---

<p align="center">
  <strong>☁️ ServerQuu — Privat, Aman, Terpercaya</strong>
</p>
