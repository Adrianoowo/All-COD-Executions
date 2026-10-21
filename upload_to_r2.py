"""
upload_to_r2.py
----------------
Bulk migrates execution assets and images to Cloudflare R2 object storage.
Supports concurrent uploads, resume capability, and content-type detection.
"""

import os
import sys
import mimetypes
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import boto3
from botocore.config import Config

# Load .env if present
env_file = Path(__file__).parent / ".env"
if env_file.exists():
    with open(env_file, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())

# Configuration - can be set via environment variables or hardcoded
R2_ACCOUNT_ID = os.environ.get("R2_ACCOUNT_ID", "d792672fd8d66494050df2a61410c55c")
R2_ACCESS_KEY_ID = os.environ.get("R2_ACCESS_KEY_ID", "")
R2_SECRET_ACCESS_KEY = os.environ.get("R2_SECRET_ACCESS_KEY", "")
R2_BUCKET_NAME = os.environ.get("R2_BUCKET_NAME", "all-cod-executions")

mimetypes.add_type("image/webp", ".webp")
mimetypes.add_type("image/svg+xml", ".svg")
mimetypes.add_type("image/gif", ".gif")
mimetypes.add_type("image/png", ".png")
mimetypes.add_type("image/jpeg", ".jpg")
mimetypes.add_type("image/jpeg", ".jpeg")


def get_s3_client():
    if not R2_ACCESS_KEY_ID or not R2_SECRET_ACCESS_KEY:
        raise ValueError("R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY must be provided.")
    
    endpoint_url = f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
    return boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
        config=Config(signature_version="s3v4", retries={"max_attempts": 5, "mode": "standard"})
    )


def collect_files(base_dirs):
    files_to_upload = []
    workspace_root = Path(__file__).parent.resolve()

    for folder_name in base_dirs:
        folder_path = workspace_root / folder_name
        if not folder_path.exists():
            continue
        for root, _, files in os.walk(folder_path):
            for file in files:
                full_path = Path(root) / file
                rel_path = full_path.relative_to(workspace_root).as_posix()
                files_to_upload.append((full_path, rel_path))
    return files_to_upload


def upload_single_file(client, local_path, s3_key, existing_objects):
    local_size = local_path.stat().st_size
    if s3_key in existing_objects and existing_objects[s3_key] == local_size:
        return s3_key, "SKIPPED", local_size

    mime_type, _ = mimetypes.guess_type(str(local_path))
    content_type = mime_type or "application/octet-stream"

    extra_args = {
        "ContentType": content_type,
        "CacheControl": "public, max-age=31536000, immutable"
    }

    client.upload_file(
        Filename=str(local_path),
        Bucket=R2_BUCKET_NAME,
        Key=s3_key,
        ExtraArgs=extra_args
    )
    return s3_key, "UPLOADED", local_size


def get_existing_r2_objects(client):
    print(f"[*] Checking existing objects in bucket '{R2_BUCKET_NAME}'...")
    existing = {}
    paginator = client.get_paginator("list_objects_v2")
    try:
        for page in paginator.paginate(Bucket=R2_BUCKET_NAME):
            for obj in page.get("Contents", []):
                existing[obj["Key"]] = obj["Size"]
    except Exception as e:
        print(f"[!] Warning fetching existing objects: {e}")
    print(f"[*] Found {len(existing)} existing objects in bucket.")
    return existing


def main():
    print("=" * 60)
    print(" Cloudflare R2 Migration Uploader")
    print("=" * 60)

    if not R2_ACCESS_KEY_ID or not R2_SECRET_ACCESS_KEY:
        print("\n[!] Error: Missing R2 credentials.")
        print("Please set R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY environment variables,")
        print("or pass them to this script.")
        sys.exit(1)

    s3 = get_s3_client()
    existing_objects = get_existing_r2_objects(s3)

    folders = ["assets"]
    files = collect_files(folders)
    total_files = len(files)
    total_bytes = sum(f[0].stat().st_size for f in files)

    print(f"[*] Found {total_files} files to sync ({total_bytes / (1024 * 1024):.2f} MB)")

    uploaded_count = 0
    skipped_count = 0
    uploaded_bytes = 0

    with ThreadPoolExecutor(max_workers=12) as executor:
        futures = {
            executor.submit(upload_single_file, s3, path, key, existing_objects): key
            for path, key in files
        }

        for future in as_completed(futures):
            key = futures[future]
            try:
                s3_key, status, size = future.result()
                if status == "UPLOADED":
                    uploaded_count += 1
                    uploaded_bytes += size
                    print(f"  [+] ({uploaded_count + skipped_count}/{total_files}) Uploaded: {s3_key} ({size / 1024:.1f} KB)")
                else:
                    skipped_count += 1
            except Exception as e:
                print(f"  [X] Failed {key}: {e}")

    print("\n" + "=" * 60)
    print(f"[✓] Migration complete!")
    print(f"    Uploaded: {uploaded_count} files ({uploaded_bytes / (1024 * 1024):.2f} MB)")
    print(f"    Skipped (already up-to-date): {skipped_count} files")
    print("=" * 60)


if __name__ == "__main__":
    main()
