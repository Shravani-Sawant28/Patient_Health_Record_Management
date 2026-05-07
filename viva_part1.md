# HealthChain EHR — Viva Preparation Guide (Part 1 of 2)

---

## 1. PROJECT OVERVIEW

### What is the project?
**HealthChain** is a **Decentralized Electronic Health Records (EHR) Management System**. It lets patients securely store medical files, doctors access records with permission, labs upload test results, and admins govern the network — all backed by blockchain and IPFS.

### Problem it solves
Traditional hospital records are siloed. Patients have zero visibility into who accesses their data, and there is no tamper-proof audit trail. HealthChain solves all three.

### Objectives
1. Give patients **sovereign control** over their medical data.
2. Enable **permissioned, auditable** access for doctors and labs.
3. Use **IPFS** for decentralized file storage (no single server failure).
4. Use **Ethereum-compatible smart contracts** for immutable file registration and access control.
5. Provide **AI-generated summaries** of medical records using Google Gemini.

### Non-Technical Explanation
Think of HealthChain like a super-secure digital locker for your medical reports. Only YOU hold the key. When you want a doctor to see your X-ray, you hand them a copy of the key for just that file, and you can take it back any time. Every time anyone opens your locker, it is recorded in a tamper-proof diary.

### Technical Explanation
HealthChain is a **Next.js 16 full-stack application** with:
- **MongoDB** for off-chain metadata and user management.
- **IPFS via Pinata** for decentralized file content storage.
- **Solidity smart contracts** (EHRRegistry, EHRAccess) on a local Hardhat node.
- **Thirdweb SDK** for passwordless Web3 wallet authentication (Email OTP / Google OAuth).
- **RSA-OAEP + AES-256-GCM** end-to-end encryption for file confidentiality.
- **Google Gemini (gemini-1.5-flash)** for AI-powered medical record summarization.
- **JWT** for stateless session management after wallet auth.

### Real-World Application
- Patients carrying records across hospitals without paperwork.
- Emergency rooms accessing a patient's drug history instantly.
- Insurance companies auditing claims without data forgery risk.
- Telemedicine platforms needing verified diagnostic data.

---

## 2. SYSTEM ARCHITECTURE AND WORKFLOW

### Architecture Layers

```
FRONTEND (Next.js 16)
  Landing Page → Role Selection → Dashboards (Patient / Doctor / Lab / Admin)
         |
         | HTTP with JWT Bearer Token
         v
BACKEND (Next.js API Routes)
  /api/auth/unified   /api/patient/*   /api/doctor/*   /api/admin/*   /api/ai/*
         |                    |
         v                    v
  MongoDB Atlas          Pinata IPFS
  users                  Encrypted file blobs (CID returned to DB)
  medicalRecords
  accessPermissions           |
  auditLogs                   v
  aiSummaries          Hardhat Node (Local)
  followups            EHRRegistry.sol + EHRAccess.sol (via Thirdweb SDK)
```

### Complete Flow — File Upload

```
1. Patient selects file + record type in UploadDialog
2. File sent as FormData to POST /api/patient/records
3. Server uploads file to Pinata → receives CID
4. MongoDB record created: { cid, recordType, patientId, encryptedAESKey, aesIV }
5. Frontend calls EHRRegistry.registerFile(recordType) on-chain
6. Smart contract emits FileRegistered(patient, fileId, category)
7. Frontend extracts fileId from event log topics[2]
8. PATCH /api/patient/records/:id saves fileId + txHash to MongoDB
9. Toast: "Stored on IPFS. On-chain File ID: X | TX: 0x..."
```

### Complete Flow — Access Grant

```
1. Patient searches for doctor by name/email
2. Patient selects doctor + access level (view / upload / both)
3. EHRAccess.grantAccess(doctorAddress, fileId, accessType) called on-chain
4. On-chain receipt with txHash obtained
5. POST /api/patient/access/grant saves permission to MongoDB
6. AuditLog entry created
7. Doctor can now see patient in /api/doctor/patients
```

### Authentication Flow

```
User clicks role → WalletLogin component → Thirdweb modal
→ Email OTP or Google OAuth → Thirdweb generates In-App Wallet
→ Wallet address extracted → POST /api/auth/unified
→ Server: new user? → register + needsProfileCompletion: true
→ Server: existing user? → verify isBlocked → generate JWT
→ JWT stored in localStorage → redirect to dashboard
→ RSA keypair generated (first time) → public key saved to DB
→ Private key saved to localStorage + server-side escrow (AES-256-GCM encrypted)
```

