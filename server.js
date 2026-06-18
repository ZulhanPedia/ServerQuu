const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { google } = require('googleapis');

const app = express();
const PORT = process.env.PORT || 3000;

// Membuat folder 'tmp' otomatis untuk menampung sementara file upload lokal (fallback simulated)
const tmpDir = path.join(__dirname, 'tmp');
if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
}

// Folder penyimpanan lokal untuk akun bersimulasi agar tidak corrupt
const drivesDataDir = path.join(__dirname, 'drives_data');
if (!fs.existsSync(drivesDataDir)) {
    fs.mkdirSync(drivesDataDir, { recursive: true });
}

// Konfigurasi Multer Engine untuk performa tinggi file besar (lokal simulated fallback)
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, tmpDir),
    filename: (req, file, cb) => cb(null, 'up-' + Date.now() + path.extname(file.originalname))
});
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 * 1024 } // Mendukung berkas hingga 10 GB
});

const DB_FILE = path.join(__dirname, 'db.json');
const CONFIG_FILE = path.join(__dirname, 'config.json');

// Inisialisasi Database Lokal & File Config Otomatis
function initDatabase() {
    if (!fs.existsSync(DB_FILE)) {
        const defaultDb = {
            pin: "1234", 
            files: [],
            logs: [{ timestamp: new Date().toISOString(), message: "Sistem ServerQuu berhasil diaktifkan." }]
        };
        fs.writeFileSync(DB_FILE, JSON.stringify(defaultDb, null, 2));
    }
    if (!fs.existsSync(CONFIG_FILE)) {
        const defaultConfig = [
            { id: 1, email: "akun14@gmail.com", client_id: "CLIENT_ID_KAMU", client_secret: "CLIENT_SECRET_KAMU", refresh_token: "REFRESH_TOKEN_AKUN_14" }
        ];
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));
    }
}
initDatabase();

// Fungsi membaca & menulis database lokal dengan penanganan proteksi crash
function readDb() { 
    try {
        return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); 
    } catch (e) {
        return { pin: "1234", files: [], logs: [] };
    }
}

function writeDb(data) { 
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8'); 
    } catch (e) {
        console.error("Gagal memperbarui db.json:", e.message);
    }
}

function readAccountsConfig() {
    try { return fs.existsSync(CONFIG_FILE) ? JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) : []; }
    catch (e) { return []; }
}

function addLog(message) {
    const db = readDb();
    db.logs.unshift({ timestamp: new Date().toISOString(), message });
    if (db.logs.length > 50) db.logs.pop(); 
    writeDb(db);
}

// Helper untuk deteksi apakah akun bersifat simulasi atau menggunakan API Google asli
function isSimulatedAccount(acc) {
    return !acc.client_id || !acc.refresh_token || 
           acc.client_id.includes("KAMU") || acc.client_id.includes("CONTOH") ||
           acc.refresh_token.includes("REFRESH_TOKEN");
}

app.use(express.json({ limit: '10gb' }));
app.use(express.urlencoded({ limit: '10gb', extended: true }));
app.use('/static', express.static(path.join(__dirname, 'static')));

// === KOORDINASI STATUS PENYIMPANAN DRIVES ===
async function dapatkanKapasitasAkun(acc) {
    if (isSimulatedAccount(acc)) {
        const db = readDb();
        const virtualUsage = db.files.filter(f => f.accountEmail === acc.email).reduce((sum, f) => sum + f.size, 0);
        return {
            limit: 15 * 1024 * 1024 * 1024,
            usage: Math.min(virtualUsage, 15 * 1024 * 1024 * 1024),
            type: "Simulated"
        };
    }
    try {
        const oAuth = new google.auth.OAuth2(acc.client_id, acc.client_secret, "urn:ietf:wg:oauth:2.0:oob");
        oAuth.setCredentials({ refresh_token: acc.refresh_token });
        const drive = google.drive({ version: 'v3', auth: oAuth });
        const res = await drive.about.get({ fields: 'storageQuota' });
        return {
            limit: parseInt(res.data.storageQuota.limit) || (15 * 1024 * 1024 * 1024),
            usage: parseInt(res.data.storageQuota.usage) || 0,
            type: "Google API Live"
        };
    } catch (e) {
        return { limit: 15 * 1024 * 1024 * 1024, usage: 0, type: `Offline (${e.response?.data?.error || e.message})` };
    }
}

// === API ROUTING ===
app.post('/api/verify-pin', (req, res) => {
    const db = readDb();
    if (req.body.pin === db.pin) return res.json({ success: true });
    res.status(401).json({ success: false });
});

app.post('/api/change-pin', (req, res) => {
    const db = readDb();
    if (req.body.oldPin !== db.pin) return res.status(400).json({ success: false, message: "PIN lama salah!" });
    db.pin = req.body.newPin;
    writeDb(db);
    addLog("PIN keamanan administrator diperbarui.");
    res.json({ success: true });
});

app.get('/api/status', async (req, res) => {
    const accounts = readAccountsConfig();
    const db = readDb();
    let totalLimit = 0, totalUsage = 0;
    for (const acc of accounts) {
        const info = await dapatkanKapasitasAkun(acc);
        totalLimit += info.limit;
        totalUsage += info.usage;
    }
    res.json({ totalLimit, totalUsage, totalFree: Math.max(0, totalLimit - totalUsage), accountsCount: accounts.length, filesCount: db.files.length });
});

app.get('/api/accounts', async (req, res) => {
    const accounts = readAccountsConfig();
    const result = [];
    for (const acc of accounts) {
        const info = await dapatkanKapasitasAkun(acc);
        result.push({ id: acc.id, email: acc.email, limit: info.limit, usage: info.usage, type: info.type });
    }
    res.json(result);
});

// API untuk Menambahkan Akun Baru Langsung ke config.json dari Web UI
app.post('/api/config/accounts/add', (req, res) => {
    const { email, client_id, client_secret, refresh_token } = req.body;
    if (!email || !client_id || !client_secret || !refresh_token) {
        return res.status(400).json({ success: false, message: "Semua kolom formulir wajib diisi!" });
    }
    const accounts = readAccountsConfig();
    if (accounts.some(acc => acc.email.toLowerCase() === email.toLowerCase())) {
        return res.status(400).json({ success: false, message: "Email ini sudah terdaftar di config.json!" });
    }
    const nextId = accounts.length > 0 ? Math.max(...accounts.map(a => a.id)) + 1 : 1;
    accounts.push({ id: nextId, email, client_id, client_secret, refresh_token });
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(accounts, null, 2), 'utf8');
        addLog(`Akun baru ditambahkan ke config.json: ${email}`);
        res.json({ success: true, message: `Akun ${email} berhasil ditambahkan.` });
    } catch (e) {
        res.status(500).json({ success: false, message: `Gagal menyimpan ke config.json: ${e.message}` });
    }
});

