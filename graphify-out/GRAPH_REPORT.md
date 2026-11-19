# Graph Report - EagleDemo  (2026-11-19)

## Corpus Check
- 119 files · ~53,048 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 13 file(s) not represented in the graph (top: (none) 6, .woff 2, .example 1)

## Summary
- 757 nodes · 1740 edges · 45 communities (39 shown, 6 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 6 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `34d98b83`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- ConfirmModal
- rbac/route.ts
- web/package.json
- db
- properties/page.tsx
- vitest
- (app)/layout.tsx
- db.ts
- parcels/routes.ts
- db/package.json
- react
- compilerOptions
- dependencies
- api
- ParcelForm.tsx
- devDependencies
- users.test.ts
- alerts.ts
- scripts
- makeUser
- documents/[id]/page.tsx
- map/page.tsx
- compilerOptions
- vitest
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
- README.md
- createApp
- auth/routes.ts
- replace-delete.test.ts
- app/layout.tsx
- redis.ts
- branding.ts

## God Nodes (most connected - your core abstractions)
1. `api()` - 39 edges
2. `prisma` - 35 edges
3. `createApp()` - 32 edges
4. `appendAudit()` - 27 edges
5. `route()` - 27 edges
6. `react` - 27 edges
7. `currentUser()` - 24 edges
8. `h()` - 24 edges
9. `vitest` - 24 edges
10. `next` - 22 edges

## Surprising Connections (you probably didn't know these)
- `submitCode()` --calls--> `api()`  [EXTRACTED]
  apps/web/src/app/(app)/admin/users/page.tsx → apps/web/src/lib/api.ts
- `decide()` --calls--> `api()`  [EXTRACTED]
  apps/web/src/app/(app)/approvals/[id]/page.tsx → apps/web/src/lib/api.ts
- `onDelete()` --calls--> `api()`  [EXTRACTED]
  apps/web/src/app/(app)/documents/[id]/page.tsx → apps/web/src/lib/api.ts
- `runNow()` --calls--> `api()`  [EXTRACTED]
  apps/web/src/app/(app)/due-dates/page.tsx → apps/web/src/lib/api.ts
- `onSubmit()` --calls--> `api()`  [EXTRACTED]
  apps/web/src/components/CustodyPanel.tsx → apps/web/src/lib/api.ts

## Import Cycles
- None detected.

## Communities (45 total, 6 thin omitted)

### Community 0 - "ConfirmModal"
Cohesion: 0.21
Nodes (8): ROLE, RoleFilter, User, UsersPage(), submitCode(), ApprovalReviewPage(), decide(), ConfirmModal()

### Community 1 - "rbac/route.ts"
Cohesion: 0.05
Nodes (92): auditAdminRouter(), appendAudit(), appendIn(), AuditDetails, AuditInput, canonicalDetails(), ChainResult, computeEntryHash() (+84 more)

### Community 2 - "web/package.json"
Cohesion: 0.06
Nodes (40): dependencies, @fontsource-variable/inter@^5.3.0, maplibre-gl@^4.7.1, next@^14.2.35, next-auth@^4.24.15, react@^18, react-dom@^18, devDependencies (+32 more)

### Community 3 - "db"
Cohesion: 0.05
Nodes (39): build, depends_on, environment, ports, context, dockerfile, condition, environment (+31 more)

### Community 4 - "properties/page.tsx"
Cohesion: 0.22
Nodes (11): FilterStatus, PropertiesPage(), ViewMode, ACTION_LABEL, StatusPill(), DocumentSummary, HistoryEntry, Parcel (+3 more)

### Community 5 - "vitest"
Cohesion: 0.18
Nodes (6): app, c, ids, PDF, app, PDF

### Community 6 - "(app)/layout.tsx"
Cohesion: 0.08
Nodes (22): handler, HomeRedirect(), AppLayout(), Providers(), SignOutButton(), AppSidebar(), ICONS, NAV_ITEMS (+14 more)

### Community 7 - "db.ts"
Cohesion: 0.27
Nodes (8): app, c, app, verify, prisma, hash, lastAudit(), TEST_PASSWORD

### Community 8 - "parcels/routes.ts"
Cohesion: 0.17
Nodes (18): Db, assertLatLng(), getParcelLocation(), LatLng, setParcelLocation(), CUSTODY_SENTENCE, historySentence(), loadForDecision() (+10 more)

### Community 9 - "db/package.json"
Cohesion: 0.12
Nodes (20): dependencies, bcryptjs@^2.4.3, @prisma/client@^5.20.0, devDependencies, prisma@^5.20.0, tsx@^4.23.15, @types/bcryptjs@^2.4.6, bcryptjs (+12 more)

### Community 10 - "react"
Cohesion: 0.15
Nodes (12): GoogleHandoff(), GoogleHandoffPage(), BYPASS_USERS, LoginPage(), Challenge, VerifyPage(), setAt(), verify() (+4 more)

### Community 11 - "compilerOptions"
Cohesion: 0.11
Nodes (17): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+9 more)

