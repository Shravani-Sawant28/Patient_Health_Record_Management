# HealthChain EHR — Viva Preparation Guide (Part 2 of 2)

---

## 4. CORE IMPLEMENTATION DETAILS

### Key Features Implemented

| Feature | How it works |
|---|---|
| Passwordless Auth | Thirdweb In-App Wallet (Email OTP / Google OAuth) → wallet address → JWT |
| Decentralized Storage | Files pinned to IPFS via Pinata; CID stored in MongoDB |
| Blockchain Registration | EHRRegistry.registerFile() on Hardhat node; fileId linked to MongoDB record |
| On-chain Access Control | EHRAccess.grantAccess / revokeAccess; AccessType enum (NONE/VIEW/UPLOAD/BOTH) |
| End-to-End Encryption | RSA-OAEP-2048 per user; AES-256-GCM per file; key wrapping for sharing |
| Server-side Key Escrow | RSA private key encrypted AES-256-GCM server-side for cross-device recovery |
| AI Summaries | Google Gemini gemini-1.5-flash extracts structured data from record text |
| Audit Logging | Every action (upload/view/grant/revoke) creates an AuditLog document |
| Clinical Follow-ups | Doctors log observations per patient; patients see timeline |
| Role-Based Dashboards | Patient / Doctor / Lab / Admin — each with distinct API access and UI |
| Admin Verification | Doctors and Labs start unverified; Admin approves/rejects |
| Health Trends Chart | Recharts LineChart plots sugar + weight extracted from AI vitals |

### Data Flow Inside the Application

```
UPLOAD:
Patient browser → FormData → /api/patient/records (server)
  → Pinata IPFS API → CID
  → MongoDB insert medicalRecords
  → return { record._id }
  → Thirdweb SDK → EHRRegistry.registerFile() → Hardhat node
  → FileRegistered event → extract fileId from topics[2]
  → /api/patient/records/:id PATCH → save fileId + txHash

ACCESS GRANT:
Patient browser → /api/users/search → list doctors
  → Thirdweb SDK → EHRAccess.grantAccess() → Hardhat node
  → AccessGranted event
  → /api/patient/access/grant → MongoDB insert accessPermissions
  → MongoDB insert auditLogs

DOCTOR VIEW:
Doctor browser → /api/doctor/patients → returns patients where doctor has isActive permission
  → /api/doctor/records/:patientId → returns medicalRecords for that patient
  → Doctor fetches CID → Pinata gateway
  → Decrypt with doctorKeys[doctorAddress] AES key (if encrypted)
```

### Authentication & State Management
- **No global state library** (no Redux/Zustand). State is local to each dashboard page.
- **JWT** stored in `localStorage["token"]`; user object in `localStorage["user"]`.
- Every API call adds `Authorization: Bearer {token}` header.
- On page load: if localStorage has no token → redirect to `/`.
- **Role guard** on each dashboard: `parsedUser.role !== "patient"` → redirect.

---

## 5. TECHNOLOGY STACK — VIVA FOCUSED

### Next.js 16
- **What:** Full-stack React framework from Vercel. Handles both frontend pages and backend API routes in one codebase.
- **Why used:** App Router with React Server Components, built-in API routes (`/app/api/*`), TypeScript support, and Vercel deployment compatibility.
- **Role here:** Serves the UI pages (patient, doctor, admin dashboards) and all REST API endpoints.
- **Alternatives:** Express.js + separate React app (more boilerplate), Remix, SvelteKit.

### React 19
- **What:** UI library for building component-based interfaces.
- **Why used:** Industry standard; hooks (`useState`, `useEffect`, `useRef`) manage local component state; `"use client"` directive marks client components.
- **Role here:** All dashboard pages, dialogs, and interactive components.

### TypeScript
- **What:** Statically typed superset of JavaScript.
- **Why used:** Type safety on model interfaces (User, MedicalRecord, etc.) catches bugs at compile time, not runtime.
- **Role here:** All `.ts` and `.tsx` files; Zod schemas complement TypeScript at runtime.

