<a name="top"></a>

# ServerQuu - Multi-Drive Cloud Storage Aggregator ☁️

ServerQuu adalah platform Virtual File System (VFS) dan Cloud Storage Aggregator berbasis Node.js yang didesain khusus agar dapat berjalan secara mandiri, stabil, dan sangat hemat daya di dalam Termux (Android) pada perangkat HP jadul Anda.

---

### 📍 Navigasi
[Persiapan & Instalasi](#-persiapan--instalasi) • [Berkas Konfigurasi](#berkas-konfigurasi) • [Panduan Kredensial](#panduan-mendapatkan-kredensial-google-drive-api) • [Cara Menjalankan](#cara-menjalankan-aplikasi) • [Hak Cipta](#hak-cipta--kontribusi)

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
### Bagian 1: Setup Google Cloud Project & API Kredensial

1. **Buat Proyek Baru**
   * Masuk ke Google Cloud Console.
   * Buat proyek baru (*Create Project*) dengan nama bebas (misal: `ServerQuu-Aggregator`).

2. **Aktifkan Google Drive API**
   * Cari **Google Drive API** di kolom pencarian utama.
   * Klik **Enable** (Aktifkan).

3. **Konfigurasi OAuth Consent Screen**
   * Pilih menu **OAuth Consent Screen** (Layar Persetujuan OAuth) di bilah sebelah kiri.
   * Pilih tipe user **External**, lalu klik **Create**.
   * Lengkapi kolom yang wajib diisi: *Nama Aplikasi*, *Email Dukungan*, dan *Email Developer*.

4. **Atur Test Users (Penting!)**
   * Pada halaman **Test Users**, klik **Add Users**.
   * Masukkan alamat email Google Drive yang ingin Anda gunakan. 
   > ⚠️ **WAJIB:** Langkah ini harus dilakukan agar API Anda mendapatkan izin akses selama status proyek masih dalam mode *Testing*.

5. **Buat Kredensial (OAuth Client ID)**
   * Pilih menu **Credentials** (Kredensial) di bilah sebelah kiri.
   * Klik tombol **+ Create Credentials** -> pilih **OAuth Client ID**.
   * Pilih tipe aplikasi: **Desktop Application** (Aplikasi Desktop).
   * Klik **Create**.
   * Salin dan simpan nilai **Client ID** dan **Client Secret** Anda.

---

### Bagian 2: Mendapatkan Refresh Token via OAuth Playground

1. **Buka OAuth Playground**
   * Akses halaman [Google OAuth Playground](https://developers.google.com/oauthplayground/).

2. **Konfigurasi Kredensial Kustom**
   * Klik tombol **Gear** (Settings Icon) di pojok kanan atas.
   * Centang pilihan **Use your own OAuth credentials**.
   * Masukkan **OAuth Client ID** dan **OAuth Client Secret** yang sudah Anda buat di Bagian 1.

3. **Otorisasi API (Step 1)**
   * Di panel sebelah kiri (**Step 1: Select & authorize APIs**), masukkan scope berikut di kolom input:
     `https://www.googleapis.com/auth/drive`
   * Klik tombol hijau **Authorize APIs**.
   * Login menggunakan akun Google Drive Anda dan setujui semua izin keamanan yang diminta.

4. **Tukarkan Kode dengan Token (Step 2)**
   * Pada **Step 2**, klik tombol biru **Exchange authorization code for tokens**.
   * Salin nilai **Refresh Token** yang dihasilkan di panel bawah.
   * Masukkan nilai tersebut ke dalam file `config.json` Anda.

🚀 Cara Menjalankan Aplikasi
Langkah 1: Jalankan Server Node.js
node server.js

Aplikasi berjalan secara lokal di port http://localhost:3000. PIN masuk awal Anda adalah 1234.
Langkah 2: Onlinekan Menggunakan Cloudflare Tunnel (Custom Domain)
Gunakan metode ini agar server di HP jadul Anda dapat diakses secara online dari mana saja dengan domain pribadi Anda sendiri, dilengkapi dengan sertifikat SSL/HTTPS gratis yang aman secara permane## Panduan Konfigurasi Google Drive API & Refresh Token

Ikuti langkah-langkah di bawah ini untuk melakukan setup Google Cloud Project dan mendapatkan kredensial yang dibutuhkan.
n tanpa memerlukan port forwarding:
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


