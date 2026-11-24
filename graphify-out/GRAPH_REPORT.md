# Graph Report - EagleDemo  (2026-11-24)

## Corpus Check
- 135 files · ~80,503 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 14 file(s) not represented in the graph (top: (none) 6, .woff 2, .example 1)

## Summary
- 905 nodes · 2232 edges · 55 communities (50 shown, 5 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 15 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `1f67e3b4`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- documents/routes.ts
- route
- web/package.json
- db
- next
- vitest
- ref_next_auth
- db.ts
- parcels/routes.ts
- db/package.json
- api
- compilerOptions
- dependencies
- properties/[id]/page.tsx
- ParcelForm.tsx
- devDependencies
- users.test.ts
- alerts.ts
- scripts
- vitest
- documents/[id]/page.tsx
- map/page.tsx
- users/routes.ts
- compilerOptions
- vitest
- login/page.tsx
- checklist.test.ts
- custody.test.ts
- filters.test.ts
- rpt.test.ts
- due-dates/page.tsx
- scripts
- tsconfig.build.json
- @eslint/js
- extends
- seed.ts
- next.config.mjs
- postcss.config.mjs
- currentUser
- settings/page.tsx
- ThemeContext.tsx
- README.md
- google.ts
- auth/routes.ts
- approvals/[id]/page.tsx
- app/layout.tsx
- chain.ts
- redis.ts
- branding.ts
- AppSidebar.tsx
- (app)/layout.tsx
- db.ts
- SettingsPage
- next-auth.d.ts

## God Nodes (most connected - your core abstractions)
1. `api()` - 50 edges
2. `react` - 36 edges
3. `prisma` - 36 edges
4. `createApp()` - 34 edges
5. `route()` - 29 edges
6. `appendAudit()` - 29 edges
7. `next` - 28 edges
8. `currentUser()` - 27 edges
9. `h()` - 26 edges
10. `vitest` - 25 edges

## Surprising Connections (you probably didn't know these)
- `handlePasswordSubmit()` --calls--> `api()`  [EXTRACTED]
  apps/web/src/app/(app)/settings/page.tsx → apps/web/src/lib/api.ts
- `handleSecurityQuestionSubmit()` --calls--> `api()`  [EXTRACTED]
  apps/web/src/app/(app)/settings/page.tsx → apps/web/src/lib/api.ts
- `createApp()` --calls--> `auditAdminRouter()`  [EXTRACTED]
  apps/api/src/app.ts → apps/api/src/audit/admin.ts
- `createApp()` --calls--> `authRouter()`  [EXTRACTED]
  apps/api/src/app.ts → apps/api/src/auth/routes.ts
- `createApp()` --calls--> `checklistRouter()`  [EXTRACTED]
  apps/api/src/app.ts → apps/api/src/documents/checklist.ts

## Import Cycles
- None detected.

## Communities (55 total, 5 thin omitted)

### Community 0 - "documents/routes.ts"
Cohesion: 0.12
Nodes (22): ArchivalSnapshot, AUDIT_ACTION_LABEL, buildDocumentTracking(), Conflict, CUSTODY_LABEL, detectAllowedMedia(), DetectedMedia, DocumentLogItem (+14 more)

### Community 1 - "route"
Cohesion: 0.16
Nodes (25): auditAdminRouter(), checklistRouter(), State, DOCUMENT_TYPES, DocumentType, findType(), REQUIRED_TYPES, todayManila() (+17 more)

### Community 2 - "web/package.json"
Cohesion: 0.06
Nodes (40): dependencies, @fontsource-variable/inter@^5.3.0, maplibre-gl@^4.7.1, next@^14.2.35, next-auth@^4.24.15, react@^18, react-dom@^18, devDependencies (+32 more)

### Community 3 - "db"
Cohesion: 0.05
Nodes (44): build, condition, depends_on, environment, ports, context, dockerfile, condition (+36 more)

### Community 4 - "next"
Cohesion: 0.12
Nodes (24): AuditPage(), Entry, Verify, ApprovalsPage(), DueItem, ManagementDashboardPage(), peso(), FilterStatus (+16 more)

### Community 5 - "vitest"
Cohesion: 0.11
Nodes (12): createApp(), app, c, ids, PDF, app, c, ids (+4 more)

### Community 6 - "ref_next_auth"
Cohesion: 0.21
Nodes (8): handler, HomeRedirect(), SignOutButton(), Home(), API_URL, authOptions, homeFor(), config

### Community 7 - "db.ts"
Cohesion: 0.16
Nodes (11): app, c, app, c, ids, app, TINY_PNG, cookieFor() (+3 more)

### Community 8 - "parcels/routes.ts"
Cohesion: 0.24
Nodes (13): CUSTODY_SENTENCE, historySentence(), loadForDecision(), ParcelInput, ParcelRow, parcelsRouter(), parseParcel(), present() (+5 more)

### Community 9 - "db/package.json"
Cohesion: 0.12
Nodes (20): dependencies, bcryptjs@^2.4.3, @prisma/client@^5.20.0, devDependencies, prisma@^5.20.0, tsx@^4.23.15, @types/bcryptjs@^2.4.6, bcryptjs (+12 more)

### Community 10 - "api"
Cohesion: 0.11
Nodes (19): UsersPage(), handleQueueUserSave(), requestAdminConfirmation(), decide(), DocumentViewer(), download(), onDelete(), fetchFile() (+11 more)

### Community 11 - "compilerOptions"
Cohesion: 0.11
Nodes (17): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+9 more)