### MongoDB (via native driver, not Mongoose)
- **What:** Document-based NoSQL database. Collections store JSON-like BSON documents.
- **Why used:** Flexible schema for evolving medical records; no rigid foreign keys; Atlas free tier works for academic projects.
- **Why native driver not Mongoose:** Mongoose adds overhead and schema rigidity. The native `MongoClient` with TypeScript interfaces gives full control.
- **Role here:** Stores users, medicalRecords, accessPermissions, auditLogs, aiSummaries, followups.
- **Alternatives:** PostgreSQL + Prisma (relational, stricter), Firebase Firestore.

### Thirdweb SDK v5
- **What:** Web3 development toolkit simplifying wallet connections, smart contract interactions.
- **Why used:** Provides "In-App Wallet" — users authenticate with email OTP or Google without needing MetaMask. Thirdweb creates and manages a smart wallet in the background.
- **Role here:** `inAppWallet()` for auth, `getContract()` + `prepareContractCall()` + `sendTransaction()` + `waitForReceipt()` for blockchain calls.
- **Alternatives:** wagmi + viem (more complex, requires user to have MetaMask), ethers.js.

### Solidity (^0.8.28)
- **What:** High-level language for writing Ethereum smart contracts.
- **Why used:** Contracts provide immutable, transparent, censorship-resistant access control and file registry.
- **Role here:** `EHRRegistry.sol` (file registration) and `EHRAccess.sol` (access control matrix).
- **Alternatives:** Vyper (Python-like Solidity alternative).

### Hardhat
- **What:** Ethereum development environment — local blockchain node, testing, deployment.
- **Why used:** Provides local chain (chainId 31337) for development without paying real gas fees. `npx hardhat node` starts the local node.
- **Role here:** Local blockchain that both contracts are deployed to during development.
- **Alternatives:** Foundry (faster tests), Truffle (older).

### IPFS via Pinata
- **What:** InterPlanetary File System — content-addressed decentralized storage. Pinata is a managed IPFS pinning service.
- **Why used:** Files are addressed by content hash (CID), not by server location. If a server goes down, the content is still retrievable from any IPFS node that has it pinned.
- **Role here:** All medical files are uploaded here. CID stored in MongoDB. Files fetched via `gateway.pinata.cloud/ipfs/{cid}`.
- **Alternatives:** Arweave (permanent storage), AWS S3 (centralized), Filecoin.

### Web Crypto API (native browser API)
- **What:** Browser-native cryptography API. No library needed.
- **Why used:** RSA-OAEP and AES-GCM are hardware-accelerated; no npm dependency risk; runs in the browser so the server NEVER sees plaintext files or raw AES keys.
- **Role here:** `lib/crypto.ts` — all encryption/decryption done client-side.
- **Alternatives:** `node:crypto` (server-side only), `crypto-js` (pure JS, slower).

### Google Gemini (gemini-1.5-flash)
- **What:** Google's multimodal AI model accessed via `@google/generative-ai` SDK.
- **Why used:** Fast, cost-efficient, good at structured JSON extraction from medical text.
- **Role here:** `lib/ai/llm-service.ts` — generates structured summaries with diagnosis, medications, vitals, keyFindings.
- **Alternatives:** OpenAI GPT-4, Anthropic Claude.

### JWT (jsonwebtoken library)
- **What:** JSON Web Token — stateless authentication token signed with a secret.
- **Why used:** Stateless — no session store needed. Every request is self-contained. Token carries userId, role, isVerified.
- **Role here:** Generated in `/api/auth/unified`, stored in localStorage, verified in every API route via `lib/auth/middleware.ts`.
- **Token expiry:** 7 days (configurable via `ACCESS_TOKEN_EXPIRES_IN` env var).

### bcrypt
- **What:** Password hashing algorithm with adaptive cost factor.
- **Why used:** Admin still uses email+password. bcrypt's salt prevents rainbow table attacks.
- **Role here:** `lib/auth/hash.ts` — only used for the admin account.

