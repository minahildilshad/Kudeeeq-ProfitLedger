# Upload to GitHub and deploy to Vercel

## What each service does

GitHub holds your application code. Vercel runs the dashboard and API. MongoDB Atlas holds the live business records and admin accounts. Uploading to GitHub does not upload your local database. Store orders are not synced automatically.

This package contains the Vercel entry point, shared database connection pool, MongoDB-backed login rate limits, and GitHub Actions tests. It has been tested locally against a database test double, but has not been deployed to your accounts or verified against your Atlas cluster.

## 1. Use this updated project

Extract the ZIP into a new folder. Open the inner `kundeeeq-backend` folder, where `package.json` and `index.js` are located. Do not replace your old local database or remove its Docker volume. The earlier ZIP works locally, but use this updated package for Vercel.

## 2. Put the code on GitHub

Create a **private**, empty repository named `kundeeeq-studio` in your GitHub account. Do not initialize it with a README, license or gitignore, since these files are already in the project.

If Git is installed, open PowerShell in the inner project folder and run each line separately:

```powershell
git init
git add .
git status
```

Review the file list: `.env`, `node_modules` and `backups` must not appear. `.env.example` is safe because it contains template values only. The supplied `.gitignore` excludes secrets, local dependencies, database backups and Vercel's local settings.

Then run:

```powershell
git commit -m "Add Kundeeeq business studio"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/kundeeeq-studio.git
git push -u origin main
```

Replace YOUR-USERNAME with your real GitHub username. Git may ask for your name/email for the commit and GitHub may open a sign-in screen. Do not put an access token into the repository or chat.

If Git is not installed, GitHub Desktop can publish this existing folder as a private repository. Select the inner project folder and inspect changed files before publishing. Avoid uploading the ZIP itself: Vercel needs the extracted files with package.json at the repository root.

The included GitHub workflow runs npm ci and npm test on pushes and pull requests. Never upload `.env`, database backups or passwords, even into a private repository.

## 3. Create the online database

Create a MongoDB Atlas project and cluster. Create a database user with a strong unique password and readWrite access limited to the `kundeeeq` database. This database username/password is separate from your dashboard admin login.

Copy the Node.js driver connection string. Replace its password placeholder using a URL-encoded database password if it contains reserved URL characters. Keep this connection string private.

Configure Atlas Network Access for your local public IP when creating the dashboard admin from your computer, and for the Vercel application's outbound IPs. Vercel deployments do not generally use your computer's IP. Use Vercel's static outbound IP or private networking options when available. If you choose Atlas's Allow Access from Anywhere option, it allows connections from any IP, so use unique database credentials restricted to this database and TLS. Do not treat an open IP list as a backup or as account protection.

Atlas guide: https://www.mongodb.com/docs/atlas/security/add-ip-address-to-list/
Vercel network guide: https://vercel.com/kb/guide/how-to-allowlist-deployment-ip-address

## 4. Create your dashboard admin in Atlas

In this new project folder, run:

```powershell
npm.cmd ci
Copy-Item .env.example .env
notepad .env
```

In Notepad replace only MONGODB_URI with the Atlas connection string and keep MONGODB_DB=kundeeeq. Keep NODE_ENV=development and APP_ORIGIN=http://localhost:3000 for this local setup step. Save and close Notepad. Do not share or upload this file.

Then run:

```powershell
npm.cmd run admin
```

Enter your dashboard email and a password of 12 to 128 characters. This creates the admin in the database selected by your new Atlas URI. Your earlier admin in local Docker does not automatically exist in Atlas.

For local business records: first export them from your old running local dashboard as CSV. After the Atlas-backed dashboard is running, import that CSV once into the empty online ledger. An online and local database are different stores; changing a URI does not move existing data.

## 5. Import GitHub into Vercel

1. Sign in to Vercel with GitHub and choose Add New Project.
2. Import your private `kundeeeq-studio` repository and allow Vercel to access it.
3. The repository root must contain package.json and index.js. If you uploaded an extra outer folder, select the inner project as Root Directory.
4. Use the **Express** framework. Keep the default install settings. This app does not need a frontend build or a public output directory.
5. Add Production environment variables:

| Name | Value |
| --- | --- |
| MONGODB_URI | Your private Atlas connection string |
| MONGODB_DB | kundeeeq |
| NODE_ENV | production |
| APP_ORIGIN | Your exact production HTTPS URL, with no trailing slash |

For example, if Vercel assigns `https://kundeeeq-studio.vercel.app`, APP_ORIGIN must be exactly that address. If the final assigned URL differs, update APP_ORIGIN and redeploy. Setting changes apply on the next deployment. The app intentionally rejects writes from other origins. Do not copy your localhost APP_ORIGIN to production.

6. Deploy. Open the assigned production link and sign in using the admin created in Atlas.
7. Confirm a purchase saves, refresh, sign out and sign in, and confirm it remains. Open the same production URL on another device and check updates after 15 seconds. Import real records only after those checks.

No Docker service runs on Vercel. The Express entry point is root index.js. The local start command uses src/local-server.js. Protected HTML lives in views/, outside Vercel's public static folder, and is served by authenticated routes.

Use Production variables for the production database. If enabling Preview deployments, configure a separate database and explicit preview origin. Do not expose production financial records to preview builds from unreviewed code.

## 6. Domain and backups

You can later add a dedicated subdomain such as studio.kundeeeq.com in Vercel and configure DNS as Vercel instructs. Set APP_ORIGIN to that exact HTTPS subdomain and redeploy. This package does not change your existing customer-facing store.

Use an appropriate Vercel plan for business use. Vercel describes its Hobby plan as personal and non-commercial: https://vercel.com/pricing

For daily business use, configure Atlas backups or an external scheduled backup job that writes to durable private storage. Vercel's function filesystem is not durable backup storage. The app's Backup button downloads ledger JSON to your computer. `npm.cmd run backup` runs on your computer/server against the database selected in .env. No automatic backup schedule or snapshot policy is activated by this package.

## Common errors

- Incorrect email/password: create the admin against the SAME Atlas URI and database name used by Vercel. Local Docker credentials are not automatically copied.
- Open the app using its configured APP_ORIGIN: the URL in the browser and APP_ORIGIN differ. Fix the variable and redeploy.
- Database connection error: check Atlas network access, database user permissions, URI password encoding and MONGODB_DB. Never paste the full URI into a screenshot or public issue.
- Cannot find view/template file: ensure views/ is committed and vercel.json is present. It explicitly includes the protected HTML files in the function bundle.
- Data is empty: the online database starts separately from Docker. Export local CSV and import it into the online ledger after verifying the correct database.
