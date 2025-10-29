from flask import Flask, jsonify, request
from flask_cors import CORS
from google.cloud import storage
import firebase_admin
from firebase_admin import credentials, firestore
import random
import os
import threading
import time

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

BUCKET_NAME = "ctenopool"
FOLDER_NAMES = ["202502-1-tif", "202502-2-tif", "202502-3-tif", "202502-4-tif"]
IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png")

os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = r"C:\Users\anabh\Code and Projects\poolingdemo\ctenopool-firebase-adminsdk-fbsvc-b6894c1076.json"
cred = credentials.Certificate(r"C:\Users\anabh\Code and Projects\poolingdemo\ctenopool-firebase-adminsdk-fbsvc-b6894c1076.json")
firebase_admin.initialize_app(cred)
db = firestore.client()
storage_client = storage.Client()

cache_lock = threading.Lock()
cached_files = {}
last_cache_time = 0
CACHE_DURATION = 300  # seconds


def refresh_cache():
    global cached_files, last_cache_time
    with cache_lock:
        now = time.time()
        if now - last_cache_time > CACHE_DURATION or not cached_files:
            new_cache = {}
            for folder in FOLDER_NAMES:
                blobs = list(storage_client.list_blobs(BUCKET_NAME, prefix=folder + "/"))
                imgs = [
                    b.name
                    for b in blobs
                    if b.name.lower().endswith(IMAGE_EXTENSIONS)
                ]
                new_cache[folder] = imgs
            cached_files = new_cache
            last_cache_time = now


def list_images(folder):
    refresh_cache()
    with cache_lock:
        return cached_files.get(folder, [])


def get_signed_url(blob_name):
    bucket = storage_client.bucket(BUCKET_NAME)
    blob = bucket.blob(blob_name)
    url = blob.generate_signed_url(
        version="v4",
        expiration=600,  # 10 minutes
        method="GET"
    )
    return url


@app.route("/api/image-set")
def image_set():
    all_imgs = []
    class_samples = {}

    # build 1 random sample per class
    for folder in FOLDER_NAMES:
        imgs = list_images(folder)
        if imgs:
            choice_blob = random.choice(imgs)  # e.g. "202502-1-tif/20250228-E-1-PA-2.png"
            class_samples[folder] = {
                "blobPath": choice_blob,
                "displayUrl": get_signed_url(choice_blob)
            }
            all_imgs.extend(imgs)

    # pick the main image from any class
    if all_imgs:
        main_blob = random.choice(all_imgs)
        main_image_obj = {
            "blobPath": main_blob,
            "displayUrl": get_signed_url(main_blob)
        }
    else:
        main_image_obj = None

    # turn keys like "202502-1-tif" into "202502-1"
    cleaned_choices = {}
    for folder, obj in class_samples.items():
        short_key = folder.replace("-tif", "")
        cleaned_choices[short_key] = obj

    return jsonify({
        "mainImage": main_image_obj,
        "choices": cleaned_choices
    })


@app.route("/api/submit-label", methods=["POST", "OPTIONS"])
def submit_label():
    if request.method == "OPTIONS":
        response = jsonify({"status": "preflight ok"})
        response.headers.add("Access-Control-Allow-Origin", "*")
        response.headers.add("Access-Control-Allow-Methods", "POST, OPTIONS")
        response.headers.add("Access-Control-Allow-Headers", "Content-Type")
        return response, 200

    data = request.json or {}

    username = data.get("username", "anonymous")

    # IMPORTANT: we now expect the CLEAN PATH
    # not the signed URL
    main_image_blob = data.get("mainImageBlob")
    picked_class = data.get("choice")

    if not main_image_blob or not picked_class:
        return jsonify({"status": "error", "message": "missing fields"}), 400

    # store the stable blob path in Firestore
    db.collection("responses").add({
        "username": username,
        "main_image_blob": main_image_blob,  # this will look like "202502-1-tif/20250228-E-1-PA-2.png"
        "selected_class": picked_class,
        "timestamp": firestore.SERVER_TIMESTAMP
    })

    response = jsonify({"status": "success"})
    response.headers.add("Access-Control-Allow-Origin", "*")
    return response, 200


if __name__ == "__main__":
    app.run(debug=True)