// API untuk Menghapus Akun dari config.json
app.delete('/api/config/accounts/:email', (req, res) => {
    const { email } = req.params;
    let accounts = readAccountsConfig();
    const initialLength = accounts.length;
    accounts = accounts.filter(acc => acc.email.toLowerCase() !== email.toLowerCase());
    if (accounts.length === initialLength) {
        return res.status(404).json({ success: false, message: "Akun tidak ditemukan di config.json." });
    }
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(accounts, null, 2), 'utf8');
        // Hapus juga file virtual yang terasosiasi dengan akun tersebut dari db.json
        const db = readDb();
        db.files = db.files.filter(f => f.accountEmail.toLowerCase() !== email.toLowerCase());
        writeDb(db);
        addLog(`Akun dihapus dari config.json: ${email}`);
        res.json({ success: true, message: `Akun ${email} berhasil dihapus.` });
    } catch (e) {
        res.status(500).json({ success: false, message: `Gagal memperbarui config.json: ${e.message}` });
    }
});

app.get('/api/files', (req, res) => res.json(readDb().files));

// ENGINE: INISIALISASI UNTUK CLIENT-SIDE DIRECT UPLOAD KE GOOGLE
app.post('/api/upload/init', async (req, res) => {
    const { name, size } = req.body;
    if (!name || !size) return res.status(400).json({ success: false, message: "Data inisialisasi tidak lengkap." });

    const accounts = readAccountsConfig();
    if (accounts.length === 0) return res.status(400).json({ success: false, message: "Tidak ada drive terdaftar." });

    const accountsWithQuota = [];
    for (const acc of accounts) {
        const info = await dapatkanKapasitasAkun(acc);
        accountsWithQuota.push({ ...acc, ...info });
    }

    let targetAccount = null;
    for (const acc of accountsWithQuota) {
        const freeSpace = acc.limit - acc.usage;
        if (size <= freeSpace) {
            targetAccount = acc;
            break;
        }
    }

    if (!targetAccount) {
        return res.status(400).json({ success: false, message: "Penyimpanan penuh di semua Drive Anda!" });
    }

    if (isSimulatedAccount(targetAccount)) {
        return res.json({ success: true, simulated: true, email: targetAccount.email });
    }

    try {
        const oAuth = new google.auth.OAuth2(targetAccount.client_id, targetAccount.client_secret, "urn:ietf:wg:oauth:2.0:oob");
        oAuth.setCredentials({ refresh_token: targetAccount.refresh_token });
        const tokenRes = await oAuth.getAccessToken();
        
        res.json({
            success: true,
            simulated: false,
            email: targetAccount.email,
            accessToken: tokenRes.token
        });
    } catch (e) {
        res.status(500).json({ success: false, message: `Otorisasi gagal: ${e.message}` });
    }
});

// ENGINE: KONFIRMASI UPLOAD + AUTO CONVERT FILE TO PUBLIC ACCESS ON GOOGLE DRIVE
app.post('/api/upload/confirm', async (req, res) => {
    const { name, size, mimeType, accountEmail, googleDriveFileId } = req.body;
    const db = readDb();
    const accounts = readAccountsConfig();
    const targetAccount = accounts.find(a => a.email === accountEmail);

    if (!targetAccount) {
        return res.status(400).json({ success: false, message: "Akun asal tidak ditemukan." });
    }

    try {
        // Otomatis ubah izin berkas Google Drive menjadi Publik
        if (!isSimulatedAccount(targetAccount)) {
            const oAuth = new google.auth.OAuth2(targetAccount.client_id, targetAccount.client_secret, "urn:ietf:wg:oauth:2.0:oob");
            oAuth.setCredentials({ refresh_token: targetAccount.refresh_token });
            const drive = google.drive({ version: 'v3', auth: oAuth });

            // Membuat ijin akses "anyone with link can read"
            await drive.permissions.create({
                fileId: googleDriveFileId,
                requestBody: {
                    role: 'reader',
                    type: 'anyone'
                }
            });
            addLog(`Berkas "${name}" berhasil diubah menjadi akses publik di awan.`);
        }

        const fileId = "vfile_" + Date.now();
        db.files.unshift({
            id: fileId,
            name,
            size: parseInt(size),
            mimeType: mimeType || "application/octet-stream",
            accountEmail,
            googleDriveFileId,
            date: new Date().toISOString()
        });
        
        writeDb(db);
        addLog(`Berkas "${name}" terdaftar dalam database virtual ServerQuu.`);
        res.json({ success: true });
    } catch (e) {
        addLog(`Gagal merubah izin akses berkas di Google: ${e.message}`);
        res.status(500).json({ success: false, message: `Gagal merubah status izin publik: ${e.message}` });
    }
});

// Fallback upload lokal jika akun yang dipilih adalah Simulated
app.post('/api/upload/local', upload.single('file'), (req, res) => {
    const { email } = req.body;
    if (!req.file || !email) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(400).json({ success: false, message: "Pengunggahan simulated gagal." });
    }

    const accountFolder = path.join(drivesDataDir, email);
    if (!fs.existsSync(accountFolder)) {
        fs.mkdirSync(accountFolder, { recursive: true });
    }

    const fileId = "vfile_" + Date.now();
    const permanentPath = path.join(accountFolder, fileId + path.extname(req.file.originalname));
    fs.renameSync(req.file.path, permanentPath);

    const db = readDb();
    db.files.unshift({
        id: fileId,
        name: req.file.originalname,
        size: req.file.size,
        mimeType: req.file.mimetype || "application/octet-stream",
        accountEmail: email,
        googleDriveFileId: "local_storage_file",
        localFilePath: permanentPath,
        date: new Date().toISOString()
    });
    writeDb(db);

    addLog(`Berkas "${req.file.originalname}" disimpan secara lokal di [${email}]`);
    res.json({ success: true });
});

