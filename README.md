# PropDial — Real Estate Power Dialer

PropDial is a high-performance, multi-tenant, TCPA-compliant power dialer built for real estate brokerages and outbound sales teams. It includes automated predictive/power dialing engines, real-time manager dashboards via server-sent events (SSE), Twilio WebRTC client softphones, and comprehensive reporting.

## Stack
- **Backend**: Node.js + Express + TypeScript + Prisma ORM + PostgreSQL + Redis + Bull Queue
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui + Recharts
- **Telephony**: Twilio Voice SDK (WebRTC softphone integration)

## Quick Start

Follow these steps to run the application locally:

```bash
# 1. Clone the repository and configure environment variables
cp .env.example .env        # Fill in the required credentials and database URLs

# 2. Spin up the local database and redis cache via Docker
docker-compose up -d        # Starts postgres + redis containers

# 3. Setup the Backend database schema and run the dev server
cd backend
npm install
npx prisma db push
npx prisma generate
npm run dev

# 4. Spin up the Frontend development server
cd ../frontend
npm install
npm run dev
```

The frontend application will be served at [http://localhost:5173](http://localhost:5173) and the backend API gateway at [http://localhost:5000](http://localhost:5000).

---

## Paid APIs — Required for Full Functionality

The application integrates with several 3rd party providers to deliver full features. Stub implementations are provided in settings/integrations. Add the respective keys in your `.env` to activate:

| Feature | Provider | Env Variable | Description |
|---------|----------|--------------|-------------|
| **Voice Calls** | Twilio | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_TWIML_APP_SID`, `TWILIO_API_KEY`, `TWILIO_API_SECRET` | Required for WebRTC client registration, call routing, and phone calls. |
| **DNC Scrubbing** | DNC.com | `DNC_API_KEY` | Auto-scrub numbers against national and internal Do-Not-Call lists before dialing. |
| **Email Invites** | SendGrid | `SENDGRID_API_KEY` | Automatically sends onboarding and team invites to new agents. |
| **HubSpot CRM** | HubSpot | `HUBSPOT_API_KEY` | Automated sync of call logs, leads, and status outcomes. |
| **Salesforce CRM** | Salesforce | `SALESFORCE_CLIENT_ID`, `SALESFORCE_CLIENT_SECRET` | Enterprise CRM integration for lead pushing and dialing pools. |
| **GoHighLevel** | GHL | `GHL_API_KEY` | Sync contacts, campaigns, and dispositions with GHL subaccounts. |
| **Follow Up Boss** | Follow Up Boss | `FUB_API_KEY` | Real estate specific CRM workflow sync. |

---

## TCPA Compliance Built-in

To protect campaigns against costly TCPA regulations, the PropDial dialer engine is hardwired with several compliance guards:

1. **DNC List Scrubbing**: Automatically verifies each lead number against national and internal DNC records before placing any outbound calls.
2. **Time Zone Guardrails**: Outbound dialing is restricted strictly between **8:00 AM and 9:00 PM** local time relative to the recipient's phone number area code and state.
3. **Abandonment Rate Monitor**: Auto-pauses active campaigns if the call drop rate (answered calls with no available agent to connect within 2 seconds) exceeds **3.0%** in a moving 30-day window.
4. **Consent Tracking**: Tracks opt-in consent dates for every imported lead in the system database.

---

## Architecture

The system flows through a real-time event-driven loop backed by Redis Pub/Sub:

```
Browser (WebRTC) ←→ Twilio Cloud ←→ Backend TwiML Webhooks
Backend API ←→ PostgreSQL (data) + Redis (state + queues)
Bull Queue → Dialer Engine → TCPA Check → Twilio REST API
SSE Stream ← Redis Pub/Sub ← Agent State Changes
```

---

## Default Roles

Access levels are partitioned into four role tiers:
- **`super_admin`**: Complete control over system configuration, global tenant creation, billing, and system configurations.
- **`admin`**: Full company administration including caller ID pools, voicemail audio templates, team invites, and integrations.
- **`manager`**: Controls active campaigns, views performance reports, manages leads CRM lists, and monitors agent real-time stats.
- **`agent`**: Standard dialer console, leads directory queue access, call softphone widget, and wrap-up dispositions selector.
