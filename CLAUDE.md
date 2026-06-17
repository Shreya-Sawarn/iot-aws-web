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
    (auth)/login/               → Sign in (email + password)
    (auth)/signup/              → Sign up (email + password + email verification)
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
8. **Authentication is identity-only** — standard email + password (Sign In / Sign Up / Forgot Password), matching modern SaaS and AWS Cognito (email as username, email verification, password login, forgot-password flow). There is **no role selection at login or signup**, and no "login as Admin/Farmer/Operator" affordance. Role, tenant ownership and permissions are assigned at the application level *after* authentication and must never be added back into the auth flow (see Authentication Architecture below).

## Authentication Architecture
Auth is a single, role-agnostic identity flow, implemented in `src/store/authStore.ts` and `src/services/auth/authService.ts`:
- **Sign In** (`/login`) — email + password
- **Sign Up** (`/signup`) — email + password → email verification code → active account
- **Forgot Password** (`/forgot-password`) — email → reset code → new password

New accounts are created with a least-privilege default role (`read_only_auditor`) and an unassigned tenant (`TENANT_UNASSIGNED`). A tenant admin / invite flow upgrades role and tenant assignment afterward — this is an application-level step, not part of authentication.

**Phase-1 mock accounts** (seeded test records for exercising role-gated UI in `src/mock-data/seed.ts` — not a login menu; sign in with these credentials the same way as any account):
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
| authStore (fake) | Cognito User Pool + Amplify |
| mock API/seed | AppSync GraphQL |
| deviceStore | DynamoDB LatestState |
| commandStore | Lambda + AWS IoT Core |
| lteSimulator | AWS IoT Core MQTT |
| localStorage | DynamoDB |
| reports (local) | Hostinger analytics |

**Cognito User Pool configuration (Phase-2):**
- Username attribute: **email** (no separate username field)
- Email verification: **required** before first sign-in (`account_status: 'pending'` → `'active'`)
- Login: **password-based** (`Cognito.signIn(email, password)`), no role/account-type selector in the Hosted UI or app sign-in form
- Account recovery: standard **forgot-password** flow (`Cognito.forgotPassword` → `Cognito.forgotPasswordSubmit`)
- Role, tenant ownership and any user classification are **not** Cognito sign-up attributes chosen by the user — they are set post-confirmation via a backend/admin process (e.g. a `custom:role` / `custom:tenant_id` attribute written by an invite or provisioning Lambda), and read by the app from the session/JWT claims, never from the auth form itself

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