// LOGIKA UNDUH: Redirect browser langsung ke Google CDN (Bypass Termux) tanpa limitasi kecepatan
app.get('/api/download/:id', async (req, res) => {
    const db = readDb();
    const file = db.files.find(f => f.id === req.params.id);
    if (!file) return res.status(404).send("Berkas tidak ditemukan.");

    // Kasus 1: Mengunduh file dari emulator lokal (Penyimpanan Fisik HP Jadul Anda)
    if (file.localFilePath && fs.existsSync(file.localFilePath)) {
        addLog(`Mentransfer berkas lokal: ${file.name}`);
        res.setHeader('Content-disposition', 'attachment; filename="' + encodeURIComponent(file.name) + '"');
        res.setHeader('Content-type', file.mimeType || 'application/octet-stream');
        res.setHeader('Content-Length', file.size);
        const readStream = fs.createReadStream(file.localFilePath);
        readStream.pipe(res);
        return;
    }

    // Kasus 2: REDIRECT ULTRA CEPAT - Langsung dilempar ke CDN Publik Google Drive (Bypass Termux & Tanpa CAPTCHA!)
    const accounts = readAccountsConfig();
    const acc = accounts.find(a => a.email === file.accountEmail);
    if (acc && !isSimulatedAccount(acc)) {
        addLog(`Mengarahkan browser langsung ke Google CDN publik: ${file.name}`);
        const directGoogleUrl = `https://drive.google.com/uc?export=download&id=${file.googleDriveFileId}`;
        return res.redirect(directGoogleUrl);
    }

    res.status(404).send("Data fisik tidak ditemukan di penyimpanan.");
});

// Hapus Berkas Fisik Asli
app.delete('/api/files/:id', async (req, res) => {
    const db = readDb();
    const fileIndex = db.files.findIndex(f => f.id === req.params.id);
    if (fileIndex === -1) return res.status(404).json({ success: false });

    const file = db.files[fileIndex];

    try {
        if (file.localFilePath && fs.existsSync(file.localFilePath)) {
            fs.unlinkSync(file.localFilePath);
        }

        const accounts = readAccountsConfig();
        const acc = accounts.find(a => a.email === file.accountEmail);
        if (acc && !isSimulatedAccount(acc)) {
            const oAuth = new google.auth.OAuth2(acc.client_id, acc.client_secret, "urn:ietf:wg:oauth:2.0:oob");
            oAuth.setCredentials({ refresh_token: acc.refresh_token });
            const drive = google.drive({ version: 'v3', auth: oAuth });
            await drive.files.delete({ fileId: file.googleDriveFileId });
        }
    } catch (e) {
        addLog(`Catatan hapus API: ${e.message}`);
    }

    db.files.splice(fileIndex, 1);
    writeDb(db);
    addLog(`Berkas "${file.name}" dibersihkan permanen.`);
    res.json({ success: true });
});

app.get('/api/logs', (req, res) => res.json(readDb().logs));

// === WEB INTERFACE (HTML/CSS/JS) ===
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ServerQuu - Panel</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        body {
            font-family: 'Plus Jakarta Sans', sans-serif;
            background-color: #fcfcfd;
            -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; user-select: none;
        }
        input { -webkit-user-select: text !important; -moz-user-select: text !important; user-select: text !important; }
        .custom-shadow { box-shadow: 0px 4px 20px rgba(0, 0, 0, 0.02); }
        
        @keyframes waveAnimation {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
        }
        .wave-progress {
            background: linear-gradient(-45deg, rgba(2, 132, 199, 0.12), rgba(56, 189, 248, 0.28), rgba(2, 132, 199, 0.12));
            background-size: 300% 300%;
            animation: waveAnimation 2s ease infinite;
        }
    </style>
