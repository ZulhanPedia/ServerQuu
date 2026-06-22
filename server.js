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
            logs: [{ timestamp: new Date().toISOString(), message: "Sistem ServerQuu berhasil diaktifkan." }],
            telegram: {
                enabled: false,
                botToken: "",
                chatId: "",
                customReadme: ""
            }
        };
        fs.writeFileSync(DB_FILE, JSON.stringify(defaultDb, null, 2), 'utf8');
    }
    if (!fs.existsSync(CONFIG_FILE)) {
        const defaultConfig = [
            { id: 1, email: "akun14@gmail.com", client_id: "CLIENT_ID_KAMU", client_secret: "CLIENT_SECRET_KAMU", refresh_token: "REFRESH_TOKEN_AKUN_14" }
        ];
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2), 'utf8');
    }
}
initDatabase();

// Fungsi membaca & menulis database lokal dengan penanganan proteksi crash dan auto-recovery array
function readDb() { 
    try {
        const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        if (!db.files) db.files = [];
        if (!db.logs) db.logs = [];
        if (!db.pin) db.pin = "1234";
        if (!db.telegram) {
            db.telegram = {
                enabled: false,
                botToken: "",
                chatId: "",
                customReadme: ""
            };
        }
        return db;
    } catch (e) {
        return { 
            pin: "1234", 
            files: [], 
            logs: [],
            telegram: { enabled: false, botToken: "", chatId: "", customReadme: "" }
        };
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

// Penambahan log dengan batas proteksi reset log ketika sudah mencapai 20 baris
function addLog(message) {
    const db = readDb();
    if (!db.logs) db.logs = [];
    db.logs.unshift({ timestamp: new Date().toISOString(), message });
    if (db.logs.length > 20) {
        db.logs = db.logs.slice(0, 20);
    }
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

// === BOT TELEGRAM AUTO NOTIFICATION HANDLER ===
function sendTelegramNotification(file, downloadLink) {
    const db = readDb();
    const tg = db.telegram;
    
    if (!tg || !tg.enabled || !tg.botToken || !tg.chatId) return;

    // Bersihkan karakter sensitif Markdown yang tersisa jika ada
    const escapedFileName = file.name.replace(/([*`\\[\\]])/g, '\\$1');

    const message = "📢 *New File Uploaded to Google Drive*\n" +
                    "📦 *File Name:* " + escapedFileName + "\n" +
                    "📱 *Status:* Success ✅";

    const readmeUrl = tg.customReadme || "https://zulhanpedia.com";

    const inlineKeyboard = {
        inline_keyboard: [
            [
                { text: "📥 Download", url: downloadLink },
                { text: "📖 Readme", url: readmeUrl }
            ]
        ]
    };

    const postData = JSON.stringify({
        chat_id: tg.chatId,
        text: message,
        parse_mode: "Markdown",
        reply_markup: inlineKeyboard
    });

    const req = https.request({
        hostname: 'api.telegram.org',
        path: "/bot" + tg.botToken + "/sendMessage",
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
        }
    }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            if (res.statusCode !== 200) {
                console.error("Gagal mengirim notifikasi Telegram:", data);
                addLog("Gagal kirim notif Telegram (" + res.statusCode + ")");
            } else {
                addLog("Notifikasi unggahan berhasil terkirim ke Telegram.");
            }
        });
    });

    req.on('error', (e) => {
        console.error("Error Telegram API:", e.message);
        addLog("Error Notif Telegram: " + e.message);
    });

    req.write(postData);
    req.end();
}

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
        return { limit: 15 * 1024 * 1024 * 1024, usage: 0, type: "Offline (" + (e.response?.data?.error || e.message) + ")" };
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

// API Get & Set Telegram Config
app.get('/api/telegram/config', (req, res) => {
    const db = readDb();
    res.json(db.telegram || { enabled: false, botToken: "", chatId: "", customReadme: "" });
});

app.post('/api/telegram/config', (req, res) => {
    const { enabled, botToken, chatId, customReadme } = req.body;
    const db = readDb();
    db.telegram = {
        enabled: enabled === true || enabled === 'true',
        botToken: botToken || "",
        chatId: chatId || "",
        customReadme: customReadme || ""
    };
    writeDb(db);
    addLog("Pengaturan notifikasi Telegram diperbarui (" + (db.telegram.enabled ? "Aktif" : "Nonaktif") + ").");
    res.json({ success: true });
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
        const db = readDb();
        db.files = db.files.filter(f => f.accountEmail.toLowerCase() !== email.toLowerCase());
        writeDb(db);
        addLog(`Akun deleted dari config.json: ${email}`);
        res.json({ success: true, message: `Akun ${email} berhasil dihapus.` });
    } catch (e) {
        res.status(500).json({ success: false, message: `Gagal memperbarui config.json: ${e.message}` });
    }
});

// API MENDAPATKAN DAFTAR FOLDER SECARA DINAMIS UNTUK AKUN TERPILIH
app.get('/api/folders', async (req, res) => {
    const { email } = req.query;
    if (!email) return res.status(400).json({ success: false, message: "Email parameter wajib dilampirkan." });

    const accounts = readAccountsConfig();
    const acc = accounts.find(a => a.email.toLowerCase() === email.toLowerCase());
    if (!acc) return res.status(404).json({ success: false, message: "Akun tidak terdaftar." });

    if (isSimulatedAccount(acc)) {
        // Mode Simulasi: Baca daftar folder fisik di direktori lokal HP
        const accountFolder = path.join(drivesDataDir, acc.email);
        if (!fs.existsSync(accountFolder)) {
            return res.json([]);
        }
        try {
            const items = fs.readdirSync(accountFolder, { withFileTypes: true });
            const folders = items
                .filter(item => item.isDirectory())
                .map(item => ({ id: item.name, name: item.name }));
            return res.json(folders);
        } catch (e) {
            return res.json([]);
        }
    }

    try {
        const oAuth = new google.auth.OAuth2(acc.client_id, acc.client_secret, "urn:ietf:wg:oauth:2.0:oob");
        oAuth.setCredentials({ refresh_token: acc.refresh_token });
        const drive = google.drive({ version: 'v3', auth: oAuth });
        
        const response = await drive.files.list({
            q: "mimeType = 'application/vnd.google-apps.folder' and trashed = false",
            fields: 'files(id, name)',
            spaces: 'drive',
            pageSize: 100
        });
        res.json(response.data.files || []);
    } catch (e) {
        res.status(500).json({ success: false, message: `Gagal menarik daftar folder Google: ${e.message}` });
    }
});

// API MEMBUAT FOLDER BARU SECARA INSTAN PADA AKUN GOOGLE DRIVE TERPILIH
app.post('/api/folders/create', async (req, res) => {
    const { email, folderName } = req.body;
    if (!email || !folderName) return res.status(400).json({ success: false, message: "Parameter tidak lengkap." });

    const accounts = readAccountsConfig();
    const acc = accounts.find(a => a.email.toLowerCase() === email.toLowerCase());
    if (!acc) return res.status(404).json({ success: false, message: "Akun tidak terdaftar." });

    if (isSimulatedAccount(acc)) {
        const targetPath = path.join(drivesDataDir, acc.email, folderName);
        try {
            fs.mkdirSync(targetPath, { recursive: true });
            addLog(`Folder simulated "${folderName}" berhasil dibuat di [${acc.email}]`);
            return res.json({ success: true, id: folderName, name: folderName });
        } catch (e) {
            return res.status(500).json({ success: false, message: e.message });
        }
    }

    try {
        const oAuth = new google.auth.OAuth2(acc.client_id, acc.client_secret, "urn:ietf:wg:oauth:2.0:oob");
        oAuth.setCredentials({ refresh_token: acc.refresh_token });
        const drive = google.drive({ version: 'v3', auth: oAuth });

        const fileMetadata = {
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder'
        };

        const folder = await drive.files.create({
            requestBody: fileMetadata,
            fields: 'id, name'
        });

        addLog(`Folder cloud "${folderName}" berhasil dibuat di [${acc.email}]`);
        res.json({ success: true, id: folder.data.id, name: folder.data.name });
    } catch (e) {
        res.status(500).json({ success: false, message: `Gagal membuat folder Google: ${e.message}` });
    }
});

app.get('/api/files', (req, res) => res.json(readDb().files));

// API PRE-FLIGHT QUOTA RESOLVER: Deteksi otomatis akun target sebelum upload berjalan
app.post('/api/upload/preflight', async (req, res) => {
    const { size } = req.body;
    if (!size) return res.status(400).json({ success: false, message: "Ukuran berkas wajib disertakan." });

    const accounts = readAccountsConfig();
    if (accounts.length === 0) return res.status(400).json({ success: false, message: "Tidak ada drive terhubung." });

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
        return res.json({ success: false, message: "Kapasitas virtual pool penuh!" });
    }
    res.json({ success: true, email: targetAccount.email });
});

// ENGINE UTAMA: INISIALISASI RESUMABLE UPLOAD SESSION (DIRECT PUT - 100% BEBAS LAG)
app.post('/api/upload/init', async (req, res) => {
    let { name, size, mimeType, targetEmail, folderId } = req.body;
    if (!name || !size) return res.status(400).json({ success: false, message: "Data inisialisasi tidak lengkap." });

    // STRATEGI MUTASI: Mengganti semua spasi dan underscore (_) menjadi tanda hubung (-)
    name = name.replace(/[\s_]+/g, '-');

    const accounts = readAccountsConfig();
    if (accounts.length === 0) return res.status(400).json({ success: false, message: "Tidak ada drive terdaftar." });

    let targetAccount = null;
    if (targetEmail && targetEmail !== "auto") {
        targetAccount = accounts.find(a => a.email.toLowerCase() === targetEmail.toLowerCase());
    } else {
        const accountsWithQuota = [];
        for (const acc of accounts) {
            const info = await dapatkanKapasitasAkun(acc);
            accountsWithQuota.push({ ...acc, ...info });
        }
        for (const acc of accountsWithQuota) {
            const freeSpace = acc.limit - acc.usage;
            if (size <= freeSpace) {
                targetAccount = acc;
                break;
            }
        }
    }

    if (!targetAccount) {
        return res.status(400).json({ success: false, message: "Penyimpanan penuh atau tidak memadai!" });
    }

    if (isSimulatedAccount(targetAccount)) {
        return res.json({ success: true, simulated: true, email: targetAccount.email, sanitizedName: name });
    }

    // Deteksi Origin Browser Client secara dinamis demi melewati proteksi CORS Google API
    const clientOrigin = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : ("http://" + (req.headers.host || "localhost:3000")));

    try {
        const oAuth = new google.auth.OAuth2(targetAccount.client_id, targetAccount.client_secret, "urn:ietf:wg:oauth:2.0:oob");
        oAuth.setCredentials({ refresh_token: targetAccount.refresh_token });
        const tokenRes = await oAuth.getAccessToken();
        const accessToken = tokenRes.token;

        // Metadata berkas untuk dikirim ke Google Drive API
        const metadata = {
            name: name,
            mimeType: mimeType || 'application/octet-stream'
        };
        if (folderId) {
            metadata.parents = [folderId];
        }

        const postData = JSON.stringify(metadata);

        // Melakukan handshake inisialisasi Resumable session ke Google dengan melewatkan Header Origin browser klien
        const googleReq = https.request({
            hostname: 'www.googleapis.com',
            path: '/upload/drive/v3/files?uploadType=resumable',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json; charset=UTF-8',
                'X-Upload-Content-Type': mimeType || 'application/octet-stream',
                'X-Upload-Content-Length': size.toString(),
                'Content-Length': Buffer.byteLength(postData),
                'Origin': clientOrigin // Kunci Utama agar Google memberikan respon CORS "Access-Control-Allow-Origin" yang sah ke browser
            }
        }, (googleRes) => {
            let bodyData = '';
            googleRes.on('data', (chunk) => { bodyData += chunk; });
            googleRes.on('end', () => {
                if (googleRes.statusCode === 200 || googleRes.statusCode === 201) {
                    const uploadUrl = googleRes.headers['location'];
                    res.json({
                        success: true,
                        simulated: false,
                        email: targetAccount.email,
                        uploadUrl: uploadUrl,
                        sanitizedName: name
                    });
                } else {
                    console.error("Inisialisasi Upload Google Gagal:", googleRes.statusCode, bodyData);
                    res.status(googleRes.statusCode).json({ 
                        success: false, 
                        message: `Google API Error (${googleRes.statusCode}): ${bodyData}` 
                    });
                }
            });
        });

        googleReq.on('error', (e) => {
            console.error("Error Koneksi Google:", e.message);
            res.status(500).json({ success: false, message: `Koneksi Google API terputus: ${e.message}` });
        });

        googleReq.write(postData);
        googleReq.end();

    } catch (e) {
        res.status(500).json({ success: false, message: `Otorisasi gagal: ${e.message}` });
    }
});

// ENGINE: KONFIRMASI UPLOAD + AUTO CONVERT FILE TO PUBLIC ACCESS ON GOOGLE DRIVE (PROTECTED NON-BLOCKING)
app.post('/api/upload/confirm', async (req, res) => {
    let { name, size, mimeType, accountEmail, googleDriveFileId, folderId, folderName } = req.body;
    const db = readDb();
    const accounts = readAccountsConfig();
    const targetAccount = accounts.find(a => a.email === accountEmail);

    if (!targetAccount) {
        return res.status(400).json({ success: false, message: "Akun asal tidak ditemukan." });
    }

    // Double-check sanitasi nama di sisi backend penampung konfirmasi
    name = name.replace(/[\s_]+/g, '-');

    // Mengisolasi izin Google Drive agar tidak mengeblok pendaftaran berkas ke database virtual
    if (!isSimulatedAccount(targetAccount)) {
        try {
            const oAuth = new google.auth.OAuth2(targetAccount.client_id, targetAccount.client_secret, "urn:ietf:wg:oauth:2.0:oob");
            oAuth.setCredentials({ refresh_token: targetAccount.refresh_token });
            const drive = google.drive({ version: 'v3', auth: oAuth });

            // Mengirim parameter ganda (requestBody & resource) guna mendukung semua jenis versi pustaka googleapis di Termux
            await drive.permissions.create({
                fileId: googleDriveFileId,
                requestBody: {
                    role: 'reader',
                    type: 'anyone'
                },
                resource: {
                    role: 'reader',
                    type: 'anyone'
                }
            });
            addLog("Berkas \"" + name + "\" berhasil diubah menjadi akses publik di awan.");
        } catch (e) {
            console.error("Gagal mengubah izin Google Drive menjadi publik:", e.message);
            addLog("Peringatan: Gagal mempublikasikan \"" + name + "\" ke publik (" + e.message + "). Berkas tetap disimpan.");
        }
    }

    const fileId = "vfile_" + Date.now();
    const newFile = {
        id: fileId,
        name,
        size: parseInt(size),
        mimeType: mimeType || "application/octet-stream",
        accountEmail,
        googleDriveFileId,
        folderId: folderId || null,
        folderName: folderName || "Utama / Root",
        date: new Date().toISOString()
    };
    db.files.unshift(newFile);
    writeDb(db);

    // Kirim notifikasi bot otomatis (Cloud Path)
    const downloadLink = "https://drive.google.com/uc?export=download&id=" + googleDriveFileId;
    sendTelegramNotification(newFile, downloadLink);

    addLog("Berkas \"" + name + "\" terdaftar dalam database virtual di folder \"" + (folderName || 'Utama / Root') + "\".");
    res.json({ success: true });
});

// Fallback upload lokal jika akun yang dipilih adalah Simulated
app.post('/api/upload/local', upload.single('file'), (req, res) => {
    const { email, folderName } = req.body;
    if (!req.file || !email) {
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(400).json({ success: false, message: "Pengunggahan simulated gagal." });
    }

    // Sanitasi nama berkas lokal sebelum dipindahkan
    const sanitizedLocalName = req.file.originalname.replace(/[\s_]+/g, '-');
    const targetFolderName = folderName || "";
    const accountFolder = path.join(drivesDataDir, email, targetFolderName);
    if (!fs.existsSync(accountFolder)) {
        fs.mkdirSync(accountFolder, { recursive: true });
    }

    const fileId = "vfile_" + Date.now();
    const permanentPath = path.join(accountFolder, fileId + path.extname(sanitizedLocalName));
    fs.renameSync(req.file.path, permanentPath);

    const db = readDb();
    const newFile = {
        id: fileId,
        name: sanitizedLocalName,
        size: req.file.size,
        mimeType: req.file.mimetype || "application/octet-stream",
        accountEmail: email,
        googleDriveFileId: "local_storage_file",
        localFilePath: permanentPath,
        folderId: targetFolderName ? targetFolderName : null,
        folderName: targetFolderName ? targetFolderName : "Utama / Root",
        date: new Date().toISOString()
    };
    db.files.unshift(newFile);
    writeDb(db);

    // Kirim notifikasi bot Telegram otomatis (Local Path)
    const clientOrigin = req.protocol + "://" + req.get('host');
    const downloadLink = clientOrigin + "/api/download/" + fileId;
    sendTelegramNotification(newFile, downloadLink);

    addLog(`Berkas "${sanitizedLocalName}" disimpan secara lokal di [${email}]/` + (targetFolderName ? `${targetFolderName}/` : ''));
    res.json({ success: true });
});

// LOGIKA UNDUH: Redirect browser langsung ke Google CDN (Bypass Termux) tanpa limitasi kecepatan
app.get('/api/download/:id', async (req, res) => {
    const db = readDb();
    const file = db.files.find(f => f.id === req.params.id);
    if (!file) return res.status(404).send("Berkas tidak ditemukan.");

    if (file.localFilePath && fs.existsSync(file.localFilePath)) {
        addLog(`Mentransfer berkas lokal: ${file.name}`);
        res.setHeader('Content-disposition', 'attachment; filename="' + encodeURIComponent(file.name) + '"');
        res.setHeader('Content-type', file.mimeType || 'application/octet-stream');
        res.setHeader('Content-Length', file.size);
        const readStream = fs.createReadStream(file.localFilePath);
        readStream.pipe(res);
        return;
    }

    const accounts = readAccountsConfig();
    const acc = accounts.find(a => a.email === file.accountEmail);
    if (acc && !isSimulatedAccount(acc)) {
        addLog(`Megarahkan browser langsung ke Google CDN publik: ${file.name}`);
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
    res.send(`<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>ServerQuu - Panel</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght=300;400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        body {
            font-family: 'Plus Jakarta Sans', sans-serif;
            background-color: #fcfcfd;
            -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; user-select: none;
        }
        input, select { -webkit-user-select: text !important; -moz-user-select: text !important; user-select: text !important; }
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

        .scrollbar-none::-webkit-scrollbar { display: none; }
        .scrollbar-none { -ms-overflow-style: none; scrollbar-width: none; }
    </style>
</head>
<body class="text-slate-800 antialiased overflow-hidden flex flex-col" style="height: 100vh; height: 100dvh; background-color: #fcfcfd;">

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

    <div id="mainDashboard" class="hidden fixed inset-0 flex flex-col overflow-hidden">
        
        <header class="bg-white border-b border-slate-100 shrink-0 z-40">
            <div class="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
                <div class="flex items-center">
                    <img id="headerLogo" src="/static/logo.png" alt="ServerQuu" class="h-10 w-auto object-contain" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%2240%22 viewBox=%220 0 120 40%22><rect width=%22120%22 height=%2240%22 rx=%228%22 fill=%22%230284C7%22/><text x=%2250%%22 y=%2255%%22 fill=%22white%22 font-family=%22sans-serif%22 font-size=%2216%22 font-weight=%22bold%22 text-anchor=%22middle%22 dominant-baseline=%22middle%22>ServerQuu</text></svg>';">
                </div>
                
                <div class="flex items-center gap-3">
                    <span class="inline-flex items-center gap-1.5 bg-sky-50 text-sky-700 px-3 py-1.5 rounded-full text-xs font-bold border border-sky-100/30">
                        <span class="w-1.5 h-1.5 bg-sky-500 rounded-full animate-pulse"></span>
                        Author: Izzuddin Badawi
                    </span>
                    <button onclick="lockSystem()" class="text-slate-500 hover:text-rose-600 px-3 py-1.5 rounded-xl transition-all font-semibold text-xs border border-slate-100 hover:border-rose-100 flex items-center gap-1.5">
                        🔒 Kunci Panel
                    </button>
                </div>
            </div>
        </header>

        <main class="flex-grow flex flex-col overflow-hidden min-h-0 max-w-6xl w-full mx-auto px-4 pt-4 pb-14">
            
            <div class="shrink-0 space-y-4 mb-4">
                
                <section class="bg-gradient-to-br from-sky-950 via-slate-900 to-slate-950 rounded-3xl p-5 text-white shadow-xl relative overflow-hidden">
                    <div class="absolute right-0 top-0 translate-x-1/4 -translate-y-1/4 w-80 h-80 bg-sky-500/10 rounded-full blur-3xl"></div>
                    <div class="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                        <div class="md:col-span-2">
                            <p class="text-sky-200 text-[10px] font-semibold tracking-widest uppercase mb-1">TOTAL STORAGE GABUNGAN (VIRTUAL POOL)</p>
                            <h2 id="totalCapText" class="text-2xl sm:text-3xl font-black mb-2">0 GB / 0 GB</h2>
                            <div class="w-full bg-slate-950 rounded-full h-2.5 mb-1.5 p-0.5 overflow-hidden">
                                <div id="capProgressBar" class="bg-gradient-to-r from-sky-400 to-cyan-300 h-full rounded-full transition-all" style="width: 0%"></div>
                            </div>
                            <p class="text-slate-400 text-[11px]" id="capPercentageText">0% terpakai</p>
                        </div>
                        <div class="grid grid-cols-2 gap-2 border-t border-slate-800 md:border-t-0 md:border-l md:border-slate-800 md:pl-4 pt-3 md:pt-0 text-center sm:text-left">
                            <div>
                                <span class="block text-slate-400 text-[10px]">Drive Terhubung</span>
                                <span id="statAccounts" class="text-xl font-bold">0</span>
                            </div>
                            <div>
                                <span class="block text-slate-400 text-[10px]">File Tersimpan</span>
                                <span id="statFiles" class="text-xl font-bold">0</span>
                            </div>
                        </div>
                    </div>
                </section>

                <nav id="tabNav" class="flex overflow-x-auto gap-2 p-1 bg-slate-100 rounded-2xl border scrollbar-none shrink-0">
                    <button onclick="switchTab('tab-accounts')" id="btn-tab-accounts" class="tab-btn px-5 py-3 rounded-xl font-medium text-sm transition-all bg-white text-sky-700 shadow-sm whitespace-nowrap">📁 Akun Terhubung</button>
                    <button onclick="switchTab('tab-upload')" id="btn-tab-upload" class="tab-btn px-5 py-3 rounded-xl font-medium text-sm transition-all text-slate-600 hover:bg-white/50 whitespace-nowrap">📤 Unggah File Baru</button>
                    <button onclick="switchTab('tab-explorer')" id="btn-tab-explorer" class="tab-btn px-5 py-3 rounded-xl font-medium text-sm transition-all text-slate-600 hover:bg-white/50 whitespace-nowrap">🗃️ File Explorer Virtual</button>
                    <button onclick="switchTab('tab-logs')" id="btn-tab-logs" class="tab-btn px-5 py-3 rounded-xl font-medium text-sm transition-all text-slate-600 hover:bg-white/50 whitespace-nowrap">📜 Riwayat / Log</button>
                    <button onclick="switchTab('tab-settings')" id="btn-tab-settings" class="tab-btn px-5 py-3 rounded-xl font-medium text-sm transition-all text-slate-600 hover:bg-white/50 whitespace-nowrap">⚙️ Pengaturan</button>
                </nav>

                <div class="bg-white border border-slate-200/70 rounded-2xl p-2.5 px-4 flex items-center overflow-hidden custom-shadow shrink-0 gap-2">
                    <span class="text-xs font-bold text-sky-700 bg-sky-50 px-2.5 py-1 rounded-lg border border-sky-100 shrink-0 select-none">Update:</span>
                    <marquee class="text-xs font-medium text-slate-600" behavior="scroll" direction="left" scrollamount="4">
                        [v1.2.0] Penambahan Fitur: Auto broadcast telegram with custom bot token, ID Chat or Channel.
                    </marquee>
                </div>

            </div>

            <div id="tabContentContainer" class="flex-grow overflow-y-auto bg-white border border-slate-100 rounded-3xl p-5 sm:p-8 custom-shadow scrollbar-none mb-2">
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

                <div id="tab-upload" class="tab-content hidden">
                    <h3 class="text-lg font-bold text-slate-900 mb-1">Unggah File ke Storage Gabungan</h3>
                    <p class="text-slate-500 text-xs mb-6">Pilih akun & folder tujuan Anda secara langsung dan interaktif tanpa perlu repot mengetikkan id folder.</p>
                    
                    <form onsubmit="handleUpload(event)" class="space-y-6">
                        
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-5 rounded-2xl border border-slate-200/50">
                            <div>
                                <label class="block text-slate-700 text-[11px] font-bold uppercase mb-1.5">1. Akun Penyimpanan</label>
                                <select id="uploadAccountSelect" onchange="handleUploadAccountChange()" class="w-full p-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-sky-600 text-xs font-medium">
                                    <option value="auto">Pilih Otomatis (Rekomendasi Cek Quota)</option>
                                </select>
                            </div>
                            
                            <div>
                                <label class="block text-slate-700 text-[11px] font-bold uppercase mb-1.5">2. Folder Tujuan</label>
                                <div class="flex gap-2">
                                    <select id="uploadFolderSelect" class="flex-grow p-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-sky-600 text-xs font-medium disabled:opacity-60" disabled>
                                        <option value="">Utama / Root</option>
                                    </select>
                                    <button type="button" id="btnCreateFolderInline" onclick="promptCreateFolder()" class="bg-sky-50 hover:bg-sky-100 text-sky-700 font-bold px-3.5 rounded-xl text-xs transition-all border border-sky-100 shrink-0 disabled:opacity-50" disabled>
                                        📁 + Folder
                                    </button>
                                </div>
                            </div>
                        </div>

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
                                <span class="text-sky-600 text-[11px] font-bold block mt-1" id="uploadStatusText"></span>
                            </div>
                            <div class="relative z-10 flex items-center gap-4 shrink-0">
                                <span id="uploadPercentage" class="text-sky-700 font-extrabold text-xs hidden">0%</span>
                                <button id="cancelUploadBtn" type="button" onclick="cancelCurrentUpload()" class="text-rose-500 hover:bg-rose-50 hover:text-rose-600 font-medium px-2.5 py-1.5 rounded-xl text-xs transition-all border border-transparent hover:border-rose-100">Batal</button>
                            </div>
                        </div>
                        
                        <button type="submit" id="btnUploadSubmit" class="w-full bg-sky-600 hover:bg-sky-700 text-white font-semibold py-3.5 rounded-xl transition-all disabled:opacity-50" disabled>Upload</button>
                    </form>
                </div>

                <div id="tab-explorer" class="tab-content hidden">
                    <h3 class="text-lg font-bold text-slate-900 mb-1">Daftar File Tersimpan</h3>
                    <p class="text-slate-500 text-xs mb-4">Berkas tersebar di banyak Google Drive Anda, namun dikelompokkan di sini secara utuh.</p>
                    
                    <div class="mb-4 relative max-w-md">
                        <span class="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400 text-sm">🔍</span>
                        <input type="text" id="searchInput" oninput="filterFiles()" placeholder="Cari nama file, folder, atau email drive..." class="w-full py-2.5 pl-10 pr-4 border border-slate-200 rounded-xl focus:outline-none focus:border-sky-600 focus:ring-4 focus:ring-sky-100 transition-all text-sm bg-slate-50/50">
                    </div>

                    <div class="mb-6 flex gap-2 overflow-x-auto pb-2 scrollbar-none">
                        <button onclick="setCategory('all')" id="cat-btn-all" class="cat-filter-btn px-4 py-2 rounded-xl text-xs font-semibold bg-sky-600 text-white transition-all whitespace-nowrap">📄 Semua</button>
                        <button onclick="setCategory('images')" id="cat-btn-images" class="cat-filter-btn px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all whitespace-nowrap">🖼️ Gambar</button>
                        <button onclick="setCategory('videos')" id="cat-btn-videos" class="cat-filter-btn px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all whitespace-nowrap">🎬 Video</button>
                        <button onclick="setCategory('archives')" id="cat-btn-archives" class="cat-filter-btn px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all whitespace-nowrap">📦 Arsip</button>
                        <button onclick="setCategory('apps')" id="cat-btn-apps" class="cat-filter-btn px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all whitespace-nowrap">📱 Aplikasi</button>
                        <button onclick="setCategory('docs')" id="cat-btn-docs" class="cat-filter-btn px-4 py-2 rounded-xl text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 transition-all whitespace-nowrap">📝 Dokumen</button>
                    </div>

                    <div class="overflow-x-auto rounded-xl border">
                        <table class="w-full text-left border-collapse">
                            <thead>
                                <tr class="bg-slate-50 text-slate-500 text-xs uppercase border-b">
                                    <th class="py-4 px-6 font-semibold">Nama File</th>
                                    <th class="py-4 px-6 font-semibold">Folder</th>
                                    <th class="py-4 px-6 font-semibold">Tujuan Penyimpanan</th>
                                    <th class="py-4 px-6 font-semibold">Ukuran</th>
                                    <th class="py-4 px-6 font-semibold text-right">Aksi</th>
                                </tr>
                            </thead>
                            <tbody id="filesTableBody"></tbody>
                        </table>
                    </div>
                </div>

                <div id="tab-logs" class="tab-content hidden text-sm">
                    <div class="flex justify-between items-center mb-6">
                        <h3 class="text-lg font-bold text-slate-900">Riwayat Tugas Server</h3>
                        <button onclick="fetchLogs()" class="text-xs text-sky-600 bg-sky-50 px-3 py-1.5 rounded-lg font-semibold hover:bg-sky-100 transition-all">🔄 Refresh</button>
                    </div>
                    <div class="bg-slate-50 rounded-2xl p-4 font-mono text-xs max-h-96 overflow-y-auto space-y-2 border" id="logContent"></div>
                </div>

                <div id="tab-settings" class="tab-content hidden">
                    <h3 class="text-lg font-bold text-slate-900 mb-1">Pengaturan Panel</h3>
                    <p class="text-slate-500 text-xs mb-6">Kelola PIN keamanan administrator, bot telegram, dan tambahkan / kurangi akun Google Drive di config.json.</p>
                    
                    <div class="space-y-8">
                        <div class="bg-slate-50/50 border border-slate-200/40 p-6 rounded-2xl">
                            <h4 class="text-sm font-bold text-slate-950 mb-1">🔒 Perbarui PIN Keamanan</h4>
                            <p class="text-slate-500 text-[11px] mb-4">Ganti PIN panel admin secara berkala demi keamanan data.</p>
                            <form onsubmit="handlePINChange(event)" class="max-w-md space-y-4">
                                <input type="password" id="oldPinInput" placeholder="PIN Lama" class="w-full py-2.5 px-4 border border-slate-200 rounded-xl focus:outline-none focus:border-sky-600 text-sm bg-white" required>
                                <input type="password" id="newPinInput" placeholder="PIN Baru (Hanya Angka)" class="w-full py-2.5 px-4 border border-slate-200 rounded-xl focus:outline-none focus:border-sky-600 text-sm bg-white" required>
                                <button type="submit" class="bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold px-5 py-2.5 rounded-xl transition-all shadow-md">Simpan PIN Baru</button>
                            </form>
                        </div>

                        <div class="bg-slate-50/50 border border-slate-200/40 p-6 rounded-2xl">
                            <h4 class="text-sm font-bold text-slate-950 mb-1">📢 Auto Kirim Notifikasi Telegram</h4>
                            <p class="text-slate-500 text-[11px] mb-4">Kirimkan rincian hasil unggahan langsung ke channel atau obrolan Telegram pribadi Anda.</p>
                            <form onsubmit="handleTelegramConfigSave(event)" class="max-w-md space-y-4">
                                <div class="flex items-center gap-2 py-1">
                                    <input type="checkbox" id="tgEnabled" class="w-4 h-4 text-sky-600 border-slate-300 rounded focus:ring-sky-500 cursor-pointer">
                                    <label for="tgEnabled" class="text-xs font-bold text-slate-700 cursor-pointer">Aktifkan Notifikasi Telegram</label>
                                </div>
                                <div>
                                    <label class="block text-slate-700 text-[11px] font-semibold uppercase mb-1">Bot Token Telegram</label>
                                    <input type="password" id="tgBotToken" placeholder="Contoh: 123456789:ABCDefGhI..." class="w-full py-2.5 px-4 border border-slate-200 rounded-xl focus:outline-none focus:border-sky-600 text-sm bg-white">
                                </div>
                                <div>
                                    <label class="block text-slate-700 text-[11px] font-semibold uppercase mb-1">ID Chat / Channel ID</label>
                                    <input type="text" id="tgChatId" placeholder="Contoh: -100123456789 atau ID user" class="w-full py-2.5 px-4 border border-slate-200 rounded-xl focus:outline-none focus:border-sky-600 text-sm bg-white">
                                </div>
                                <div>
                                    <label class="block text-slate-700 text-[11px] font-semibold uppercase mb-1">Custom Link Readme</label>
                                    <input type="url" id="tgCustomReadme" placeholder="Contoh: https://link-custom-kamu.com/readme" class="w-full py-2.5 px-4 border border-slate-200 rounded-xl focus:outline-none focus:border-sky-600 text-sm bg-white">
                                </div>
                                <button type="submit" class="bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold px-5 py-2.5 rounded-xl transition-all shadow-md">Simpan Konfigurasi Telegram</button>
                            </form>
                        </div>

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

                        <div class="bg-slate-50/50 border border-slate-200/40 p-6 rounded-2xl">
                            <h4 class="text-sm font-bold text-slate-950 mb-1">📋 Kurangi & Kelola Akun config.json</h4>
                            <p class="text-slate-500 text-[11px] mb-4">Daftar email terdaftar. Anda dapat menghapus atau mengurangi akun secara instan dari sini.</p>
                            <div id="configAccountsList" class="space-y-3 max-w-md">
                                </div>
                        </div>
                    </div>
                </div>
            </div>
        </main>

        <footer class="bg-white border-t py-3 text-center text-slate-400 text-[11px] fixed bottom-0 left-0 right-0 z-30 shadow-[0_-2px_10px_rgba(0,0,0,0.03)]">
            <p class="mb-0.5">All rights reserved © Copyright 2026, ZulhanPedia.</p>
            <p>Created with <span class="text-rose-500">♥️</span> Powered by Gemini & ZulhanPedia.</p>
        </footer>

    </div>

    <div id="toast" class="opacity-0 pointer-events-none transition-all duration-300 fixed bottom-16 right-5 z-50 bg-slate-900 text-white px-5 py-3 rounded-2xl text-sm font-medium shadow-xl flex items-center gap-3">
        <span id="toastIcon">🛡️</span><span id="toastMsg">Sukses</span>
    </div>

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
            
            const activeBtn = document.getElementById("btn-" + tabId);
            if (activeBtn) {
                activeBtn.className = "tab-btn px-5 py-3 rounded-xl font-medium text-sm transition-all bg-white text-sky-700 shadow-sm whitespace-nowrap";
                activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            }

            if (tabId === 'tab-logs') fetchLogs();
            if (tabId === 'tab-accounts') fetchAccounts();
            if (tabId === 'tab-settings') {
                fetchAccounts(); 
                fetchTelegramConfig(); 
            }
            if (tabId === 'tab-upload') syncUploadFormAccounts(); 
            if (tabId === 'tab-explorer') {
                document.getElementById("searchInput").value = ""; 
                setCategory('all'); 
                fetchFiles();
            }
        }

        function refreshData() { fetchStatus(); fetchAccounts(); fetchFiles(); }

        // JS Logic untuk mengambil konfigurasi Telegram saat ini
        function fetchTelegramConfig() {
            fetch('/api/telegram/config')
                .then(r => r.json())
                .then(cfg => {
                    document.getElementById("tgEnabled").checked = cfg.enabled;
                    document.getElementById("tgBotToken").value = cfg.botToken || "";
                    document.getElementById("tgChatId").value = cfg.chatId || "";
                    document.getElementById("tgCustomReadme").value = cfg.customReadme || "";
                });
        }

        // JS Logic untuk menyimpan konfigurasi Telegram
        function handleTelegramConfigSave(e) {
            e.preventDefault();
            const enabled = document.getElementById("tgEnabled").checked;
            const botToken = document.getElementById("tgBotToken").value.trim();
            const chatId = document.getElementById("tgChatId").value.trim();
            const customReadme = document.getElementById("tgCustomReadme").value.trim();

            fetch('/api/telegram/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled, botToken, chatId, customReadme })
            })
            .then(r => r.json())
            .then(d => {
                if (d.success) {
                    showToast("Konfigurasi Telegram disimpan!", "🚀");
                } else {
                    showToast("Gagal menyimpan konfigurasi Telegram.", "⚠️");
                }
            })
            .catch(() => {
                showToast("Terjadi kesalahan koneksi.", "⚠️");
            });
        }

        function syncUploadFormAccounts() {
            const select = document.getElementById("uploadAccountSelect");
            const currentSelected = select.value;
            
            select.innerHTML = '<option value="auto">Pilih Otomatis (Rekomendasi Cek Quota)</option>';
            window.activeAccounts.forEach(acc => {
                if (!acc.type.startsWith("Offline")) {
                    select.innerHTML += \`<option value="\${acc.email}">\${acc.email} (\${acc.type})</option>\`;
                }
            });
            
            if (currentSelected && [...select.options].some(opt => opt.value === currentSelected)) {
                select.value = currentSelected;
            } else {
                handleUploadAccountChange();
            }
        }

        function handleUploadAccountChange() {
            const accSelect = document.getElementById("uploadAccountSelect");
            const folderSelect = document.getElementById("uploadFolderSelect");
            const btnCreateFolder = document.getElementById("btnCreateFolderInline");
            const email = accSelect.value;

            if (email === "auto") {
                folderSelect.innerHTML = '<option value="">Pilih file dahulu untuk mendeteksi folder...</option>';
                folderSelect.disabled = true;
                btnCreateFolder.disabled = true;
                return;
            }

            folderSelect.disabled = false;
            btnCreateFolder.disabled = false;
            folderSelect.innerHTML = '<option value="">Memuat folder...</option>';

            fetch('/api/folders?email=' + encodeURIComponent(email))
                .then(r => r.json())
                .then(folders => {
                    folderSelect.innerHTML = '<option value="">Utama / Root</option>';
                    folders.forEach(f => {
                        folderSelect.innerHTML += \`<option value="\${f.id}">📁 \${f.name}</option>\`;
                    });
                })
                .catch(err => {
                    folderSelect.innerHTML = '<option value="">Gagal memuat folder</option>';
                });
        }

        function promptCreateFolder() {
            const email = document.getElementById("uploadAccountSelect").value;
            if (email === "auto") return;

            const name = prompt("Masukkan nama folder baru:");
            if (!name || name.trim() === "") return;

            const folderSelect = document.getElementById("uploadFolderSelect");
            const btnCreateFolder = document.getElementById("btnCreateFolderInline");

            folderSelect.disabled = true;
            btnCreateFolder.disabled = true;

            fetch('/api/folders/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email, folderName: name.trim() })
            })
            .then(r => r.json())
            .then(d => {
                folderSelect.disabled = false;
                btnCreateFolder.disabled = false;
                if (d.success) {
                    showToast("Folder berhasil dibuat!", "📁");
                    const opt = document.createElement("option");
                    opt.value = d.id;
                    opt.innerText = "📁 " + d.name;
                    opt.selected = true;
                    folderSelect.appendChild(opt);
                } else {
                    showToast(d.message, "⚠️");
                    handleUploadAccountChange();
                }
            })
            .catch(err => {
                folderSelect.disabled = false;
                btnCreateFolder.disabled = false;
                showToast("Koneksi gagal membuat folder.", "⚠️");
                handleUploadAccountChange();
            });
        }

        window.allFiles = [];
        let currentCategory = 'all';

        function fetchFiles() {
            fetch('/api/files').then(r => r.json()).then(fs => {
                window.allFiles = fs;
                filterFiles();
            });
        }

        function displayFiles(files) {
            const body = document.getElementById("filesTableBody");
            body.innerHTML = files.length === 0 ? '<tr><td colspan="5" class="text-center py-8 text-slate-400">Belum ada file.</td></tr>' : '';
            files.forEach(f => {
                const sizeMB = (f.size / (1024 * 1024)).toFixed(2);
                const folderDisp = f.folderName ? f.folderName : "Utama / Root";
                
                body.innerHTML += \`
                    <tr class="border-b hover:bg-slate-50/40 text-sm">
                        <td class="py-4 px-6 font-medium text-slate-900 truncate max-w-[180px] sm:max-w-xs" title="\${f.name}">\${f.name}</td>
                        <td class="py-4 px-6 text-sky-700 text-xs font-semibold">
                            <span class="inline-flex items-center gap-1 bg-sky-50 px-2 py-1 rounded-lg border border-sky-100/50 truncate max-w-[120px]">
                                📁 \${folderDisp}
                            </span>
                        </td>
                        <td class="py-4 px-6 text-slate-500 text-xs truncate max-w-[120px] sm:max-w-xs">\${f.accountEmail}</td>
                        <td class="py-4 px-6 text-slate-600"> \` + sizeMB + \` MB</td>
                        <td class="py-4 px-6 text-right space-x-1 shrink-0 whitespace-nowrap">
                            <button onclick="copyDownloadLink('\${f.id}', '\${f.googleDriveFileId}')" class="text-sky-600 font-semibold text-xs py-1 px-2.5 bg-sky-50 rounded-lg hover:bg-sky-100">Salin</button>
                            <a href="/api/download/\${f.id}" class="text-sky-600 font-semibold text-xs py-1 px-2.5 bg-sky-50 rounded-lg inline-block hover:bg-sky-100">Unduh</a>
                            <button onclick="deleteFile('\${f.id}')" class="text-rose-600 font-semibold text-xs py-1 px-2.5 bg-rose-50 rounded-lg hover:bg-rose-100">Hapus</button>
                        </td>
                    </tr>\`;
            });
        }

        function setCategory(cat) {
            currentCategory = cat;
            document.querySelectorAll(".cat-filter-btn").forEach(btn => {
                btn.classList.replace("bg-sky-600", "bg-slate-100");
                btn.classList.replace("text-white", "text-slate-600");
            });
            const activeBtn = document.getElementById("cat-btn-" + cat);
            if (activeBtn) {
                activeBtn.classList.replace("bg-slate-100", "bg-sky-600");
                activeBtn.classList.replace("text-slate-600", "text-white");
            }
            filterFiles();
        }

        function filterFiles() {
            const query = document.getElementById("searchInput").value.toLowerCase().trim();
            let filtered = window.allFiles;

            if (currentCategory !== 'all') {
                filtered = filtered.filter(f => {
                    const ext = f.name.slice((f.name.lastIndexOf(".") - 1 >>> 0) + 2).toLowerCase();
                    if (currentCategory === 'images') {
                        return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext);
                    } else if (currentCategory === 'videos') {
                        return ['mp4', 'mkv', 'avi', 'mov', 'webm', 'flv', '3gp'].includes(ext);
                    } else if (currentCategory === 'archives') {
                        return ['zip', 'rar', 'tar', 'gz', '7z', 'iso'].includes(ext);
                    } else if (currentCategory === 'apps') {
                        return ['apk', 'xapk', 'ipa', 'deb', 'mtz'].includes(ext);
                    } else if (currentCategory === 'docs') {
                        return ['pdf', 'docx', 'xlsx', 'pptx', 'txt', 'epub', 'rtf'].includes(ext);
                    }
                    return false;
                });
            }

            if (query !== "") {
                filtered = filtered.filter(f => 
                    f.name.toLowerCase().includes(query) || 
                    (f.folderName && f.folderName.toLowerCase().includes(query)) ||
                    f.accountEmail.toLowerCase().includes(query)
                );
            }

            displayFiles(filtered);
        }

        function copyDownloadLink(id, googleDriveFileId) {
            let link = "";
            if (googleDriveFileId && googleDriveFileId !== "local_storage_file") {
                link = "https://drive.google.com/uc?export=download&id=" + googleDriveFileId;
            } else {
                link = window.location.origin + '/api/download/' + id;
            }
            const tempInput = document.createElement("input");
            tempInput.value = link;
            document.body.appendChild(tempInput);
            tempInput.select();
            document.execCommand("copy");
            document.body.removeChild(tempInput);
            showToast("Tautan Google Drive disalin!", "📋");
        }

        function fetchLogs() {
            fetch('/api/logs').then(r => r.json()).then(l => {
                const c = document.getElementById("logContent");
                if (l.length === 0) {
                    c.innerHTML = '<div class="text-center text-slate-400 text-xs py-4">Belum ada riwayat tugas terekam.</div>';
                    return;
                }
                c.innerHTML = l.map(log => \`<div><span class="text-sky-500">[\\u00A0\${new Date(log.timestamp).toLocaleTimeString()}\\u00A0]</span> \${log.message}</div>\`).join('');
            });
        }

        function updateFileInfo() {
            const input = document.getElementById("fileInput");
            const select = document.getElementById("uploadAccountSelect");
            const folderSelect = document.getElementById("uploadFolderSelect");
            const btnCreateFolder = document.getElementById("btnCreateFolderInline");
            const statusText = document.getElementById("uploadStatusText");

            if (input.files && input.files[0]) {
                const file = input.files[0];
                
                document.getElementById("fileSelectLabel").innerText = "Membaca berkas... ⏱️";
                statusText.innerText = "Mendapatkan info metadata...";

                setTimeout(() => {
                    // Visualisasi nama file yang disanitasi di sisi Web UI sebelum diupload
                    const processedName = file.name.replace(/[\s_]+/g, '-');
                    document.getElementById("fileSelectLabel").innerText = "Ganti file terpilih";
                    document.getElementById("selectedFileName").innerText = processedName;
                    document.getElementById("selectedFileSize").innerText = (file.size/1024/1024).toFixed(2) + " MB";
                    document.getElementById("fileDetailContainer").classList.remove("hidden");
                    document.getElementById("btnUploadSubmit").disabled = false;
                    
                    document.getElementById("uploadProgressBg").style.width = "0%";
                    document.getElementById("uploadPercentage").classList.add("hidden");
                    document.getElementById("uploadPercentage").innerText = "0%";
                    document.getElementById("cancelUploadBtn").classList.remove("hidden");

                    if (select.value === "auto") {
                        statusText.innerText = "Mengevaluasi penyimpanan ideal...";
                        fetch('/api/upload/preflight', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ size: file.size })
                        })
                        .then(r => r.json())
                        .then(d => {
                            if (d.success) {
                                statusText.innerText = "Target Akun: " + d.email;
                                folderSelect.disabled = false;
                                btnCreateFolder.disabled = false;
                                folderSelect.innerHTML = '<option value="">Memuat folder...</option>';
                                
                                fetch('/api/folders?email=' + encodeURIComponent(d.email))
                                    .then(r => r.json())
                                    .then(folders => {
                                        folderSelect.innerHTML = '<option value="">Utama / Root</option>';
                                        folders.forEach(f => {
                                            folderSelect.innerHTML += \`<option value="\${f.id}">📁 \${f.name}</option>\`;
                                        });
                                    })
                                    .catch(() => {
                                        folderSelect.innerHTML = '<option value="">Utama / Root (Gagal memuat)</option>';
                                    });
                            } else {
                                statusText.innerText = "⚠️ Quota tidak memadai!";
                                document.getElementById("btnUploadSubmit").disabled = true;
                            }
                        });
                    } else {
                        statusText.innerText = "Target Akun: " + select.value;
                    }
                }, 100);
            } else { resetUploadForm(); }
        }

        function resetUploadForm() {
            document.getElementById("fileInput").value = "";
            document.getElementById("fileSelectLabel").innerText = "Klik untuk memilih berkas";
            document.getElementById("fileDetailContainer").classList.add("hidden");
            document.getElementById("btnUploadSubmit").disabled = true;
            document.getElementById("btnUploadSubmit").innerText = "Upload";
            document.getElementById("uploadStatusText").innerText = "";
            syncUploadFormAccounts();
        }

        window.currentXhr = null;

        function handleUpload(e) {
            e.preventDefault();
            const file = document.getElementById("fileInput").files[0];
            if (!file) return;

            const btn = document.getElementById("btnUploadSubmit");
            const progressBg = document.getElementById("uploadProgressBg");
            const percentLabel = document.getElementById("uploadPercentage");
            const cancelBtn = document.getElementById("cancelUploadBtn");
            const accSelect = document.getElementById("uploadAccountSelect");
            const folderSelect = document.getElementById("uploadFolderSelect");
            
            btn.disabled = true;
            btn.innerText = "Uploading... ☁️";
            
            progressBg.style.width = "0%";
            percentLabel.innerText = "Inisialisasi...";
            percentLabel.classList.remove("hidden");

            const selectedFolderId = folderSelect.value;
            const selectedFolderName = folderSelect.options[folderSelect.selectedIndex] ? folderSelect.options[folderSelect.selectedIndex].text.replace("📁 ", "") : "Utama / Root";

            fetch('/api/upload/init', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    name: file.name, 
                    size: file.size, 
                    mimeType: file.type || 'application/octet-stream', 
                    targetEmail: accSelect.value, 
                    folderId: selectedFolderId 
                })
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

                const targetFileName = data.sanitizedName || file.name;

                if (data.simulated) {
                    percentLabel.innerText = "Uploading (Lokal)...";
                    const fd = new FormData();
                    fd.append("file", file);
                    fd.append("email", data.email);
                    fd.append("folderName", selectedFolderId);

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
                            showToast("Berkas tersimpan di folder lokal!", "✅");
                        } else {
                            showToast("Upload lokal gagal.", "⚠️");
                            resetUploadForm();
                        }
                    });
                    
                    xhr.open('POST', '/api/upload/local');
                    xhr.send(fd);
                    return;
                }

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
                        let responseDrive;
                        try {
                            responseDrive = JSON.parse(xhr.responseText);
                        } catch (e) {
                            console.error("Gagal mengurai respon JSON Google:", e);
                        }
                        
                        const driveFileId = (responseDrive && responseDrive.id) ? responseDrive.id : "gdrive_file_unknown_" + Date.now();
                        
                        fetch('/api/upload/confirm', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                name: targetFileName,
                                size: file.size,
                                mimeType: file.type,
                                accountEmail: data.email,
                                googleDriveFileId: driveFileId,
                                folderId: selectedFolderId,
                                folderName: selectedFolderName
                            })
                        })
                        .then(r => {
                            if (!r.ok) throw new Error("Gagal mendaftarkan berkas di basis data virtual.");
                            return r.json();
                        })
                        .then(() => {
                            resetUploadForm();
                            refreshData();
                            switchTab('tab-explorer');
                            showToast("Sukses upload langsung ke Google Drive!", "🚀");
                        })
                        .catch(err => {
                            showToast(err.message, "⚠️");
                            resetUploadForm();
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

                xhr.open('PUT', data.uploadUrl);
                xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
                xhr.send(file); 
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

        window.activeAccounts = [];

        function fetchAccounts() {
            fetch('/api/accounts').then(r => r.json()).then(accs => {
                window.activeAccounts = accs;
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

        let touchStartX = 0;
        let touchStartY = 0;
        let touchEndX = 0;
        let touchEndY = 0;

        const tabOrder = ['tab-accounts', 'tab-upload', 'tab-explorer', 'tab-logs', 'tab-settings'];

        document.addEventListener('touchstart', e => {
            if (e.target.closest('.overflow-x-auto') || e.target.closest('input') || e.target.closest('select') || e.target.closest('textarea')) return;
            touchStartX = e.changedTouches[0].screenX;
            touchStartY = e.changedTouches[0].screenY;
        }, { passive: true });

        document.addEventListener('touchend', e => {
            if (e.target.closest('.overflow-x-auto') || e.target.closest('input') || e.target.closest('select') || e.target.closest('textarea')) return;
            touchEndX = e.changedTouches[0].screenX;
            touchEndY = e.changedTouches[0].screenY;
            handleSwipeGesture();
        }, { passive: true });

        function handleSwipeGesture() {
            const diffX = touchEndX - touchStartX;
            const diffY = touchEndY - touchStartY;
            
            if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 80) {
                const activeTab = document.querySelector(".tab-content:not(.hidden)");
                if (!activeTab) return;
                const currentTabId = activeTab.id;
                const currentIndex = tabOrder.indexOf(currentTabId);

                if (diffX < 0) {
                    const nextIndex = (currentIndex + 1) % tabOrder.length;
                    switchTab(tabOrder[nextIndex]);
                } else {
                    const prevIndex = (currentIndex - 1 + tabOrder.length) % tabOrder.length;
                    switchTab(tabOrder[prevIndex]);
                }
            }
        }
    </script>
</body>
</html>`);
});

// Menghidupkan Web Server di Termux HP Jadul dengan Visualisasi Kotak ASCII Dinamis yang Terpusat
app.listen(PORT, '0.0.0.0', () => {
    const cols = process.stdout.columns || 80;
    const boxWidth = 60;
    const padding = Math.max(0, Math.floor((cols - boxWidth) / 2));
    const padStr = " ".repeat(padding);

    const cyan = '\x1b[36m';
    const bold = '\x1b[1m';
    const reset = '\x1b[0m';
    const green = '\x1b[32m';
    const yellow = '\x1b[33m';
    const white = '\x1b[37m';

    console.log("");
    console.log(padStr + cyan + "┌──────────────────────────────────────────────────────────┐" + reset);
    console.log(padStr + cyan + "│   " + green + bold + "Sistem ServerQuu Multi-Drive telah Aktif di Android!   " + cyan + "│" + reset);
    console.log(padStr + cyan + "├──────────────────────────────────────────────────────────┤" + reset);
    console.log(padStr + cyan + "│ " + yellow + "Author    :" + white + " Izzuddin Badawi                               " + cyan + "│" + reset);
    console.log(padStr + cyan + "│ " + yellow + "Telegram  :" + white + " @Hyperos_id                                   " + cyan + "│" + reset);
    console.log(padStr + cyan + "│ " + yellow + "Version   :" + white + " 1.2.0                                         " + cyan + "│" + reset);
    console.log(padStr + cyan + "│ " + yellow + "Config    :" + white + " config.json                                   " + cyan + "│" + reset);
    console.log(padStr + cyan + "│ " + yellow + "Local Link:" + cyan + bold + " http://localhost:" + PORT + " ".repeat(Math.max(0, 24 - (PORT.toString().length - 4))) + cyan + "│" + reset);
    console.log(padStr + cyan + "└──────────────────────────────────────────────────────────┘" + reset);
    console.log("");
});