---

## 3. FILE-WISE CODE EXPLANATION

---

### `blockchain/contracts/EHRRegistry.sol`
**Purpose:** Immutable on-chain registry of all uploaded files per patient.

**Key Structures:**
- `struct FileMeta { uint256 fileId; string category; uint256 timestamp; }`
- `mapping(address => uint256) fileCounter` — auto-incrementing ID per patient wallet
- `mapping(address => FileMeta[]) patientFiles` — list of all files per patient

**Key Functions:**
- `registerFile(string _category)` — patient wallet calls this; increments fileId, stores FileMeta, emits `FileRegistered` event.
- `getFiles(address _patient)` — read-only; returns full FileMeta array for that patient.

**Viva key point:** The `fileId` is extracted from the emitted event's `topics[2]` (second indexed parameter). This is how the frontend links an on-chain entry to a MongoDB document.

---

### `blockchain/contracts/EHRAccess.sol`
**Purpose:** On-chain access control matrix — who can access which specific file.

**Key Structures:**
- `enum AccessType { NONE=0, VIEW=1, UPLOAD=2, BOTH=3 }`
- `mapping(patient => mapping(doctor => mapping(fileId => AccessType))) permissions`

**Key Functions:**
- `grantAccess(doctor, fileId, access)` — patient calls this; sets the permission cell.
- `revokeAccess(doctor, fileId)` — resets that cell to NONE (does NOT delete — important!).
- `checkAccess(patient, doctor, fileId)` — view function; returns AccessType uint.
- `grantBatchAccess(doctor, fileIds[], access)` — loops and sets access for multiple files in one transaction.

**Events:** `AccessGranted(patient, doctor, fileId, access)` and `AccessRevoked(patient, doctor, fileId)` — all parameters are indexed for efficient log filtering.

---

### `new_frontend/lib/contracts.ts`
**Purpose:** Single source of truth for all blockchain config in the frontend. No cross-folder JSON imports needed — ABIs are hardcoded inline.

**Exports:**
- `thirdwebClient` — created with `NEXT_PUBLIC_THIRDWEB_CLIENT_ID`
- `localChain` — chain ID 31337, RPC `http://127.0.0.1:8545`
- `EHRRegistryABI` and `EHRAccessABI` — full ABI arrays (as const)
- `AccessType` — `{ NONE:0, VIEW:1, UPLOAD:2, BOTH:3 }`
- `toAccessTypeUint("view" | "upload" | "view-upload")` → returns 1, 2, or 3
- `parseDeployedAddress(value)` — validates that env var is a proper `0x` + 40 hex chars

---

### `new_frontend/lib/db/models.ts`
**Purpose:** TypeScript interface definitions (not Mongoose schemas — raw MongoDB driver is used directly).

**Key Interfaces:**

`User`:
- `email`, `password` (hashed), `name`, `role`, `isVerified`, `isBlocked`
- `blockchainAddress` — Thirdweb In-App Wallet address (sparse index)
- `encryptionPublicKey` — RSA public key in base64 SPKI format
- `encryptionPrivateKeyEscrow: { ivB64, tagB64, cipherB64 }` — AES-GCM encrypted RSA private key stored server-side
- `dateOfBirth`, `bloodType`, `emergencyContact` — patient profile fields

`MedicalRecord`:
- `patientId`, `uploadedBy`, `uploaderRole`
- `cid` / `fileCID` — IPFS content identifier
- `recordType`, `fileType`, `fileSize`, `description`
- `fileId` — on-chain ID from EHRRegistry
- `transactionHash` — Quorum/Hardhat tx hash
- `encryptedAESKey`, `aesIV` — encryption metadata
- `doctorKeys: Record<string, string>` — maps doctor wallet address to their RSA-wrapped AES key

`AccessPermission`:
- `patientId`, `grantedTo`, `grantedToRole`, `accessLevel`, `isActive`, `blockchainTxHash`

`AISummary`:
- `recordId`, `patientId`, `summary.diagnosis`, `summary.medications[]`, `summary.testResults[]`, `summary.keyFindings[]`, `modelUsed`

`AuditLog`:
- `action` (grant_access / revoke_access / view_record / upload_record / download_record)
- `performedBy`, `performedByRole`, `timestamp`, `blockchainTxHash`