### Zod
- **What:** TypeScript-first schema validation library.
- **Why used:** Validates Gemini's AI output at runtime (AI can return unexpected structures).
- **Role here:** `MedicalSummarySchema` in `llm-service.ts` — ensures the parsed JSON from Gemini has the expected shape.

### Tailwind CSS + Radix UI (shadcn/ui)
- **What:** Tailwind is a utility-first CSS framework. Radix UI provides accessible, unstyled component primitives. shadcn/ui combines both into ready-made components.
- **Role here:** All UI styling and components (Card, Dialog, Button, Select, Toast, Tabs, Badge, etc.).

### Recharts
- **What:** React charting library built on D3.
- **Role here:** `LineChart` on the patient Health Trends tab — plots biometric data extracted from AI summaries over time.

---

## 6. DATABASE / DATA HANDLING

### MongoDB Collections

**`users`**
```
{
  _id: ObjectId,
  email: "patient@example.com",
  password: "",                        // empty for wallet users
  name: "Shravani Sawant",
  role: "patient",                     // patient | doctor | lab | admin
  isVerified: true,                    // false for doctors/labs until admin approves
  isBlocked: false,
  blockchainAddress: "0xabc...123",    // sparse unique index
  encryptionPublicKey: "MIIBIj...",    // base64 SPKI RSA public key
  encryptionPrivateKeyEscrow: {
    ivB64: "...", tagB64: "...", cipherB64: "..."
  },
  dateOfBirth: "1998-05-12",
  bloodType: "O+",
  createdAt: ISODate,
  updatedAt: ISODate
}
```

**`medicalRecords`**
```
{
  _id: ObjectId,
  patientId: ObjectId,
  uploadedBy: ObjectId,
  uploaderRole: "patient",             // patient | doctor | lab
  fileName: "blood_test.pdf",
  fileType: "application/pdf",
  fileSize: 204800,
  cid: "QmXyz...",                     // IPFS CID
  recordType: "Lab Report",
  description: "Annual blood panel",
  encryptedAESKey: "base64...",        // AES key encrypted with patient RSA public key
  aesIV: "base64...",                  // 12-byte IV for AES-GCM
  doctorKeys: {
    "0xdoc...": "base64..."            // AES key re-encrypted for each authorized doctor
  },
  fileId: 3,                           // on-chain fileId from EHRRegistry
  transactionHash: "0x...",            // Quorum/Hardhat tx hash
  createdAt: ISODate
}
```

**`accessPermissions`**
```
{
  _id: ObjectId,
  patientId: "string(ObjectId)",
  grantedTo: "string(ObjectId)",       // doctor or lab userId
  grantedToRole: "doctor",
  accessLevel: "view-upload",          // view | upload | view-upload
  isActive: true,
  grantedAt: ISODate,
  revokedAt: null,
  blockchainTxHash: "0x..."
}
```

**`auditLogs`**
```
{
  _id: ObjectId,
  action: "grant_access",              // grant_access | revoke_access | view_record | upload_record
  performedBy: "string(ObjectId)",
  performedByRole: "patient",
  targetUserId: "string(ObjectId)",
  recordId: "string(ObjectId)",
  patientId: "string(ObjectId)",
  timestamp: ISODate,
  blockchainTxHash: "0x...",
  metadata: {}
}
```

**`aiSummaries`**
```
{
  _id: "summary_{timestamp}_{random}",
  recordId: "string(ObjectId)",
  patientId: "string(ObjectId)",
  summary: {
    diagnosis: "Type 2 Diabetes",
    medications: ["Metformin 500mg"],
    testResults: [{ test: "HbA1c", value: "7.2", unit: "%", normalRange: "<5.7" }],
    recommendations: ["Low-carb diet"],
    keyFindings: ["Elevated blood glucose"],
    vitals: { bloodPressure: "130/85", sugarLevel: 180, weight: 72 }
  },
  generatedAt: ISODate,
  modelUsed: "gpt-4-medical-demo"
}
```

