from datetime import datetime, timedelta
import json, random, os, threading, time, io, re
from flask import Flask, jsonify, request
from flask_cors import CORS
from google.cloud import storage
import firebase_admin
from firebase_admin import credentials, firestore
from google.api_core.exceptions import Forbidden, BadRequest
from PIL import Image
from admin_analytics_api import admin_bp


THUMB_SIGNED_TTL = 60 * 60 * 24 * 7  # 7 days
THUMB_PREFIX = "thumbs-512"
THUMB_MAX = 512
THUMB_QUALITY = 82
THUMB_CACHE = "public, max-age=604800, immutable"

BUCKET_NAME = "ctenopool"
FOLDER_NAMES = ["202502-1-tif", "202502-2-tif", "202502-3-tif", "202502-4-tif"]
IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".tif", ".tiff")

LOCAL_CREDS_PATH = r"C:\Users\anabh\Code and Projects\CtenaphoreClassification\southern-matter-476413-c8-9993e2631d6b.json"

creds_json = os.getenv("GOOGLE_APPLICATION_CREDENTIALS_JSON")
if creds_json:
    sa_info = json.loads(creds_json)
    temp_path = "/tmp/gcp-creds.json"
    with open(temp_path, "w") as f:
        json.dump(sa_info, f)
    cred_path = temp_path
else:
    cred_path = LOCAL_CREDS_PATH

os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = cred_path

cred = credentials.Certificate(cred_path)
firebase_admin.initialize_app(cred)
db = firestore.client()
storage_client = storage.Client()

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# ---------- helpers for thumbnails ----------

def public_gcs_url(path: str) -> str:
    return f"https://storage.googleapis.com/{BUCKET_NAME}/{path}"

def thumb_key_for(original_blob_name: str) -> str:
    base, _dot, _ext = original_blob_name.rpartition(".")
    if not base:
        base = original_blob_name
    return f"{THUMB_PREFIX}/{base}.jpg"

SIGNED_TTL = 3600  # 1 hour
signed_cache = {}   # { blob_name -> (url, expires_at) }
signed_lock = threading.Lock()

def get_signed_url_cached(blob_name):
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

def ensure_thumb_and_get_url(original_blob_name: str) -> str:
    bucket = storage_client.bucket(BUCKET_NAME)
    thumb_name = thumb_key_for(original_blob_name)
    thumb_blob = bucket.blob(thumb_name)

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
            return get_signed_url_cached(original_blob_name)
        except Exception:
            return get_signed_url_cached(original_blob_name)

    try:
        return thumb_blob.generate_signed_url(
            version="v4",
            expiration=THUMB_SIGNED_TTL,
            method="GET",
        )
    except BadRequest:
        return get_signed_url_cached(original_blob_name)

# ---------- caching, incl. by date ----------

CACHE_DURATION = 300
cache_lock = threading.Lock()
cached_files = {}      # { folder -> [blob_names] }
cached_by_date = {}    # { '20250305' -> [blob_names] }
last_cache_time = 0

DATE_RE = re.compile(r"(\d{8})-")

def extract_date_from_blob_name(blob_name: str):
    m = DATE_RE.search(blob_name)
    return m.group(1) if m else None

def refresh_cache():
    global cached_files, cached_by_date, last_cache_time
    with cache_lock:
        now = time.time()
        if now - last_cache_time > CACHE_DURATION or not cached_files:
            new_cache = {}
            by_date = {}
            for folder in FOLDER_NAMES:
                blobs = storage_client.list_blobs(BUCKET_NAME, prefix=folder + "/")
                imgs = [b.name for b in blobs if b.name.lower().endswith(IMAGE_EXTENSIONS)]
                new_cache[folder] = imgs
                for name in imgs:
                    d = extract_date_from_blob_name(name)
                    if d:
                        by_date.setdefault(d, []).append(name)
            cached_files = new_cache
            cached_by_date = by_date
            last_cache_time = now

