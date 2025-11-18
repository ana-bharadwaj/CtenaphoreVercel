import json
from flask import Flask, jsonify, request
from flask_cors import CORS
from google.cloud import storage
import firebase_admin
from firebase_admin import credentials, firestore
import random
import os
import threading
import time
from PIL import Image
import io
from google.api_core.exceptions import Forbidden, BadRequest

THUMB_SIGNED_TTL = 60 * 60 * 24 * 7  # 7 days

# thumbnail settings
THUMB_PREFIX = "thumbs-512"
THUMB_MAX = 512
THUMB_QUALITY = 82
THUMB_CACHE = "public, max-age=604800, immutable"  # 7 days

def public_gcs_url(path: str) -> str:
    return f"https://storage.googleapis.com/{BUCKET_NAME}/{path}"

def thumb_key_for(original_blob_name: str) -> str:
    base, _dot, _ext = original_blob_name.rpartition(".")
    if not base:
        base = original_blob_name
    return f"{THUMB_PREFIX}/{base}.jpg"

def ensure_thumb_and_get_url(original_blob_name: str) -> str:
    """
    UBLA-safe: create/update a 512px JPEG thumbnail and return a signed URL.
    No object ACLs are used (no make_public).
    """
    bucket = storage_client.bucket(BUCKET_NAME)
    thumb_name = thumb_key_for(original_blob_name)
    thumb_blob = bucket.blob(thumb_name)

    # If the thumb doesn't exist, generate and upload it
    if not thumb_blob.exists():
        try:
            src_blob = bucket.blob(original_blob_name)
            data = src_blob.download_as_bytes()

            im = Image.open(io.BytesIO(data)).convert("RGB")
            im.thumbnail((THUMB_MAX, THUMB_MAX), Image.LANCZOS)
            out = io.BytesIO()
            im.save(out, format="JPEG", quality=THUMB_QUALITY, optimize=True, progressive=True)
            out.seek(0)

            thumb_blob.upload_from_file(out, content_type="image/jpeg")
            thumb_blob.cache_control = THUMB_CACHE
            thumb_blob.patch()
        except Forbidden:
            # No write perms → fall back to original signed URL
            return get_signed_url_cached(original_blob_name)
        except Exception:
            # Any other unexpected issue → fall back to original signed URL
            return get_signed_url_cached(original_blob_name)

    # Always return a signed URL (UBLA-safe)
    try:
        return thumb_blob.generate_signed_url(
            version="v4",
            expiration=THUMB_SIGNED_TTL,
            method="GET",
        )
    except BadRequest:
        # If for some reason signed URL fails, use original as last resort
        return get_signed_url_cached(original_blob_name)


app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

BUCKET_NAME = "ctenopool"
FOLDER_NAMES = ["202502-1-tif", "202502-2-tif", "202502-3-tif", "202502-4-tif"]
IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".tif", ".tiff")

# Local path to your service account JSON (for dev on your laptop)
LOCAL_CREDS_PATH = r"C:\Users\anabh\Code and Projects\CtenaphoreClassification\ctenopool-firebase-adminsdk-fbsvc-fbf85008c1.json"

# Try to read JSON creds from environment (for Render)
creds_json = os.getenv("GOOGLE_APPLICATION_CREDENTIALS_JSON")

if creds_json:
    # ---- Production (Render) ----
    sa_info = json.loads(creds_json)
    temp_path = "/tmp/gcp-creds.json"
    with open(temp_path, "w") as f:
        json.dump(sa_info, f)

    cred_path = temp_path
else:
    # ---- Local dev ----
    cred_path = LOCAL_CREDS_PATH

# Make sure GOOGLE_APPLICATION_CREDENTIALS points to the file
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = cred_path

# Init Firebase & Firestore
cred = credentials.Certificate(cred_path)
firebase_admin.initialize_app(cred)
db = firestore.client()

# Storage client will pick up the same creds from env
storage_client = storage.Client()

