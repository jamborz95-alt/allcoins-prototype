# ALLCOINS RP

Separate GTA San Andreas roleplay project with its own server and ALLCOINS (AC) as the sole in-game currency.

## Current status
- RP-only Neon PostgreSQL project: `allcoins-rp` (PostgreSQL 17, EU Central).
- Neon Function `allcoinsrp` is deployed. Its public base URL is documented in `docs/DEPLOYMENT.md`.
- RP tables are created; gameplay schema migration `002_rp_gameplay.sql` adds character state, inventory, vehicle state, wallet-operation idempotency records and moderation history.
- Neon Data API is enabled with external JWT verification. The public/anonymous role has no direct table read/write permissions.
- SQL health, account creation, character creation and character-list procedures were exercised through Neon SQL.
- **The HTTP API has not been fully end-to-end verified from an external client yet.** The game server is not running.

## Architecture
- `api/`: Node.js HTTP API source and SQL migrations.
- `api/migrations/`: versioned RP schema.
- `openmp/`: starter gamemode for a future dedicated open.mp server.
- `docs/`: integration contract and deployment notes.

## Important currency rule
The RP database must not become a second source of truth for the AC balance. Live purchases and rewards must call an authenticated internal wallet API in the existing ALLCOINS backend. That wallet bridge has not yet been implemented or verified, so live AC transactions must remain disabled.

## Local API
1. `cd api`
2. `npm install`
3. Copy `.env.example` to `.env` and configure the RP database and strong server-only secrets.
4. `npm test`
5. `npm start`

## Multiplayer client note
The dedicated open.mp server is separate from the HTTP API and needs a compatible host with persistent UDP support. Android cross-play depends on the selected GTA San Andreas mobile client and must be tested before promising compatibility.
