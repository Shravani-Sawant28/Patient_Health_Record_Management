# HealthChain EHR — Full Codebase Analysis

## 1. Project Layout (Bird's-Eye View)

```
Patient_Health_Record_Management0/
├── new_frontend/          ← 🖥️ FRONTEND + BACKEND (Next.js Full-Stack)
│   ├── app/
│   │   ├── api/           ← 🔧 BACKEND (Next.js Route Handlers = REST API)
│   │   ├── admin/         ← Admin UI pages
│   │   ├── doctor/        ← Doctor UI pages
│   │   ├── patient/       ← Patient UI pages
│   │   ├── lab/           ← Lab UI pages
│   │   └── page.tsx       ← Landing / Login page
│   ├── components/        ← Reusable React UI components
│   ├── lib/
│   │   ├── db/            ← 🗄️ DATABASE layer (MongoDB connection + models)
│   │   ├── auth/          ← JWT + password hashing utilities
│   │   ├── ai/            ← AI/LLM service (Gemini)
│   │   └── contracts.ts   ← Blockchain ABI + Thirdweb client
│   └── ...
└── blockchain/            ← ⛓️ Smart Contracts (Hardhat + Solidity)
    ├── contracts/
    │   ├── EHRRegistry.sol
    │   └── EHRAccess.sol
    └── scripts/           ← Deployment scripts
```

---

## 2. Where Is Each Layer Written?

### 🖥️ Frontend (UI)
| Location | Description |
|---|---|
| `new_frontend/app/page.tsx` | Landing page with wallet login + email/password login |
| `new_frontend/app/patient/` | Patient dashboard, records view, access management |
| `new_frontend/app/doctor/` | Doctor dashboard, patient list, record upload |
| `new_frontend/app/lab/` | Lab dashboard, report upload |
| `new_frontend/app/admin/` | Admin panel: user management, verifications |
| `new_frontend/app/complete-profile/` | Universal intake form (after first wallet login) |
| `new_frontend/components/` | Shared UI: wallet-login, dashboard, doctor, patient, lab, AI widgets |

**Framework:** Next.js 16 (App Router) with React 19, TypeScript, TailwindCSS v4, shadcn/ui (Radix UI components).

---

### 🔧 Backend (API)
All backend logic is written as **Next.js Route Handlers** (server-side TypeScript files named `route.ts`) inside `new_frontend/app/api/`. There is **no separate Express/Node backend**. The Next.js server itself handles both SSR and REST API.

**Auth utilities (used by all APIs):**
| File | Purpose |
|---|---|
| `lib/auth/jwt.ts` | `generateToken()` / `verifyToken()` using `jsonwebtoken` |
| `lib/auth/hash.ts` | `hashPassword()` / `verifyPassword()` using `bcrypt` |
| `lib/auth/middleware.ts` | `requireAuth()`, `requireRole()`, `requireVerified()` — reads Bearer JWT from headers |

---

### 🗄️ Database Layer
| File | Purpose |
|---|---|
| `lib/db/mongo.ts` | MongoDB connection (`MongoClient` from `mongodb` driver). Caches connection for reuse. DB name: `ehr-platform` |
| `lib/db/models.ts` | TypeScript `interface` definitions for all collections (NOT Mongoose schemas) |

**MongoDB Collections used across the app:**
| Collection | Stores |
|---|---|
| `users` | All users (patients, doctors, labs, admin) |
| `medicalRecords` | Uploaded medical records metadata |
| `accessPermissions` | Patient-granted access to doctors/labs |
| `auditLogs` | Every significant action logged |
| `aiSummaries` | AI-generated summaries of records |
| `followups` | Doctor observation/upload notes per patient |

---

## 3. Does the Code Use Mongoose? — The Definitive Answer

### ✅ Mongoose is **installed** but ❌ **NOT actually used** for any database operations.

**Evidence:**

1. **`package.json`** lists `"mongoose": "^9.1.2"` as a dependency — it is installed.

2. **`lib/db/models.ts`** imports mongoose on line 2:
   ```ts
   import mongoose from "mongoose";
   ```
   ...but **never calls `mongoose.model()`, `mongoose.connect()`, or `mongoose.Schema()`**. The import is dead/unused.

3. **`lib/db/mongo.ts`** uses the **raw `mongodb` driver** (`MongoClient`) — not Mongoose:
   ```ts
   import { MongoClient, type Db } from "mongodb"
   const client = await MongoClient.connect(MONGODB_URI, ...)
   ```

