
// main.js - نسخه جامع و اصلاح شده برای Frame Show AI
const { app, BrowserWindow, dialog, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { execSync, spawn, exec } = require('child_process'); 

// ==========================================
// 1. تنظیمات و مسیرهای ذخیره‌سازی
// ==========================================
let mainWindow = null;
let loadingWindow = null;
let serverReady = false;
let pyServerProcess = null;

const SERVER_URL = 'http://127.0.0.1:5000';
const APP_DATA_PATH = app.getPath('userData');
const STORE_FILE = path.join(APP_DATA_PATH, 'app_store.json');
const CMS_BASE_PATH = path.join(APP_DATA_PATH, 'cms_models');

function ensureDirectories() {
    if (!fs.existsSync(CMS_BASE_PATH)) {
        fs.mkdirSync(CMS_BASE_PATH, { recursive: true });
        fs.mkdirSync(path.join(CMS_BASE_PATH, 'doors'), { recursive: true });
        fs.mkdirSync(path.join(CMS_BASE_PATH, 'windows'), { recursive: true });
    }
}
ensureDirectories();


// main.js - این تابع را جایگزین نسخه قبلی کنید

// =======================================================
// ===> این تابع را جایگزین تابع startPythonServer فعلی کنید <===
// =======================================================
function startPythonServer() {
    let serverPath;

    // تعیین مسیر سرور بر اساس حالت توسعه یا نصب شده
    if (app.isPackaged) {
        // در نسخه نهایی، سرور در کنار فایل اجرایی اصلی قرار می‌گیرد
        serverPath = path.join(path.dirname(app.getPath('exe')), 'FrameShowAIServer', 'FrameShowAIServer.exe');
    } else {
        // در حالت توسعه (npm start)، سرور در پوشه dist/FrameShowAIServer است
        serverPath = path.join(__dirname, 'dist', 'FrameShowAIServer', 'FrameShowAIServer.exe');
    }

    const MAX_RETRIES = 15; // تعداد تلاش برای پیدا کردن سرور
    const RETRY_INTERVAL = 500; // فاصله زمانی بین هر تلاش (نیم ثانیه)
    let retries = 0;

    // این تابع داخلی، مسئول پیدا کردن و اجرای سرور است
    function findAndStart() {
        if (fs.existsSync(serverPath)) {
            // فایل پیدا شد! حالا آن را اجرا می‌کنیم.
            console.log(`[Main Process] Server found at: ${serverPath}. Starting process...`);
            try {
                // پنجره کنسول را برای عیب‌یابی باز می‌گذاریم. برای نسخه نهایی می‌توانید windowsHide: true بگذارید
                pyServerProcess = spawn(serverPath, [], { windowsHide: false });

                // لاگ‌های عادی سرور را چاپ کن
                pyServerProcess.stdout.on('data', (data) => {
                    console.log(`[Python Server]: ${data.toString().trim()}`);
                });

                // هشدارهای سرور را چاپ کن، اما برنامه را نبند
                pyServerProcess.stderr.on('data', (data) => {
                    console.error(`[Python Server Warning/Error]: ${data.toString().trim()}`);
                });

                // فقط در صورتی که سرور کاملاً از کار بیفتد، خطا نمایش بده
                pyServerProcess.on('close', (code) => {
                    console.log(`Python server process exited with code: ${code}`);
                    if (code !== 0 && !mainWindow) { // اگر کد خطا داشت و پنجره اصلی هنوز باز نشده بود
                       dialog.showErrorBox("موتور پردازشی از کار افتاد", `سرور به صورت غیرمنتظره بسته شد. لطفاً برنامه را دوباره اجرا کنید.`);
                    }
                });
                
                // حالا که سرور اجرا شد، منتظر آماده به کار شدنش می‌مانیم
                checkServerStatus();

            } catch (e) {
                dialog.showErrorBox("خطای اجرایی", `امکان اجرای موتور پردازشی وجود نداشت.\n${e.message}`);
                app.quit();
            }
        } else {
            // اگر فایل پیدا نشد، ناامید نشو! دوباره تلاش کن.
            retries++;
            if (retries < MAX_RETRIES) {
                console.warn(`[Main Process] Server not found, retrying in ${RETRY_INTERVAL}ms... (Attempt ${retries}/${MAX_RETRIES})`);
                setTimeout(findAndStart, RETRY_INTERVAL);
            } else {
                // اگر بعد از چندین تلاش هنوز پیدا نشد، آنگاه خطا بده
                dialog.showErrorBox("خطای حیاتی", `موتور پردازشی یافت نشد. لطفاً مطمئن شوید فرآیند ساخت با 'npm run dist' یا 'npm run py-server-build' کامل شده باشد.\nمسیر مورد انتظار: ${serverPath}`);
                app.quit();
            }
        }
    }
    
    // اولین تلاش برای پیدا کردن و اجرای سرور را شروع کن
    findAndStart();
}


// ==========================================
// 3. توابع امنیتی و لایسنس
// ==========================================

function getMachineId() {
    try {
        return execSync('wmic csproduct get uuid').toString().split('\n')[1].trim();
    } catch (e) { return 'UNKNOWN-ID'; }
}

function getStore() {
    try {
        if (!fs.existsSync(STORE_FILE)) return {};
        return JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
    } catch (e) { return {}; }
}

function setStore(store) {
    try {
        fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), 'utf8');
    } catch (e) { console.error("Store Error:", e); }
}

