# Deploy SimplePayroll — Free, No Credit Card

Stack: Node + Express + MySQL. Needs a public URL + a MySQL-compatible DB.

All paths below are free tier, no credit card required for creation.

## Option A — Koyeb (app) + TiDB Cloud (DB) — Recommended
Fastest, no server to maintain. Koyeb free tier: 1x Eco instance (0.5 vCPU / 512 MB), sleeps when idle (first visit takes ~30s). TiDB Cloud free tier: 5 GB, 500M rows, SSL required.

### 1. Database — TiDB Cloud (free, no card)
1. https://tidbcloud.com → Sign up → **Create Cluster** → **Serverless** (free) → Create.
2. Wait ~1 min → Open cluster → **Connect** (top right) → **General** tab.
3. Note: `Host`, `Port` (4000), `Username` (e.g. `xxxxx.root`), `Password`. Set `DB_NAME=simple_payroll`.
4. Connect with a DB client (DBeaver / MySQL Workbench / TablePlus). You can also use the built-in SQL editor in TiDB Cloud console.
5. Import `database/schema.sql` (Run / Import in the console or client). Verify tables exist, especially `users` and `employees`.
6. Confirm admin exists: `SELECT username, role FROM users;` → `admin`.

> TiDB root-ish user: the username includes `.root` suffix. Use it exactly as shown.

### 2. App — Koyeb (free, no card)
1. https://koyeb.com → Sign up (GitHub / email).
2. **Create App** → **From Git** → connect GitHub `rinmico2-ui/simplepayroll`, branch `main`.
3. Settings:
   - Builder: **Docker** (uses `Dockerfile`) — or Buildpack/Node with Start `node server.js`.
   - Instance type: **Eco** (free) — e.g. `t2-micro` equivalent, set region nearest you (Singapore `ap-southeast-1` recommended for PH).
   - Port: `3000`.
   - Environment variables (add in Koyeb `Environment Variables`):
     ```
     NODE_ENV=production
     PORT=3000
     DB_HOST=<TiDB host from step 1>
     DB_PORT=4000
     DB_USER=<TiDB user>
     DB_PASS=<TiDB password>
     DB_NAME=simple_payroll
     DB_SSL=true
     SESSION_SECRET=<long random string, min 32 chars>
     ```
4. **Deploy**. Koyeb gives you `https://<app>.koyeb.app`.
5. Verify: open URL → `/health` returns `{"status":"ok"}` → login `admin / admin123` → change password in Settings. Demo staff check: dashboard loads.

> Generate a secret: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

### 3. Verify end-to-end
- [ ] Login admin/admin123 works
- [ ] Dashboard charts load
- [ ] Employees list shows 5 samples
- [ ] Create a period → Calculate → Approve → Payslip prints
- [ ] `/health` returns ok

### Known limits (free tiers)
- Koyeb free instance sleeps after idle → first request is slow. Upgrade only if needed.
- TiDB free cluster has egress/time limits — fine for typical small-business payroll.
- Change `admin123` immediately after first login.

## Option B — Oracle Cloud Always Free VPS + Docker Compose
Truly always-on (no sleep). Oracle requires a card for identity verification only (no charge) — Skip if you don't want any card.

1. https://oracle.com/cloud/free → Create Always Free **VM** Ubuntu 24.04, shape `VM.Standard.A1.Flex` (2 OCPU/12GB, ARM). Or `VM.Standard.E2.1.Micro` x86.
2. SSH in:
   ```bash
   sudo apt update && sudo apt install -y docker.io docker-compose-plugin ufw
   sudo systemctl enable --now docker
   sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw --force enable
   ```
3. Clone repo, create `.env` with a strong `SESSION_SECRET` + DB password, then:
   ```bash
   git clone https://github.com/rinmico2-ui/simplepayroll.git
   cd simplepayroll
   cp .env.example .env   # edit DB_* + SESSION_SECRET real values
   docker compose up -d --build
   ```
   `docker-compose.yml` (app + MySQL, to be added if you choose this path) runs both services.
4. Put nginx + Let's Encrypt in front of `http://localhost:3000` for HTTPS, or use Caddy:
   ```bash
   sudo apt install -y caddy
   echo "yourdomain.com { reverse_proxy localhost:3000 }" | sudo tee /etc/caddy/Caddyfile
   sudo systemctl restart caddy
   ```
5. Initialize DB: `docker compose exec db mysql -u root -p < database/schema.sql`
6. Verify via `https://yourdomain.com` and `/health`.

## Option C — Your own PC (Windows) + Cloudflare Tunnel — True $0, no card
Expires only if your PC is off. Good for class/demo, not 24/7 production.
1. Install MySQL (XAMPP) → import `database/schema.sql` → set local `.env` → `npm start`.
2. Install `cloudflared` → `cloudflared tunnel login` → `cloudflared tunnel create simplepayroll` → configure `~/.cloudflared/config.yml` with `hostname: payroll.yourdomain.com, service: http://localhost:3000` → `cloudflared tunnel route dns ...` → `cloudflared tunnel run simplepayroll`.
3. Free Cloudflare quick tunnel (no domain needed): `cloudflared tunnel --url http://localhost:3000` gives a temp `*.trycloudflare.com` URL. Keep PC on.

## Troubleshooting
- `Cannot connect to MySQL` → check `DB_HOST/PORT/USER/PASS`, `DB_SSL=true` for TiDB, and that the schema was imported.
- Login 503 `Database not found` → import `database/schema.sql`.
- Login works but charts empty → check browser console / `/api/dashboard` (session cookie, HTTPS).
- Koyeb "App crashloop" → check env vars, ensure `PORT` matches Dockerfile (`3000`), and `/health` passes.
- Session secret error → set `SESSION_SECRET` in Koyeb env; restart.
