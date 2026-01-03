// app.js - نسخه جامع (سازگار با وب و Electron) + متصل به Google Forms

// =========================================================================================
// ********************** متغیرهای سراسری (Global Variables) **********************
// =========================================================================================

let isFsActive = true; 
let subscriptionStatus = { isActive: true, isTrialExpired: false, remainingDays: 30, expiresAt: null }; 
let isPreviewMode = false;

let doorCanvas, doorCtx;
let doorImage = new Image(); 
let currentDoorModel = null; 
let doorPoints = [{x: 50, y: 50}, {x: 150, y: 50}, {x: 150, y: 150}, {x: 50, y: 150}]; 
let doorImageLoaded = false;
let doorDraggingPoint = null;

let windowCanvas, windowCtx;
let windowImage = new Image(); 
let currentWindowModel = null;
let windowPoints = [{x: 50, y: 50}, {x: 150, y: 50}, {x: 150, y: 150}, {x: 50, y: 150}]; 
let windowImageLoaded = false;
let windowDraggingPoint = null;

const DOORS_INDEX_KEY = 'doors_models';
const WINDOWS_INDEX_KEY = 'windows_models';

// چک کردن اینکه آیا در محیط Electron هستیم یا مرورگر معمولی
const isElectron = typeof window.electronAPI !== 'undefined';
const API_BASE_URL = "https://frame-show-project-1.onrender.com/health";

// =========================================================================================
// ********************** تابع ارسال گزارش به Google Form **********************
// =========================================================================================

async function sendToGoogleForm(machineId, planName) {
    const formURL = "https://docs.google.com/forms/d/e/1FAIpQLSdhxjZHSBY92_TxyUB5deFnivRbiDQLdRDvIR1X4sC6sSy0FQ/formResponse";
    const formData = new FormData();
    
    // آی‌دی فیلد شما: entry.579462829
    formData.append("entry.579462829", `User: ${machineId} | Requesting Plan: ${planName} | Date: ${new Date().toLocaleString('fa-IR')}`);

    try {
        await fetch(formURL, {
            method: "POST",
            mode: "no-cors",
            body: formData
        });
        console.log("Report sent to Google Form");
    } catch (error) {
        console.error("Error sending report:", error);
    }
}

// =========================================================================================
// ********************** تابع آپلود تصویر پس‌زمینه **********************
// =========================================================================================

function handleImageUpload(e, isDoor) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        const img = isDoor ? doorImage : windowImage;
        img.onload = () => {
            const canvas = isDoor ? doorCanvas : windowCanvas;
            const ctx = canvas.getContext('2d');

            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;

            const w = img.naturalWidth;
            const h = img.naturalHeight;
            const size = Math.min(w, h) * 0.15; 
            
            const initialPoints = [
                { x: (w/2) - size, y: (h/2) - size }, 
                { x: (w/2) + size, y: (h/2) - size }, 
                { x: (w/2) + size, y: (h/2) + size }, 
                { x: (w/2) - size, y: (h/2) + size }  
            ];

            if (isDoor) {
                doorImageLoaded = true;
                doorPoints = initialPoints;
            } else {
                windowImageLoaded = true;
                windowPoints = initialPoints;
            }

            ctx.drawImage(img, 0, 0);
            updatePointsVisibility();
            
            const statusLabel = document.getElementById(`${isDoor?'door':'window'}-status-label`);
            if(statusLabel) statusLabel.textContent = "تصویر بارگذاری شد. حالا مدل را انتخاب کنید.";
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

// =========================================================================================
// ********************** توابع مدیریت فایل و کمکی **********************
// =========================================================================================

// =======================================================
// ===> این تابع را نیز جایگزین کنید <===
// =======================================================
async function getWindows() {
    if (isElectron) {
        const data = await window.electronAPI.executeFsOperation('getStoreValue', WINDOWS_INDEX_KEY);
        try { return JSON.parse(data || '[]'); } catch (e) { return []; }
    } else {
        // حالت وب: از یک فایل JSON آنلاین بخوان
        const response = await fetch(`${API_BASE_URL}/models/windows.json`);
        return await response.json();
    }
}

async function getWindows() {
    if (isElectron) {
        const data = await window.electronAPI.executeFsOperation('getStoreValue', WINDOWS_INDEX_KEY);
        try { return JSON.parse(data || '[]'); } catch (e) { return []; }
    } else {
        return JSON.parse(localStorage.getItem(WINDOWS_INDEX_KEY) || '[]');
    }
}

function getBase64FromImage(imgElement, type = 'jpeg') {
    const canvas = document.createElement('canvas');
    canvas.width = imgElement.naturalWidth; 
    canvas.height = imgElement.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imgElement, 0, 0);
    return canvas.toDataURL(type === 'png' ? 'image/png' : 'image/jpeg').split(',')[1];
}