# ---- Caches ----
cache_lock = threading.Lock()
cached_files = {}          # { folder -> [blob_names...] }
last_cache_time = 0
CACHE_DURATION = 300  # seconds

SIGNED_TTL = 3600  # 1 hour
signed_cache = {}   # { blob_name -> (url, expires_at) }
signed_lock = threading.Lock()

def refresh_cache():
    """Refresh the list of image blobs per folder if stale."""
    global cached_files, last_cache_time
    with cache_lock:
        now = time.time()
        if now - last_cache_time > CACHE_DURATION or not cached_files:
            new_cache = {}
            for folder in FOLDER_NAMES:
                blobs = storage_client.list_blobs(BUCKET_NAME, prefix=folder + "/")
                imgs = [b.name for b in blobs if b.name.lower().endswith(IMAGE_EXTENSIONS)]
                new_cache[folder] = imgs
            cached_files = new_cache
            last_cache_time = now

def list_images(folder):
    """Return cached image names for a folder."""
    with cache_lock:
        return cached_files.get(folder, [])

def get_signed_url_cached(blob_name):
    """Return a cached signed URL when possible to improve browser caching."""
    now = time.time()
    with signed_lock:
        url, exp = signed_cache.get(blob_name, (None, 0))
        if url and (exp - now) > 60:
            return url

        bucket = storage_client.bucket(BUCKET_NAME)
        blob = bucket.blob(blob_name)
        new_url = blob.generate_signed_url(version="v4", expiration=SIGNED_TTL, method="GET")
        signed_cache[blob_name] = (new_url, now + SIGNED_TTL)
        return new_url

@app.route("/api/health")
def health():
    return jsonify({"status": "ok"}), 200

# --- Global per-class choices for single pooling ---
fixed_choices_lock = threading.Lock()
fixed_class_samples = {}  # { folder: {blobPath, displayUrl} }

def get_or_init_fixed_choices():
    """Initialize once, and return globally-fixed class choices."""
    global fixed_class_samples
    with fixed_choices_lock:
        if fixed_class_samples:
            return fixed_class_samples
        refresh_cache()
        for folder in FOLDER_NAMES:
            imgs = list_images(folder)
            if imgs:
                choice_blob = random.choice(imgs)
                fixed_class_samples[folder] = {
                    "blobPath": choice_blob,
                    "displayUrl": get_signed_url_cached(choice_blob)
                }
        return fixed_class_samples

@app.route("/api/image-set")
def image_set():
    fixed_class_samples_local = get_or_init_fixed_choices()
    # Gather all imgs for main random choice
    all_imgs = []
    for folder in FOLDER_NAMES:
        imgs = list_images(folder)
        all_imgs.extend(imgs)
    main_image_obj = None
    if all_imgs:
        main_blob = random.choice(all_imgs)
        main_image_obj = {
            "blobPath": main_blob,
            "displayUrl": ensure_thumb_and_get_url(main_blob)
        }
    # Clean labels: "202502-1-tif" -> "202502-1"
    cleaned_choices = {f.replace("-tif", ""): obj for f, obj in fixed_class_samples_local.items()}
    return jsonify({"mainImage": main_image_obj, "choices": cleaned_choices})

