# All-COD-Executions & ExecutionersBot System Instructions

> **Attention AI Agent**: This project ecosystem consists of a static web frontend (`All-COD-Executions`), a Discord bot (`ExecutionersBot`), a **Google Sheet** (the primary database/source of truth), a **Cloudflare R2 bucket** (the CDN for media), and **Turso** (user inventory). Read this guide carefully before editing any files.

---

## 1. High-Level Architecture

```
                          ┌─────────────────────────────────────┐
                          │     Google Sheets (Source of Truth) │
                          │  Spreadsheet ID: 1tdTf7Squ1...      │
                          └───────┬─────────────────────┬───────┘
                                  │ (Published CSV)     │ (Published CSV / Webhook)
                                  ▼                     ▼
               ┌───────────────────────┐   ┌───────────────────────┐
               │   All-COD-Executions  │   │    ExecutionersBot    │
               │   (Static Website)    │   │     (Discord Bot)     │
               └──────────┬────────────┘   └──────────┬────────────┘
                          │                           │
                          │ (Streams icons/GIFs)      │ (Embed images)
                          ▼                           ▼
            ┌───────────────────────────────────────────────┐
            │          Cloudflare R2 Storage (CDN)          │
            │   https://pub-21d091e8cc674a2c9f1f8a59eac107b6.r2.dev/  │
            └───────────────────────────────────────────────┘
```

---

## 2. Media & Asset Storage (Cloudflare R2)

### The Golden Rule
* **Execution Assets (`assets/...`)**: These are finishing move icons (`assets/{GAME}/{CleanName}.png`) and animated preview GIFs (`assets/previews/{GAME}/{CleanName}.gif`). **They MUST be served via Cloudflare R2.** Do NOT commit large media files to Git.
* **Website UI Images (`images/...`)**: Game cover backgrounds (`images/backgrounds/...`) and sidebar game icons (`images/...`) **remain LOCAL on the website repository/GitHub**. Do NOT push them to Cloudflare R2.

### Cloudflare Details
* **Public Domain**: `https://pub-21d091e8cc674a2c9f1f8a59eac107b6.r2.dev`
* **Bucket Name**: `all-cod-executions`
* **Account ID**: `d792672fd8d66494050df2a61410c55c`
* **Credentials**: Kept in local `.env` (ignored by git).
* **URL Resolution in Frontend (`index.js`)**:
  ```javascript
  function resolveAssetUrl(path) {
    if (!path) return '';
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;
    if (cleanPath.startsWith('assets/')) {
      return `${CDN_BASE_URL}/${cleanPath}`;
    }
    return cleanPath; // images/ stays local!
  }
  ```
* **Bulk Upload / Sync**: Run `python upload_to_r2.py` in `All-COD-Executions` to sync any local `assets/` to R2 with multi-threading and resume support.

---

## 3. Data Management & Google Sheets (`/gsheets`)

The **Google Sheet is the live database** for both the website and the Discord bot.

### Sheet Coordinates
* **Spreadsheet ID**: `1tdTf7Squ1zQDyb8WN2w8lUUZBYsjELef1oH1JYIGJkw`
* **Sheet GID**: `1458453375`
* **CSV Endpoint**:
  `https://docs.google.com/spreadsheets/d/e/2PACX-1vT9EOMdiacUjhgNkMA8tQze2PqKXThqPX4MxCUZNnS-3GNuGapsATPrYJKLWggNaJjcaLz89JL23ovP/pub?gid=1458453375&single=true&output=csv`

### Setting up the Google Apps Script Webhook
To enable automatic writing directly from Discord commands (`/sync-wiki`, `/add-execution`, `/edit-execution`) to Google Sheets:
1. Open the Google Spreadsheet in your browser.
2. Click **Extensions** > **Apps Script**.
3. Replace all code with the contents of `google_apps_script.js`.
4. Click **Deploy** > **New deployment** > Select type: **Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Copy the generated Web app URL and paste it into `ExecutionersBot/.env`:
   ```env
   GOOGLE_APPS_SCRIPT_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
   GOOGLE_APPS_SCRIPT_SECRET=CHANGE_ME_TO_A_SECRET_KEY
   ```

---

## 4. Discord Bot Commands & Wiki Automation

### `/sync-wiki`
Automatically queries the Call of Duty Fandom wiki API, finds finishing moves that aren't yet in the database:
1. Downloads icons and animated preview GIFs.
2. Sanitizes GIFs with Pillow (`loop=0`, `disposal=2`) to prevent Discord animation freezing.
3. Uploads assets directly to Cloudflare R2 (`assets/{game}/{clean_name}.png`, `assets/previews/{game}/{clean_name}.gif`).
4. Appends the new rows to Google Sheets via `sheets_client.batch_add_remote_executions()`.
5. Updates in-memory bot cache and local fallback CSV immediately.
* Use `dry_run=True` to inspect what moves would be added without writing.

### `/add-execution`
Manually adds a finishing move from Discord without opening Google Sheets. Sets up R2 paths, syncs to Google Sheets, and updates bot cache.

### `/edit-execution`
Modifies price, bundle, store link, or aliases for an existing finishing move and syncs the changes to Google Sheets.