function getPointPositionRatio(point, canvasWidth, canvasHeight, bgWidth, bgHeight) {
    const scaleX = bgWidth / canvasWidth; 
    const scaleY = bgHeight / canvasHeight;
    return [ (point.x * scaleX) / bgWidth, (point.y * scaleY) / bgHeight ];
}

// =========================================================================================
// ********************** تابع اصلی رندر **********************
// =========================================================================================

async function renderVTO_Python(vtoType) {
    const isDoor = vtoType === 'door';
    const bgImg = isDoor ? doorImage : windowImage;
    const modelData = isDoor ? currentDoorModel : currentWindowModel;
    const pointsArray = isDoor ? doorPoints : windowPoints;
    const canvas = isDoor ? doorCanvas : windowCanvas;
    const statusLabel = document.getElementById(`${vtoType}-status-label`);
    
    const brightnessValue = 1.0; 
    const opacityValue = 1.0;

    if (!subscriptionStatus.isActive) {
        if(statusLabel) {
            statusLabel.textContent = "⚠️ اشتراک فعال نیست.";
            statusLabel.style.color = 'red';
        }
        return; 
    }

    if (!bgImg.src || !canvas || !modelData || !modelData.img) return;
    
    if (!isElectron) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(bgImg, 0, 0);
        ctx.drawImage(modelData.img, pointsArray[0].x, pointsArray[0].y, pointsArray[2].x - pointsArray[0].x, pointsArray[2].y - pointsArray[0].y);
        return;
    }

    const corners = pointsArray.map(p => getPointPositionRatio(p, canvas.width, canvas.height, bgImg.naturalWidth, bgImg.naturalHeight));
    const bgBase64 = getBase64FromImage(bgImg, 'jpeg'); 
    const modelBase64 = getBase64FromImage(modelData.img, 'png'); 

// =======================================================
// ===> این بلاک try...catch را جایگزین کنید <===
// =======================================================
try {
    let response; // متغیر پاسخ را بیرون تعریف می‌کنیم

    // چک می‌کنیم در ��دام محیط هستیم
    if (isElectron) {
        // --- حالت دسکتاپ (Electron) ---
        // از API داخلی برای ارتباط با سرور محلی استفاده کن
        response = await window.electronAPI.py.render({
            background: bgBase64, 
            model: modelBase64, 
            corners: corners, 
            opacity: opacityValue, 
            brightness: brightnessValue 
        });
    } else {
        // --- حالت وب (افزونه) ---
        // یک درخواست fetch به سرور آنلاین ارسال کن
        const webResponse = await fetch(`${API_BASE_URL}/api/vto/process`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                background: bgBase64, 
                model: modelBase64, 
                corners: corners, 
                opacity: opacityValue, 
                brightness: brightnessValue 
            })
        });

        if (!webResponse.ok) {
            // اگر سرور خطا داد (مثلاً 500)، آن را نمایش بده
            throw new Error(`Server returned an error: ${webResponse.statusText}`);
        }
        response = await webResponse.json();
    }

    // ادامه منطق برنامه که برای هر دو حالت یکسان است
    if (response.status === 'success') {
        const finalImage = new Image();
        finalImage.onload = () => {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height); 
            ctx.drawImage(finalImage, 0, 0, canvas.width, canvas.height); 
            if(statusLabel) {
                statusLabel.textContent = `✅ مدل اعمال شد.`;
                statusLabel.style.color = 'green';
            }
        };
        finalImage.src = 'data:image/jpeg;base64,' + response.result_image_base64;
    } else {
        // اگر سرور پاسخ داد ولی status برابر success نبود
        throw new Error(response.error || 'An unknown error occurred on the server.');
    }

} catch (error) {
    console.error("Render process failed:", error);
    if(statusLabel) {
        statusLabel.textContent = `⚠️ خطا در پردازش.`;
        statusLabel.style.color = 'red';
    }
}
}
const throttledRenderVTO = throttle(renderVTO_Python, 150);

