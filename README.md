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