4. **Every single API route** imports `getDatabase()` from `@/lib/db/mongo` and uses `db.collection("name").find(...)` — the raw MongoDB driver pattern.

5. **All schemas in `models.ts` are TypeScript `interface`s**, not Mongoose `Schema` objects. Mongoose's schema validation, middleware (pre/post hooks), virtuals, and ODM methods are never used.

### Why Is Mongoose Listed?
It was likely added during initial setup as a "might need it" dependency, or an earlier version of the code used it. The developer then switched to the raw MongoDB driver for more control. **Mongoose is essentially dead weight in this codebase.**

> **Key Difference for Viva:**
> - **Mongoose** = ODM (Object Document Mapper), adds schema validation, middleware, population, virtuals on top of MongoDB.
> - **Raw `mongodb` driver** = What this project actually uses. Direct `db.collection().find()` calls. TypeScript interfaces provide type-safety, but no runtime schema enforcement.

---

## 4. Every API Endpoint — Working & Frontend Connection

### Auth Group (`/api/auth/`)

#### `POST /api/auth/register`
- **File:** `app/api/auth/register/route.ts`
- **Purpose:** Register a new patient, doctor, or lab with email+password.
- **Logic:** Hashes password with bcrypt → inserts into `users` collection. Patients are auto-verified (`isVerified: true`); doctors/labs need admin approval (`isVerified: false`).
- **Auth Guard:** None (public)
- **Collections:** `users` (insert)
- **Frontend Call:** Registration form on `app/page.tsx` (landing page)

---

#### `POST /api/auth/login`
- **File:** `app/api/auth/login/route.ts`
- **Purpose:** Email+password login for all roles including admin.
- **Logic:** 
  - If email matches `ADMIN_EMAIL` (env var) → checks password directly, returns JWT with role=`admin`.
  - For normal users → queries `users`, verifies bcrypt hash, checks `isBlocked`, generates JWT.
- **Auth Guard:** None (public)
- **Collections:** `users` (read)
- **Frontend Call:** Email login form on `app/page.tsx`

---

#### `POST /api/auth/unified`
- **File:** `app/api/auth/unified/route.ts`
- **Purpose:** Blockchain wallet-based login/auto-registration (Thirdweb In-App Wallet).
- **Logic:** 
  - Receives `blockchainAddress`, `email`, `role`, optional RSA `encryptionPublicKey` + `encryptionPrivateKeyJwk`.
  - Looks up user by wallet address (case-insensitive regex).
  - **Returning user** → logs in, optionally stores/retrieves encrypted RSA private key escrow.
  - **New user** → auto-registers with `isVerified: role === "patient"`, stores RSA key escrow (AES-256-GCM encrypted with server secret), returns `needsProfileCompletion: true`.
- **Auth Guard:** None (public)
- **Collections:** `users` (read + insert/update)
- **Frontend Call:** `components/wallet-login.tsx` after Thirdweb wallet connect

---

#### `GET /api/auth/me`
- **File:** `app/api/auth/me/route.ts`
- **Purpose:** Returns the currently logged-in user's profile.
- **Auth Guard:** `requireAuth` (any valid JWT)
- **Collections:** `users` (read)
- **Frontend Call:** Layout/dashboard components on mount to hydrate user state

---

#### `POST /api/auth/refresh`
- **File:** `app/api/auth/refresh/route.ts`
- **Purpose:** Refreshes the JWT token.
- **Auth Guard:** `requireAuth`

---

### Profile Group (`/api/profile/`)

#### `POST /api/profile/complete`
- **File:** `app/api/profile/complete/route.ts`
- **Purpose:** Saves role-specific profile fields after first wallet login (universal intake).
- **Logic:** Validates + saves fields per role:
  - Patient: `name`, `dateOfBirth`, `bloodType`, `emergencyContact`
  - Doctor: `name`, `specialization`, `licenseNumber`
  - Lab: `name`, `licenseNumber`
- **Auth Guard:** `requireRole(["patient", "doctor", "lab"])`
- **Collections:** `users` (read + update)
- **Frontend Call:** `app/complete-profile/` intake page (redirected to after new wallet registration)

---

### Patient Group (`/api/patient/`)

#### `GET /api/patient/records` + `POST /api/patient/records`
- **File:** `app/api/patient/records/route.ts`
- **Purpose (GET):** Fetch all medical records belonging to the logged-in patient. Returns serialized records sorted newest-first.
- **Purpose (POST):** Patient uploads a new medical record (multipart form). Uploads to **Pinata IPFS** → stores CID + metadata in MongoDB. Accepts `encryptedAESKey` + `aesIV` for client-side encryption.
- **Auth Guard:** `requireRole(["patient"])`
- **Collections:** `medicalRecords` (read / insert)
- **Frontend Call:** Patient dashboard records tab; patient upload form

