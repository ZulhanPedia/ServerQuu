
ServerQuu - Multi-Drive Cloud Storage Aggregator ☁️
ServerQuu adalah platform Virtual File System (VFS) dan Cloud Storage Aggregator berbasis Node.js yang didesain khusus agar dapat berjalan secara mandiri, stabil, dan sangat hemat daya di dalam Termux (Android) pada perangkat HP jadul Anda.

Platform ini memungkinkan Anda mendeteksi, menggabungkan, dan mengelola banyak akun Google Drive menjadi satu kesatuan kapasitas raksasa (virtual storage pool) lewat satu antarmuka web premium yang selaras dengan warna identitas logo ServerQuu (Sky Blue & Deep Navy Blue).

⚡ Mengapa ServerQuu Sangat Cepat & Anti-Gagal? (Arsitektur Baru)
Versi terbaru ini menggunakan arsitektur Hybrid Client-Cloud Pipeline yang revolusioner untuk memecahkan batas performa HP jadul:

Direct Client-Side Upload (Upload Tanpa Batas): Proses upload tidak lagi melewati server Termux atau Cloudflare Tunnel Anda (Double Bandwidth Bypass). Browser Anda akan meminta otorisasi ke Termux, lalu mengunggah file langsung ke server Google API. Kecepatan unggah berjalan 100% mengikuti kecepatan internet asli perangkat Anda (bisa tembus ratusan Mbps)!
Auto-Public Permission Conversion: Begitu pengunggahan selesai, server Termux Anda secara otomatis memerintahkan Google Drive API untuk mengubah izin akses berkas tersebut menjadi Publik (Anyone with the link can view).
Direct Google CDN Redirect Download (Anti-CAPTCHA): Saat mengklik tombol Unduh, peramban Anda akan langsung dialihkan (redirect) ke link CDN publik Google Drive (https://drive.google.com/uc?export=download&id=...). Hal ini membuat proses download 100% bebas dari pemblokiran halaman robot Google ("We're sorry..."), aman dari CAPTCHA, dan berjalan dengan kecepatan unduh Google yang sangat kencang.
Memory-Safe Local Storage Fallback: Jika Anda menggunakan akun tiruan (Simulated Account), sistem otomatis menyimpan file fisik asli Anda ke direktori lokal ./drives_data/ di dalam penyimpanan HP server Anda secara aman tanpa ada kerusakan data (corrupt).
🎨 Pembaruan Visual (Standar Desain 2026)
Skema Warna Senada: Seluruh warna aksen (tombol, progress bar, ornamen ombak, dan indikator) menggunakan warna Sky Blue (sky-600) dan Ocean Cyan yang sangat menyatu dengan logo ServerQuu.
Header yang Rapih: Bagian header kiri bersih hanya menampilkan Logo ServerQuu. Informasi Author Izzuddin Badawi diletakkan sangat rapi di bagian kanan atas menggunakan ukuran font mikro yang elegan, tepat berada di atas tombol Kunci Panel.
Gelombang Progres Transparan: Progres upload interaktif yang menampilkan status Uploading (dari browser ke Google) hingga berubah otomatis menjadi Saving to Cloud... ☁️ dengan efek gradien gelombang berdenyut yang indah.
📱 Kebutuhan Sistem di Termux
Jalankan perintah berikut di aplikasi Termux Anda untuk mempersiapkan lingkungan Node.js:

pkg update && pkg upgrade -y
pkg install nodejs git -y
Kloning Repositori & Instalasi
git clone [https://github.com/ZulhanPedia/ServerQuu/](https://github.com/ZulhanPedia/ServerQuu)
cd ServerQuu
npm install
Catatan: Letakkan berkas gambar logo kustom Anda dengan nama logo.png di dalam folder static agar logo ServerQuu termuat sempurna.

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
Bagian 1: Mendapatkan Client ID dan Client Secret
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
Bagian 2: Mendapatkan Refresh Token via OAuth Playground
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
🚀 Cara Menjalankan Aplikasi
Langkah 1: Jalankan Server Node.js
node server.js
Aplikasi berjalan secara lokal di port http://localhost:3000. PIN masuk awal Anda adalah 1234.

Langkah 2: Onlinekan Menggunakan Cloudflare Tunnel (Custom Domain)
Gunakan metode ini agar server di HP jadul Anda dapat diakses secara online dari mana saja dengan domain pribadi Anda sendiri, dilengkapi dengan sertifikat SSL/HTTPS gratis yang aman secara permanen tanpa memerlukan port forwarding:

1. Menghubungkan Domain ke Cloudflare
Pastikan Anda sudah mendaftarkan domain pribadi Anda di Cloudflare Dashboard dan mengarahkan Name Server (NS) domain Anda ke Cloudflare.
2. Install Cloudflared di Termux
Buka sesi Termux baru, lalu jalankan perintah instalasi berikut:

pkg install cloudflared -y
3. Hubungkan Akun Cloudflare ke Termux
Jalankan perintah login berikut:

cloudflared tunnel login
Buka tautan otorisasi yang muncul di browser Anda, pilih domain pribadi Anda, lalu klik Authorize. Berkas sertifikat keamanan cert.pem akan diunduh secara otomatis ke folder ~/.cloudflared/.
4. Buat Tunnel Baru
cloudflared tunnel create serverquu-tunnel
Salin ID Tunnel (UUID) yang muncul di layar Termux (berupa kombinasi panjang huruf dan angka).
5. Konfigurasi config.yml
Buat berkas konfigurasi tunnel di folder Cloudflare:

nano ~/.cloudflared/config.yml
Salin baris konfigurasi berikut (sesuaikan <UUID-TUNNEL-ANDA> dan ganti drive.domainanda.com dengan subdomain pilihan Anda):

tunnel: <UUID-TUNNEL-ANDA>
credentials-file: /data/data/com.termux/files/home/.cloudflared/<UUID-TUNNEL-ANDA>.json

ingress:
  - hostname: drive.domainanda.com
    service: http://localhost:3000
  - service: http_status:404
Simpan dengan menekan Ctrl + O lalu Enter, keluar dari nano dengan Ctrl + X.

6. Daftarkan DNS Record di Cloudflare
Jalankan perintah berikut agar Cloudflare secara otomatis membuat DNS CNAME domain Anda yang mengarah ke tunnel:

cloudflared tunnel route dns serverquu-tunnel drive.domainanda.com
7. Jalankan Tunnel di Latar Belakang (24/7 Online)
Gunakan perintah nohup agar tunnel Anda terus berjalan lancar di background meskipun Termux ditutup atau layar HP Anda mati:

nohup cloudflared tunnel run serverquu-tunnel > /dev/null 2>&1 &
Sekarang, Anda bisa membuka browser di laptop, HP lain, atau PC di luar kota dan mengakses platform penyimpanan virtual Anda dengan aman lewat tautan domain pribadi Anda (misal: https://drive.domainanda.com)!

Hak Cipta & Kontribusi
Author: Izzuddin Badawi
Branding: ZulhanPedia
All rights reserved © Copyright 2026, ZulhanPedia. Created with ♥️ Powered by Gemini & ZulhanPedia.