@app.route("/api/two-image-pair")
def two_image_pair():
    refresh_cache()
    is_same = random.choice([True, False])

    def safe_pick_two(imgs):
        if not imgs:
            return []
        if len(imgs) == 1:
            return [imgs[0], imgs[0]]
        return random.sample(imgs, 2)

    viable = [f for f in FOLDER_NAMES if len(list_images(f)) >= 1]

    if is_same:
        if not viable:
            return jsonify({"images": [], "options": [], "groundTruth": None, "trueClasses": []}), 200
        chosen_class = random.choice(viable)
        imgs = list_images(chosen_class)
        selected = safe_pick_two(imgs)
        classes = [chosen_class, chosen_class]
    else:
        if len(viable) < 2:
            # fallback: treat as same class
            is_same = True
            chosen_class = viable[0] if viable else None
            imgs = list_images(chosen_class) if chosen_class else []
            selected = safe_pick_two(imgs)
            classes = [chosen_class, chosen_class] if chosen_class else []
        else:
            class1, class2 = random.sample(viable, 2)
            imgs1 = list_images(class1)
            imgs2 = list_images(class2)
            sel1 = random.choice(imgs1) if imgs1 else None
            sel2 = random.choice(imgs2) if imgs2 else None
            selected = [s for s in [sel1, sel2] if s]
            classes = [class1, class2]

    imgs_info = [{"blobPath": b, "displayUrl": ensure_thumb_and_get_url(b)} for b in selected]
    options = ["Same class", "Different class"]

    ground_truth = "Same class" if is_same else "Different class"
    cleaned_classes = [c.replace("-tif", "") for c in classes if c]

    return jsonify({
        "images": imgs_info,
        "options": options,
        "groundTruth": ground_truth,
        "trueClasses": cleaned_classes
    })

@app.route("/api/submit-single-label", methods=["POST", "OPTIONS"])
def submit_single_label():
    if request.method == "OPTIONS":
        response = jsonify({"status": "preflight ok"})
        response.headers.add("Access-Control-Allow-Origin", "*")
        response.headers.add("Access-Control-Allow-Methods", "POST, OPTIONS")
        response.headers.add("Access-Control-Allow-Headers", "Content-Type")
        return response, 200

    data = request.json or {}
    username = data.get("username", "anonymous")
    main_image_blob = data.get("mainImageBlob")
    picked_class = data.get("choice")

    if not main_image_blob or not picked_class:
        return jsonify({"status": "error", "message": "missing fields"}), 400

    # derive true class from blob path
    folder = main_image_blob.split("/")[0] if "/" in main_image_blob else main_image_blob
    true_class = folder.replace("-tif", "")
    is_correct = (picked_class == true_class)

    db.collection("responses").document(username).collection("submissions").add({
        "main_image_blob": main_image_blob,
        "selected_class": picked_class,
        "true_class": true_class,
        "correct": is_correct,
        "timestamp": firestore.SERVER_TIMESTAMP
    })

    response = jsonify({
        "status": "success",
        "correct": is_correct,
        "trueClass": true_class
    })
    response.headers.add("Access-Control-Allow-Origin", "*")
    return response, 200

@app.route("/api/submit-pair-label", methods=["POST", "OPTIONS"])
def submit_pair_label():
    if request.method == "OPTIONS":
        response = jsonify({"status": "preflight ok"})
        response.headers.add("Access-Control-Allow-Origin", "*")
        response.headers.add("Access-Control-Allow-Methods", "POST, OPTIONS")
        response.headers.add("Access-Control-Allow-Headers", "Content-Type")
        return response, 200

    data = request.json or {}
    username = data.get("username", "anonymous")
    image_paths = data.get("imagePaths")
    picked_option = data.get("choice")

    if not picked_option or not image_paths or len(image_paths) != 2:
        return jsonify({"status": "error", "message": "missing or invalid fields"}), 400

    # derive class labels from blob paths
    def folder_to_class(path: str):
        if not path:
            return None
        folder = path.split("/")[0]
        return folder.replace("-tif", "")

    true_classes = [folder_to_class(p) for p in image_paths]
    same_class = (len(true_classes) == 2 and true_classes[0] == true_classes[1])
    ground_truth = "Same class" if same_class else "Different class"
    is_correct = (picked_option == ground_truth)

    db.collection("responses_pair").document(username).collection("submissions").add({
        "image_paths": image_paths,
        "selected_option": picked_option,
        "ground_truth": ground_truth,
        "true_classes": true_classes,
        "correct": is_correct,
        "timestamp": firestore.SERVER_TIMESTAMP,
    })

    response = jsonify({
        "status": "success",
        "correct": is_correct,
        "groundTruth": ground_truth,
        "trueClasses": true_classes
    })
    response.headers.add("Access-Control-Allow-Origin", "*")
    return response, 200

if __name__ == "__main__":
    app.run(debug=True)