// =========================================================================================
// ********************** مدیریت خرید آنلاین و لایسنس **********************
// =========================================================================================

async function startPayment(planType) {
    let machineId = "WEB_USER";
    if(isElectron) machineId = await window.electronAPI.getMachineId();
    
    // ارسال گزارش به گوگل فرم قبل از انتقال به درگاه
    await sendToGoogleForm(machineId, planType);
    
    const checkoutUrl = `https://your-website.com/pay?mid=${machineId}&plan=${planType}`;
    
    alert("درخواست شما ثبت شد. در حال انتقال به درگاه پرداخت...");
    window.open(checkoutUrl, '_blank');

    if (isElectron) {
        const checkInterval = setInterval(async () => {
            const status = await window.electronAPI.requestSubscriptionUpdate();
            if (status.isActive) {
                alert("✅ تبریک! پرداخت موفقیت‌آمیز بود و اشتراک شما فعال شد.");
                updateSubscriptionUI(status);
                clearInterval(checkInterval);
            }
        }, 10000);
        setTimeout(() => clearInterval(checkInterval), 600000);
    }
}

function updateSubscriptionUI(status) {
    subscriptionStatus = status;
    const statusText = document.getElementById('subscription-text');
    const daysBadge = document.getElementById('days-left-badge');
    const authContainer = document.getElementById('auth-container');
    const machineIdDisplay = document.getElementById('display-machine-id');

    if (authContainer) {
        if (status.isActive) {
            if(statusText) statusText.textContent = "✅ اشتراک فعال است";
            if(daysBadge) daysBadge.textContent = `${status.remainingDays} روز باقی‌مانده`;
            authContainer.style.backgroundColor = 'var(--success-color)';
        } else {
            if(statusText) statusText.textContent = "❌ اشتراک غیرفعال";
            if(daysBadge) daysBadge.textContent = "نیاز به تمدید";
            authContainer.style.backgroundColor = 'var(--danger-color)';
        }
    }

    if (machineIdDisplay && isElectron) {
        window.electronAPI.getMachineId().then(id => {
            machineIdDisplay.textContent = id;
        });
    }
}

// =========================================================================================
// ********************** مدیریت CMS **********************
// =========================================================================================

async function loadDoorsFromLocal() {
    const doors = await getDoors();
    const doorSelect = document.getElementById('door-select');
    if(doorSelect) {
        doorSelect.innerHTML = '<option value="">انتخاب مدل درب...</option>';
        doors.forEach(door => {
            const option = document.createElement('option');
            option.value = door.id;
            option.textContent = door.name;
            doorSelect.appendChild(option);
        });
    }
    renderList(doors, 'door-list-cms', 'door');
}

