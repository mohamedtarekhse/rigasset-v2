# RigAsset Pro — Backend API v2

REST API for the **RigAsset Pro** Land Rig Asset Management System.  
Built for **Vercel** (serverless) + **Supabase** (PostgreSQL).

---

## Stack

| Layer        | Technology                          |
|--------------|-------------------------------------|
| Runtime      | Node.js 18+                         |
| Framework    | Express 4                           |
| Database     | PostgreSQL via Supabase             |
| Auth         | JWT (access + refresh tokens)       |
| Deployment   | Vercel (serverless functions)       |
| Passwords    | bcryptjs (cost 12)                  |

---

## Project Structure

```
rigasset-v2/
├── server.js              ← Express entry point (exported for Vercel)
├── vercel.json            ← Routes all requests to server.js
├── package.json
├── .env.example           ← Copy → .env for local dev
│
├── lib/
│   └── db.js              ← Supabase/serverless-safe pg connection
│
├── middleware/
│   ├── auth.js            ← JWT verify + role guards
│   └── errorHandler.js   ← Global error handler + asyncHandler
│
├── api/                   ← One file per resource
│   ├── auth.js
│   ├── assets.js
│   ├── rigs.js
│   ├── companies.js
│   ├── contracts.js
│   ├── maintenance.js
│   ├── transfers.js
│   ├── bom.js
│   ├── users.js
│   ├── notifications.js
│   └── dashboard.js
│
└── database/
    ├── schema.sql         ← All tables, indexes, views, triggers
    ├── seed.sql           ← Demo data (14 rigs, 24 assets, 6 users…)
    ├── run-schema.js      ← npm run db:schema
    └── run-seed.js        ← npm run db:seed
```

---

## Quick Start

### 1. Create Supabase project

1. Go to [supabase.com](https://supabase.com) → New project
2. Note your **project ref** and **database password**
3. Go to **Project Settings → Database → Connection string**
4. Copy the **Transaction pooler** string (port **6543**) — this is your `DATABASE_URL`

> ⚠️ Use port **6543** (Transaction Pooler), NOT 5432 (direct connection).  
> Vercel serverless functions need the pooler to avoid connection exhaustion.

### 2. Apply the schema

```bash
# In Supabase: Dashboard → SQL Editor
# Paste contents of database/schema.sql and click Run
```

Or from command line after setting up `.env`:
```bash
npm run db:schema
```

### 3. Insert seed data

```bash
# In Supabase: Dashboard → SQL Editor
# Paste contents of database/seed.sql and click Run
```

Or from command line:
```bash
npm run db:seed
```

### 4. Configure environment

```bash
cp .env.example .env
# Edit .env — fill in DATABASE_URL and JWT secrets
```

### 5. Run locally

```bash
npm install
npm run dev
# → http://localhost:3000
```

### 6. Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables in Vercel dashboard:
# Project → Settings → Environment Variables
```

**Required Vercel environment variables:**

| Variable | Where to get it |
|---|---|
| `DATABASE_URL` | Supabase → Project Settings → Database → Transaction pooler URL (port 6543) |
| `JWT_SECRET` | Generate: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `JWT_REFRESH_SECRET` | Generate a second random string (different from JWT_SECRET) |
| `CORS_ORIGINS` | Your frontend URL e.g. `https://your-app.vercel.app` |

---

## Default Users

| Name | Email | Password | Role |
|---|---|---|---|
| Ahmad Mohammed | admin@rigasset.com | RigAsset2025! | Admin |
| Sara Al-Rashid | sara@rigasset.com | RigAsset2025! | Asset Manager |
| James Miller | james@rigasset.com | RigAsset2025! | Operations Manager |
| Layla Hassan | layla@rigasset.com | RigAsset2025! | Editor |
| David Chen | david@rigasset.com | RigAsset2025! | Viewer |
| Fatima Al-Zahra | fatima@rigasset.com | RigAsset2025! | Editor |

> ⚠️ Change all passwords after first login in production.

---

## Authentication

All `/api/*` routes require a Bearer token except `/api/auth/login` and `/api/auth/register`.

### Login
```http
POST /api/auth/login
Content-Type: application/json

{ "email": "admin@rigasset.com", "password": "RigAsset2025!" }
```

**Response:**
```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "user": { "id": "...", "fullName": "Ahmad Mohammed", "role": "Admin" }
}
```

### Use the token
```http
GET /api/assets
Authorization: Bearer eyJ...
```

### Refresh access token
```http
POST /api/auth/refresh
Content-Type: application/json

{ "refreshToken": "eyJ..." }
```

---

## Role Permissions

| Role | Read | Write | Delete | Approve Transfers |
|---|---|---|---|---|
| Admin | ✅ | ✅ | ✅ | Both stages |
| Asset Manager | ✅ | ✅ | ✅ | Stage 2 (final) |
| Operations Manager | ✅ | ✅ | ❌ | Stage 1 |
| Editor | ✅ | ✅ | ❌ | ❌ |
| Viewer | ✅ | ❌ | ❌ | ❌ |

---

## API Reference

### Health
```
GET  /           → service status + db ping
GET  /health     → same as above
GET  /api        → full endpoint list
```

### Auth
```
POST /api/auth/login
POST /api/auth/register
POST /api/auth/refresh
POST /api/auth/logout
GET  /api/auth/me
PUT  /api/auth/change-password
```

### Dashboard
```
GET /api/dashboard   → all KPIs, rig breakdown, alerts, expiring contracts
```

### Assets
```
GET    /api/assets               ?rig=&company=&status=&category=&search=&page=&limit=
GET    /api/assets/summary
GET    /api/assets/by-rig
GET    /api/assets/:id
POST   /api/assets
PUT    /api/assets/:id
DELETE /api/assets/:id
GET    /api/assets/:id/history
```

### Rigs
```
GET    /api/rigs
GET    /api/rigs/:id
POST   /api/rigs
PUT    /api/rigs/:id
DELETE /api/rigs/:id
```

### Companies
```
GET    /api/companies
GET    /api/companies/:id
POST   /api/companies
PUT    /api/companies/:id
DELETE /api/companies/:id
```

### Contracts
```
GET    /api/contracts            ?status=&company=&rig=&search=
GET    /api/contracts/expiring   ?days=30
GET    /api/contracts/:id
POST   /api/contracts
PUT    /api/contracts/:id
DELETE /api/contracts/:id
```

### Maintenance
```
GET    /api/maintenance          ?rig=&asset=&status=&priority=&type=&page=&limit=
GET    /api/maintenance/alerts
GET    /api/maintenance/by-rig
GET    /api/maintenance/:id
POST   /api/maintenance
PUT    /api/maintenance/:id
POST   /api/maintenance/:id/complete
GET    /api/maintenance/:id/logs
DELETE /api/maintenance/:id
```

`status` filter values: `Overdue` | `Due Soon` | `Scheduled` | `Completed` | `In Progress`

### Transfers (2-stage approval)
```
GET    /api/transfers            ?status=&priority=&search=
GET    /api/transfers/:id
POST   /api/transfers
POST   /api/transfers/:id/approve-ops    ← Operations Manager (stage 1)
POST   /api/transfers/:id/approve-mgr   ← Asset Manager (stage 2)
DELETE /api/transfers/:id
```

Approval body:
```json
{ "action": "approve", "comment": "Approved — equipment needed on Rig 5" }
```
`action`: `approve` | `reject` | `hold`

On final approval → asset `location`, `rig_id`, `company_id` updated automatically in a transaction.

### BOM
```
GET    /api/bom                  ?assetId=&rigName=&type=&status=&search=
GET    /api/bom/tree/:assetId
GET    /api/bom/:id
POST   /api/bom
PUT    /api/bom/:id
DELETE /api/bom/:id              (cascades to all children)
```

### Users
```
GET    /api/users
GET    /api/users/:id            (use 'me' for current user)
POST   /api/users                (Admin only)
PUT    /api/users/:id
DELETE /api/users/:id            (Admin only)
POST   /api/users/:id/reset-password  (Admin only)
```

### Notifications
```
GET    /api/notifications        ?unread=true&limit=50
PUT    /api/notifications/read-all
PUT    /api/notifications/:id/read
DELETE /api/notifications/:id
DELETE /api/notifications        (clears all read)
```

---

## Connecting the HTML Frontend

Replace in-memory JavaScript arrays with API calls:

```javascript
const API = 'https://your-api.vercel.app';
let TOKEN = localStorage.getItem('token');

// Helper functions
const api = {
  async get(path) {
    const r = await fetch(API + path, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });
    if (!r.ok) throw await r.json();
    return r.json();
  },
  async post(path, body) {
    const r = await fetch(API + path, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!r.ok) throw await r.json();
    return r.json();
  },
  async put(path, body) {
    const r = await fetch(API + path, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!r.ok) throw await r.json();
    return r.json();
  },
  async delete(path) {
    const r = await fetch(API + path, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${TOKEN}` }
    });
    if (!r.ok) throw await r.json();
    return r.json();
  }
};