---

#### `POST /api/patient/records/upload`
- **File:** `app/api/patient/records/upload/route.ts`
- **Purpose:** Alternative upload route (stricter — requires `encryptedAESKey` + `aesIV`).
- **Logic:** Same as above but encryption fields are mandatory.
- **Auth Guard:** `requireRole(["patient"])`
- **Collections:** `medicalRecords` (insert)
- **Frontend Call:** Patient upload component (with E2E encryption flow)

---

#### `GET/DELETE /api/patient/records/[id]`
- **File:** `app/api/patient/records/[id]/route.ts`
- **Purpose:** View or delete a single record by MongoDB ObjectId.
- **Auth Guard:** `requireRole(["patient"])`
- **Collections:** `medicalRecords` (read / delete)

---

#### `POST /api/patient/access/grant`
- **File:** `app/api/patient/access/grant/route.ts`
- **Purpose:** Patient grants a doctor or lab access to their records.
- **Logic:**
  1. Validates the target user is a verified doctor/lab with a `blockchainAddress`.
  2. Creates `accessPermissions` document.
  3. If `doctorKeyMap` provided → updates each record's `doctorKeys` field with the doctor's address → encrypted AES key (so doctor can decrypt the files).
  4. Writes `grant_access` audit log.
- **Auth Guard:** `requireRole(["patient"])`
- **Collections:** `accessPermissions` (insert), `medicalRecords` (update), `auditLogs` (insert), `users` (read)
- **Frontend Call:** Patient "Manage Access" page → "Grant Access" button

---

#### `POST /api/patient/access/revoke`
- **File:** `app/api/patient/access/revoke/route.ts`
- **Purpose:** Patient revokes a previously granted permission.
- **Logic:** Sets `isActive: false`, `revokedAt: Date.now()` on the permission. Writes `revoke_access` audit log. Optionally stores blockchain tx hash.
- **Auth Guard:** `requireRole(["patient"])`
- **Collections:** `accessPermissions` (update), `auditLogs` (insert)
- **Frontend Call:** Patient "Manage Access" page → "Revoke" button

---

#### `GET /api/patient/access/list`
- **File:** `app/api/patient/access/list/route.ts`
- **Purpose:** Returns all access permissions for the logged-in patient, enriched with doctor/lab user details (name, email, role, specialization).
- **Auth Guard:** `requireRole(["patient"])`
- **Collections:** `accessPermissions` (read), `users` (read)
- **Frontend Call:** Patient "Manage Access" page — access list table

---

#### `GET /api/patient/audit-logs`
- **File:** `app/api/patient/audit-logs/route.ts`
- **Purpose:** Returns all audit log entries where `patientId` = current user, enriched with performer and target user names.
- **Auth Guard:** `requireRole(["patient"])`
- **Collections:** `auditLogs` (read), `users` (read)
- **Frontend Call:** Patient "Activity / Audit" tab

---

### Doctor Group (`/api/doctor/`)

#### `GET /api/doctor/patients`
- **File:** `app/api/doctor/patients/route.ts`
- **Purpose:** Returns list of all patients who have granted access to the logged-in doctor (active permissions only), enriched with patient name, email, and RSA public key.
- **Auth Guard:** `requireVerified` + role check `doctor`
- **Collections:** `accessPermissions` (read), `users` (read)
- **Frontend Call:** Doctor dashboard — patient list

---

#### `GET /api/doctor/records/[patientId]`
- **File:** `app/api/doctor/records/[patientId]/route.ts`
- **Purpose:** Returns medical records for a specific patient (doctor must have active `view` or `view-upload` permission).
- **Auth Guard:** `requireVerified` + role check
- **Collections:** `accessPermissions` (read), `medicalRecords` (read)
- **Frontend Call:** Doctor dashboard — clicking a patient to view their records

---

#### `POST /api/doctor/upload`
- **File:** `app/api/doctor/upload/route.ts`
- **Purpose:** Doctor uploads a medical record for a patient (requires `upload` or `view-upload` permission).
- **Logic:**
  1. Checks `accessPermissions` for upload right.
  2. Uploads file to **Pinata IPFS** → gets CID.
  3. Inserts `medicalRecord` with encryption fields.
  4. Writes `upload_record` audit log.
  5. Writes a `followup` document (doctor observation).
