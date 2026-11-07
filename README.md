# GateSathi (गेटसाथी)

> **"Har entry, har bachcha, surakshit." (हर एंट्री, हर बच्चा, सुरक्षित।)**

GateSathi is a free visitor-entry progressive web application (PWA) designed specifically for Delhi government schools ("School ka digital register"). It replaces cumbersome, unsearchable paper registers with a digital logbook that verifies visitors, maps approved guardians to students, alerts guards and teachers when an unlisted visitor arrives for pickup, maintains live campus headcounts for school principals, and enforces strict DPDP Act 2023 / Rules 2025 compliance with zero biometric facial recognition and 100% school data ownership.

---

## 1. Architecture

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        Frontends (PWA / Web)                           │
│  ┌──────────────────────┐ ┌──────────────────────┐ ┌─────────────────┐ │
│  │   Guard PWA (/gate)  │ │ Teacher PWA (/teacher│ │Principal Dash   │ │
│  │  - 10-digit lookup   │ │ - Approval cards     │ │  (/dashboard)   │ │
│  │  - Live photo via cam│ │ - Instant push alert │ │ - Live headcount│ │
│  │  - IndexedDB offline │ │ - One-tap approve    │ │ - Escalations   │ │
│  │  - 5s polling status │ │ - Add guardian toggle│ │ - Teacher audit │ │
│  └──────────┬───────────┘ └──────────┬───────────┘ └────────┬────────┘ │
└─────────────┼────────────────────────┼──────────────────────┼──────────┘
              │                        │                      │
              ▼                        ▼                      ▼
┌────────────────────────────────────────────────────────────────────────┐
│               Next.js 16 (App Router + Server Actions)                 │
│                      Hosted on Netlify Functions                       │
│  - Session Authentication (Auth.js v5 JWT with tokenVersion checks)    │
│  - RBAC: super_admin, principal, guard, teacher                        │
│  - Multi-tenant school isolation (every query scoped by schoolId)      │
│  - Audit logger (lib/audit.ts writes every state change)               │
│  - Idempotent API endpoints via clientId / dedupeKey                   │
│  - Read-only Pilot UI routes (/approvals/recent, /stats & /visits/today│
└──────┬───────────────────────┬──────────────────────────┬──────────────┘
       │                       │                          │
       ▼                       ▼                          ▼
┌──────────────┐       ┌───────────────┐          ┌───────────────┐
│MongoDB Atlas │       │ Cloudflare R2 │          │Web Push Server│
│ (AWS Mumbai) │       │(Private Bucket│          │    (VAPID)    │
│ - Students   │       │ - Private     │          │- web-push RFC │
│ - Guardians  │       │   photos      │          │  8292 standard│
│ - Visits     │       │ - 5m presigned│          │- Teacher/Admin│
│ - Approvals  │       │   upload PUT  │          │  push dispatch│
│ - Outbox     │       │ - 10m signed  │          └───────────────┘
│ - AuditLogs  │       │   view GET    │
└──────────────┘       └───────────────┘
       ▲
       │
┌──────┴─────────────────────────────────────────────────────────────────┐
│                     Netlify Scheduled Functions                        │
│  ┌─────────────────────────────────┐ ┌───────────────────────────────┐ │
│  │  notify-tick (* * * * *)        │ │ close-visits (0 * * * *)      │ │
│  │  - Escalates overdue requests   │ │ - Hourly cron to auto-close   │ │
│  │  - Retries failed outbox pushes │ │   open visits past closing    │ │
│  │  - Expires stale pending reqs   │ │   hour (IST)                  │ │
│  └─────────────────────────────────┘ └───────────────────────────────┘ │
│  * Note: Scheduled functions trigger only on published production      │
│    Netlify deploys, not on deploy previews. Equivalent HTTP endpoints  │
│    (/api/cron/*) are protected by CRON_SECRET for preview & CI testing.│
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Entry & Approval Flow

```text
Visitor arrives at school gate
              │
              ▼
   Guard enters 10-digit mobile number
              │
      ┌───────┴───────┐
      ▼               ▼
[Known Visitor]  [New Visitor]
      │               │
      │          OTP verification via SMS (or Mock in Preview)
      │          + DPDP consent notice in Hindi / English
      │               │
      └───────┬───────┘
              ▼
Capture live photo from rear camera (compressed to ~150KB client-side)
Select student(s) from linked list or search
Select Purpose (Pickup, Meet student, PTM, Office work, Other)
              │
              ▼
Is visitor linked as approved guardian for ALL selected students?
      ├── YES ──► Entry recorded immediately; student pickup allowed; confirmation displayed.
      └── NO  ──► Guard prompted to select unapproved reason (Relative, Neighbour, Driver/auto, Other).
                  If Purpose == Pickup:
                      │
                      ▼
                  ApprovalRequest created for class teacher of each student.
                  Visit created with pickupBlocked: true.
                  Guard screen shows "Waiting for Class Teacher Approval" (polling status every 5s).
                      │
                      ├───────────────────────────────────────────────────┐
                      ▼                                                   ▼
            [Teacher approves]                                  [Teacher rejects]
     pickupBlocked cleared; guard screen                pickupBlocked stays true; guard screen
     shows green check + teacher name + time;            shows red cross "Do Not Release The Child";
     optional "Add as approved guardian" saved.          guard resets to gate.
                      │
                      ▼ (No decision within 5 minutes)
          Overdue request auto-escalated to School Principal via notify-tick cron.
          Principal gets push notification; can approve or reject from /dashboard.
                      │
                      ▼ (No decision within 30 minutes)
          Request status transitioned to 'expired'; audit log written.
          Guard screen shows: "Expired — call office" (समय समाप्त — कार्यालय से संपर्क करें).
```

### Exit & Auto-Close
- When visitor leaves, guard taps **"अभी परिसर में (Inside Now)"** → marks exit timestamp with one tap.
- If visitor never checks out, the hourly `close-visits` scheduled function automatically closes open visits when the school's IST closing time (`closingHourIst`, default 17:00) is reached, marking `autoClosed: true` and expiring any lingering unapproved requests.

### Offline Entry Queue & Child Safety
- **Child Safety First**: If the guard device is offline and an unlisted visitor requests student **Pickup**, GateSathi blocks the confirmation step and displays a red card: *"Offline — teacher approval not possible. Do not release the child. Call the office/principal."* (`offlinePickupBlockedTitle`). The guard may optionally log the record for audit purposes (`pickupBlocked: true`), but the student cannot be released until an approval is secured.
- **Capture-Time Timestamps**: Queued offline visits record `entryAt` at the instant of capture. When synchronized, `/api/gate/visits` accepts `body.entryAt` after verifying it is not in the future (permitting 2 minutes clock skew) and not older than 24 hours, stamping `metadata.offlineSynced: true` on the `AuditLog`.
- **Zero Silent Loss**:
  - **Network / Photo Failures**: If the compressed photo upload to Cloudflare R2 fails during sync, the entry is retained in IndexedDB and re-attempted on the next sync cycle.
  - **Session Expiration (401)**: The queue halts without losing entries, prompting the guard to re-authenticate.
  - **Server Rejections (4xx/5xx)**: If rejected by the server, entries are transitioned to a dedicated `failed_visits` IndexedDB store with the error reason. The guard UI displays a *"1 entry failed to sync — show to office"* alert with single-tap Retry or Dismiss actions.

---

## 3. Notification & Outbox System

### Triggers & Routing Table

| Event | Primary Recipient | Channel | Fallback / Escalation | Deduplication Key |
| --- | --- | --- | --- | --- |
| **Pickup requested (Teacher assigned)** | Class Teacher | Web Push (VAPID) | If teacher has 0 push subscriptions: immediately notifies School Principals | `approval_request:${requestId}:${teacherId}` |
| **Pickup requested (No Teacher assigned)** | School Principals | Web Push (VAPID) | Visible on Principal Dashboard active queue | `approval_request:${requestId}:no_teacher` |
| **Pending > 5 min (Escalation)** | School Principals | Web Push (VAPID) | Escalated badge + pulse indicator on Dashboard | `approval_escalated:${requestId}` |
| **Request decided (Approve/Reject)** | Gate Guard | 5s HTTP Polling | Guard poll returns `decidedByName`, `decidedAt`, notes | Polled via `/api/gate/visits/[visitId]/approval-status` |
| **Request stale > 30 min (Expiry)** | Gate Guard | 5s HTTP Polling | Status set to `expired`; shows "Expired — call office" | Transitioned atomically; logged to `AuditLog` |

### Outbox Model & Reliability
Notifications are never sent directly over raw network connections without persistence. They are written to a dedicated `Notification` MongoDB collection:
- **Statuses**: `queued` ➔ `sent`, `failed`, or `no_subscription`.
- **Immediate dispatch**: Upon creation, the route attempts delivery with a strict **3-second timeout** so that 2G/3G gate connections are not blocked.
- **Exponential Backoff**: If delivery fails (e.g. transient network or push service downtime), `notify-tick` retries with exponential backoff: 2 min, 4 min, 8 min, 16 min. After 5 failed attempts, the notification is marked exhausted.
- **Subscription Pruning**: 404 and 410 response codes from push services automatically delete the dead endpoint from `PushSubscription`.
- **TTL**: Outbox records are automatically deleted by MongoDB after 30 days via a TTL index on `createdAt`.

### iOS PWA Limitation
On Apple iOS (iPhone/iPad, iOS 16.4+), Web Push notifications **require the web app to be added to the Home Screen** as an installed PWA. Web Push cannot be activated inside regular Safari tabs.
- When a teacher visits `/teacher` on an iOS browser without PWA installation, GateSathi displays a bilingual instructions card:
  > **iPhone / iPad:** Safari में नीचे **Share (शेयर)** बटन दबाएं और **'Add to Home Screen'** चुनें। फिर होम स्क्रीन से GateSathi खोलें।

### How to Test Push Locally
1. Run `npx web-push generate-vapid-keys` and set `VAPID_PUBLIC_KEY` & `VAPID_PRIVATE_KEY` in `.env.local`.
2. Start dev server (`npm run dev:local` or `npm run dev`).
3. Log in as a teacher (`9999999991` or seed credentials) in Chrome / Edge / Firefox (over `localhost` or HTTPS).
4. Tap **"सूचनाएं चालू करें (Enable)"** in the top banner and accept the browser permission prompt.
5. In another window, log an unapproved pickup visit at `/gate` for a student in that teacher's class.
6. A native desktop/OS push notification will appear instantly. Clicking it focuses `/teacher`.

---

## 4. Data Model

| Collection | Model File | Key Fields | Primary & Unique Indexes |
| --- | --- | --- | --- |
| **schools** | `models/School.ts` | `schoolId`, `name`, `udiseCode`, `district`, `state`, `closingHourIst`, `teacherApprovalEscalationMinutes`, `teacherApprovalExpiryMinutes`, `isActive` | `{ schoolId: 1 }` (unique), `{ udiseCode: 1 }` (unique), `{ state: 1, district: 1 }` |
| **users** | `models/User.ts` | `name`, `phone`, `passwordHash`, `role` (`super_admin` \| `principal` \| `guard` \| `teacher`), `schoolIds`, `classAssignments`, `isActive`, `tokenVersion` | `{ phone: 1 }` (unique), `{ schoolIds: 1, role: 1 }` |
| **students** | `models/Student.ts` | `schoolId`, `admissionNo`, `name`, `className`, `section`, `rollNumber`, `isActive` | `{ schoolId: 1, admissionNo: 1 }` (unique), `{ schoolId: 1, className: 1, section: 1 }` |
| **visitors** | `models/Visitor.ts` | `schoolId`, `phone`, `name`, `photoKey`, `defaultRelation`, `consentAt`, `consentVersion`, `isBlocked` | `{ schoolId: 1, phone: 1 }` (unique) |
| **guardianlinks**| `models/GuardianLink.ts` | `schoolId`, `studentId`, `visitorId`, `relation`, `approved` | `{ schoolId: 1, studentId: 1, visitorId: 1 }` (unique), `{ schoolId: 1, visitorId: 1 }` |
| **visits** | `models/Visit.ts` | `schoolId`, `clientId`, `visitorId`, `studentIds`, `purpose`, `isApproved`, `reasonCode`, `pickupBlocked`, `entryAt`, `exitAt`, `autoClosed` | `{ schoolId: 1, clientId: 1 }` (unique idempotency), `{ schoolId: 1, entryAt: -1 }`, `{ schoolId: 1, exitAt: 1 }` |
| **approvalrequests**| `models/ApprovalRequest.ts`| `schoolId`, `visitId`, `studentId`, `visitorId`, `teacherId`, `status`, `requestedBy`, `decidedBy`, `decidedAt`, `escalatedAt`, `note` | `{ schoolId: 1, status: 1, createdAt: 1 }`, `{ teacherId: 1, status: 1 }`, `{ visitId: 1 }` |
| **notifications**| `models/Notification.ts` | `schoolId`, `userId`, `type`, `payload`, `status`, `attempts`, `nextAttemptAt`, `dedupeKey` | `{ dedupeKey: 1 }` (unique), `{ schoolId: 1, status: 1, nextAttemptAt: 1 }`, `{ createdAt: 1 }` (TTL 30 days) |
| **pushsubscriptions**| `models/PushSubscription.ts`| `userId`, `schoolId`, `endpoint`, `p256dh`, `auth` | `{ userId: 1, endpoint: 1 }` (unique), `{ schoolId: 1 }` |
| **auditlogs** | `models/AuditLog.ts` | `schoolId`, `userId`, `action`, `entityType`, `entityId`, `metadata`, `ipAddress` | `{ schoolId: 1, createdAt: -1 }`, `{ action: 1 }` |
| **otprequests**| `models/OtpRequest.ts` | `phone`, `codeHash`, `attempts`, `expiresAt` | `{ phone: 1 }`, `{ expiresAt: 1 }` (TTL auto-cleanup) |
| **ratelimits** | `models/RateLimit.ts` | `key`, `points`, `expireAt` | `{ key: 1 }` (unique), `{ expireAt: 1 }` (TTL) |
| **leads** | `models/Lead.ts` | `name`, `schoolName`, `role`, `phone`, `message`, `ipAddress` | `{ createdAt: -1 }` |

---

## 5. Local Setup & Commands

### Prerequisites
- Node.js 20+
- A running MongoDB instance (or MongoDB Atlas connection string)
- Cloudflare R2 bucket credentials (optional for UI mock testing; required for live photo uploads)

### Installation
```bash
# Clone the repository
git clone https://github.com/JayantOlhyan/gate-sathi.git
cd gate-sathi

# Install dependencies
npm install

# Setup environment variables
cp .env.example .env.local
```

### Generate Keys & Configure Environment
```bash
# 1. Generate Auth.js secret
openssl rand -base64 32

# 2. Generate VAPID keys for Web Push
npx web-push generate-vapid-keys
```

### Seed Development Database
Populates a dummy Delhi school, teachers, students, guard, and principal:
```bash
npm run seed
```
**Seed Credentials:**
- **Super Admin:** Phone `9999999990` / Password `Password@123`
- **Principal:** Phone `9999999991` / Password `Password@123`
- **Guard:** Phone `9999999992` / Password `Password@123`

### Development Scripts
```bash
npm run dev           # Start Next.js development server on port 3000
npm run dev:local     # Start local dev server with embedded in-memory MongoDB + seed data
npm run pilot         # Create/verify a real pilot school + principal + guard + teachers
npm run test          # Run Vitest test suite with real in-memory MongoDB
npm run typecheck     # Validate TypeScript types without emit
npm run lint          # Run ESLint validation
npm run build         # Build production bundle with Webpack & Serwist PWA
npx tsx scripts/e2e-pilot.ts # Run Playwright 360x640 Hindi E2E flow timing + screenshot verification
```

### Environment Variables

| Variable | Description | Default / Example |
| --- | --- | --- |
| `MONGODB_URI` | MongoDB Atlas SRV connection string | `mongodb+srv://...` |
| `AUTH_SECRET` | 32-byte session secret | `openssl rand -base64 32` |
| `AUTH_URL` | Application root URL | `http://localhost:3000` |
| `AUTH_TRUST_HOST` | Trust proxy headers (Netlify) | `true` |
| `OTP_MODE` | OTP delivery mechanism | `mock` (dev/preview) or `msg91` (prod) |
| `ALLOW_MOCK_OTP` | Allows OTP 000000 in mock mode | `true` (never in real production) |
| `NEXT_PUBLIC_DEMO_MODE` | Exposes `/demo` showcase & demo credentials on landing page | Omit / `false` in production; `true` for local demo |
| `MSG91_AUTH_KEY` | MSG91 API authentication key | Set once DLT approved |
| `MSG91_TEMPLATE_ID`| DLT-approved MSG91 OTP template ID | Set once DLT approved |
| `R2_ACCOUNT_ID` | Cloudflare account ID | Cloudflare dashboard |
| `R2_ACCESS_KEY_ID` | Cloudflare R2 S3 API Access Key | R2 API Tokens |
| `R2_SECRET_ACCESS_KEY`| Cloudflare R2 S3 API Secret Key | R2 API Tokens |
| `R2_BUCKET` | Private R2 storage bucket | `gatesathi-private` |
| `CRON_SECRET` | Shared secret for cron triggers | Custom secret |
| `VAPID_PUBLIC_KEY` | Web Push VAPID public key | Generated via web-push |
| `VAPID_PRIVATE_KEY`| Web Push VAPID private key | Generated via web-push |
| `VAPID_SUBJECT` | VAPID contact email / URL | `mailto:support@gatesathi.in` |

For full deployment and Cloudflare R2 CORS configurations, refer to [DEPLOY.md](DEPLOY.md). For visual screen layout references across Guard, Teacher, and Principal views, see [uiux-references/README.md](uiux-references/README.md).

---

## 6. Project Roadmap

> **Note:** The source of truth for all milestone progress is the [GateSathi Notion Master Checklist](https://app.notion.com/p/408d8b74468a8198aae5d34e49a2d81d). This table mirrors its status as of November 2026.

### Phase 0: Name, Brand & Infrastructure Setup
- [x] Product Name ("GateSathi") & Tagline ("Har entry, har bachcha, surakshit.")
- [x] Check domain availability (`gatesathi.in`)
- [x] Brand logo designed and integrated in header & favicon
- [x] App & PWA icon suite generated (192, 512, maskable, apple-touch)
- [x] GitHub repository created (`github.com/JayantOlhyan/gate-sathi`)
- [ ] Purchase domain `gatesathi.in` (before DoE pitch)
- [ ] Trademark check & filing for "GateSathi" (Classes 9 and 42)
- [ ] Setup production cloud accounts (Netlify, MongoDB Atlas AWS Mumbai, Cloudflare R2, Sentry)
- [ ] TRAI DLT registration & MSG91 account application
- [ ] Confirm pilot school with mama ji (school selection, gate phone, student Excel, permission)
- [ ] Consent notice validation at gate and `/privacy`
- **Exit Gate:** All production cloud accounts active, DLT registration submitted, pilot school confirmed. ⬜

### Phase 1: Baseline Gate Observations (Pre-Build Validation)
- [ ] Sit at pilot school gate during morning arrival and afternoon dismissal
- [ ] Time 20 paper register entries
- [ ] Measure total visitors per day & peak 15-minute volume
- [ ] Benchmark time to answer "Who met student X on Tuesday?"
- [ ] Audit 50 paper register entries for incompleteness / illegibility
- [ ] Photograph physical register pages for before/after case study
- **Exit Gate:** Baseline benchmark sheet completed. ⬜

### Phase 2: Build Version 1
- [x] Week 1: Project foundation, Auth.js v5 RBAC, Next.js 16 App Router
- [x] Week 2: Student & guardian bulk import (CSV/XLSX), conflict resolution
- [x] Week 3: Gate entry engine (lookup, photo capture, student linking, auto-approval)
- [x] Week 4: Offline entry queue (IndexedDB), PWA service worker, full Hindi localization, reliable notification outbox & escalation
- [x] Pilot UI Rebuild (Nov 2026): Rebuilt Screens 01–13 to match `docs/ux/reference/` mockups (Hindi-first single-language rendering, 2-step Guard lookup + one-screen entry, live approval status strip, 2-step exit confirmation, Teacher large-photo approval & history tabs, Principal 4-stat summary + Today's Gate Log + Teacher Roster + responsive Student CSV Import), resolved Pilot Blockers P0.1–P0.6, and verified via Playwright E2E suite (`scripts/e2e-pilot.ts`)
- [ ] Deploy to Netlify production + seed database + R2 CORS verified
- [ ] Field timing validation on budget Android phone (<15s repeat visitor, <45s new visitor)
- [ ] Acceptance test: New guard logs entry with zero intervention
- **Exit Gate:** A new guard logs a complete entry with no help. ⬜

### Phase 3: Single School Pilot (Weeks 5–8)
- [ ] Day 1 guard shadowing & on-ground training
- [ ] Dual-register run (1 week paper + digital parallel)
- [ ] Paper register phased out; 100% digital logbook
- [ ] Weekly feedback reviews with guard and principal
- **Exit Gate:** 500+ successful digital entries logged with zero child-safety incidents. ⬜

### Phase 4: Cluster Pilot (3–5 Schools, Weeks 9–14)
- [ ] Onboard 3 to 5 additional government schools in same district
- [ ] Multi-school principal monitoring & district admin dashboard
- [ ] Formal legal review of DPDP privacy policy with a technology lawyer
- **Exit Gate:** Testimonials and written endorsement letters from 3 principals. ⬜

### Phase 5: Directorate of Education (DoE) Pitch (Month 4)
- [ ] Compile pilot data into an executive presentation for DoE officials
- [ ] Live demo showcasing student safety & guardian verification
- [ ] Submit proposal for circular authorization across Delhi zones
- **Exit Gate:** DoE circular permitting GateSathi adoption across district schools. ⬜

### Phase 6: Delhi State Rollout (Months 5–12)
- [ ] Incorporate private limited company for formal government MoUs
- [ ] Scale infrastructure to support 1,000+ schools across Delhi
- [ ] Regional train-the-trainer workshops for security staff
- **Exit Gate:** 100+ schools actively logging daily gate traffic. ⬜

### Phase 7: Multi-State Expansion (Year 2)
- [ ] Register entity as an approved seller on the Government e-Marketplace (GeM)
- [ ] Adapt localization for additional Indian languages (Punjabi, Marathi, Bengali, Tamil)
- [ ] Outreach to education departments in neighbouring states
- **Exit Gate:** Expansion into at least 2 additional states. ⬜

### Phase 8: Premium Tier for Private Schools
- [ ] Develop private school SaaS tier with enterprise bells & whistles
- [ ] Cross-subsidize 100% free government school usage through private school revenues
- **Exit Gate:** Financially sustainable, mission-aligned business model. ⬜

---

## 7. Registrations & External Accounts Checklist

| Item | Where (URL) | Why Needed | Needed by Phase | Lead Time | Cost Note | Status |
| --- | --- | --- | --- | --- | --- | --- |
| **Domain `gatesathi.in`** | Any registrar (e.g. Namecheap, Cloudflare, GoDaddy) | Production web URL & email sender identity | Before DoE pitch | 1–2 hours | Check on site (~₹500–1,000/yr) | ⬜ Pending |
| **Trademark "GateSathi"** | [ipindiaonline.gov.in](https://ipindiaonline.gov.in) | Protect brand & trademark rights under Classes 9 (software) and 42 (SaaS) | Phase 0 | Several months | Check on site (Govt fee ~₹4,500/class for individual/startup) | ⬜ Pending |
| **Netlify Account** | [netlify.com](https://www.netlify.com) | Hosting serverless Next.js app & scheduled cron functions | Phase 0 | Instant | Free tier available | ⬜ Pending |
| **MongoDB Atlas** | [mongodb.com/atlas](https://www.mongodb.com/atlas) | Managed database hosted in AWS Mumbai (`ap-south-1`) for Indian data residency | Phase 0 | Instant | Free tier available | ⬜ Pending |
| **Cloudflare R2** | [cloudflare.com](https://www.cloudflare.com) | Private visitor photo storage with 0 egress fees | Phase 0 | Instant | Free tier (requires payment method on file) | ⬜ Pending |
| **Sentry** | [sentry.io](https://sentry.io) | Production error tracking & crash monitoring | Phase 0 | Instant | Free tier | ⬜ Pending |
| **TRAI DLT & MSG91 Account** | [msg91.com](https://msg91.com) & Telecom DLT portals (Jio, Airtel, Vodafone) | Regulatory requirement for sending SMS OTPs in India (Principal Entity, Header, Content Template registration) | Phase 0 (Start now) | Days to weeks (requires business KYC documents) | Check on site (~₹5,900 DLT registration fee + SMS pack) | ⬜ Pending (Run mock OTP on previews) |
| **VAPID Keys** | Local CLI | Cryptographic keys for Web Push notifications | Phase 0 | Instant (`npx web-push generate-vapid-keys`) | ₹0 (Free, no registration) | ✅ Generated |
| **DoE / School Permission** | School / District Office (via mama ji) | Formal authorization to pilot digital entry app at the school gate | Phase 0 | Days to weeks | ₹0 | ⬜ Pending |
| **DPDP Consent Notice** | In-app (`/gate` and `/privacy`) | Legal compliance under Digital Personal Data Protection Act 2023 | Phase 0 | Implemented | ₹0 | ✅ Implemented |
| **Legal Privacy Review** | Technology Lawyer | Legal review of privacy policy and data retention agreements before expanding | Phase 4 | 2–3 weeks | Check with counsel | ⬜ Pending |
| **Company Incorporation** | [mca.gov.in](https://www.mca.gov.in) | Legal corporate entity required for signing formal MoUs with DoE | Phase 6 | 2–4 weeks | Check on site with CA | ⬜ Pending |
| **GeM Seller Registration**| [gem.gov.in](https://gem.gov.in) | Listing on Government e-Marketplace for state procurement | Phase 7 | 1–2 weeks | Check on site | ⬜ Pending |
| **Google Play Console** | [play.google.com/console](https://play.google.com/console) | Only if an Android native wrapper is built in future | Future | 2–3 days | One-time \$25 fee | ⬜ Deferred (PWA used in v1) |

---

## 8. Open Questions & Field Considerations

*Notes from initial school field interviews:*
1. **Approval Scope:** Should class teacher approval be required strictly for **Pickup** visits of unlisted guardians, or for **every flagged unapproved visit** (including "Meet student" or "PTM")?
   - *Current implementation:* Configurable per school via `school.teacherApprovalFor` ('pickup' vs 'all_flagged'). Defaults to 'pickup' to prevent teacher notification fatigue.
2. **Absentee Teacher Coverage:** If the designated class teacher is absent, on medical leave, or taking a class with their phone on silent, who authorizes the release of the child?
   - *Current implementation:* Automatic 5-minute escalation forwards the request directly to the School Principal dashboard.
3. **Teacher Smartphone & Connectivity Realities:** Do government school teachers have active smartphones with internet connectivity during school hours?
   - *Finding:* Most teachers use WhatsApp for staff communication, but school Wi-Fi is often absent and mobile network signal varies inside classrooms. GateSathi falls back to Principals immediately when teachers have no push subscriptions registered.

---

## 9. Future Features (Not in v1)
The following capabilities are deliberately planned for post-v1 phases:
- **Pre-approved visitor passes:** Parents generating a single-use entry QR/code for scheduled visits.
- **Parent WhatsApp / SMS alerts:** Instant SMS notification sent to parents when their child is picked up.
- **CSV & Analytics exports:** Deep analytics on hourly footfall, repeat visitors, and late-pickup trends.
- **Multi-gate support:** Multiple synchronized security checkpoints for sprawling school campuses.
- **Staff & contractor attendance:** Dedicated attendance clock-in for non-teaching school staff.
- **Android APK:** Native Play Store app (TWA / React Native) if required by government procurement tenders.

---

## 10. Links & Resources
- **Notion Master Page:** [GateSathi Master Checklist](https://app.notion.com/p/408d8b74468a8198aae5d34e49a2d81d)
- **Deployment Guide:** [DEPLOY.md](DEPLOY.md)
- **GitHub Repository:** [github.com/JayantOlhyan/gate-sathi](https://github.com/JayantOlhyan/gate-sathi)