### Community 12 - "dependencies"
Cohesion: 0.10
Nodes (26): dependencies, bcryptjs@^2.4.3, express@^4.21.0, @google/genai@2.32.0, ioredis@^5.11.1, multer@^2.5.0, next-auth@^4.24.15, node-cron@4.6.0 (+18 more)

### Community 13 - "api"
Cohesion: 0.11
Nodes (25): Doc, Checklist, ChecklistCard(), Field(), PropertyPage(), Tab, ACTION_LABEL, Custody (+17 more)

### Community 14 - "ParcelForm.tsx"
Cohesion: 0.33
Nodes (7): NewPropertyPage(), ParcelForm(), ParcelFormValues, ParcelLocationPicker, toBody(), validateParcelForm(), valuesFrom()

### Community 15 - "devDependencies"
Cohesion: 0.10
Nodes (21): devDependencies, eslint@^9.12.0, supertest@^7.0.0, tsx@^4.19.0, @types/bcryptjs@^2.4.6, @types/express@^4.17.21, @types/multer@^1.4.13, @types/node@^22.0.0 (+13 more)

### Community 16 - "users.test.ts"
Cohesion: 0.29
Nodes (3): app, c, ids

### Community 17 - "alerts.ts"
Cohesion: 0.22
Nodes (12): port, ALERT_DAYS, AlertMessage, asDate(), CheckResult, mailerFromEnv(), recipientsFromEnv(), runConfiguredCheck() (+4 more)

### Community 18 - "scripts"
Cohesion: 0.15
Nodes (13): devDependencies, prettier@^3.3.3, name, private, scripts, dev, format, lint (+5 more)

### Community 19 - "makeUser"
Cohesion: 0.29
Nodes (6): app, c, ids, names, pdf, makeUser()

### Community 20 - "documents/[id]/page.tsx"
Cohesion: 0.21
Nodes (9): DocumentViewer(), download(), onDelete(), Failure, fetchFile(), Meta, Version, CustodyPanel() (+1 more)

### Community 21 - "map/page.tsx"
Cohesion: 0.09
Nodes (35): Chevron(), MapPage(), Options, ParcelMap, ParcelOption, StatusFilter, OFFLINE_STYLE, ParcelLocationPicker() (+27 more)

### Community 23 - "compilerOptions"
Cohesion: 0.18
Nodes (10): compilerOptions, esModuleInterop, module, moduleResolution, noEmit, outDir, skipLibCheck, strict (+2 more)

### Community 24 - "vitest"
Cohesion: 0.29
Nodes (4): app, cookies, ids, NEW_PARCEL

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
Cohesion: 0.20
Nodes (12): AuditPage(), Entry, Verify, ApprovalsPage(), DueDatesPage(), runNow(), Item, PaginatedDueList() (+4 more)

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

### Community 43 - "createApp"
Cohesion: 0.19
Nodes (8): createApp(), app, app, c, ids, testEnv, supertest, vitest

### Community 44 - "auth/routes.ts"
Cohesion: 0.11
Nodes (33): ISSUERS, enrolled(), TokenInfo, future, good, verifyGoogleIdToken(), auditFailedSignIn(), authRouter() (+25 more)

### Community 45 - "replace-delete.test.ts"
Cohesion: 0.29
Nodes (3): app, c, ids

### Community 46 - "app/layout.tsx"
Cohesion: 0.33
Nodes (3): geistMono, geistSans, metadata

### Community 47 - "redis.ts"
Cohesion: 0.29
Nodes (5): app, app, c, closeRedis(), cookieFor()

## Knowledge Gaps
- **3 isolated node(s):** `./tsconfig.json`, `next/core-web-vitals`, `next/typescript`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 308 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `express` connect `rbac/route.ts` to `parcels/routes.ts`, `dependencies`, `auth/routes.ts`, `redis.ts`?**
  _High betweenness centrality (0.070) - this node is a cross-community bridge._
- **What connects `./tsconfig.json`, `next/core-web-vitals`, `next/typescript` to the rest of the system?**
  _3 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `rbac/route.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0545361875637105 - nodes in this community are weakly interconnected._
- **Why does `next` connect `react` to `ConfirmModal`, `web/package.json`, `properties/page.tsx`, `(app)/layout.tsx`, `api`, `ParcelForm.tsx`, `app/layout.tsx`, `documents/[id]/page.tsx`, `map/page.tsx`, `due-dates/page.tsx`?**
  _High betweenness centrality (0.069) - this node is a cross-community bridge._
- **Should `web/package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.05813953488372093 - nodes in this community are weakly interconnected._
- **Why does `react` connect `react` to `ConfirmModal`, `web/package.json`, `properties/page.tsx`, `(app)/layout.tsx`, `api`, `ParcelForm.tsx`, `documents/[id]/page.tsx`, `map/page.tsx`, `due-dates/page.tsx`?**
  _High betweenness centrality (0.062) - this node is a cross-community bridge._
- **Should `db` be split into smaller, more focused modules?**
  _Cohesion score 0.05384615384615385 - nodes in this community are weakly interconnected._