**`followups`**
```
{
  _id: ObjectId,
  patientId: ObjectId,
  doctorId: ObjectId,
  doctorName: "Dr. Sharma",
  doctorSpecialization: "Cardiology",
  action: "observation",               // view | upload | observation
  recordId: "string (optional)",
  description: "Patient's BP normalized after medication adjustment.",
  timestamp: ISODate
}
```

### CRUD Operations Summary

| Operation | Endpoint | Collection |
|---|---|---|
| Create user | POST /api/auth/unified | users |
| Read patient records | GET /api/patient/records | medicalRecords |
| Create record | POST /api/patient/records | medicalRecords |
| Update record (add fileId) | PATCH /api/patient/records/:id | medicalRecords |
| Grant access | POST /api/patient/access/grant | accessPermissions + auditLogs |
| Revoke access | POST /api/patient/access/revoke | accessPermissions (update isActive) + auditLogs |
| Verify user | POST /api/admin/verify-user | users (update isVerified) |
| Block user | POST /api/admin/block-user | users (update isBlocked) |
| Create AI summary | POST /api/ai/generate-summary | aiSummaries |
| Create followup | POST /api/followup | followups |

---

## 7. CRITICAL CODE SNIPPETS — LINE BY LINE

### Snippet 1: Smart Contract — registerFile (EHRRegistry.sol)
```solidity
function registerFile(string memory _category) external {
    // ++fileCounter[msg.sender]: pre-increment, so first file = 1 (not 0)
    // msg.sender = the patient's wallet address (guaranteed by Thirdweb)
    uint256 newFileId = ++fileCounter[msg.sender];

    // Push a FileMeta struct into this patient's array
    patientFiles[msg.sender].push(
        FileMeta(newFileId, _category, block.timestamp)
    );

    // Emit indexed event — fileId is indexed so frontend can filter by it
    emit FileRegistered(msg.sender, newFileId, _category);
}
```
**Key point:** `++fileCounter` (pre-increment) means IDs start at 1. `block.timestamp` is set by the miner — in Hardhat it's the current Unix time.

---

### Snippet 2: Extracting fileId from Event Log (upload-dialog.tsx)
```typescript
// After waitForReceipt, confirmed.logs contains all events emitted
for (const log of confirmed.logs ?? []) {
    const topic2 = log.topics?.[2]  // topics[0]=event sig, [1]=patient address, [2]=fileId
    if (
        log.address?.toLowerCase() === regLower &&  // from EHRRegistry contract
        topic2 !== undefined &&
        topic2 !== null
    ) {
        // topic2 is a 32-byte hex string e.g. "0x0000...0003"
        // BigInt converts hex → bigint, Number converts bigint → JS number
        fileId = Number(BigInt(topic2))
        break
    }
}
```
**Key point:** Event topics are 32-byte hex. `BigInt(hexString)` converts safely; `Number()` extracts the integer. We check `log.address` to ensure it's the correct contract's event.

---

### Snippet 3: Server-side Key Escrow Encryption (unified/route.ts)
```typescript
function encryptEscrowString(plaintext: string): User["encryptionPrivateKeyEscrow"] {
    const iv = crypto.randomBytes(12)          // 96-bit IV (recommended for AES-GCM)
    const key = deriveEscrowKey()              // SHA-256(KEY_ESCROW_SECRET) → 32 bytes
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv)
    const cipherText = Buffer.concat([
        cipher.update(plaintext, "utf8"),      // encrypt the JWK JSON string
        cipher.final()
    ])
    const tag = cipher.getAuthTag()            // 16-byte authentication tag (GCM integrity)
    return {
        ivB64: iv.toString("base64"),          // store IV (not secret, just unique)
        tagB64: tag.toString("base64"),        // store auth tag for integrity check
        cipherB64: cipherText.toString("base64")
    }
}
```
**Why AES-GCM?** It's authenticated encryption — provides both confidentiality AND integrity. The `authTag` ensures the ciphertext was not tampered with.

