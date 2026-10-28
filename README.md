# ALLCOINS RP

Separate GTA San Andreas roleplay project with its own server and ALLCOINS (AC) as the sole in-game currency.

## Project status
This repository is the initial source scaffold. The live ALLCOINS Telegram Mini App and `allcoins-server` are not modified by this project.

## Architecture
- `api/`: Node.js HTTP API for RP accounts, characters, vehicles and server health.
- `api/migrations/`: schema for RP-only records and idempotent wallet operation references.
- `openmp/`: starter gamemode for an open.mp dedicated server.
- `docs/`: integration contract and deployment notes.

## Important currency rule
The RP database must not duplicate or independently edit the AC balance. Production purchases/rewards must call a verified internal ALLCOINS wallet API. No real wallet mutation is enabled until that API contract and service credentials are configured.

## Local API
1. `cd api`
2. `npm install`
3. Copy `.env.example` to `.env` and configure the RP database.
4. `npm test`
5. `npm start`

## Multiplayer client note
The open.mp server is a dedicated game server, not a web game. Android compatibility depends on the chosen GTA San Andreas mobile client; test it separately before promising cross-play.