`Followup`:
- `patientId`, `doctorId`, `doctorName`, `doctorSpecialization`, `action`, `description`, `timestamp`

---

### `new_frontend/lib/db/mongo.ts`
**Purpose:** Singleton MongoDB connection with module-level caching.

**Key pattern:**
```typescript
let cachedClient: MongoClient | null = null
let cachedDb: Db | null = null

export async function connectToDatabase() {
  if (cachedClient && cachedDb) return { client: cachedClient, db: cachedDb }
  const client = await MongoClient.connect(MONGODB_URI, { serverSelectionTimeoutMS: 8000 })
  cachedClient = client
  cachedDb = client.db("ehr-platform")
  return { client, db: cachedDb }
}
```

**Why caching?** Next.js API routes are stateless — without caching, every API call would open a new connection and exhaust MongoDB Atlas connection limits.

---

### `new_frontend/lib/auth/jwt.ts`
**Purpose:** JWT generation and verification for stateless sessions.

- `generateToken(payload)` — signs `{ userId, email, role, isVerified, name }` with HS256, 7-day expiry.
- `verifyToken(token)` — returns decoded JWTPayload or null on failure.
- Separate `generateRefreshToken` / `verifyRefreshToken` using `JWT_SECRET-refresh` secret.

---

### `new_frontend/lib/auth/middleware.ts`
**Purpose:** Route-level auth guards used at the top of every API handler.

- `getAuthUser(req)` — reads `Authorization: Bearer <token>`, verifies JWT.
- `requireAuth(req)` — throws `"Unauthorized"` if no valid token.
- `requireRole(req, allowedRoles[])` — throws `"Forbidden"` if role not in list.
- `requireVerified(req)` — throws if doctor/lab has `isVerified: false`.

**Pattern used across all API routes:**
```typescript
const user = requireRole(req, ["patient"])  // or ["doctor"], ["admin"]
// rest of route handler uses user.userId, user.role, etc.
```

---

### `new_frontend/lib/crypto.ts`
**Purpose:** Client-side only end-to-end encryption. Uses only the native Web Crypto API — zero external dependencies.

**Full Encryption Scheme:**
1. On first login: `generateEncryptionKeyPair()` creates RSA-OAEP-2048 keypair.
2. Public key (SPKI, base64) saved to `User.encryptionPublicKey` in MongoDB.
3. Private key (JWK) saved to localStorage under key `ehr_privkey_{walletAddress}`.
4. When uploading a file: `encryptFile(fileBuffer)` generates a random AES-256-GCM key, encrypts the file, returns `{ encryptedBuffer, aesKeyRaw, ivB64 }`.
5. `wrapAESKey(aesKeyRaw, patientPublicKeyB64)` — RSA-encrypts the AES key → stored as `encryptedAESKey` in MongoDB.
6. When granting access: patient calls `unwrapAESKey(encryptedAESKey, address)` to get raw AES key, then `wrapAESKey(aesKeyRaw, doctorPublicKeyB64)` to re-encrypt for doctor — stored in `doctorKeys[doctorAddress]`.
7. Doctor decryption: reads their entry from `doctorKeys`, unwraps with their private key, decrypts file.

**Key Functions:**
- `generateEncryptionKeyPair()` → `{ publicKeyB64, privateKeyJwk }`
- `savePrivateKey(address, jwk)` → writes to localStorage
- `hasPrivateKey(address)` → boolean check
- `encryptFile(fileBuffer)` → `{ encryptedBuffer, aesKeyRaw, ivB64 }`
- `decryptFile(encryptedBuffer, aesKeyRaw, ivB64)` → `ArrayBuffer`
- `wrapAESKey(aesKeyRaw, recipientPublicKeyB64)` → base64 RSA-ciphertext
- `unwrapAESKey(encryptedAESKeyB64, address)` → raw AES ArrayBuffer

---

### `new_frontend/lib/ipfs.ts`
**Purpose:** Server-side utility for uploading files to IPFS via Pinata API.

**Flow:** `Buffer → Readable stream → FormData → axios POST to api.pinata.cloud/pinning/pinFileToIPFS → returns { cid, size }`

**Dev fallback:** If Pinata returns 401/403 or is unreachable in non-production, returns `{ cid: "mock_cid_{timestamp}", size }` so dev works offline.

**Why stream not buffer?** Pinata on Windows requires a Readable stream in multipart form — plain Buffer attachment fails. This is documented in a code comment.

---