async function loadWindowsFromLocal() {
    const windows = await getWindows();
    const windowSelect = document.getElementById('window-select');
    if(windowSelect) {
        windowSelect.innerHTML = '<option value="">انتخاب مدل پنجره...</option>';
        windows.forEach(w => {
            const option = document.createElement('option');
            option.value = w.id;
            option.textContent = w.name;
            windowSelect.appendChild(option);
        });
    }
    renderList(windows, 'window-list-cms', 'window');
}

function renderList(items, containerId, type) {
    const listDiv = document.getElementById(containerId);
    if(!listDiv) return;
    listDiv.innerHTML = items.length ? '' : '<p>مدلی یافت نشد.</p>';
    items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'door-model-item';
        div.style = "display: flex; justify-content: space-between; padding: 10px; border-bottom: 1px solid #eee;";
        div.innerHTML = `<span>${item.name}</span><button class="btn-danger" data-id="${item.id}" data-filename="${item.file || ''}">حذف</button>`;
        listDiv.appendChild(div);
    });
}

async function handleCmsSubmit(e, vtoType) {
    e.preventDefault();
    const statusLabel = document.getElementById(`cms-${vtoType}-status`);
    const nameInput = document.getElementById(`cms-${vtoType}-name`);
    const fileInput = document.getElementById(`cms-${vtoType}-file`);
    const files = fileInput.files;

    if (!files.length) return;

    try {
        const key = vtoType === 'door' ? DOORS_INDEX_KEY : WINDOWS_INDEX_KEY;
        let models = await (vtoType === 'door' ? getDoors() : getWindows());

        for (const file of files) {
            const id = Date.now() + '-' + Math.random().toString(36).substr(2, 5);
            
            if (isElectron) {
                const fileName = `${id}-${file.name}`;
                await window.electronAPI.executeFsOperation('saveFile', vtoType === 'door' ? 'doors' : 'windows', fileName, file.path);
                models.push({ id, name: nameInput.value || file.name, file: fileName });
            } else {
                const reader = new FileReader();
                reader.onload = async (ev) => {
                    models.push({ id, name: nameInput.value || file.name, imgData: ev.target.result });
                    localStorage.setItem(key, JSON.stringify(models));
                    vtoType === 'door' ? await loadDoorsFromLocal() : await loadWindowsFromLocal();
                };
                reader.readAsDataURL(file);
            }
        }

        if (isElectron) {
            await window.electronAPI.executeFsOperation('setStoreValue', key, JSON.stringify(models));
            vtoType === 'door' ? await loadDoorsFromLocal() : await loadWindowsFromLocal();
        }

        if(statusLabel) statusLabel.textContent = "✅ با موفقیت ذخیره شد.";
        e.target.reset();
    } catch (error) {
        if(statusLabel) statusLabel.textContent = "❌ خطا در ذخیره.";
    }
}

async function handleDelete(e, type) {
    if (!e.target.classList.contains('btn-danger')) return;
    const id = e.target.getAttribute('data-id');
    const filename = e.target.getAttribute('data-filename');
    if (!confirm("آیا از حذف این مدل اطمینان دارید؟")) return;

    const key = type === 'door' ? DOORS_INDEX_KEY : WINDOWS_INDEX_KEY;
    
    if (isElectron && filename) {
        await window.electronAPI.executeFsOperation('deleteFile', type === 'door' ? 'doors' : 'windows', filename);
    }
    
    let models = await (type === 'door' ? getDoors() : getWindows());
    models = models.filter(m => m.id !== id);

    if (isElectron) {
        await window.electronAPI.executeFsOperation('setStoreValue', key, JSON.stringify(models));
    } else {
        localStorage.setItem(key, JSON.stringify(models));
    }

    type === 'door' ? await loadDoorsFromLocal() : await loadWindowsFromLocal();
}

// =========================================================================================
// ********************** مدیریت Canvas و نقاط **********************
// =========================================================================================