// Login
async function login(email, password) {
  const { accessToken, refreshToken, user } = await api.post('/api/auth/login', { email, password });
  TOKEN = accessToken;
  localStorage.setItem('token', accessToken);
  localStorage.setItem('refreshToken', refreshToken);
  return user;
}

// Load dashboard KPIs
async function loadDashboard() {
  const data = await api.get('/api/dashboard');
  document.getElementById('totalAssets').textContent = data.assets.total;
  document.getElementById('activeRigs').textContent  = data.rigs.active;
  // ... etc
}

// Load assets with filters
async function loadAssets(filters = {}) {
  const params = new URLSearchParams(filters).toString();
  const { data } = await api.get(`/api/assets?${params}`);
  return data; // array of assets
}

// On page load
window.addEventListener('DOMContentLoaded', async () => {
  try {
    await loadDashboard();
    const assets = await loadAssets({ limit: 500 });
    renderAssets(assets);
  } catch (err) {
    if (err.code === 'TOKEN_EXPIRED') {
      // Refresh the token
      const newTokens = await api.post('/api/auth/refresh', {
        refreshToken: localStorage.getItem('refreshToken')
      });
      TOKEN = newTokens.accessToken;
      localStorage.setItem('token', TOKEN);
    }
  }
});
```

---

## Troubleshooting

### `db: disconnected` on Vercel
- Check `DATABASE_URL` is set in Vercel → Project → Settings → Environment Variables
- Make sure you're using the **Transaction Pooler** URL (port **6543**), not the direct connection (5432)
- The URL format should be: `postgresql://postgres.XXXX:PASSWORD@aws-0-region.pooler.supabase.com:6543/postgres`

### CORS errors from frontend
- Add your frontend URL to `CORS_ORIGINS` in Vercel environment variables
- No trailing slash: `https://myapp.vercel.app` not `https://myapp.vercel.app/`

### `Route GET / not found`
- Make sure `vercel.json` is in the project root and has the routes config
- Redeploy after adding `vercel.json`

### `TokenExpiredError` after 8 hours
- Use the refresh token flow: `POST /api/auth/refresh` with the stored `refreshToken`
- Store both tokens in `localStorage` and refresh silently when a 401 is received

### Supabase connection pool exhausted
- This happens if you use the direct connection (port 5432) with Vercel
- Switch to Transaction Pooler (port 6543) in your `DATABASE_URL`
"# rigasset-v2" 