- **Auth Guard:** `requireVerified` + role check `doctor`
- **Collections:** `medicalRecords` (insert), `auditLogs` (insert), `followups` (insert), `users` (read), `accessPermissions` (read)
- **Frontend Call:** Doctor dashboard — "Upload Record" form

---

### Lab Group (`/api/lab/`)

#### `GET /api/lab/patients`
- **File:** `app/api/lab/patients/route.ts`
- **Purpose:** Returns patients who granted access to this lab.
- **Auth Guard:** `requireVerified` + role check `lab`
- **Collections:** `accessPermissions` (read), `users` (read)

---

#### `GET /api/lab/records/[patientId]`
- **File:** `app/api/lab/records/[patientId]/route.ts`
- **Purpose:** View a patient's records (lab must have view access).
- **Auth Guard:** `requireVerified` + role check `lab`
- **Collections:** `accessPermissions` (read), `medicalRecords` (read)

---

#### `POST /api/lab/upload`
- **File:** `app/api/lab/upload/route.ts`
- **Purpose:** Lab uploads a test report for a patient.
- **Logic:** Same as doctor upload but with `labName` + `testType` metadata. Also stores lab's own `blockchainAddress → encryptedAESKey` in `doctorKeys` (field reuse for lab key storage).
- **Auth Guard:** `requireVerified` + role check `lab`
- **Collections:** `medicalRecords` (insert), `auditLogs` (insert), `users` (read), `accessPermissions` (read)
- **Frontend Call:** Lab dashboard — "Upload Report" form

---

#### `GET /api/lab/upload-history`
- **File:** `app/api/lab/upload-history/route.ts`
- **Purpose:** Returns all records uploaded by this lab.
- **Auth Guard:** `requireVerified` + role check `lab`
- **Collections:** `medicalRecords` (read)

---

### Admin Group (`/api/admin/`)

#### `GET /api/admin/stats`
- **File:** `app/api/admin/stats/route.ts`
- **Purpose:** Returns platform-wide statistics: user counts by role, pending verifications, blocked users, total records by uploader role, active/revoked permissions, audit log count.
- **Auth Guard:** `requireRole(["admin"])`
- **Collections:** `users`, `medicalRecords`, `accessPermissions`, `auditLogs` (all read)
- **Frontend Call:** Admin dashboard main stats cards

---

#### `GET /api/admin/users`
- **File:** `app/api/admin/users/route.ts`
- **Purpose:** Returns full list of all users (excluding admin themselves).
- **Auth Guard:** `requireRole(["admin"])`
- **Collections:** `users` (read)
- **Frontend Call:** Admin "Users" management table

---

#### `GET /api/admin/pending-verifications`
- **File:** `app/api/admin/pending-verifications/route.ts`
- **Purpose:** Returns doctors and labs with `isVerified: false` and `isBlocked: false` (awaiting approval).
- **Auth Guard:** `requireRole(["admin"])`
- **Collections:** `users` (read)
- **Frontend Call:** Admin "Pending Verifications" panel

---

#### `POST /api/admin/verify-user`
- **File:** `app/api/admin/verify-user/route.ts`
- **Purpose:** Approve or reject a doctor/lab.
  - `action: "approve"` → sets `isVerified: true`
  - `action: "reject"` → sets `isBlocked: true` (rejection = block)
- **Auth Guard:** `requireRole(["admin"])`
- **Collections:** `users` (update)
- **Frontend Call:** Admin "Pending Verifications" → Approve / Reject buttons

---

#### `POST /api/admin/block-user`
- **File:** `app/api/admin/block-user/route.ts`
- **Purpose:** Block or unblock any non-admin user.
- **Auth Guard:** `requireRole(["admin"])`
- **Collections:** `users` (update)
- **Frontend Call:** Admin users table → Block/Unblock action

---

#### `GET /api/admin/audit-logs`
- **File:** `app/api/admin/audit-logs/route.ts`
- **Purpose:** Returns up to 100 (configurable) audit log entries system-wide, enriched with performer, target, and patient user names.
- **Auth Guard:** `requireRole(["admin"])`
- **Collections:** `auditLogs` (read), `users` (read)
- **Frontend Call:** Admin "Audit Logs" page

---

### Users Group (`/api/users/`)

#### `GET /api/users/search`
- **File:** `app/api/users/search/route.ts`
- **Purpose:** Search for verified, non-blocked doctors and/or labs by name/email. Used by patients when granting access.
- **Query Params:** `role=doctor|lab`, `q=<search string>`
- **Auth Guard:** `requireAuth` (any logged-in user)
- **Collections:** `users` (read, password excluded via projection)
- **Frontend Call:** Patient "Grant Access" search box