---

### Snippet 4: Client-side File Encryption (crypto.ts)
```typescript
export async function encryptFile(fileBuffer: ArrayBuffer): Promise<{
    encryptedBuffer: ArrayBuffer
    aesKeyRaw: ArrayBuffer
    ivB64: string
}> {
    // Generate a fresh random 256-bit AES key for each file
    const aesKey = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]
    )
    // 96-bit random IV — never reuse IV with the same key
    const iv = crypto.getRandomValues(new Uint8Array(12))

    // Encrypt the file — returns ciphertext with GCM auth tag appended
    const encryptedBuffer = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv }, aesKey, fileBuffer
    )
    // Export the raw key bytes so we can RSA-wrap them
    const aesKeyRaw = await crypto.subtle.exportKey("raw", aesKey)

    return {
        encryptedBuffer,
        aesKeyRaw,
        ivB64: btoa(String.fromCharCode(...iv))  // base64-encode IV for storage
    }
}
```

---

### Snippet 5: MongoDB Connection Singleton (mongo.ts)
```typescript
// Module-level variables persist across requests in the same Node.js process
let cachedClient: MongoClient | null = null
let cachedDb: Db | null = null

export async function connectToDatabase() {
    // If already connected, reuse — no new connection
    if (cachedClient && cachedDb) {
        return { client: cachedClient, db: cachedDb }
    }
    // serverSelectionTimeoutMS: fail fast if Atlas is unreachable
    const client = await MongoClient.connect(MONGODB_URI, {
        serverSelectionTimeoutMS: 8000,
    })
    const db = client.db("ehr-platform")
    cachedClient = client
    cachedDb = db
    return { client, db }
}
```

---

### Snippet 6: Role-based Access Check in AI Summary Route
```typescript
// Check if user has access to this record
if (user.role === "patient" && record.patientId.toString() !== user.userId) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 })
}

if (user.role === "doctor" || user.role === "lab") {
    const hasAccess = await permissionsCollection.findOne({
        patientId: record.patientId.toString(),
        grantedTo: user.userId,
        isActive: true,
        accessLevel: { $in: ["view", "view-upload"] },  // must have VIEW permission
    })
    if (!hasAccess) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }
}
```
**Key point:** MongoDB `$in` operator checks if `accessLevel` matches any of the provided values. "upload" alone does NOT grant view access.

---

## 9. RESULTS & OUTPUT

### What the system produces
1. **Patient uploads** a PDF lab report → stored on IPFS → registered on blockchain with fileId → visible in dashboard.
2. **Patient grants access** to a doctor → on-chain transaction recorded → doctor sees patient in their list.
3. **Doctor views records** → sees list of files with types/dates → can open/download.
4. **AI summary** generated → structured JSON with diagnosis, medications, vitals extracted and displayed.
5. **Audit log** shows all events with timestamps — immutable record of who did what.
6. **Admin** sees pending doctors → clicks Approve → doctor's `isVerified` becomes `true`.

### Viva Demo Flow (Step by Step)
```
1. Open http://localhost:3000 — landing page with 4 role cards
2. Click Admin → email/password login → Admin dashboard
3. Show Pending Verifications tab (if any doctors pending)
4. Click Patient card → Email OTP via Thirdweb → Patient dashboard
5. Click "Upload Record" → select a PDF → choose "Lab Report" → click Upload
   - Show the stage labels changing: "Uploading to IPFS…" → "Registering on blockchain…"
   - Show success toast with "On-chain File ID: 1 | TX: 0x..."
6. Click "Grant Access" → search for a doctor → select → grant "view-upload"
   - Show blockchain toast with TX hash
7. Logout → Login as Doctor → see patient in sidebar
8. Click patient → click "View Medical Records" → show the uploaded PDF
9. Click "Log Clinical Observation" → type a note → save
10. Go back to Patient dashboard → Clinical Follow-ups tab → show the timeline
11. Go to Audit Logs tab → show all recorded events
12. Go to Permissions tab → click Revoke → doctor loses access
```

