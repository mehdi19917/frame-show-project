# server.py - نسخه نهایی با قابلیت VTO، Gemini Inpainting و Remove Background
# =========================================================================================
# ===> نسخه تمیز شده import ها <===
from flask import Flask, request, jsonify
from flask_cors import CORS
import base64
from io import BytesIO
from PIL import Image
import os
import warnings
import json
import datetime
import requests 
from typing import Tuple, Optional, Any
import numpy as np
import cv2
# from rembg import remove  <-- دیگر به این نیازی نداریم

# 🚨 تعریف اولیه برای جلوگیری از خطای Linter
GEMINI_AVAILABLE = False
genai = None
APIError = None

# 🚨 وارد کردن کتابخانه Gemini به صورت شرطی
try:
    from google import genai
    from google.genai.errors import APIError
    GEMINI_AVAILABLE = True
except ImportError:
    warnings.warn("Gemini libraries not found. Advanced Inpainting is disabled.")
app = Flask(__name__)

origins = [
    "https://65955b2585fcd200085a1a1c--meek-pie-7517c6.netlify.app",
    "http://localhost:8888" # برای تست محلی در آینده
]
CORS(app, resources={
    r"/api/*": {"origins": origins},
    r"/models/*": {"origins": origins} # مسیر جدید را هم اضافه می‌کنیم
})
# <<<<<<<<<<<<<<< کل این بلاک را جایگزین بخش توابع کمکی فعلی خود کنید >>>>>>>>>>>>>>>

# =========================================================================================
# ********************** توابع کمکی تبدیل (نسخه نهایی و یکپارچه) **********************
# =========================================================================================

def base64_to_pil(base64_string: str) -> Image.Image:
    """
    رشته Base64 را به یک آبجکت تصویر PIL (RGBA) تبدیل می‌کند.
    """
    if ',' in base64_string:
        base64_string = base64_string.split(',')[-1]
    img_data = base64.b64decode(base64_string)
    return Image.open(BytesIO(img_data)).convert("RGBA")

def pil_to_base64(pil_img: Image.Image) -> str:
    """
    یک آبجکت تصویر PIL را به رشته Base64 (با فرمت PNG) تبدیل می‌کند.
    """
    buffered = BytesIO()
    pil_img.save(buffered, format="PNG")
    return base64.b64encode(buffered.getvalue()).decode('utf-8')

def pil_to_cv2(pil_img: Image.Image) -> np.ndarray:
    """
    یک آبجکت تصویر PIL (RGBA) را به یک آرایه OpenCV (BGRA) تبدیل می‌کند.
    """
    return cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGBA2BGRA)

def cv2_to_pil(cv_img: np.ndarray) -> Image.Image:
    """
    یک آرایه OpenCV را به یک آبجکت تصویر PIL تبدیل می‌کند.
    """
    if len(cv_img.shape) == 3 and cv_img.shape[2] == 3:
        return Image.fromarray(cv2.cvtColor(cv_img, cv2.COLOR_BGR2RGB))
    elif len(cv_img.shape) == 3 and cv_img.shape[2] == 4:
        return Image.fromarray(cv2.cvtColor(cv_img, cv2.COLOR_BGRA2RGBA))
    return Image.fromarray(cv_img)

def base64_to_cv2(base64_string: str, with_alpha: bool = True) -> np.ndarray:
    """
    رشته Base64 را مستقیما به یک آرایه OpenCV تبدیل می‌کند.
    """
    pil_img = base64_to_pil(base64_string)
    cv_img = pil_to_cv2(pil_img)
    if not with_alpha:
        return cv2.cvtColor(cv_img, cv2.COLOR_BGRA2BGR)
    return cv_img

def cv2_to_base64(img: np.ndarray) -> str:
    """
    یک آرایه OpenCV را به رشته Base64 (با فرمت PNG) تبدیل می‌کند.
    """
    pil_img = cv2_to_pil(img)
    return pil_to_base64(pil_img)


