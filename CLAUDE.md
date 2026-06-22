# OrbiPulse Web — CLAUDE.md

## Project Overview
**OrbiPulse IoT Control Platform** — Industrial IoT dashboard for OrbiDrive valve actuators.
Built for E-Actuell Labs Private Limited, Udupi, India.
Future-compatible with AWS + Hostinger hybrid architecture (DOC-CLD-012).

## Tech Stack
- **Framework:** Next.js 16 (App Router, TypeScript)
- **Styling:** Tailwind CSS
- **State:** Zustand (authStore, deviceStore, commandStore, alertStore, simulatorStore)
- **Charts:** Recharts
- **Icons:** Lucide React
- **Queries:** TanStack React Query

## Key Documents (Source of Truth)
Located in `c:\Users\shubh\Desktop\IOT Project\`:
1. `DOC_SW_APP_001_OrbiPulse_Mobile_App_GUI_Scheme_Screen_Flow_RevA1.docx`
2. `Combined_DOC6_OrbiPulse_OrbiDrive_Cloud_Application_AWS_Data_Simulator_Package_RevA1.docx`
3. `SW-SEED-001_OrbiPulse_OrbiDrive_Demo_Seed_Dataset_RevA0.xlsx`
4. `SW-ENUM-001_OrbiPulse_OrbiDrive_Enum_Catalogue_RevA0.xlsx`
5. `SW-DATA-001_OrbiPulse_OrbiDrive_Data_Dictionary_Field_Map_RevA0.xlsx`
6. `AWS-Hostinger Hybrid Cloud Strategy.docx`

## Architecture
```
src/
  app/
    page.tsx                    → Root redirect (/ → /dashboard or /login)
    (auth)/login/               → Sign in (email + password) — no public signup
    (auth)/forgot-password/     → Forgot password (email → code → new password)
    (dashboard)/
      layout.tsx                → Auth guard + sidebar + topbar
      dashboard/page.tsx        → Main dashboard (/dashboard)
      devices/page.tsx          → Device list (/devices)
      devices/[id]/page.tsx     → Device detail + command panel
      alerts/page.tsx           → Alerts & faults
      weather/page.tsx          → Weather advisory
      reports/page.tsx          → Analytics reports
  types/index.ts                → All TypeScript types (DynamoDB-compatible)
  constants/enums.ts            → Enum display maps and messages
  mock-data/seed.ts             → Demo seed data (SW-SEED-001)
  simulator/lteSimulator.ts     → LTE device simulator
  store/
    authStore.ts                → Auth state (fake Cognito-compatible)
    deviceStore.ts              → Device state + latest telemetry
    commandStore.ts             → Command ACK lifecycle
    alertStore.ts               → Events and faults
    simulatorStore.ts           → Connects simulator to React
  components/
    providers/AppProviders.tsx  → QueryClient + store initialization
    layout/Sidebar.tsx          → Navigation sidebar
    layout/Topbar.tsx           → Page header
    ui/StatusBadge.tsx          → Reusable status badges
  utils/
    cn.ts                       → Tailwind class merge
    format.ts                   → Date/unit formatters
```

## Critical Rules
1. **NO FALSE SUCCESS** — only show success after `ack_stage = 'completed'`
2. **Pure LTE** — no WiFi assumptions in simulator
3. **MQTT contract** — frozen; defined in DOC#6.9 / `23_MQTT_Topic_Map` (see MQTT Contract Reference below). Do not invent or republish topic strings outside `src/constants/mqtt.ts`
4. **JSON naming** — snake_case only
5. **Weather advisory** — advisory only, NEVER auto-control irrigation
6. **Role access** — always check role before showing restricted actions
7. **Stale/offline** — always show clearly, never show old data as live
8. **No public signup** — accounts are created or approved only by E-Actuell or a tenant authority (Phase-1: pre-provisioned in `mock-data/seed.ts`; Phase-2: Cognito `AdminCreateUser` via an internal admin tool — never a public route). There is **no role selection at login**, and no "login as Admin/Farmer/Operator" affordance.
9. **Maintainer access is not global** — every permission is scoped by `tenant_id + site_id/zone_id + device_id + role + validity period` via `session.access_grants` (see Authorization Architecture below). No role, including admin roles, receives an unconditional bypass.

## Authentication Architecture
Auth is identity-only, implemented in `src/store/authStore.ts` and `src/services/auth/authService.ts`:
- **Sign In** (`/login`) — email + password, for accounts that already exist
- **Forgot Password** (`/forgot-password`) — email → reset code → new password

There is no sign-up flow. `signUp`/`confirmSignUp`/self-registration, the `signupUsers`/`signupCredentials` client-persisted identity overlay, the `TENANT_UNASSIGNED` sentinel, and the automatic `read_only_auditor` default-role assignment have all been removed — accounts must already exist (in `MOCK_USERS`/Cognito) before a login attempt can succeed.

## Authorization Architecture
Authorization is **not** a flat role. Every permission is a scoped, time-bounded `AccessGrant` (`src/types/index.ts`):
```ts
{ grant_id, user_id, tenant_id, site_id?, zone_id?, device_id?, role, valid_from, valid_until }
```
- A session holds `access_grants: AccessGrant[]` — a user may hold many, across tenants/sites/devices.
- `session.user.role` / `session.user.tenant_id` remain for backward-compatible display only — they are never the authorization source of truth.
- `authStore.hasRole(roles, scope?)` — with no `scope`, behaves exactly as the old flat check (existing call sites unaffected); with a `scope` (`tenant_id`/`site_id`/`zone_id`/`device_id`), checks for an active, currently-valid grant matching that scope.
- `authStore.canAccessDevice(device_id)` — default-deny; resolves the device's tenant/site and checks for a matching active grant. No admin/maintainer role bypasses this.
- Phase-1: grants are seeded in `MOCK_ACCESS_GRANTS` (`mock-data/seed.ts`), mirroring each demo account's existing role/tenant/site. Phase-2: backed by a `UserAccessGrants` DynamoDB table, resolved via AppSync pipeline resolvers — never a Cognito Group or custom attribute (insufficient for multi-row, time-bounded, device-scoped grants).
- `zone_id` is structurally supported on `AccessGrant` but not yet enforceable against any device — no `Site`/`Device` record carries a `zone_id` today. Flagged as an open item, not silently assumed.

**Phase-1 mock accounts** (pre-provisioned test records for exercising role-gated UI in `src/mock-data/seed.ts` — not a login menu; sign in with these credentials the same way as any account):
| Email | Password | Seeded Role |
|-------|----------|------|
| admin@orbipulse.com | Admin@123 | Founder / Admin |
| farmer@orbipulse.com | Farmer@123 | Farmer |
| operator@orbipulse.com | Operator@123 | Municipal Operator |
| installer@orbipulse.com | Install@123 | Installer |
| service@orbipulse.com | Service@123 | Service Technician |

## Dev Commands
```bash
# Add to PATH first:
export PATH="/c/Users/shubh/AppData/Local/OpenAI/Codex/runtimes/cua_node/789504f803e82e2b/bin:$PATH"

