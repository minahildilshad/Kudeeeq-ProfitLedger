# Kundeeeq Business Studio

**For GitHub and Vercel, start with [DEPLOY_GITHUB_VERCEL.md](DEPLOY_GITHUB_VERCEL.md).**

A private jewelry inventory and profit dashboard with an Express backend and MongoDB database. The refined wine and ivory interface is included. Node.js 22 or newer is required.

## What changes for you

Transactions now save in MongoDB, rather than browser storage. Closing the page or clearing the browser does not erase database records. Other signed-in devices refresh every 15 seconds and when the tab becomes visible. Save operations validate inventory and profit on the server. If two devices save at once, one receives a conflict and must refresh instead of overwriting the other device's work.

This package is ready to install locally. It has not been deployed to your website or connected to your store's orders. Data durability depends on the database and tested backups. It is not a guarantee against device loss or hosting failure.

## Start on Windows or macOS

1. Install Node.js 22 or newer and Docker Desktop. Open Docker Desktop.
2. Extract this ZIP. Open a terminal inside the extracted `kundeeeq-backend` folder.
3. Run `npm ci`.
4. Copy `.env.example` to `.env`. On Windows PowerShell: `Copy-Item .env.example .env`. On macOS: `cp .env.example .env`. If hidden files are not visible, use these terminal commands.
5. Run `docker compose up -d` to start MongoDB. Your records live in the named `kundeeeq_mongo` Docker volume and survive ordinary restarts. Do not run `docker compose down -v`, which removes that volume.
6. Run `npm run admin`. Enter your email and a password of at least 12 characters. Password entry is hidden. There is no shared default password.
7. Run `npm start`.
8. Open **http://localhost:3000** and sign in. Use that exact address because it matches APP_ORIGIN. Keep this terminal running while using the app. Restart it with `npm start` when needed.

Alternatively, install MongoDB locally yourself or use a MongoDB Atlas database and put its connection URI into MONGODB_URI. Docker is optional if MongoDB is already available.

Do not open `views/index.html` directly. It needs the running backend. The original offline HTML remains a separate version.

## Bring your existing records across

Open your existing offline file in the same browser you originally used. Export all transactions as CSV. In the connected app, use Import and select that CSV, review the preview, then confirm. Export and import once into an empty database. Browser records do not migrate automatically, and the backend does not read your old browser storage. CSV is the migration format for this version.

## Keep a backup

Run `npm run backup` regularly. It creates a timestamped JSON file in `backups/`. You can select another folder with `npm run backup -- /absolute/path` (quote paths that contain spaces). Copy backups to a separate device or private cloud location. The backup contains financial records, so restrict access. These are ledger backups only, without login accounts or sessions.

To restore, first create a fresh backup, stop other people editing the app, then run `npm run restore -- backups/YOUR-FILE.json`. Review the count and type RESTORE. It replaces the complete ledger and validates stock calculations first. Refresh all devices after restoring. Test restoration into a separate database before relying on your backup plan.

The app also provides an authenticated JSON download at `/api/backup`, plus the existing CSV export. Backups are available now but not scheduled automatically. Schedule the backup command with Windows Task Scheduler or your hosting provider's scheduler. Ensure scheduled jobs run inside this project directory so `.env` is loaded, and monitor failures. Use managed MongoDB snapshots for full database disaster recovery including admin accounts.

## Access from anywhere

Local setup only works on this computer by default. For multiple devices and access away from home, host the Node application and use a private managed MongoDB database. Set MONGODB_URI, MONGODB_DB, NODE_ENV=production, APP_ORIGIN=https://your-admin-domain, HOST=0.0.0.0 and PORT for your host. Set TRUST_PROXY=1 only behind exactly one trusted reverse proxy. Put HTTPS in front of the app, restrict direct access to its backend port, and restrict database access to your application host. Set up managed backups and verify restoration.

Use a separate admin subdomain such as `studio.your-domain` while keeping the customer store as it is. Adding this package does not automatically connect store purchases, orders, refunds or products. That integration requires the store's backend/API details. Do not expose the unauthenticated local Docker MongoDB port to the internet.

## Login and recovery

Passwords use salted scrypt hashing. Sessions use random tokens stored as hashes in MongoDB and HttpOnly, SameSite=Strict cookies, with a 12-hour expiry. Production cookies require HTTPS. Every write checks the configured origin and authenticated writes also require a CSRF token. Login permits 10 attempts per IP per fixed 15-minute window. Attempts are counted atomically in MongoDB, so the limit is shared across server instances. At a window boundary up to 20 attempts can occur across two adjacent windows. Expired counters are removed by a TTL index.

To reset a forgotten password, run `npm run admin` on the server and use the existing email. Confirm RESET to replace the password and revoke that user's sessions. Anyone with shell access and database credentials can reset administrators. There is no recovery email or public registration. All created admins share one business ledger and have full access. Multi-company permissions are not implemented.

## Accounting scope

Money uses integer paisa. FIFO matches oldest purchased units first, including purchase shipping/fees. Sales exceeding stock are rejected. Expense and sale validations run before an atomic database update. Purchases that support sales cannot be deleted while those sales still require them. All-time profit, inventory, chart, product contribution, CSV import/export and the rules-based assistant are preserved.

This version assumes fully paid transactions. It has no returns, unpaid balances, taxes or automated store order sync. Limits are 500 entries per import and 10,000 total ledger entries. The latest 1,000 write actions are retained inside the ledger as a limited operational history, not a tamper-proof audit archive. The UI still computes preview totals locally; the server independently recalculates and validates every save.

If a save loses its network response, refresh and inspect records before retrying. A server may have saved successfully before the connection was interrupted. The revision check prevents replaying a request against the old ledger revision. Work is not queued offline.

## API

- POST /api/auth/login: email, password; sets session cookie.
- GET /api/auth/me: returns a CSRF token after sign-in.
- POST /api/auth/logout: revokes current session.
- POST /api/auth/password: currentPassword, newPassword; revokes all sessions for that user.
- GET /api/ledger: entries, version, calculated metrics and csrf.
- POST /api/ledger: action add/delete plus current version, or action ask plus question. Add entries use integer paisa, not decimal rupees.
- GET /api/backup: authenticated ledger JSON download.
- GET /api/health: process liveness only, not a database health check.

Send X-CSRF-Token with authenticated POSTs. Write requests need an Origin matching APP_ORIGIN. API calls are same-origin only.

## Verification

Run `npm test`. Tests cover FIFO costs, overselling, session/password behavior, access controls, shared login rate limits across two app instances, database-backed HTTP saves, conflicting writes and deletion constraints through an in-memory database test double. A real MongoDB connection is required for installation and must be tested in your deployment. The test double is not a replacement for a production database check.

The lockfile pins the dependency versions resolved while packaging. Before deployment, review dependency updates and run the tests. Source layout: root `index.js` Vercel entry, `src/local-server.js` local entry, `src/` server and accounting, `views/` protected connected UI and sign-in, `scripts/` administrator and backup utilities, `test/` checks.