# =========================================================================================
# ********************** منطق پردازش اصلی VTO و Gemini **********************
# =========================================================================================

def process_vto_advanced(bg_base64, model_base64, corners_ratio, opacity, use_ai_inpainting, color_swap_hue, brightness):
    background_img_bgr = base64_to_cv2(bg_base64, with_alpha=False) 
    model_img_bgra = base64_to_cv2(model_base64, with_alpha=True)
    if background_img_bgr is None or model_img_bgra is None:
        return None, "Error loading images."

    if brightness != 1.0:
        bgr_p = model_img_bgra[:, :, :3]
        alpha_p = model_img_bgra[:, :, 3]
        bgr_p = cv2.convertScaleAbs(bgr_p, alpha=brightness, beta=0)
        model_img_bgra = cv2.merge([bgr_p, alpha_p])

    h_bg, w_bg = background_img_bgr.shape[:2]
    h_model, w_model = model_img_bgra.shape[:2] 
    inpainted_bg_bgr = background_img_bgr.copy() 
    
    corners_px = np.int32([[c[0]*w_bg, c[1]*h_bg] for c in corners_ratio])
    
    # Gemini Inpainting
    if GEMINI_CLIENT_READY and use_ai_inpainting: 
        try:
            mask = np.zeros((h_bg, w_bg), dtype=np.uint8)
            cv2.fillPoly(mask, [corners_px], 255) 
            bg_pil = cv2_to_pil(background_img_bgr) 
            mask_pil = Image.fromarray(mask).convert('L') 
            
            response = GEMINI_CLIENT.models.generate_images( 
                model='imagen-3.0-generate-002', 
                prompt="Remove the object in the masked area and inpaint smoothly.",
                config={"number_of_images": 1, "output_mime_type": "image/jpeg"},
                image=bg_pil, mask_image=mask_pil 
            )
            if response.generated_images:
                inpainted_bg_rgb = np.array(response.generated_images[0].image.convert("RGB")) 
                inpainted_bg_bgr = cv2.cvtColor(inpainted_bg_rgb, cv2.COLOR_RGB2BGR)
        except Exception as e:
            print(f"Gemini Error: {e}")

    # Homography
    pts_model = np.float32([[0, 0], [w_model-1, 0], [w_model-1, h_model-1], [0, h_model-1]])
    pts_target = np.float32(corners_px)
    M = cv2.getPerspectiveTransform(pts_model, pts_target) 
    warped_model = cv2.warpPerspective(model_img_bgra, M, (w_bg, h_bg))

    # Blending
    alpha_channel = (warped_model[:, :, 3].astype(np.float32) / 255.0) * opacity
    overlay_colors = warped_model[:, :, :3]
    final_result = inpainted_bg_bgr.copy().astype(np.float32) 
    
    for c in range(3):
        final_result[:,:,c] = (alpha_channel * overlay_colors[:,:,c] + (1 - alpha_channel) * final_result[:,:,c])
    
    return np.uint8(final_result), None

# =========================================================================================
# ********************** تنظیمات Gemini **********************
# =========================================================================================

GEMINI_API_KEY = "AIzaSyA7x8Po9-CCqD_OIQCKJzeYIosRZnQ6NTk" 
GEMINI_CLIENT = None
GEMINI_CLIENT_READY = False

if GEMINI_AVAILABLE and GEMINI_API_KEY:
    try:
        GEMINI_CLIENT = genai.Client(api_key=GEMINI_API_KEY)
        GEMINI_CLIENT_READY = True
        print("Gemini Client successfully initialized.")
    except Exception as e:
        print(f"Gemini initialization failed: {e}")

# =========================================================================================
# ********************** تعریف مسیرهای API **********************
# =========================================================================================

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({"status": "ok", "gemini_ready": GEMINI_CLIENT_READY}), 200

