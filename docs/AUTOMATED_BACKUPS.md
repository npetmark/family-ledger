# Automated Supabase Database Backups

This repository includes an automated GitHub Actions workflow to back up the complete Supabase database on a daily schedule and on-demand.

## Workflow Overview

- **File**: [`.github/workflows/db-backup.yml`](file:///.github/workflows/db-backup.yml)
- **Schedule**: Daily at `02:00 UTC` (`cron: '0 2 * * *'`).
- **Manual Trigger**: Available anytime via GitHub Actions **Run workflow** button with options for scope (`full`, `data-only`, or `schema-only`) and retention days.
- **Included Schemas**: `public` (tables & data), `auth` (`auth.users` and identities), and `storage` (metadata).
- **Compression**: `gzip` level 9.
- **Encryption**: Optional client-side GPG AES-256 encryption.

---

## 1. Setting up GitHub Secrets

Go to your GitHub repository:
**Settings → Secrets and variables → Actions → New repository secret**

### Required Secret

| Secret Name | Description | Example |
| :--- | :--- | :--- |
| `SUPABASE_DB_URL` | PostgreSQL connection string from Supabase | `postgresql://postgres.[REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?sslmode=require` |

#### How to find `SUPABASE_DB_URL`:
1. Log in to [supabase.com/dashboard](https://supabase.com/dashboard).
2. Select your project.
3. Go to **Project Settings** (gear icon) → **Database**.
4. Scroll to **Connection string** → Select **URI** (or **Session pooler** / **Direct connection**).
5. Replace `[YOUR-PASSWORD]` with your actual Supabase database password.

---

### Optional Secrets

| Secret Name | Description | Purpose |
| :--- | :--- | :--- |
| `BACKUP_PASSPHRASE` | Password/key for GPG symmetric encryption | Encrypts `.sql.gz` to `.sql.gz.gpg` before saving to GitHub artifacts. |
| `S3_BUCKET` | AWS S3 or Cloudflare R2 bucket name | Offsite cloud storage sync. |
| `S3_ENDPOINT` | Custom S3 endpoint (e.g. for Cloudflare R2) | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `AWS_ACCESS_KEY_ID` | S3 / R2 Access Key ID | Authentication for offsite upload. |
| `AWS_SECRET_ACCESS_KEY` | S3 / R2 Secret Key | Authentication for offsite upload. |

---

## 2. Triggering a Manual Backup

1. In GitHub, go to the **Actions** tab.
2. Under "All workflows" on the left, select **Automated Supabase DB Backup**.
3. Click the **Run workflow** dropdown on the right:
   - Select the branch (usually `main`).
   - Select **Backup Scope** (`full`, `data-only`, or `schema-only`).
   - Choose **Artifact Retention Days** (e.g. `30` or `90`).
4. Click **Run workflow**.

---

## 3. Downloading and Restoring a Backup

### Step 1: Download Artifact
1. Go to the completed workflow run under **Actions**.
2. Scroll to the **Artifacts** section at the bottom.
3. Download the `supabase-backup-<timestamp>` zip file and extract it.

### Step 2: Decrypt (If `BACKUP_PASSPHRASE` was used)
```bash
gpg --decrypt supabase_backup_<timestamp>_full.sql.gz.gpg > supabase_backup_<timestamp>_full.sql.gz
```

### Step 3: Decompress
```bash
gzip -d supabase_backup_<timestamp>_full.sql.gz
# Yields supabase_backup_<timestamp>_full.sql
```

### Step 4: Restore to Supabase
You can restore to your local Supabase instance or to a fresh Supabase cloud project using `psql`:

```bash
# Restore to local Supabase
psql "postgresql://postgres:postgres@127.0.0.1:55322/postgres" < supabase_backup_<timestamp>_full.sql

# Restore to remote Supabase
psql "postgresql://postgres.[REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?sslmode=require" < supabase_backup_<timestamp>_full.sql
```