### `new_frontend/app/api/auth/unified/route.ts`
**Purpose:** The core auth endpoint — handles both login AND auto-registration for all wallet users in a single POST.

**Request body:** `{ blockchainAddress, email, role, encryptionPublicKey?, encryptionPrivateKeyJwk?, requestEncryptionPrivateKeyJwk? }`

**Logic:**
1. Validate `blockchainAddress` present and `role` is patient/doctor/lab.
2. Case-insensitive MongoDB lookup: `{ blockchainAddress: /^{address}$/i }`.
3. **Returning user path:** Check `isBlocked` → optionally store/restore RSA private key escrow → generate JWT → return `{ token, user, needsProfileCompletion: false }`.
4. **New user path:** Auto-register. `isVerified = role === "patient"` (patients auto-approve, doctors/labs need admin). Derive display name from email prefix. Store encrypted private key escrow if provided. Return `{ token, user, needsProfileCompletion: true }`.
5. **Server-side escrow:** Private key encrypted using `AES-256-GCM` with key derived from `KEY_ESCROW_SECRET` env var via SHA-256 hash. Stored as `{ ivB64, tagB64, cipherB64 }`.

---

### `new_frontend/components/wallet-login.tsx`
**Purpose:** Client React component that orchestrates the full Thirdweb + backend authentication sequence.

**State:** `authMethod` (email | google), `status` (idle | authenticating | done), `error`.

**`handleSignIn()` steps:**
1. Open Thirdweb connect modal configured with `inAppWallet({ auth: { options: [authMethod] } })`.
2. Extract wallet address (lowercased).
3. POST `/api/auth/unified` with address + role → get JWT + user + `needsProfileCompletion`.
4. Store JWT and user in localStorage.
5. If no local private key exists: try to restore from server escrow. If no escrow (new user): generate RSA keypair, save locally, push public key + encrypted private key to server via another `/api/auth/unified` call.
6. If local key exists: sync it to server escrow.
7. Redirect: `needsProfileCompletion` → `/complete-profile`, else `/${role}`.

**Critical Note:** Email OTP and Google OAuth generate **different wallet addresses** for the same email in Thirdweb's In-App Wallet system. Switching auth methods = different account.

---

### `new_frontend/app/page.tsx`
**Purpose:** Landing page — entry point for all users.

**State:** `showAuth` (boolean), `selectedRole`.

**UI flow:**
1. Default: 4 animated role cards (Patient / Doctor / Lab / Admin) with feature lists.
2. On card click: `setShowAuth(true)`, `setSelectedRole(role)`.
3. Auth card shows role badge + `<WalletLogin role={selectedRole} />` for Patient/Doctor/Lab.
4. Admin role shows traditional email + password form → POST `/api/auth/login`.

---

### `new_frontend/app/patient/page.tsx`
**Purpose:** Full patient dashboard — 5 tabs.

**Data loading:** `loadAllData()` fires 4 parallel `fetch` calls via `Promise.all`:
- `GET /api/patient/records`
- `GET /api/patient/access/list`
- `GET /api/patient/audit-logs`
- `GET /api/users/search`

**Tabs:**
1. **My Records** — file list with Download button.
2. **Permissions** — active access grants with Revoke button.
3. **Audit Logs** — last 15 log entries.
4. **Health Trends** — Recharts `<LineChart>` plotting `sugarLevel` and `weight` from AI summaries over time.
5. **Clinical Follow-ups** — vertical timeline of doctor observations with icons by action type.

**`handleDownload(record)`:**
1. Fetch blob from `https://gateway.pinata.cloud/ipfs/{cid}`.
2. If `record.encryptedAESKey` exists: `unwrapAESKey` → `decryptFile` → get plaintext buffer.
3. Create `Blob` → `URL.createObjectURL` → programmatic `<a>` click → `revokeObjectURL`.

**`handleRevokeAccess(userId)`:** POST `/api/patient/access/revoke` → reloads data.

---

### `new_frontend/app/doctor/page.tsx`
**Purpose:** Doctor dashboard with split-panel layout — sidebar patient list + main workspace.

**Auth guard:** If `parsedUser.isVerified === false` → renders "Account Verification Pending" card. No API calls made.

**Patient list:** `GET /api/doctor/patients` → shows all patients who granted this doctor any access. Each card shows patient name + access level badge.

