# GateSathi Deployment Guide (Netlify + MongoDB Atlas + Cloudflare R2)

## 1. Environment Variables

Configure the following environment variables in **Netlify Site Settings → Environment Variables**:

| Variable | Required | Description |
| --- | --- | --- |
| `MONGODB_URI` | Yes | MongoDB Atlas SRV connection string (`mongodb+srv://<user>:<password>@<cluster>.mongodb.net/gatesathi?retryWrites=true&w=majority`). |
| `AUTH_SECRET` | Yes | 32-byte random secret used by Auth.js v5 to sign/encrypt session JWTs (`openssl rand -base64 32`). |
| `AUTH_URL` | Recommended | Canonical origin URL of the deployment (e.g., `https://<site-name>.netlify.app`) used by Auth.js v5 for callback and redirect resolution. |
| `AUTH_TRUST_HOST` | Yes (Netlify) | Set to `true` on Netlify so Auth.js v5 trusts the `X-Forwarded-Host` header across preview and production URLs. |
| `OTP_MODE` | Yes | Set to `mock` for dev/preview testing, or `msg91` for live SMS OTP delivery once DLT registration is approved. |
| `ALLOW_MOCK_OTP` | Preview only | Must be explicitly set to `true` alongside `OTP_MODE=mock` to enable `MockOtpProvider` (`000000` test code + yellow `"TEST MODE — OTP 000000"` banner on `/gate`). In production without `ALLOW_MOCK_OTP=true`, `OTP_MODE=mock` throws at startup. |
| `MSG91_AUTH_KEY` | When `OTP_MODE=msg91` | MSG91 API authentication key for SMS OTP dispatch. |
| `MSG91_TEMPLATE_ID` | When `OTP_MODE=msg91` | DLT-approved MSG91 OTP template ID. |
| `R2_ACCOUNT_ID` | Yes | Cloudflare account ID for the R2 storage endpoint (`https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`). |
| `R2_ACCESS_KEY_ID` | Yes | R2 API token Access Key ID (with Object Read & Write permissions on the bucket). |
| `R2_SECRET_ACCESS_KEY` | Yes | R2 API token Secret Access Key. |
| `R2_BUCKET` | Yes | Private Cloudflare R2 bucket name (e.g., `gatesathi-private`). |
| `CRON_SECRET` | Yes | Shared secret token required in `Authorization: Bearer <CRON_SECRET>` or `x-cron-secret` header for `POST /api/cron/close-visits`. |

---

## 2. Cloudflare R2 CORS Configuration

In **Cloudflare Dashboard → R2 → `<R2_BUCKET>` → Settings → CORS Policy**, paste the following JSON (replace `https://<your-site>.netlify.app` with your Netlify site URL and preview wildcard if needed):

```json
[
  {
    "AllowedOrigins": [
      "https://<your-site>.netlify.app",
      "http://localhost:3000"
    ],
    "AllowedMethods": [
      "PUT",
      "GET",
      "HEAD"
    ],
    "AllowedHeaders": [
      "content-type",
      "content-length"
    ],
    "ExposeHeaders": [
      "ETag"
    ],
    "MaxAgeSeconds": 3600
  }
]
```

> **Note**: Keep **Public Access** disabled on the R2 bucket. All uploads use 5-minute presigned `PUT` URLs (`content-type` and `content-length` signed) and all photo views use 10-minute presigned `GET` URLs.

---

## 3. MongoDB Atlas Network & Database Setup

1. **Cluster Region**: Provision the Atlas cluster in **AWS Mumbai (`ap-south-1`)**.
2. **Database User**: Under **Database Access**, create a user with `readWrite` permissions on the `gatesathi` database.
3. **Network Access (IP Access List)**:
   - Because Netlify Serverless Functions execute from dynamic egress IPs, go to **Security → Network Access → Add IP Address** and allow access from `0.0.0.0/0` (`Allow Access from Anywhere`), protected by a strong database password and TLS (`mongodb+srv://`).

---

## 4. Seeding MongoDB Atlas

To seed the initial `Pilot School`, `super_admin`, `principal`, `guard`, and 10 dummy students against your Atlas database (note: `scripts/seed.ts` refuses to run if `NODE_ENV=production`):

```bash
MONGODB_URI="mongodb+srv://<username>:<password>@<cluster>.mongodb.net/gatesathi?retryWrites=true&w=majority" NODE_ENV=development npm run seed
```

Seeded credentials created by `npm run seed`:
- **Super Admin**: `9999999990` / `Password@123`
- **Principal**: `9999999991` / `Password@123`
- **Guard**: `9999999992` / `Password@123`

---

## 5. Health Check Endpoint

Verify deployment readiness via the public, rate-limited health endpoint:

```bash
curl -s https://<your-site>.netlify.app/api/health
```

Expected response:
```json
{
  "db": "ok",
  "r2": "ok",
  "otpMode": "mock"
}
```
