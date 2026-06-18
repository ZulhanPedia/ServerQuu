<a name="top"></a>

# ServerQuu - Multi-Drive Cloud Storage Aggregator ☁️

ServerQuu adalah platform Virtual File System (VFS) dan Cloud Storage Aggregator berbasis Node.js yang didesain khusus agar dapat berjalan secara mandiri, stabil, dan sangat hemat daya di dalam Termux (Android) pada perangkat HP jadul Anda.

---

### 📍 Navigasi
[Persiapan & Instalasi](#-persiapan--instalasi) • [Berkas Konfigurasi](#%EF%B8%8F-berkas-konfigurasi) • [Panduan Kredensial](#-panduan-mendapatkan-kredensial-google-drive-api) • [Cara Menjalankan](#-cara-menjalankan-aplikasi) • [Hak Cipta](#-hak-cipta--kontribusi)

---

## 🛠️ Persiapan & Instalasi

1. **Persiapan Lingkungan Node.js**  
   Jalankan perintah berikut di aplikasi Termux Anda:
```bash
   pkg update && pkg upgrade -y
   pkg install nodejs git -y
   git clone [https://github.com/ZulhanPedia/ServerQuu](https://github.com/ZulhanPedia/ServerQuu)
   cd ServerQuu
   npm install
💡 Catatan: Letakkan berkas gambar logo kustom Anda dengan nama logo.png di dalam folder static agar logo ServerQuu termuat sempurna.
↑ Kembali ke atas

⚙️ Berkas Konfigurasi
1. config.json (Konfigurasi Akun)
Kredensial Google Drive disimpan di file ini secara rahasia agar aman dari intipan browser web:
[
  {
    "id": 1,
    "email": "akun_utama@gmail.com",
    "client_id": "CLIENT_ID_GOOGLE_ANDA",
    "client_secret": "CLIENT_SECRET_GOOGLE_ANDA",
    "refresh_token": "REFRESH_TOKEN_AKUN_TERSEBUT"
  }
]

2. db.json (Database Virtual)
Buat file ini di direktori yang sama dengan isi awal sebagai berikut:
{
  "pin": "1234",
  "files": [],
  "logs": []
}


🔑 Panduan Mendapatkan Kredensial Google Drive API
<details>
<summary><b>Bagian 1: Mendapatkan Client ID dan Client Secret (Klik untuk Ekspand)</b></summary>
Buka Google Cloud Console.
Buat proyek baru (Create Project) dengan nama bebas (misal: ServerQuu-Aggregator).
Cari Google Drive API di kolom pencarian, lalu klik Enable (Aktifkan).
Pilih menu OAuth Consent Screen (Layar Persetujuan OAuth) di sebelah kiri:
Pilih tipe user External, klik Create.
Lengkapi kolom nama aplikasi, email dukungan, dan email developer.
Pada halaman Test Users, klik Add Users dan masukkan alamat email Google Drive yang ingin Anda gunakan. (Langkah ini WAJIB agar API Anda mendapat izin akses).
Pilih menu Credentials (Kredensial) di sebelah kiri:
Klik tombol + Create Credentials -> pilih OAuth Client ID.
Pilih tipe aplikasi: Desktop Application (Aplikasi Desktop).
Klik Create, lalu salin nilai Client ID dan Client Secret Anda.
</details>
<details>
<summary><b>Bagian 2: Mendapatkan Refresh Token via OAuth Playground (Klik untuk Ekspand)</b></summary>
Buka halaman Google OAuth Playground.
Klik tombol Gear (Settings Icon) di pojok kanan atas:
Centang pilihan Use your own OAuth credentials.
Masukkan OAuth Client ID dan OAuth Client Secret yang Anda buat tadi.
Di panel sebelah kiri (Step 1: Select & authorize APIs):
Masukkan scope: https://www.googleapis.com/auth/drive
Klik tombol hijau Authorize APIs.
Login menggunakan email Google Drive Anda dan setujui semua izin keamanan yang diminta.
Pada Step 2:
Klik tombol biru Exchange authorization code for tokens.
Salin nilai Refresh Token yang dihasilkan di panel bawah, lalu masukkan ke dalam config.json.
</details>
↑ Kembali ke atas

🚀 Cara Menjalankan Aplikasi
Langkah 1: Jalankan Server Node.js
node server.js

Aplikasi berjalan secara lokal di port http://localhost:3000. PIN masuk awal Anda adalah 1234.
Langkah 2: Onlinekan Menggunakan Cloudflare Tunnel (Custom Domain)
Gunakan metode ini agar server di HP jadul Anda dapat diakses secara online dari mana saja dengan domain pribadi Anda sendiri, dilengkapi dengan sertifikat SSL/HTTPS gratis yang aman secara permanen tanpa memerlukan port forwarding:
Menghubungkan Domain ke Cloudflare
Pastikan Anda sudah mendaftarkan domain pribadi Anda di Cloudflare Dashboard dan mengarahkan Name Server (NS) domain Anda ke Cloudflare.
Install Cloudflared di Termux
Buka sesi Termux baru, lalu jalankan perintah instalasi berikut:
   pkg install cloudflared -y
   cloudflared tunnel login
Buka tautan otorisasi yang muncul di browser Anda, pilih domain pribadi Anda, lalu klik Authorize. Berkas sertifikat keamanan cert.pem akan diunduh secara otomatis ke folder ~/.cloudflared/.

Buat Tunnel Baru
   nano ~/.cloudflared/config.yml

Salin ID Tunnel (UUID) yang muncul di layar Termux (berupa kombinasi panjang huruf dan angka).
Konfigurasi config.yml
Buat berkas konfigurasi tunnel di folder Cloudflare:
   nano ~/.cloudflared/config.yml
Salin baris konfigurasi berikut (sesuaikan <UUID-TUNNEL-ANDA> dan ganti drive.domainanda.com dengan subdomain pilihan Anda):
   tunnel: <UUID-TUNNEL-ANDA>
   credentials-file: /data/data/com.termux/files/home/.cloudflared/<UUID-TUNNEL-ANDA>.json

   ingress:
  - hostname: Sub.domaain.kamu
    service: http://localhost:3000
  - service: http_status:404