function checkLicense() {
    const store = getStore();
    const TRIAL_DAYS = 7;
    let trialStart = store.trialStart;

    if (!trialStart) {
        trialStart = Date.now();
        store.trialStart = trialStart;
        store.subscriptionExpires = trialStart + (TRIAL_DAYS * 24 * 60 * 60 * 1000);
        setStore(store);
    }

    const status = {
        isActive: store.subscriptionExpires > Date.now(),
        remainingDays: Math.max(0, Math.ceil((store.subscriptionExpires - Date.now()) / (86400000))),
        expiresAt: store.subscriptionExpires,
        isTrial: true
    };

    if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('subscription-status', status);
    }
    return status;
}

// ==========================================
// 4. مدیریت پنجره‌ها (اصلاح شده برای رفع صفحه خالی)
// ==========================================

function createLoadingWindow() {
    loadingWindow = new BrowserWindow({
        width: 500, height: 350,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        resizable: false,
        center: true,
        webPreferences: {
             preload: path.join(__dirname, 'preload.js'), // به پل امن ما اشاره می‌کند
             contextIsolation: true,  // <<< بسیار مهم
             nodeIntegration: false,    // <<< بسیار مهم
            devTools: true
         
        }
    });
    
    loadingWindow.loadFile('loading.html');
    
    loadingWindow.once('ready-to-show', () => {
        loadingWindow.show();
        startPythonServer(); 
        checkServerStatus(); 
    });
}

function createMainWindow() {
    if (loadingWindow) {
        loadingWindow.close();
        loadingWindow = null;
    }
    
    Menu.setApplicationMenu(null); 

    // ... در تابع createMainWindow
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    icon: path.join(__dirname, 'iconvk.png'),
    webPreferences: {
      // =======================================================
      // ===> کد اصلاح شده و صحیح برای معماری مدرن الکترون <===
      // =======================================================
      preload: path.join(__dirname, 'preload.js'), // به پل امن ما اشاره می‌کند

      contextIsolation: true,  // <<< بسیار مهم: این دو دنیا را از هم جدا و امن می‌کند
      nodeIntegration: false,    // <<< بسیار مهم: این از خطای require is not defined جلوگیری می‌کند
      
      devTools: true             // برای عیب‌یابی باز می‌ماند
      // webSecurity: false دیگر نیازی نیست، چون ما از روش امن‌تری استفاده می‌کنیم
    }
  });


    mainWindow.loadFile('index.html');
    
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        checkLicense();
    });
}

function checkServerStatus() {
    const request = http.request(`${SERVER_URL}/health`, { method: 'GET', timeout: 800 }, (res) => {
        if (res.statusCode === 200) {
            serverReady = true;
            createMainWindow();
        } else {
            setTimeout(checkServerStatus, 1000);
        }
    });
    
    request.on('error', () => {
        setTimeout(checkServerStatus, 1000);
    });
    request.end();
}

// ==========================================
// 5. هندلرهای IPC (بدون هیچ تغییری)
// ==========================================

ipcMain.handle('get-machine-id', () => getMachineId());

ipcMain.handle('vto-render', async (event, data) => {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify(data);
        const options = {
            hostname: '127.0.0.1', port: 5000,
            path: '/api/vto/process', method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'Content-Length': Buffer.byteLength(postData) 
            }
        };
        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => resolve(JSON.parse(body)));
        });
        req.on('error', (e) => reject(e));
        req.write(postData);
        req.end();
    });
});

ipcMain.handle('run-grabcut', async (event, data) => {
    return new Promise((resolve, reject) => {
        // 'data' شامل عکس، کادر، و نقاط راهنما است
        const postData = JSON.stringify(data); 
        const options = {
            hostname: '127.0.0.1', port: 5000,
            path: '/api/grabcut', // <<< مسیر API جدید در سرور پایتون
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };
        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (e) {
                    reject(e); // اگر پاسخ JSON معتبر نباشد
                }
            });
        });
        req.on('error', (e) => reject(e));
        req.write(postData);
        req.end();
    });
});


ipcMain.handle('request-subscription-update', async () => checkLicense());

ipcMain.handle('execute-fs-operation', async (event, operation, ...args) => {
    const store = getStore();
    try {
        switch (operation) {
            case 'getStoreValue': return store[args[0]] || null;
            case 'setStoreValue':
                store[args[0]] = args[1];
                setStore(store);
                return { success: true };
            case 'saveFile':
                const destDir = path.join(CMS_BASE_PATH, args[0]);
                if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
                fs.copyFileSync(args[2], path.join(destDir, args[1]));
                return { success: true };
            case 'listFiles':
                const dir = path.join(CMS_BASE_PATH, args[0]);
                if (!fs.existsSync(dir)) return [];
                return fs.readdirSync(dir).map(file => {
                    const bitmap = fs.readFileSync(path.join(dir, file));
                    return {
                        name: file,
                        path: `data:image/png;base64,${bitmap.toString('base64')}`
                    };
                });
            case 'deleteFile':
                const target = path.join(CMS_BASE_PATH, args[0], args[1]);
                if (fs.existsSync(target)) fs.unlinkSync(target);
                return { success: true };
            case 'clearAllData':
                if (fs.existsSync(STORE_FILE)) fs.unlinkSync(STORE_FILE);
                if (fs.existsSync(CMS_BASE_PATH)) fs.rmSync(CMS_BASE_PATH, { recursive: true, force: true });
                ensureDirectories();
                return { success: true };
            default: return null;
        }
    } catch (e) { return { error: e.message }; }
    
});

// ==========================================
// 6. چرخه عمر برنامه
// ==========================================

app.whenReady().then(createLoadingWindow);

app.on('window-all-closed', () => {
    if (pyServerProcess) {
        // روش صحیح و امن برای بستن پراسس
        if (process.platform === 'win32') {
            exec(`taskkill /pid ${pyServerProcess.pid} /f /t`, () => {
                app.quit();
            });
        } else {
            pyServerProcess.kill();
            app.quit();
        }
    } else {
        app.quit();
    }
});