### Community 12 - "dependencies"
Cohesion: 0.10
Nodes (25): dependencies, bcryptjs@^2.4.3, express@^4.21.0, @google/genai@2.32.0, ioredis@^5.11.1, multer@^2.5.0, next-auth@^4.24.15, node-cron@4.6.0 (+17 more)

### Community 13 - "properties/[id]/page.tsx"
Cohesion: 0.13
Nodes (13): Checklist, ChecklistCard(), Field(), MediaKindFilter, PropertyPage(), Tab, DocumentHistorySection(), peso() (+5 more)

### Community 14 - "ParcelForm.tsx"
Cohesion: 0.19
Nodes (14): NewPropertyPage(), ParcelForm(), handleAreaInputChange(), handleSelectFiles(), handleToggleAreaUnit(), setField(), ParcelFormValues, ParcelLocationPicker (+6 more)

### Community 15 - "devDependencies"
Cohesion: 0.10
Nodes (21): devDependencies, eslint@^9.12.0, supertest@^7.0.0, tsx@^4.19.0, @types/bcryptjs@^2.4.6, @types/express@^4.17.21, @types/multer@^1.4.13, @types/node@^22.0.0 (+13 more)

### Community 16 - "users.test.ts"
Cohesion: 0.16
Nodes (9): app, enrolled(), verify, encryptSecret(), app, c, enrolled(), ids (+1 more)

### Community 17 - "alerts.ts"
Cohesion: 0.21
Nodes (13): port, addDays(), ALERT_DAYS, AlertMessage, asDate(), CheckResult, mailerFromEnv(), recipientsFromEnv() (+5 more)

### Community 18 - "scripts"
Cohesion: 0.15
Nodes (13): devDependencies, prettier@^3.3.3, name, private, scripts, dev, format, lint (+5 more)

### Community 19 - "vitest"
Cohesion: 0.22
Nodes (7): app, c, ids, names, pdf, testEnv, vitest

### Community 20 - "documents/[id]/page.tsx"
Cohesion: 0.15
Nodes (15): DocViewerTab, Failure, Meta, Version, ACTION_LABEL, Custody, CustodyRecord, HOLDER_LABEL (+7 more)

### Community 21 - "map/page.tsx"
Cohesion: 0.07
Nodes (53): Chevron(), MapPage(), handleExport(), MobileSheetState, MobileTab, Options, ParcelMap, ParcelOption (+45 more)

### Community 22 - "users/routes.ts"
Cohesion: 0.17
Nodes (18): AuditDetails, MAX_USER_PASSWORD, MIN_USER_PASSWORD, validatePasswordPolicy(), COMMON, isCommonPassword(), assertNotLastActiveIt(), audit() (+10 more)

### Community 23 - "compilerOptions"
Cohesion: 0.18
Nodes (10): compilerOptions, esModuleInterop, module, moduleResolution, noEmit, outDir, skipLibCheck, strict (+2 more)

### Community 24 - "vitest"
Cohesion: 0.29
Nodes (4): app, cookies, ids, NEW_PARCEL

### Community 25 - "login/page.tsx"
Cohesion: 0.17
Nodes (9): BYPASS_USERS, LoginPage(), RecoverPasswordPage(), Challenge, VerifyPage(), setAt(), verify(), AuthShell() (+1 more)

### Community 26 - "checklist.test.ts"
Cohesion: 0.25
Nodes (5): app, c, ids, pdf(), upload()

### Community 27 - "custody.test.ts"
Cohesion: 0.29
Nodes (6): app, c, ids, pdf(), toBank, upload()

### Community 28 - "filters.test.ts"
Cohesion: 0.25
Nodes (4): app, c, ids, p

### Community 29 - "rpt.test.ts"
Cohesion: 0.25
Nodes (3): app, c, ids

### Community 30 - "due-dates/page.tsx"
Cohesion: 0.14
Nodes (18): PendingAdminAction, ROLE, RoleFilter, User, DueDatesPage(), DueTab, Item, peso() (+10 more)

### Community 31 - "scripts"
Cohesion: 0.29
Nodes (7): scripts, build, dev, lint, start, test, typecheck

### Community 32 - "tsconfig.build.json"
Cohesion: 0.33
Nodes (5): compilerOptions, noEmit, exclude, extends, ./tsconfig.json

### Community 33 - "@eslint/js"
Cohesion: 0.40
Nodes (4): @eslint/js@^9.12.0, typescript-eslint@^8.8.0, @eslint/js, typescript-eslint

### Community 35 - "extends"
Cohesion: 0.50
Nodes (3): extends, next/core-web-vitals, next/typescript