---

### Records Group (`/api/records/`)

#### `GET /api/records/[id]`
- **File:** `app/api/records/[id]/route.ts`
- **Purpose:** Fetch a single record by ID with access control (patient owns it, or doctor/lab has active view permission).
- **Auth Guard:** `requireAuth`
- **Collections:** `medicalRecords` (read), `accessPermissions` (read)

---

### AI Group (`/api/ai/`)

#### `POST /api/ai/generate-summary`
- **File:** `app/api/ai/generate-summary/route.ts`
- **Purpose:** Generate an AI summary for a medical record using Gemini/LLM. Checks access, caches result in `aiSummaries`.
- **Logic:** Extracts text from file → calls `generateMedicalSummary()` (Gemini AI) → stores `AISummary` doc.
- **Auth Guard:** `requireAuth` (patient owns record, or doctor/lab has view access)
- **Collections:** `medicalRecords` (read), `accessPermissions` (read), `aiSummaries` (read + insert)
- **Frontend Call:** Record detail view → "Generate AI Summary" button

---

#### `GET /api/ai/summary/[recordId]`
- **File:** `app/api/ai/summary/[recordId]/route.ts`
- **Purpose:** Fetch a previously generated AI summary.
- **Auth Guard:** `requireAuth`
- **Collections:** `aiSummaries` (read)

---

### Followup Group (`/api/followup/`)

#### `GET /api/followup` + `POST /api/followup`
- **File:** `app/api/followup/route.ts`
- **Purpose (GET):** 
  - Patient → returns all followup notes for themselves.
  - Doctor → requires `?patientId=...` query, returns that patient's followups.
- **Purpose (POST):** Doctor logs a new followup observation (action: `view`, `upload`, or `observation`).
- **Auth Guard:** `requireAuth` (GET), `requireRole(["doctor"])` (POST)
- **Collections:** `followups` (read / insert), `users` (read for doctor name)
- **Frontend Call:** Patient dashboard "Doctor Followups" section; Doctor dashboard after viewing/uploading a record

---

## 5. Blockchain Layer (Smart Contracts)

Located in `blockchain/contracts/`:

| Contract | Function |
|---|---|
| `EHRRegistry.sol` | `registerFile(category)` — logs file registration on-chain, emits `FileRegistered` event with `fileId` |
| `EHRAccess.sol` | `grantAccess()`, `revokeAccess()`, `checkAccess()`, `grantBatchAccess()` — on-chain permission ledger |

**Frontend integration:** `lib/contracts.ts` exports ABIs + Thirdweb client. Components call blockchain functions **before** hitting the REST API — the transaction hash is then passed to the API as `blockchainTxHash` for audit trail correlation.

---

## 6. External Services

| Service | Used For | Config |
|---|---|---|
| **MongoDB Atlas** | Primary database | `MONGODB_URI` env var |
| **Pinata (IPFS)** | Decentralized file storage | `PINATA_JWT` env var |
| **Thirdweb** | In-App Wallet (blockchain auth) | `NEXT_PUBLIC_THIRDWEB_CLIENT_ID` |
| **Google Gemini** | AI record summaries | `GOOGLE_GENERATIVE_AI_API_KEY` |
| **Hardhat (local)** | Smart contract deployment | Chain ID 31337, `http://127.0.0.1:8545` |

---

## 7. Summary Table

| Layer | Location | Technology |
|---|---|---|
| **Frontend UI** | `new_frontend/app/` (pages) + `new_frontend/components/` | Next.js 16, React 19, TailwindCSS v4, shadcn/ui |
| **Backend API** | `new_frontend/app/api/` (route.ts files) | Next.js Route Handlers (TypeScript) |
| **Database Access** | `new_frontend/lib/db/mongo.ts` | Raw `mongodb` driver (NOT Mongoose) |
| **DB Schemas** | `new_frontend/lib/db/models.ts` | TypeScript interfaces only |
| **Auth** | `new_frontend/lib/auth/` | JWT (`jsonwebtoken`) + bcrypt |
| **File Storage** | `new_frontend/lib/ipfs.ts` | Pinata IPFS via Axios |
| **Blockchain** | `blockchain/contracts/` + `new_frontend/lib/contracts.ts` | Solidity + Hardhat + Thirdweb |
| **AI** | `new_frontend/lib/ai/` + `/api/ai/` | Google Gemini via `@ai-sdk/google` |
| **Mongoose** | `package.json` (installed), `models.ts` (imported) | **NOT USED** — dead dependency |