def list_images(folder):
    with cache_lock:
        return cached_files.get(folder, [])

def list_images_by_date(date_str: str):
    with cache_lock:
        return cached_by_date.get(date_str, [])

# ---------- health ----------

@app.route("/api/health")
def health():
    return jsonify({"status": "ok"}), 200

# ---------- single-image pooling choices ----------

fixed_choices_lock = threading.Lock()
fixed_class_samples = {}  # kept for other usages if needed

def get_or_init_fixed_choices():
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
    # ensure caches are fresh
    refresh_cache()

    # all images for choosing a main one
    all_imgs = []
    for folder in FOLDER_NAMES:
        all_imgs.extend(list_images(folder))

    main_image_obj = None
    main_date = None
    main_blob = None

    if all_imgs:
        main_blob = random.choice(all_imgs)
        main_date = extract_date_from_blob_name(main_blob)
        main_image_obj = {
            "blobPath": main_blob,
            "displayUrl": ensure_thumb_and_get_url(main_blob),
        }

    DATE_WINDOW_DAYS = 2  # change to 1 if you only want +/- 1 day

    cleaned_choices = {}
    if main_date and main_blob:
        candidate_imgs = []

        try:
            from datetime import datetime, timedelta  # make sure this is imported at top
            main_dt = datetime.strptime(main_date, "%Y%m%d").date()
            for offset in range(-DATE_WINDOW_DAYS, DATE_WINDOW_DAYS + 1):
                d = main_dt + timedelta(days=offset)
                d_str = d.strftime("%Y%m%d")
                candidate_imgs.extend(list_images_by_date(d_str))
        except ValueError:
            candidate_imgs = list_images_by_date(main_date)

        candidate_imgs = [img for img in candidate_imgs if img != main_blob]

        # group by folder / class
        imgs_by_folder = {f: [] for f in FOLDER_NAMES}
        for name in candidate_imgs:
            folder = name.split("/")[0]
            if folder in imgs_by_folder:
                imgs_by_folder[folder].append(name)

        per_class = {}
        for folder, imgs in imgs_by_folder.items():
            if imgs:
                choice_blob = random.choice(imgs)
                per_class[folder] = {
                    "blobPath": choice_blob,
                    "displayUrl": get_signed_url_cached(choice_blob),
                }

        cleaned_choices = {
            f.replace("-tif", ""): obj
            for f, obj in per_class.items()
        }

    return jsonify({"mainImage": main_image_obj, "choices": cleaned_choices})

# ---------- two-image pair endpoint (unchanged except cache refresh uses same helpers) ----------

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
    options = ["Same individual", "Different individual"]
    ground_truth = "Same individual" if is_same else "Different individual"
    cleaned_classes = [c.replace("-tif", "") for c in classes if c]

    return jsonify({
        "images": imgs_info,
        "options": options,
        "groundTruth": ground_truth,
        "trueClasses": cleaned_classes
    })

# ---------- submit single label ----------

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

# ---------- submit pair label ----------

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

    def folder_to_class(path: str):
        if not path:
            return None
        folder = path.split("/")[0]
        return folder.replace("-tif", "")

    true_classes = [folder_to_class(p) for p in image_paths]
    same_class = (len(true_classes) == 2 and true_classes[0] == true_classes[1])
    ground_truth = "Same individual" if same_class else "Different individual"
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

# ---------- three-image same-class endpoint ----------

