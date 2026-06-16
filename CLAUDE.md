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
    (auth)/login/               → Login page
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
3. **MQTT contract** — topics: `orbipulse/v1/{tenant_id}/{site_id}/{device_id}/{msg_type}`
4. **JSON naming** — snake_case only
5. **Weather advisory** — advisory only, NEVER auto-control irrigation
6. **Role access** — always check role before showing restricted actions
7. **Stale/offline** — always show clearly, never show old data as live

## Demo Accounts
| Email | Password | Role |
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
| authStore (fake) | Cognito + Amplify |
| mock API/seed | AppSync GraphQL |
| deviceStore | DynamoDB LatestState |
| commandStore | Lambda + AWS IoT Core |
| lteSimulator | AWS IoT Core MQTT |
| localStorage | DynamoDB |
| reports (local) | Hostinger analytics |

## Simulator Modes
- `demo_mode` — stable values, rare disconnects (default)
- `dev_mode` — more LTE variation for development
- `fault_mode` — frequent faults + disconnects for testing safety UI
- `test_mode` — deterministic, no failures
- `gateway_mode` — OrbiHub child-device routing
- `replay_mode` — replay saved fixtures

## MQTT Topic Map (DOC#6.9)
```
orbipulse/v1/{tenant_id}/{site_id}/{device_id}/telemetry
orbipulse/v1/{tenant_id}/{site_id}/{device_id}/command
orbipulse/v1/{tenant_id}/{site_id}/{device_id}/ack
orbipulse/v1/{tenant_id}/{site_id}/{device_id}/event
orbipulse/v1/{tenant_id}/{site_id}/{device_id}/availability
orbipulse/v1/{tenant_id}/{site_id}/{device_id}/diagnostic
orbipulse/v1/{tenant_id}/{site_id}/{device_id}/ota/status
```