### Community 36 - "seed.ts"
Cohesion: 0.17
Nodes (7): PARCELS, prisma, TENANT_ASSIGNMENTS, USERS, ACCOUNTS, PARCEL_ENRICHMENT, prisma

### Community 39 - "currentUser"
Cohesion: 0.16
Nodes (21): ACTIONS, custodyRouter(), date(), HOLDERS, Input, iso(), nextStatus(), parse() (+13 more)

### Community 40 - "settings/page.tsx"
Cohesion: 0.23
Nodes (12): DEFAULT_POSITION_LABELS, ROLE_LABELS, SectionId, ThemeContextValue, UserProfile, Role, FONT_SIZES, FontSizeId (+4 more)

### Community 41 - "ThemeContext.tsx"
Cohesion: 0.29
Nodes (12): applyDomAttributes(), avatarKeyFor(), fontKeyFor(), isValidFontSize(), isValidTheme(), lastDarkKeyFor(), lastLightKeyFor(), normalizeImageFileToDataUrl() (+4 more)

### Community 43 - "google.ts"
Cohesion: 0.29
Nodes (4): ISSUERS, TokenInfo, future, good

### Community 44 - "auth/routes.ts"
Cohesion: 0.13
Nodes (34): verifyGoogleIdToken(), auditFailedSignIn(), authRouter(), Challenge, challengeKey(), DUMMY_HASH, handoffKey(), issueChallenge() (+26 more)

### Community 45 - "approvals/[id]/page.tsx"
Cohesion: 0.29
Nodes (8): ApprovalReviewPage(), DocumentsPage(), BackButton(), goBack(), onKeyDown(), ConfirmModal(), isImageFileName(), SecureMediaPreview()

### Community 46 - "app/layout.tsx"
Cohesion: 0.33
Nodes (3): geistMono, geistSans, metadata

### Community 47 - "chain.ts"
Cohesion: 0.16
Nodes (17): appendAudit(), appendIn(), AuditInput, canonicalDetails(), ChainResult, computeEntryHash(), GENESIS_HASH, HashedFields (+9 more)

### Community 48 - "redis.ts"
Cohesion: 0.26
Nodes (6): app, app, app, c, closeRedis(), makeUser()

### Community 50 - "AppSidebar.tsx"
Cohesion: 0.21
Nodes (9): AppSidebar(), ICONS, initialsFrom(), NAV_ITEMS, NavItem, ROLE_FULL_LABEL, ROLE_SHORT_LABEL, shortFirstName() (+1 more)

### Community 51 - "(app)/layout.tsx"
Cohesion: 0.31
Nodes (4): AppLayout(), Providers(), AppShellMain(), CommandPalette()

### Community 52 - "db.ts"
Cohesion: 0.39
Nodes (6): Db, prisma, assertLatLng(), getParcelLocation(), LatLng, setParcelLocation()

### Community 53 - "SettingsPage"
Cohesion: 0.22
Nodes (5): AccordionChevron(), initialsFrom(), SettingsPage(), handlePasswordSubmit(), handleSecurityQuestionSubmit()

### Community 54 - "next-auth.d.ts"
Cohesion: 0.33
Nodes (5): next-auth, next-auth/jwt, JWT, Session, User

## Knowledge Gaps
- **3 isolated node(s):** `./tsconfig.json`, `next/core-web-vitals`, `next/typescript`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 368 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `express` connect `route` to `documents/routes.ts`, `currentUser`, `parcels/routes.ts`, `dependencies`, `auth/routes.ts`, `chain.ts`, `redis.ts`, `users/routes.ts`?**
  _High betweenness centrality (0.065) - this node is a cross-community bridge._
- **What connects `./tsconfig.json`, `next/core-web-vitals`, `next/typescript` to the rest of the system?**
  _3 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `documents/routes.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.12307692307692308 - nodes in this community are weakly interconnected._
- **Why does `react` connect `due-dates/page.tsx` to `web/package.json`, `next`, `settings/page.tsx`, `ThemeContext.tsx`, `api`, `approvals/[id]/page.tsx`, `properties/[id]/page.tsx`, `ParcelForm.tsx`, `AppSidebar.tsx`, `(app)/layout.tsx`, `documents/[id]/page.tsx`, `map/page.tsx`, `login/page.tsx`?**
  _High betweenness centrality (0.064) - this node is a cross-community bridge._
- **Should `web/package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.05813953488372093 - nodes in this community are weakly interconnected._
- **Why does `next` connect `due-dates/page.tsx` to `web/package.json`, `next`, `ref_next_auth`, `approvals/[id]/page.tsx`, `properties/[id]/page.tsx`, `ParcelForm.tsx`, `app/layout.tsx`, `AppSidebar.tsx`, `(app)/layout.tsx`, `documents/[id]/page.tsx`, `map/page.tsx`, `login/page.tsx`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._
- **Should `db` be split into smaller, more focused modules?**
  _Cohesion score 0.047474747474747475 - nodes in this community are weakly interconnected._