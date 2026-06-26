# ALC Client Inquiry System

Modern web-based Client Inquiry System for centralized branch client and loan verification.

## Tech Stack

- Next.js App Router
- TypeScript
- TailwindCSS
- MySQL central database
- Microsoft SQL Server branch databases
- Prisma ORM
- Signed cookie login with roles: `ADMIN`, `INQUIRY_USER`, `AUDITOR`

## Modules

- Login
- Dashboard
- Branch Management
- Client Inquiry
- Loan Result Viewer
- Sync Logs
- User Management
- Settings

## Client Inquiry Rules

The inquiry screen searches by full name, birthdate, contact number, client ID, or valid ID number.

- No matched client: `No existing client record found.`
- Matched client with all balances at `0`: `Client has previous loan record but fully paid.`
- Matched client with any balance greater than `0`: `Client has existing loan balance at [Branch Name]. Please verify before approval.`

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy environment variables:

```bash
cp .env.example .env
```

3. Update `.env`:

```env
DATABASE_URL="mysql://alc_user:strong_password@localhost:3306/alc_central"
SESSION_SECRET="use-a-long-random-secret"
SYNC_ENCRYPTION_KEY="use-a-long-random-sync-key"
SYNC_BATCH_SIZE="500"
SQLSERVER_ENCRYPT="false"
SQLSERVER_TRUST_CERT="true"
```

4. Create the MySQL database:

```sql
CREATE DATABASE alc_central CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

5. Run Prisma migration and seed:

```bash
npm run prisma:migrate
npm run prisma:seed
```

6. Start the app:

```bash
npm run dev
```

Default seeded login:

- Email: `admin@alc.local`
- Password: `Admin@12345`

## Branch Sync

Active branches are read from the central `branches` table. Each branch points to a Microsoft SQL Server database and stores:

- `branch_name`
- `branch_code`
- `public_ip`
- `db_host`
- `db_name`
- `db_user`
- `encrypted_db_password`
- `status`
- `last_sync_at`

Use `db_host` as either `server-name`, `server-name:1433`, or `server-name,1433`.

Run sync manually:

```bash
npm run sync:branches
```

Cron command for midnight sync:

```bash
0 0 * * * cd /path/to/alc-client-inquiry-system && npm run sync:branches >> logs/sync.log 2>&1
```

## Expected Remote Branch Tables

The sync service reads these branch tables with read-only credentials:

```sql
clients(id, client_id, full_name, birthdate, contact_number, valid_id_number, address, updated_at)
loans(id, client_remote_id, loan_number, principal_amount, balance, status, released_at, maturity_at, updated_at)
payments(id, client_remote_id, loan_remote_id, amount, paid_at, updated_at)
```

Remote records are upserted into the central database by `branch_id + remote_id`.

## Project Structure

```text
app/
  (app)/
    branches/
    dashboard/
    inquiry/
    loans/
    settings/
    sync-logs/
    users/
  api/
components/
lib/
prisma/
  migrations/001_init/migration.sql
  schema.prisma
  seed.ts
scripts/
  sync-branches.ts
  sync-service.ts
```

## Role Access

- `ADMIN`: all modules, branch sync, user management, settings
- `INQUIRY_USER`: dashboard, client inquiry, loan result viewer
- `AUDITOR`: dashboard, client inquiry, loan result viewer, sync logs

## Notes

- Replace seeded credentials immediately after first login.
- Use read-only branch database users for sync.
- Keep `SESSION_SECRET` and `SYNC_ENCRYPTION_KEY` private and stable between deployments.