### Performance Notes
- IPFS uploads to Pinata: ~2-5 seconds for files under 5MB.
- Blockchain transactions on Hardhat local node: ~500ms per transaction.
- MongoDB queries: <50ms with proper indexing.
- Gemini AI summary generation: ~3-8 seconds depending on document length.
- All dashboard data loaded in parallel (`Promise.all`) — reduces initial load time.

---

## 10. FUTURE SCOPE & IMPROVEMENTS

### Security Improvements
- **Rate limiting** on API routes (prevent brute-force attacks).
- **HTTPS enforcement** in production (currently HTTP local).
- **CORS configuration** — restrict origins.
- **File type validation** server-side (currently trusts Content-Type header).
- **Private IPFS gateway** instead of public Pinata gateway (prevents unauthorized CID access).

### Scalability Improvements
- **Deploy contracts to Polygon or Arbitrum** instead of local Hardhat — real decentralization.
- **MongoDB Atlas sharding** for large-scale deployments.
- **Redis caching** for frequently-accessed records lists.
- **Event-driven architecture** — use webhooks or message queues for audit log writes instead of synchronous inserts.

### Feature Enhancements
- **Real OCR** in `extractTextFromFile()` — use Tesseract.js or a cloud Vision API so AI summaries work on actual scanned documents.
- **Email/SMS notifications** when access is granted or revoked.
- **Appointment scheduling** — doctor books slots tied to patient records.
- **Mobile app** — React Native frontend with same API.
- **DICOM support** for imaging files (MRI, CT scans).
- **Multi-language support** for non-English medical records.
- **Batch revoke access** — patient revokes all access in one click.
- **Record expiry** — access grants auto-expire after N days.

### Blockchain Improvements
- **Upgrade to Quorum** (enterprise Ethereum with privacy transactions) for healthcare compliance.
- **Zero-Knowledge Proofs** — prove a doctor has access without revealing which patient.
- **DAO governance** for admin verification instead of single admin.

---

## 11. ASSUMPTIONS & UNCLEAR POINTS

### Assumptions Made
1. **Encryption is optional** — the current upload flow skips RSA/AES encryption and uploads plaintext files to IPFS. The encryption infrastructure in `crypto.ts` is built but `encryptFile()` is not called in the upload dialog. Files are protected by IPFS CID obscurity, not cryptographic encryption at upload time.

2. **Single admin** — only one admin account exists (email+password). There is no admin registration flow — admin must be seeded directly into the database.

3. **Local Hardhat node** — blockchain features only work when `npx hardhat node` is running locally. Without it, the system gracefully degrades to off-chain only (IPFS + MongoDB still work).

4. **Pinata free tier** — IPFS pinning uses Pinata's free tier. Files may be unpinned after inactivity in production.

5. **Thirdweb In-App Wallet** — wallets are managed by Thirdweb's infrastructure, not by users themselves. This is a trade-off: better UX but some custody over wallet creation.

6. **fileId scoping** — in `GrantAccessDialog`, `fileId = 0` by default when called without a specific record. The on-chain `grantAccess(doctor, 0, access)` grants access to fileId 0 which is a convention for "all files" — but this is not enforced anywhere on-chain or off-chain explicitly.

7. **AI summaries** — `extractTextFromFile()` is a stub returning a placeholder string. The Gemini prompt is technically analyzing a description string, not actual file content. Real implementation would require OCR integration.

### Known Limitations
- Private key stored in `localStorage` is vulnerable to XSS attacks. A production system should use a hardware security module (HSM) or secure enclave.
- The `needsProfileCompletion` redirect goes to `/complete-profile` but this page's content depends on the `complete-profile` directory implementation.
- Audit logs are append-only in code convention but MongoDB itself does not enforce this — an admin with DB access could delete logs.

---

*End of HealthChain EHR Viva Preparation Guide*
*Generated from full codebase analysis — May 2026*