@app.route("/api/three-image-set")
def three_image_set():
    """
    Returns 3 images that all belong to the same class (folder),
    with dates within +/- DATE_WINDOW_DAYS of a randomly chosen anchor image
    in that class. Also returns 4 class options (1 correct + 3 distractors).
    """
    refresh_cache()
    DATE_WINDOW_DAYS = 2  # close date range window

    # classes that have at least 3 images total
    viable = [f for f in FOLDER_NAMES if len(list_images(f)) >= 3]
    if not viable:
        return jsonify({"images": [], "options": [], "trueClass": None}), 200

    chosen_class = random.choice(viable)
    class_imgs = list_images(chosen_class)
    anchor_blob = random.choice(class_imgs)
    anchor_date_str = extract_date_from_blob_name(anchor_blob)

    candidates = []
    if anchor_date_str:
        try:
            anchor_dt = datetime.strptime(anchor_date_str, "%Y%m%d").date()
            for name in class_imgs:
                d_str = extract_date_from_blob_name(name)
                if not d_str:
                    continue
                try:
                    d_dt = datetime.strptime(d_str, "%Y%m%d").date()
                except ValueError:
                    continue
                if abs((d_dt - anchor_dt).days) <= DATE_WINDOW_DAYS:
                    candidates.append(name)
        except ValueError:
            pass

    # if not enough in the close-date window, fall back to all images in the class
    if len(candidates) < 3:
        candidates = class_imgs

    if len(candidates) >= 3:
        selected = random.sample(candidates, 3)
    else:
        # last-resort: allow duplicates if there are fewer than 3
        # (should not happen with your dataset, but safe)
        while len(candidates) < 3 and candidates:
            candidates.append(random.choice(candidates))
        selected = candidates[:3]

    # build image info
    imgs_info = [
        {
            "blobPath": b,
            "displayUrl": ensure_thumb_and_get_url(b),
        }
        for b in selected
    ]

    # options: 1 correct class + up to 3 other random classes
    true_class = chosen_class.replace("-tif", "")
    all_classes_clean = [f.replace("-tif", "") for f in FOLDER_NAMES]
    other_classes = [c for c in all_classes_clean if c != true_class]

    # pick up to 3 distractors
    num_distractors = min(3, len(other_classes))
    distractors = random.sample(other_classes, num_distractors) if num_distractors > 0 else []

    # ---- WITH this ----

    options = [true_class] + distractors
    random.shuffle(options)

    selected_set = set(selected)
    choices = {}
    for folder in FOLDER_NAMES:
        clean = folder.replace("-tif", "")
        candidates = [b for b in list_images(folder) if b not in selected_set]
        if candidates:
            ref_blob = random.choice(candidates)
            choices[clean] = {
                "blobPath": ref_blob,
                "displayUrl": get_signed_url_cached(ref_blob),
            }

    return jsonify({
        "images": imgs_info,
        "options": options,
        "trueClass": true_class,
        "choices": choices,
    })


# ---------- submit three-image label ----------

@app.route("/api/submit-three-label", methods=["POST", "OPTIONS"])
def submit_three_label():
    if request.method == "OPTIONS":
        response = jsonify({"status": "preflight ok"})
        response.headers.add("Access-Control-Allow-Origin", "*")
        response.headers.add("Access-Control-Allow-Methods", "POST, OPTIONS")
        response.headers.add("Access-Control-Allow-Headers", "Content-Type")
        return response, 200

    data = request.json or {}
    username = data.get("username", "anonymous")
    image_paths = data.get("imagePaths")
    picked_class = data.get("choice")

    if not picked_class or not image_paths or len(image_paths) < 1:
        return jsonify({"status": "error", "message": "missing or invalid fields"}), 400

    # all three are from the same class; infer from the first image path
    first_path = image_paths[0]
    folder = first_path.split("/")[0] if "/" in first_path else first_path
    true_class = folder.replace("-tif", "")

    is_correct = (picked_class == true_class)

    db.collection("responses_three").document(username).collection("submissions").add({
        "image_paths": image_paths,
        "selected_class": picked_class,
        "true_class": true_class,
        "correct": is_correct,
        "timestamp": firestore.SERVER_TIMESTAMP,
    })

    response = jsonify({
        "status": "success",
        "correct": is_correct,
        "trueClass": true_class
    })
    response.headers.add("Access-Control-Allow-Origin", "*")
    return response, 200
app.register_blueprint(admin_bp)


if __name__ == "__main__":
    app.run(debug=True)