function updatePointsVisibility() {
    const update = (prefix, points, loaded, model) => {
        for(let i=0; i<4; i++){
            const el = document.getElementById(`${prefix}-point-${i}`);
            if(el) {
                if(loaded && model) {
                    el.style.left = `${points[i].x}px`;
                    el.style.top = `${points[i].y}px`;
                    el.classList.remove('hidden');
                } else el.classList.add('hidden');
            }
        }
    };
    update('door', doorPoints, doorImageLoaded, currentDoorModel);
    update('window', windowPoints, windowImageLoaded, currentWindowModel);
}

function setupDraggablePoints() {
    const handleDown = (prefix, e) => {
        const points = prefix === 'door' ? doorPoints : windowPoints;
        for(let i=0; i<4; i++){
            const el = document.getElementById(`${prefix}-point-${i}`);
            if(el && !el.classList.contains('hidden')){
                const r = el.getBoundingClientRect();
                if(e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom){
                    if(prefix === 'door') doorDraggingPoint = i; else windowDraggingPoint = i;
                    return true;
                }
            }
        }
        return false;
    };

    document.addEventListener('mousedown', e => { handleDown('door', e) || handleDown('window', e); });
    document.addEventListener('mouseup', () => {
        if(doorDraggingPoint !== null) renderVTO_Python('door');
        if(windowDraggingPoint !== null) renderVTO_Python('window');
        doorDraggingPoint = null; windowDraggingPoint = null;
    });

    document.addEventListener('mousemove', e => {
        const move = (isDoor) => {
            const canvas = isDoor ? doorCanvas : windowCanvas;
            const points = isDoor ? doorPoints : windowPoints;
            const idx = isDoor ? doorDraggingPoint : windowDraggingPoint;
            if(idx !== null) {
                const r = canvas.getBoundingClientRect();
                points[idx] = { 
                    x: Math.max(0, Math.min(canvas.width, e.clientX - r.left)), 
                    y: Math.max(0, Math.min(canvas.height, e.clientY - r.top)) 
                };
                
                const ctx = canvas.getContext('2d');
                ctx.drawImage(isDoor ? doorImage : windowImage, 0, 0, canvas.width, canvas.height);
                ctx.beginPath(); ctx.setLineDash([5, 5]); ctx.strokeStyle = '#3b82f6';
                ctx.moveTo(points[0].x, points[0].y); points.forEach(p => ctx.lineTo(p.x, p.y));
                ctx.closePath(); ctx.stroke();
                updatePointsVisibility();
            }
        };
        if(doorDraggingPoint !== null) move(true);
        if(windowDraggingPoint !== null) move(false);
    });
}

// =========================================================================================
// ********************** ناوبری و لودر **********************
// =========================================================================================

async function handleModelSelect(e, isDoor) {
    const id = e.target.value;
    const models = await (isDoor ? getDoors() : getWindows());
    const model = models.find(m => m.id === id);
    if(model) {
        if (isElectron) {
            const files = await window.electronAPI.listFiles(isDoor ? 'doors' : 'windows');
            const path = files.find(f => f.name === model.file)?.path;
            if(path) {
                const img = new Image();
                img.onload = () => {
                    if(isDoor) currentDoorModel = { ...model, img }; else currentWindowModel = { ...model, img };
                    updatePointsVisibility();
                    renderVTO_Python(isDoor ? 'door' : 'window');
                };
                img.src = path;
            }
        } else {
            const img = new Image();
            img.onload = () => {
                if(isDoor) currentDoorModel = { ...model, img }; else currentWindowModel = { ...model, img };
                updatePointsVisibility();
                renderVTO_Python(isDoor ? 'door' : 'window');
            };
            img.src = model.imgData;
        }
    }
}

function showView(viewId) {
    document.querySelectorAll('.view').forEach(view => {
        view.style.display = 'none';
    });
    const activeView = document.getElementById(viewId);
    if (activeView) {
        activeView.style.display = 'block';
    }
}

