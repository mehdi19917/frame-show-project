# FrameShowAIServer.spec - نسخه نهایی و صنعتی (One-Folder)

# -*- mode: python ; coding: utf-8 -*-

from PyInstaller.utils.hooks import collect_all

# --- جمع‌آوری تمام وابستگی‌های لازم ---
datas, binaries, hiddenimports = [], [], []
libs_to_collect = [
    'flask', 'numpy', 'PIL', 'cv2', 'google.generativeai', 
    'google.ai', 'google.auth', 'google.api_core', 'requests', 'flask_cors',
    'google.cloud', 'google.logging', 'google.resumable_media'
]

for lib in libs_to_collect:
    try:
        datas_lib, binaries_lib, hiddenimports_lib = collect_all(lib)
        datas.extend(datas_lib)
        binaries.extend(binaries_lib)
        hiddenimports.extend(hiddenimports_lib)
    except Exception as e:
        print(f"Could not collect {lib}: {e}")

# --- تحلیل اصلی برنامه ---
a = Analysis(
    ['server.py'],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    noarchive=False
)

pyz = PYZ(a.pure, a.zipped_data)

# --- تعریف خروجی اجرایی (EXE) ---
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='FrameShowAIServer',
    debug=True,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True, # برای دیدن خطاها
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

# --- ساختار نهایی پوشه (مهمترین بخش) ---
coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='FrameShowAIServer' # <-- این اسم پوشه خروجی خواهد بود
)
