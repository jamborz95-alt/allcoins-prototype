# ALLCOINS RP architecture

- **Game server:** a dedicated open.mp server is planned; its starter gamemode is not yet a running production server.
- **RP API:** a Neon Function `allcoinsrp` has been deployed for the HTTP control plane. The Node.js/Express API source in `api/` remains the portable service implementation.
- **RP data:** Neon PostgreSQL contains accounts, characters, Telegram links, one-time link codes, vehicles, character stats, inventory, wallet-operation idempotency records and moderation history.
- **Wallet authority:** the existing ALLCOINS backend and database remain the only source of truth for AC. No AC balance is stored in the RP database.
- **Telegram:** the existing ALLCOINS backend must verify Telegram WebApp `initData` itself before confirming a link.

## Current deployment

- Neon project: `allcoins-rp`, PostgreSQL 17, region `aws-eu-central-1`.
- Neon Function URL: `https://br-nameless-lake-b9zqg5sa-allcoinsrp.compute.c-7.eu-central-1.aws.neon.tech/`.
- Neon Data API is enabled with external JWT verification.
- The `rp_anon` role does not have direct read/write privileges on account, character, link, vehicle, inventory or wallet-operation tables.
- SQL-level health/account/character procedure checks passed; external HTTP end-to-end checks are still outstanding.

## Security boundaries

1. Never ship server secrets in a client or gamemode binary.
2. Authenticate every protected route server-to-server.
3. Use one-time, short-lived link codes; store only their hashes.
4. Use idempotency keys and atomic wallet mutations in the authoritative ALLCOINS backend.
5. Return unavailable errors rather than inventing a local AC balance if ALLCOINS is unreachable.
6. Do not enable live AC purchases/rewards until the existing ALLCOINS backend has the required internal wallet routes and those routes are tested.
7. Do not trust a Telegram user ID supplied directly by a browser or game client.

## Next steps

1. Verify the public Neon Function routes with external HTTP requests.
2. Align and test the deployed handler and versioned source code.
3. Add and test the internal AC balance/transaction routes to the existing backend without changing the Mini App URL.
4. Compile and deploy the dedicated game server on a UDP-capable host.
5. Test supported PC and Android clients before claiming cross-play.