</head>
<body class="text-slate-800 antialiased min-h-screen flex flex-col justify-between">

    <!-- OVERLAY POP UP PIN KEAMANAN -->
    <div id="pinOverlay" class="fixed inset-0 bg-slate-900/40 backdrop-blur-xl z-50 flex items-center justify-center p-4 transition-all duration-300">
        <div class="bg-white rounded-3xl p-8 max-w-sm w-full border border-slate-100 shadow-2xl text-center">
            <div class="mb-5 flex justify-center">
                <img id="loginLogo" src="/static/logo.png" alt="Logo" class="h-16 w-auto object-contain hidden" onerror="this.remove(); document.getElementById('loginFallbackIcon').classList.remove('hidden');">
                <div id="loginFallbackIcon" class="w-16 h-16 bg-sky-50 text-sky-600 rounded-2xl flex items-center justify-center text-3xl shadow-inner">🔐</div>
            </div>
            <h2 class="text-2xl font-bold text-slate-900 mb-2">Akses Terkunci</h2>
            <p class="text-slate-500 text-sm mb-6">Masukkan PIN keamanan untuk mengelola Multi-Drive.</p>
            <div class="mb-6">
                <input type="password" id="pinInput" placeholder="••••" maxlength="8" class="w-full text-center text-3xl tracking-widest font-bold py-3 px-4 border-2 border-slate-100 rounded-2xl focus:outline-none focus:border-sky-600 focus:ring-4 focus:ring-sky-100 transition-all bg-slate-50/50" autofocus>
                <div id="pinError" class="text-rose-500 text-sm mt-3 font-semibold hidden">PIN salah!</div>
            </div>
            <button onclick="submitPin()" class="w-full bg-sky-600 hover:bg-sky-700 text-white font-semibold py-4 rounded-2xl transition-all shadow-lg active:scale-95">Buka Kunci Akses</button>
        </div>
    </div>

    <!-- MAIN PANEL -->
    <div id="mainDashboard" class="hidden flex-grow pb-12">
        <header class="bg-white border-b border-slate-100 sticky top-0 z-40 backdrop-blur-md bg-white/95">
            <div class="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
                
                <!-- Logo Minimalis di Sebelah Kiri -->
                <div class="flex items-center">
                    <img id="headerLogo" src="/static/logo.png" alt="ServerQuu" class="h-10 w-auto object-contain" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%2240%22 viewBox=%220 0 120 40%22><rect width=%22120%22 height=%2240%22 rx=%228%22 fill=%22%230284C7%22/><text x=%2250%%22 y=%2255%%22 fill=%22white%22 font-family=%22sans-serif%22 font-size=%2216%22 font-weight=%22bold%22 text-anchor=%22middle%22 dominant-baseline=%22middle%22>ServerQuu</text></svg>';">
                </div>
                
                <!-- SISI KANAN HEADER: Author Badge Kecil di atas Kunci Panel -->
                <div class="flex flex-col items-end gap-1">
                    <span class="inline-flex items-center gap-1 bg-sky-50 text-sky-700 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border border-sky-100/30">
                        <span class="w-1.5 h-1.5 bg-sky-500 rounded-full animate-pulse"></span>
                        Author: Izzuddin Badawi
                    </span>
                    <button onclick="lockSystem()" class="text-slate-500 hover:text-rose-600 px-2.5 py-1 hover:bg-rose-50 rounded-lg transition-all font-medium text-[11px] border border-slate-100 hover:border-rose-100 flex items-center gap-1 mt-0.5">
                        🔒 Kunci Panel
                    </button>
                </div>
            </div>
        </header>

        <main class="max-w-6xl mx-auto px-4 mt-8">
            <section class="bg-gradient-to-br from-sky-950 via-slate-900 to-slate-950 rounded-3xl p-6 sm:p-8 text-white shadow-xl mb-8 relative overflow-hidden">
                <div class="absolute right-0 top-0 translate-x-1/4 -translate-y-1/4 w-80 h-80 bg-sky-500/10 rounded-full blur-3xl"></div>
                <div class="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
                    <div class="md:col-span-2">
                        <p class="text-sky-200 text-xs font-semibold tracking-widest uppercase mb-1">TOTAL STORAGE GABUNGAN (VIRTUAL POOL)</p>
                        <h2 id="totalCapText" class="text-3xl sm:text-4xl font-black mb-3">0 GB / 0 GB</h2>
                        <div class="w-full bg-slate-950 rounded-full h-3 mb-2 p-0.5 overflow-hidden">
                            <div id="capProgressBar" class="bg-gradient-to-r from-sky-400 to-cyan-300 h-full rounded-full transition-all" style="width: 0%"></div>
                        </div>
                        <p class="text-slate-400 text-xs" id="capPercentageText">0% terpakai</p>
                    </div>
                    <div class="grid grid-cols-2 gap-4 border-t border-slate-800 md:border-t-0 md:border-l md:border-slate-800 md:pl-6 pt-6 md:pt-0 text-center sm:text-left">
                        <div>
                            <span class="block text-slate-400 text-xs">Drive Terhubung</span>
                            <span id="statAccounts" class="text-2xl font-bold">0</span>
                        </div>
                        <div>
                            <span class="block text-slate-400 text-xs">File Tersimpan</span>
                            <span id="statFiles" class="text-2xl font-bold">0</span>
                        </div>
                    </div>
                </div>
            </section>

            <nav class="flex overflow-x-auto gap-2 p-1 bg-slate-100 rounded-2xl mb-8 border scrollbar-none">
                <button onclick="switchTab('tab-accounts')" id="btn-tab-accounts" class="tab-btn px-5 py-3 rounded-xl font-medium text-sm transition-all bg-white text-sky-700 shadow-sm whitespace-nowrap">📁 Akun Terhubung</button>
                <button onclick="switchTab('tab-upload')" id="btn-tab-upload" class="tab-btn px-5 py-3 rounded-xl font-medium text-sm transition-all text-slate-600 hover:bg-white/50 whitespace-nowrap">📤 Unggah File Baru</button>
                <button onclick="switchTab('tab-explorer')" id="btn-tab-explorer" class="tab-btn px-5 py-3 rounded-xl font-medium text-sm transition-all text-slate-600 hover:bg-white/50 whitespace-nowrap">🗃️ File Explorer Virtual</button>
                <button onclick="switchTab('tab-logs')" id="btn-tab-logs" class="tab-btn px-5 py-3 rounded-xl font-medium text-sm transition-all text-slate-600 hover:bg-white/50 whitespace-nowrap">📜 Riwayat / Log</button>
                <button onclick="switchTab('tab-settings')" id="btn-tab-settings" class="tab-btn px-5 py-3 rounded-xl font-medium text-sm transition-all text-slate-600 hover:bg-white/50 whitespace-nowrap">⚙️ Pengaturan</button>
            </nav>

            <div class="bg-white border border-slate-100 rounded-3xl p-6 sm:p-8 custom-shadow">
                <!-- TAB ACCOUNTS -->
                <div id="tab-accounts" class="tab-content">
                    <div class="mb-6 flex justify-between items-center">
                        <div>
                            <h3 class="text-lg font-bold text-slate-900">Google Drive Aktif</h3>
                            <p class="text-slate-500 text-xs">Daftar email drive terhubung. Tambah atau kurangi akun pada tab <span class="font-semibold text-sky-600 cursor-pointer" onclick="switchTab('tab-settings')">Pengaturan</span>.</p>
                        </div>
                        <button onclick="refreshData()" class="text-xs text-sky-600 bg-sky-50 px-3 py-1.5 rounded-lg font-semibold hover:bg-sky-100 transition-all">🔄 Refresh</button>
                    </div>
                    <div id="accountsList" class="grid grid-cols-1 md:grid-cols-2 gap-4"></div>
                </div>

                <!-- TAB UPLOAD -->
                <div id="tab-upload" class="tab-content hidden">
                    <h3 class="text-lg font-bold text-slate-900 mb-1">Unggah File ke Storage Gabungan</h3>
                    <p class="text-slate-500 text-xs mb-6">Berkas Anda akan otomatis dikirim secara langsung ke Google Drive API demi performa kecepatan penuh tanpa batas.</p>
                    <form onsubmit="handleUpload(event)" class="space-y-6">
                        <div class="border-2 border-dashed border-slate-200 hover:border-sky-400 bg-slate-50/50 rounded-2xl p-8 text-center cursor-pointer transition-all" onclick="document.getElementById('fileInput').click()">
                            <input type="file" id="fileInput" class="hidden" onchange="updateFileInfo()">
                            <span class="text-4xl block mb-2">☁️</span>
                            <span class="block font-semibold text-slate-800" id="fileSelectLabel">Klik untuk memilih berkas</span>
                        </div>
                        
                        <div id="fileDetailContainer" class="hidden relative overflow-hidden bg-slate-50 border border-slate-200/60 rounded-2xl p-4 flex items-center justify-between custom-shadow">
                            <div id="uploadProgressBg" class="absolute left-0 top-0 bottom-0 wave-progress transition-all duration-300 z-0" style="width: 0%;"></div>
                            <div class="relative z-10 flex-grow min-w-0 pr-4">
                                <span class="font-bold block text-slate-800 text-sm truncate" id="selectedFileName"></span>
                                <span class="text-slate-500 text-xs block mt-0.5" id="selectedFileSize"></span>
                            </div>
                            <div class="relative z-10 flex items-center gap-4 shrink-0">
                                <span id="uploadPercentage" class="text-sky-700 font-extrabold text-xs hidden">0%</span>
                                <button id="cancelUploadBtn" type="button" onclick="cancelCurrentUpload()" class="text-rose-500 hover:bg-rose-50 hover:text-rose-600 font-medium px-2.5 py-1.5 rounded-xl text-xs transition-all border border-transparent hover:border-rose-100">Batal</button>
                            </div>
                        </div>
                        
                        <button type="submit" id="btnUploadSubmit" class="w-full bg-sky-600 hover:bg-sky-700 text-white font-semibold py-3.5 rounded-xl transition-all disabled:opacity-50" disabled>Upload</button>
                    </form>
                </div>

                <!-- TAB EXPLORER -->
                <div id="tab-explorer" class="tab-content hidden">
                    <h3 class="text-lg font-bold text-slate-900 mb-1">Daftar File Tersimpan</h3>
                    <p class="text-slate-500 text-xs mb-6">Berkas tersebar di banyak Google Drive Anda, namun dikelompokkan di sini secara utuh.</p>
                    <div class="overflow-x-auto rounded-xl border">
                        <table class="w-full text-left border-collapse">
                            <thead>
                                <tr class="bg-slate-50 text-slate-500 text-xs uppercase border-b">
                                    <th class="py-4 px-6 font-semibold">Nama File</th>
                                    <th class="py-4 px-6 font-semibold">Tujuan Penyimpanan</th>
                                    <th class="py-4 px-6 font-semibold">Ukuran</th>
                                    <th class="py-4 px-6 font-semibold text-right">Aksi</th>
                                </tr>
                            </thead>
                            <tbody id="filesTableBody"></tbody>
                        </table>
                    </div>
                </div>

                <!-- TAB LOGS -->
                <div id="tab-logs" class="tab-content hidden text-sm">
                    <div class="flex justify-between items-center mb-6">
                        <h3 class="text-lg font-bold text-slate-900">Riwayat Tugas Server</h3>
                        <button onclick="fetchLogs()" class="text-xs text-sky-600 bg-sky-50 px-3 py-1.5 rounded-lg font-semibold">🔄 Refresh</button>
                    </div>
                    <div class="bg-slate-50 rounded-2xl p-4 font-mono text-xs max-h-96 overflow-y-auto space-y-2 border" id="logContent"></div>
                </div>

                <!-- TAB SETTINGS: PENGATURAN SYSTEM & MANAJEMEN AKUN G-DRIVE -->
                <div id="tab-settings" class="tab-content hidden">
                    <h3 class="text-lg font-bold text-slate-900 mb-1">Pengaturan Panel</h3>
                    <p class="text-slate-500 text-xs mb-6">Kelola PIN keamanan administrator dan tambahkan / kurangi akun Google Drive di config.json.</p>
                    
                    <div class="space-y-8">
                        <!-- Sub-menu 1: Ganti PIN -->
                        <div class="bg-slate-50/50 border border-slate-200/40 p-6 rounded-2xl">
                            <h4 class="text-sm font-bold text-slate-950 mb-1">🔒 Perbarui PIN Keamanan</h4>
                            <p class="text-slate-500 text-[11px] mb-4">Ganti PIN panel admin secara berkala demi keamanan data.</p>
                            <form onsubmit="handlePINChange(event)" class="max-w-md space-y-4">
                                <input type="password" id="oldPinInput" placeholder="PIN Lama" class="w-full py-2.5 px-4 border border-slate-200 rounded-xl focus:outline-none focus:border-sky-600 text-sm bg-white" required>
                                <input type="password" id="newPinInput" placeholder="PIN Baru (Hanya Angka)" class="w-full py-2.5 px-4 border border-slate-200 rounded-xl focus:outline-none focus:border-sky-600 text-sm bg-white" required>
                                <button type="submit" class="bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold px-5 py-2.5 rounded-xl transition-all shadow-md">Simpan PIN Baru</button>
                            </form>
                        </div>

                        <!-- Sub-menu 2: + Tambah Akun Baru -->
                        <div class="bg-slate-50/50 border border-slate-200/40 p-6 rounded-2xl">
                            <h4 class="text-sm font-bold text-slate-950 mb-1">➕ Tambah Akun Google Drive</h4>
                            <p class="text-slate-500 text-[11px] mb-4">Mendaftarkan kredensial akun baru langsung ke berkas <code class="font-bold text-sky-600">config.json</code>.</p>
                            <form onsubmit="handleConfigAccountAdd(event)" class="max-w-md space-y-4">
                                <div>
                                    <label class="block text-slate-700 text-[11px] font-semibold uppercase mb-1">Email Google Drive</label>
                                    <input type="email" id="newAccEmail" placeholder="contoh@gmail.com" class="w-full py-2.5 px-4 border border-slate-200 rounded-xl focus:outline-none focus:border-sky-600 text-sm bg-white" required>
                                </div>
                                <div>
                                    <label class="block text-slate-700 text-[11px] font-semibold uppercase mb-1">Client ID</label>
                                    <input type="text" id="newAccClientId" placeholder="Masukkan Client ID" class="w-full py-2.5 px-4 border border-slate-200 rounded-xl focus:outline-none focus:border-sky-600 text-sm bg-white" required>
                                </div>
                                <div>
                                    <label class="block text-slate-700 text-[11px] font-semibold uppercase mb-1">Client Secret</label>
                                    <input type="password" id="newAccClientSecret" placeholder="Masukkan Client Secret" class="w-full py-2.5 px-4 border border-slate-200 rounded-xl focus:outline-none focus:border-sky-600 text-sm bg-white" required>
                                </div>
                                <div>
                                    <label class="block text-slate-700 text-[11px] font-semibold uppercase mb-1">Refresh Token</label>
                                    <input type="password" id="newAccRefreshToken" placeholder="Masukkan Refresh Token" class="w-full py-2.5 px-4 border border-slate-200 rounded-xl focus:outline-none focus:border-sky-600 text-sm bg-white" required>
                                </div>
                                <button type="submit" class="bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold px-5 py-2.5 rounded-xl transition-all shadow-md">Simpan Akun Baru</button>
                            </form>
                        </div>

                        <!-- Sub-menu 3: Kelola Akun terdaftar -->
                        <div class="bg-slate-50/50 border border-slate-200/40 p-6 rounded-2xl">
                            <h4 class="text-sm font-bold text-slate-950 mb-1">📋 Kurangi & Kelola Akun config.json</h4>
                            <p class="text-slate-500 text-[11px] mb-4">Daftar email terdaftar. Anda dapat menghapus atau mengurangi akun secara instan dari sini.</p>
                            <div id="configAccountsList" class="space-y-3 max-w-md">
                                <!-- Diisi oleh Javascript -->
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    </div>

    <!-- TOAST NOTIFICATION -->
    <div id="toast" class="opacity-0 pointer-events-none transition-all duration-300 fixed bottom-5 right-5 z-50 bg-slate-900 text-white px-5 py-3 rounded-2xl text-sm font-medium shadow-xl flex items-center gap-3">
        <span id="toastIcon">🛡️</span><span id="toastMsg">Sukses</span>
    </div>

    <footer class="bg-white border-t py-6 text-center text-slate-400 text-xs mt-12">
        <p class="mb-1">All rights reserved © Copyright 2026, ZulhanPedia.</p>
        <p>Created with <span class="text-rose-500">♥️</span> Powered by Gemini & ZulhanPedia.</p>
    </footer>

    <!-- INTERFACE LOGIC SCRIPT -->
    <script>
        document.addEventListener('contextmenu', e => { e.preventDefault(); showToast("Fitur Klik Kanan Dinonaktifkan!", "🛡️"); });
        document.addEventListener('keydown', e => {
            const cmd = e.ctrlKey || e.metaKey;
            if (cmd && ['c', 'C', 'x', 'X', 'u', 'U', 's', 'S'].includes(e.key)) { e.preventDefault(); showToast("Penyalinan kode ditolak!", "🚫"); }
            if (e.key === 'F12' || (cmd && e.shiftKey && ['I', 'i', 'J', 'j'].includes(e.key))) { e.preventDefault(); showToast("Akses DevTools Dinonaktifkan!", "🚨"); }
        });

        document.addEventListener("DOMContentLoaded", () => {
            const key = localStorage.getItem("key_verify");
            if (key) {
                fetch('/api/verify-pin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: key }) })
                .then(res => res.ok ? bypass() : localStorage.removeItem("key_verify"));
            }
        });

        function submitPin() {
            const pinInput = document.getElementById("pinInput");
            const pin = pinInput.value;
            fetch('/api/verify-pin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin }) })
            .then(res => {
                if (res.ok) { 
                    localStorage.setItem("key_verify", pin); 
                    bypass(); 
                    showToast("Selamat datang!", "🔓"); 
                }
                else { 
                    pinInput.value = "";
                    pinInput.focus();
                    document.getElementById("pinError").classList.remove("hidden"); 
                    setTimeout(() => {
                        document.getElementById("pinError").classList.add("hidden");
                    }, 3000);
                }
            });
        }

        function bypass() {
            document.getElementById("pinOverlay").classList.add("opacity-0", "pointer-events-none");
            document.getElementById("mainDashboard").classList.remove("hidden");
            refreshData();
        }

        function lockSystem() {
            localStorage.removeItem("key_verify");
            document.getElementById("pinInput").value = "";
            document.getElementById("pinOverlay").classList.remove("opacity-0", "pointer-events-none");
            document.getElementById("mainDashboard").classList.add("hidden");
        }

        function switchTab(tabId) {
            document.querySelectorAll(".tab-content").forEach(el => el.classList.add("hidden"));
            document.getElementById(tabId).classList.remove("hidden");
            document.querySelectorAll(".tab-btn").forEach(b => b.classList.replace("bg-white", "text-slate-600"));
            document.getElementById("btn-" + tabId).className = "tab-btn px-5 py-3 rounded-xl font-medium text-sm transition-all bg-white text-sky-700 shadow-sm whitespace-nowrap";
            if (tabId === 'tab-logs') fetchLogs();
            if (tabId === 'tab-accounts') fetchAccounts();
            if (tabId === 'tab-settings') fetchAccounts(); // Sync config list
        }

        function refreshData() { fetchStatus(); fetchAccounts(); fetchFiles(); }

        function fetchStatus() {
            fetch('/api/status').then(r => r.json()).then(d => {
                const u = (d.totalUsage / 1024 / 1024 / 1024).toFixed(2);
                const l = (d.totalLimit / 1024 / 1024 / 1024).toFixed(2);
                document.getElementById("totalCapText").innerText = u + " GB / " + l + " GB";
                document.getElementById("statAccounts").innerText = d.accountsCount;
                document.getElementById("statFiles").innerText = d.filesCount;
                const p = d.totalLimit > 0 ? ((d.totalUsage / d.totalLimit) * 100).toFixed(1) : 0;
                document.getElementById("capProgressBar").style.width = p + "%";
                document.getElementById("capPercentageText").innerText = p + "% kapasitas virtual terpakai";
            });
        }

        function fetchAccounts() {
            fetch('/api/accounts').then(r => r.json()).then(accs => {
                const list = document.getElementById("accountsList");
                list.innerHTML = accs.length === 0 ? '<div class="col-span-2 text-center py-6 text-slate-400">config.json kosong!</div>' : '';
                
                const configList = document.getElementById("configAccountsList");
                if (configList) {
                    configList.innerHTML = accs.length === 0 ? '<div class="text-center py-4 text-slate-400 text-xs">Belum ada akun di config.json.</div>' : '';
                }

                accs.forEach(a => {
                    const u = (a.usage / 1024 / 1024 / 1024).toFixed(2);
                    const l = (a.limit / 1024 / 1024 / 1024).toFixed(2);
                    const p = ((a.usage / a.limit) * 100).toFixed(1);
                    const bCls = a.type.startsWith("Offline") ? "bg-rose-50 text-rose-700 font-bold border" : "bg-sky-50 text-sky-700";
                    
                    // Render Main Cards
                    list.innerHTML += \`
                        <div class="bg-white border border-slate-200/60 p-5 rounded-2xl flex flex-col justify-between custom-shadow">
                            <div>
                                <div class="flex justify-between items-start mb-2 gap-2">
                                    <span class="font-bold text-slate-900 truncate block max-w-[180px] sm:max-w-xs">\${a.email}</span>
                                    <span class="text-[10px] px-2.5 py-1 rounded-full \${bCls}">\${a.type}</span>
                                </div>
                                <span class="text-xs text-slate-500 block mb-4">Penyimpanan: \${u} GB / \${l} GB (\${p}%)</span>
                            </div>
                            <div class="w-full bg-slate-100 rounded-full h-2 overflow-hidden"><div class="bg-sky-600 h-full rounded-full" style="width: \${p}%"></div></div>
                        </div>\`;

                    // Render Settings List
                    if (configList) {
                        configList.innerHTML += \`
                            <div class="flex items-center justify-between p-3.5 bg-white rounded-xl border border-slate-200/60 custom-shadow">
                                <div class="truncate pr-4">
                                    <span class="text-xs font-bold text-slate-900 block truncate">\${a.email}</span>
                                    <span class="text-[10px] text-slate-400 block mt-0.5">\${a.type}</span>
                                </div>
                                <button onclick="deleteConfigAccount('\${a.email}')" class="text-[10px] font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-lg transition-all">Hapus</button>
                            </div>
                        \`;
                    }
                });
            });
        }

        function fetchFiles() {
            fetch('/api/files').then(r => r.json()).then(fs => {
                const body = document.getElementById("filesTableBody");
                body.innerHTML = fs.length === 0 ? '<tr><td colspan="4" class="text-center py-8 text-slate-400">Belum ada file.</td></tr>' : '';
                fs.forEach(f => {
                    const sizeMB = (f.size / (1024 * 1024)).toFixed(2);
                    body.innerHTML += \`
                        <tr class="border-b hover:bg-slate-50/40 text-sm">
                            <td class="py-4 px-6 font-medium text-slate-900 truncate max-w-xs">\${f.name}</td>
                            <td class="py-4 px-6 text-slate-500 text-xs truncate max-w-[120px] sm:max-w-xs">\${f.accountEmail}</td>
                            <td class="py-4 px-6 text-slate-600"> \` + sizeMB + \` MB</td>
                            <td class="py-4 px-6 text-right space-x-2">
                                <a href="/api/download/\${f.id}" class="text-sky-600 font-semibold text-xs py-1 px-2.5 bg-sky-50 rounded-lg inline-block hover:bg-sky-100">Unduh</a>
                                <button onclick="deleteFile('\${f.id}')" class="text-rose-600 font-semibold text-xs py-1 px-2.5 bg-rose-50 rounded-lg hover:bg-rose-100">Hapus</button>
                            </td>
                        </tr>\`;
                });
            });
        }

        function fetchLogs() {
            fetch('/api/logs').then(r => r.json()).then(l => {
                const c = document.getElementById("logContent");
                c.innerHTML = l.map(log => \`<div><span class="text-sky-500">[\${new Date(log.timestamp).toLocaleTimeString()}]</span> \${log.message}</div>\`).join('');
            });
        }

        function updateFileInfo() {
            const input = document.getElementById("fileInput");
            if (input.files && input.files[0]) {
                document.getElementById("fileSelectLabel").innerText = "Ganti file terpilih";
                document.getElementById("selectedFileName").innerText = input.files[0].name;
                document.getElementById("selectedFileSize").innerText = (input.files[0].size/1024/1024).toFixed(2) + " MB";
                document.getElementById("fileDetailContainer").classList.remove("hidden");
                document.getElementById("btnUploadSubmit").disabled = false;
                
                document.getElementById("uploadProgressBg").style.width = "0%";
                document.getElementById("uploadPercentage").classList.add("hidden");
                document.getElementById("uploadPercentage").innerText = "0%";
                document.getElementById("cancelUploadBtn").classList.remove("hidden");
            } else { resetUploadForm(); }
        }

        function resetUploadForm() {
            document.getElementById("fileInput").value = "";
            document.getElementById("fileSelectLabel").innerText = "Klik untuk memilih berkas";
            document.getElementById("fileDetailContainer").classList.add("hidden");
            document.getElementById("btnUploadSubmit").disabled = true;
            document.getElementById("btnUploadSubmit").innerText = "Upload";
        }

        window.currentXhr = null;

        // --- TEKNOLOGI ULTRA-SPEED: CLIENT-SIDE DIRECT UPLOAD KE API GOOGLE DRIVE ---
        function handleUpload(e) {
            e.preventDefault();
            const file = document.getElementById("fileInput").files[0];
            if (!file) return;

            const btn = document.getElementById("btnUploadSubmit");
            const progressBg = document.getElementById("uploadProgressBg");
            const percentLabel = document.getElementById("uploadPercentage");
            const cancelBtn = document.getElementById("cancelUploadBtn");
            
            btn.disabled = true;
            btn.innerText = "Uploading... ☁️";
            
            progressBg.style.width = "0%";
            percentLabel.innerText = "Inisialisasi...";
            percentLabel.classList.remove("hidden");

            // Langkah 1: Minta otorisasi upload ke backend
            fetch('/api/upload/init', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: file.name, size: file.size })
            })
            .then(res => {
                if (!res.ok) throw new Error("Gagal menginisialisasi penyimpanan.");
                return res.json();
            })
            .then(data => {
                if (!data.success) {
                    showToast(data.message, "⚠️");
                    resetUploadForm();
                    return;
                }

                // KASUS A: Jika akun adalah Simulated (Simulasi lokal)
                if (data.simulated) {
                    percentLabel.innerText = "Uploading (Lokal)...";
                    const fd = new FormData();
                    fd.append("file", file);
                    fd.append("email", data.email);

                    const xhr = new XMLHttpRequest();
                    window.currentXhr = xhr;

                    xhr.upload.addEventListener('progress', (ev) => {
                        if (ev.lengthComputable) {
                            const pct = Math.round((ev.loaded / ev.total) * 100);
                            progressBg.style.width = pct + "%";
                            percentLabel.innerText = "Saving to Server (" + pct + "%)";
                        }
                    });

                    xhr.addEventListener('load', () => {
                        if (xhr.status === 200) {
                            resetUploadForm();
                            refreshData();
                            switchTab('tab-explorer');
                            showToast("Berkas tersimpan di emulator lokal!", "✅");
                        } else {
                            showToast("Upload lokal gagal.", "⚠️");
                            resetUploadForm();
                        }
                    });
                    
                    xhr.open('POST', '/api/upload/local');
                    xhr.send(fd);
                    return;
                }

                // KASUS B: JALUR CEPAT (Akun Live) - Upload langsung dari browser ke API Google Drive
                const boundary = 'foo_bar_boundary';
                const delimiter = "\\r\\n--" + boundary + "\\r\\n";
                const close_delim = "\\r\\n--" + boundary + "--";

                const metadata = {
                    name: file.name,
                    mimeType: file.type || 'application/octet-stream'
                };

                const metadataPart = JSON.stringify(metadata);
                
                const header = delimiter + 
                               'Content-Type: application/json; charset=UTF-8\\r\\n\\r\\n' + 
                               metadataPart + 
                               delimiter + 
                               'Content-Type: ' + (file.type || 'application/octet-stream') + '\\r\\n\\r\\n';

                const multipartBody = new Blob([
                    header,
                    file,
                    close_delim
                ], { type: 'multipart/related; boundary=' + boundary });

                const xhr = new XMLHttpRequest();
                window.currentXhr = xhr;

                xhr.upload.addEventListener('progress', (ev) => {
                    if (ev.lengthComputable) {
                        const pct = Math.round((ev.loaded / ev.total) * 100);
                        progressBg.style.width = pct + "%";
                        percentLabel.innerText = "Direct Uploading (" + pct + "%)";
                        if (pct >= 100) {
                            cancelBtn.classList.add("hidden");
                            percentLabel.innerText = "Finalisasi Cloud... ☁️";
                        }
                    }
                });

                xhr.addEventListener('load', () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        const responseDrive = JSON.parse(xhr.responseText);
                        
                        fetch('/api/upload/confirm', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                name: file.name,
                                size: file.size,
                                mimeType: file.type,
                                accountEmail: data.email,
                                googleDriveFileId: responseDrive.id
                            })
                        })
                        .then(() => {
                            resetUploadForm();
                            refreshData();
                            switchTab('tab-explorer');
                            showToast("Sukses upload langsung ke Google Drive!", "🚀");
                        });
                    } else {
                        showToast("Google Drive API menolak upload.", "⚠️");
                        resetUploadForm();
                    }
                });

                xhr.addEventListener('error', () => {
                    showToast("Koneksi Google API terputus!", "⚠️");
                    resetUploadForm();
                });

                xhr.open('POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart');
                xhr.setRequestHeader('Authorization', 'Bearer ' + data.accessToken);
                xhr.send(multipartBody);
            })
            .catch(err => {
                showToast(err.message, "⚠️");
                resetUploadForm();
            });
        }

        function cancelCurrentUpload() {
            if (window.currentXhr) {
                window.currentXhr.abort();
            }
            resetUploadForm();
        }

        function deleteFile(id) {
            if (confirm("Hapus berkas ini secara permanen?")) {
                fetch('/api/files/' + id, { method: 'DELETE' }).then(() => { refreshData(); showToast("File terhapus!", "🗑️"); });
            }
        }

        function handlePINChange(e) {
            e.preventDefault();
            const oldPin = document.getElementById("oldPinInput").value;
            const newPin = document.getElementById("newPinInput").value;
            fetch('/api/change-pin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ oldPin, newPin }) })
            .then(r => r.json()).then(d => {
                if (d.success) {
                    document.getElementById("oldPinInput").value = "";
                    document.getElementById("newPinInput").value = "";
                    localStorage.setItem("key_verify", newPin);
                    showToast("PIN berhasil diganti!", "🔒");
                    switchTab('tab-accounts');
                } else { showToast(d.message, "⚠️"); }
            });
        }

        // Fungsi Menangani Penambahan Akun Kredensial Baru ke config.json via Web UI
        function handleConfigAccountAdd(e) {
            e.preventDefault();
            const email = document.getElementById("newAccEmail").value;
            const client_id = document.getElementById("newAccClientId").value;
            const client_secret = document.getElementById("newAccClientSecret").value;
            const refresh_token = document.getElementById("newAccRefreshToken").value;

            const btn = e.target.querySelector("button[type='submit']");
            btn.disabled = true;
            btn.innerText = "Menyimpan...";

            fetch('/api/config/accounts/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, client_id, client_secret, refresh_token })
            })
            .then(r => r.json())
            .then(d => {
                btn.disabled = false;
                btn.innerText = "Simpan Akun Baru";
                if (d.success) {
                    document.getElementById("newAccEmail").value = "";
                    document.getElementById("newAccClientId").value = "";
                    document.getElementById("newAccClientSecret").value = "";
                    document.getElementById("newAccRefreshToken").value = "";
                    refreshData();
                    showToast("Akun disimpan ke config.json!", "🚀");
                } else {
                    showToast(d.message, "⚠️");
                }
            })
            .catch(err => {
                btn.disabled = false;
                btn.innerText = "Simpan Akun Baru";
                showToast("Gagal menyimpan akun.", "⚠️");
            });
        }

        // Fungsi Menangani Penghapusan Akun Kredensial dari config.json via Web UI
        function deleteConfigAccount(email) {
            if (confirm("Apakah Anda yakin ingin menghapus akun " + email + " dari config.json secara permanen? Semua berkas terasosiasi di database virtual akan ikut terhapus.")) {
                fetch('/api/config/accounts/' + encodeURIComponent(email), {
                    method: 'DELETE'
                })
                .then(r => r.json())
                .then(d => {
                    if (d.success) {
                        refreshData();
                        showToast("Akun berhasil dihapus dari konfigurasi!", "🗑️");
                    } else {
                        showToast(d.message, "⚠️");
                    }
                })
                .catch(err => {
                    showToast("Gagal menghapus akun.", "⚠️");
                });
            }
        }

        function showToast(m, icon = "📢") {
            const t = document.getElementById("toast");
            document.getElementById("toastMsg").innerText = m;
            document.getElementById("toastIcon").innerText = icon;
            t.classList.remove("opacity-0", "pointer-events-none");
            t.style.transform = "translateY(-10px)";
            setTimeout(() => { t.classList.add("opacity-0", "pointer-events-none"); t.style.transform = "translateY(0)"; }, 3000);
        }
    </script>
</body>
</html>
    `);
});

// Menghidupkan Web Server di Termux HP Jadul
app.listen(PORT, '0.0.0.0', () => {
    console.log(`===================================================`);
    console.log(`   ServerQuu Multi-Drive is active on Android!    `);
    console.log(`   Author       : Izzuddin Badawi             `);
    console.log(`   Telegram     : @Hyperos_id            `);
    console.log(`   Version      : 1.0.0 (Beta)            `);
    console.log(`   Server lokal aktif di: http://localhost:${PORT}  `);
    console.log(`===================================================`);
});