**Workspace (on patient select):**
- Session observation textarea → `POST /api/followup` with `action: "observation"`.
- "View Medical Records" → opens `<ViewRecordsDialog>` with patient records from `/api/doctor/records/{patientId}`.
- "Upload Report" (only if `accessLevel` includes "upload") → `POST /api/doctor/upload` as multipart FormData.
- "Past Follow-ups" → opens `<FollowupsTimelineDialog>`.

---

### `new_frontend/app/admin/page.tsx`
**Purpose:** Admin control panel — user governance and system monitoring.

**Data loading:** 4 parallel API calls for pending verifications, all users, audit logs (last 50), system stats.

**Stats cards:** Total Users, Pending (doctors + labs), IPFS Files, Active Grants.

**Tabs:**
1. **Verification Queue** — pending doctors/labs with Approve/Reject buttons → POST `/api/admin/verify-user`.
2. **Network Directory** — all users with role badge, verified checkmark, wallet address; Block/Unblock button for non-admin users → POST `/api/admin/block-user`.
3. **System Logs** — all audit log entries with action badge, performer name + role, timestamp.

---

### `new_frontend/components/patient/upload-dialog.tsx`
**Purpose:** Multi-stage upload modal. Button label reflects current stage for UX clarity.

**Stage labels:** `idle` → `"Uploading to IPFS…"` → `"Registering on blockchain…"` → `"Saving record…"`

**`handleSubmit()` sequence:**
1. Guard: `submitInFlightRef.current` prevents double-submit.
2. Build `FormData` with file + recordType + description.
3. POST to `/api/patient/records` → IPFS upload + MongoDB insert.
4. If `EHR_REGISTRY_ADDRESS_DEPLOYED` valid and Thirdweb `account` connected: `getContract` → `prepareContractCall("registerFile", [recordType])` → `sendTransaction` → `waitForReceipt` → parse `fileId` from `receipt.logs[].topics[2]`.
5. PATCH `/api/patient/records/{recordId}` with `{ fileId, transactionHash }`.
6. Toast: success with TX hash prefix, or destructive warning if blockchain skipped.

---

### `new_frontend/components/patient/grant-access-dialog.tsx`
**Purpose:** Modal for granting blockchain-backed access to a specific doctor or lab.

**Props:** `fileId?: number` — scopes the on-chain grant to a specific file (0 = all files convention).

**`handleSubmit()` sequence:**
1. Validate doctor has a wallet address (otherwise blockchain step skipped).
2. `EHRAccess.grantAccess(doctorHex, BigInt(fileId), toAccessTypeUint(accessLevel))` on-chain.
3. Wait for receipt → get `blockchainTxHash`.
4. POST `/api/patient/access/grant` with `{ userId, accessLevel, blockchainTxHash, doctorAddress }`.

---

### `new_frontend/lib/ai/llm-service.ts`
**Purpose:** Google Gemini AI integration for structured medical record summarization.

**Model:** `gemini-1.5-flash` (fast, cost-efficient multimodal model).

**`generateMedicalSummary(fileData, recordType)`:**
1. Builds a prompt asking Gemini to return ONLY JSON matching the `MedicalSummarySchema`.
2. Schema (validated by Zod): `{ diagnosis?, medications[]?, testResults[]?, recommendations[]?, keyFindings[], vitals?: { bloodPressure, sugarLevel, weight } }`.
3. Gemini response → strips markdown fences → `JSON.parse` → Zod validation.
4. If parse fails: returns `{ keyFindings: ["Error parsing document results"] }`.

**`extractTextFromFile(fileName, fileType)`:** Currently a stub — returns a descriptive string. Real OCR/text extraction would replace this.

---

### `new_frontend/lib/view-encrypted-record.ts`
**Purpose:** Shared helpers for fetching + decrypting IPFS files in the browser (used by both patient and doctor dashboards).

**Key functions:**
- `ipfsGatewayUrl(cid)` — returns `https://gateway.pinata.cloud/ipfs/{cid}`.
- `normalizeRecordForDecryption(record)` — handles field name variations (cid vs fileCID, aesIV vs aesIv) and BSON binary format from MongoDB.
- `resolveWalletAddressForCrypto(activeAccount, profileAddress)` — picks the correct wallet address for localStorage key lookup.
- `fetchDecryptAndOpen({ cid, wrappedKeyB64, aesIV, fileType, walletAddressLower, displayFileName })` — full pipeline: unwrap AES key → fetch from IPFS → decrypt → open blob in new tab (or download if popup blocked).

---