npm run dev    # http://localhost:3000
npm run build  # Production build
npm run lint   # Lint check
```

## Future AWS Replacement Map
| Current (Local) | Future (AWS) |
|----------------|--------------|
| authStore (fake) | Cognito User Pool (identity only) + Amplify |
| MOCK_ACCESS_GRANTS | DynamoDB `UserAccessGrants` table |
| mock API/seed | AppSync GraphQL |
| deviceStore | DynamoDB LatestState |
| commandStore | Lambda + AWS IoT Core |
| lteSimulator | AWS IoT Core MQTT |
| localStorage | DynamoDB |
| reports (local) | Hostinger analytics |

**Cognito User Pool configuration (Phase-2):**
- Username attribute: **email** (no separate username field)
- **Self-registration disabled.** Accounts created via `Cognito.AdminCreateUser`, called only from an internal admin tool by E-Actuell staff or a tenant authority (scoped to their own tenant) — never from a public route
- First sign-in: Cognito's standard `FORCE_CHANGE_PASSWORD` challenge after an admin-issued temporary password
- Login: **password-based** (`Cognito.signIn(email, password)`), no role/account-type selector anywhere in the sign-in form
- Account recovery: standard **forgot-password** flow (`Cognito.forgotPassword` → `Cognito.forgotPasswordSubmit`)
- Cognito is identity verification only. Role/tenant/site/device authorization is **never** a Cognito Group or custom attribute — it is resolved from the `UserAccessGrants` DynamoDB table via AppSync pipeline resolvers, keyed by the verified `sub` claim

## Simulator Modes
- `demo_mode` — stable values, rare disconnects (default)
- `dev_mode` — more LTE variation for development
- `fault_mode` — frequent faults + disconnects for testing safety UI
- `test_mode` — deterministic, no failures
- `gateway_mode` — OrbiHub child-device routing
- `replay_mode` — replay saved fixtures

## MQTT Contract Reference
MQTT topics, payload schemas, ACK stages, fault codes, reason codes and event IDs are defined exclusively in the approved contract documents — they are **not** reproduced here:
- `DOC#6.9` (Combined_DOC6, §3.2 MQTT topic map)
- `23_MQTT_Topic_Map`

The single canonical, executable implementation of the topic pattern lives in [`src/constants/mqtt.ts`](src/constants/mqtt.ts) (`buildTopic`, `topics`). All other code (including `src/types/index.ts`) must reuse that implementation rather than building topic strings independently. Any new field, command, ACK stage, event code, reason code or fault code requires owner-approved contract revision — see the source documents above, not this file.

## Authority Allocation (DOC-CLD-012)
The AWS/Hostinger split below is the approved cloud architecture baseline. It governs *cloud-side* responsibilities only — device safety and physical motion remain under firmware/gateway authority per DOC#6.9, independent of this split.

**AWS shall host:**
- Device connectivity — IoT Core, device certificates, device authentication, MQTT broker, MQTT routing
- Device management — identity, registry, command tracking, command acknowledgements, online/offline status
- Mobile/web app services — Cognito authentication, user/role management, AppSync APIs, latest device state
- OTA infrastructure — firmware packages, package validation, download authorization
- Operational database — **latest state only** (battery, position, faults, communication status, last telemetry, last command status)
- AWS shall **not** become the primary analytics engine

**Hostinger shall host:**
- Corporate website and product pages
- Customer portal (future) — reports, downloads, documentation, service records
- Analytics engine — irrigation/municipal analytics, historical trend analysis, battery life calculations, condition monitoring summaries, predictive maintenance
- Reporting engine — PDF/Excel exports, AMC reports, municipal reports, water usage reports
- Historical database — long-term telemetry (battery history, valve movement history, water usage history, alarm history)

Functions frozen to AWS (must never move to Hostinger): MQTT broker, device certificates, device authentication, command routing, command acknowledgement lifecycle, OTA package authorization, user authentication, device ownership validation, active device state.