// =========================================================================================
// ********************** راه‌اندازی (Initial Setup) **********************
// =========================================================================================

async function setupEventListeners() {
    doorCanvas = document.getElementById('vto-door-canvas');
    windowCanvas = document.getElementById('vto-window-canvas');
    
    setupDraggablePoints();

    const pricingButtons = document.querySelectorAll('#pricing .price-card button');
    pricingButtons.forEach((btn, index) => {
        btn.onclick = () => startPayment(index === 0 ? 'silver' : 'diamond');
    });

    const navIds = ['nav-vto-door', 'nav-vto-window', 'nav-cms-door', 'nav-cms-window', 'nav-tutorial', 'nav-pricing'];
    navIds.forEach(id => {
        const el = document.getElementById(id);
        if(el) {
            el.onclick = () => {
                showView(id.replace('nav-', ''));
                document.querySelectorAll('#main-navigation button').forEach(b => b.classList.remove('nav-active'));
                el.classList.add('nav-active');
            };
        }
    });

    document.getElementById('door-image-upload').onchange = (e) => handleImageUpload(e, true);
    document.getElementById('window-image-upload').onchange = (e) => handleImageUpload(e, false);
    
    document.getElementById('door-select').onchange = (e) => handleModelSelect(e, true);
    document.getElementById('window-select').onchange = (e) => handleModelSelect(e, false);

    document.getElementById('cms-door-form').onsubmit = (e) => handleCmsSubmit(e, 'door');
    document.getElementById('cms-window-form').onsubmit = (e) => handleCmsSubmit(e, 'window');
    document.getElementById('door-list-cms').onclick = (e) => handleDelete(e, 'door');
    document.getElementById('window-list-cms').onclick = (e) => handleDelete(e, 'window');

    if (isElectron) {
        window.electronAPI.onSubscriptionStatus(updateSubscriptionUI);
        const currentStatus = await window.electronAPI.requestSubscriptionUpdate();
        updateSubscriptionUI(currentStatus);
    } else {
        updateSubscriptionUI(subscriptionStatus);
    }
    
    const clearBtn = document.getElementById('clear-all-data-btn');
    if (clearBtn) {
        clearBtn.onclick = async () => {
            if (confirm("تمامی داده‌های ذخیره شده (مدل‌ها و تنظیمات) پاک شوند؟")) {
                if (isElectron) {
                    await window.electronAPI.executeFsOperation('setStoreValue', DOORS_INDEX_KEY, '[]');
                    await window.electronAPI.executeFsOperation('setStoreValue', WINDOWS_INDEX_KEY, '[]');
                } else {
                    localStorage.removeItem(DOORS_INDEX_KEY);
                    localStorage.removeItem(WINDOWS_INDEX_KEY);
                }
                window.location.reload(); 
            }
        };
    }

    await loadDoorsFromLocal();
    await loadWindowsFromLocal();
    showView('vto-door'); 

    document.getElementById('door-download-btn').onclick = () => {
        const link = document.createElement('a');
        link.download = 'frame-show-door.jpg';
        link.href = doorCanvas.toDataURL('image/jpeg', 1.0);
        link.click();
    };

    document.getElementById('window-download-btn').onclick = () => {
        const link = document.createElement('a');
        link.download = 'frame-show-window.jpg';
        link.href = windowCanvas.toDataURL('image/jpeg', 1.0);
        link.click();
    };
} 

function throttle(func, limit) {
    let lastFunc, lastRan;
    return function() {
        const context = this, args = arguments;
        if (!lastRan) { func.apply(context, args); lastRan = Date.now(); } 
        else {
            clearTimeout(lastFunc);
            lastFunc = setTimeout(() => { 
                if ((Date.now() - lastRan) >= limit) { func.apply(context, args); lastRan = Date.now(); } 
            }, limit - (Date.now() - lastRan));
        }
    }
}

window.onload = setupEventListeners;