@app.route('/api/vto/process', methods=['POST'])
def process_image_api():
    try:
        data = request.json
        result_img, error = process_vto_advanced(
            data.get('background'), data.get('model'), data.get('corners'), 
            data.get('opacity', 1.0), data.get('use_ai_inpainting', False), 
            data.get('color_swap_hue'), data.get('brightness', 1.0)
        )
        if error: return jsonify({"error": error}), 500
        return jsonify({"status": "success", "result_image_base64": cv2_to_base64(result_img)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# =======================================================
# ===> مسیر نهایی: اجرای GrabCut با تمام اطلاعات <===
# =======================================================
@app.route('/api/grabcut', methods=['POST'])
def grabcut_api():
    try:
        data = request.json
        image_data_base64 = data['image']
        
        img_bytes = base64.b64decode(image_data_base64.split(',')[1])
        img_np = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(img_np, cv2.IMREAD_COLOR)

        if img is None:
            raise ValueError("Could not decode image.")

        # ساخت ماسک اولیه
        mask = np.zeros(img.shape[:2], np.uint8)
        bgdModel = np.zeros((1, 65), np.float64)
        fgdModel = np.zeros((1, 65), np.float64)
        
        # ۱. اجرای اولیه با کادر
        rect_data = data['rect']
        rect = (rect_data['x'], rect_data['y'], rect_data['w'], rect_data['h'])
        cv2.grabCut(img, mask, rect, bgdModel, fgdModel, 5, cv2.GC_INIT_WITH_RECT)
        
        # ۲. اعمال نقاط اصلاح (در صورت وجود)
        refine_points = data.get('refine_points', [])
        if refine_points:
            for point in refine_points:
                color = cv2.GC_FGD if point['mode'] == 'fg' else cv2.GC_BGD
                cv2.circle(mask, (point['x'], point['y']), 5, color, -1)
            
            # اجرای مجدد با ماسک اصلاح‌شده
            cv2.grabCut(img, mask, None, bgdModel, fgdModel, 5, cv2.GC_INIT_WITH_MASK)

        # ۳. ساخت تصویر نهایی با پس‌زمینه شفاف
        final_mask = np.where((mask == cv2.GC_PR_FGD) | (mask == cv2.GC_FGD), 255, 0).astype('uint8')
        final_mask = cv2.GaussianBlur(final_mask, (3, 3), 0)
        
        b, g, r = cv2.split(img)
        result_rgba = cv2.merge((b, g, r, final_mask))

        # ۴. برش هوشمند (Auto-Cropping)
        contours, _ = cv2.findContours(final_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if contours:
            main_contour = max(contours, key=cv2.contourArea)
            x, y, w, h = cv2.boundingRect(main_contour)
            cropped_result = result_rgba[y:y+h, x:x+w]
        else:
            cropped_result = result_rgba

        _, buffer = cv2.imencode('.png', cropped_result)
        output_base64 = base64.b64encode(buffer).decode('utf-8')
        
        return jsonify({ "status": "success", "image": f"data:image/png;base64,{output_base64}" })

    except Exception as e:
        print(f"Error in GrabCut API: {e}")
        return jsonify({"error": str(e)}), 500
    
        # server.py - این را به انتهای فایل اضافه کنید

@app.route('/models/<string:model_type>.json')
def get_models_json(model_type):
    """
    این API، فایل‌های JSON مربوط به مدل‌ها را برمی‌گرداند.
    """
    if model_type not in ['doors', 'windows']:
        return jsonify({"error": "Invalid model type"}), 404
    
    file_path = os.path.join('models', f'{model_type}.json')
    
    if not os.path.exists(file_path):
        return jsonify({"error": f"{model_type}.json not found on server"}), 404
        
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    return jsonify(data)


# =========================================================================
if __name__ == '__main__':
    print("Starting AI Service (Python Flask)...")
    app.run(host='127.0.0.1', port=5000, debug=False)
    