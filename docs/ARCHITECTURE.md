# ALLCOINS RP architecture

- **Game server:** dedicated open.mp server for GTA San Andreas multiplayer. This is separate from the web API and needs its own compatible host and compiled gamemode.
- **RP API:** Node.js/Express service for game-server requests, RP accounts, characters, Telegram linking, and wallet proxying.
- **RP data:** PostgreSQL tables for RP accounts, characters, links, link codes, and vehicles. There is intentionally no local AC balance column.
- **Wallet authority:** the existing ALLCOINS backend and its database remain the only source of truth for AC.
- **Telegram:** the existing backend validates Telegram WebApp initData; only that trusted backend can confirm account links.

## Safety boundaries

1. Never ship server secrets in a client or gamemode binary.
2. Use server-to-server authentication for every protected API route.
3. Use one-time, short-lived link codes; store only their hashes.
4. Use idempotency keys and atomic wallet mutations in the authoritative ALLCOINS backend.
5. Return unavailable errors rather than inventing a local balance if ALLCOINS is unreachable.
6. Do not deploy the wallet bridge with placeholder credentials or enable live wallet changes before main API support exists.

## Current stage
Initial source scaffold only. The API is not yet deployed, database migration has not been applied, wallet endpoints have not been added to the existing ALLCOINS backend, and the open.mp server is not running. Android cross-play depends on a compatible mobile client and requires separate testing.
