# Deployment checklist

## Current Neon deployment

- Neon project: `allcoins-rp`
- PostgreSQL: version 17, region `aws-eu-central-1`
- Function: `allcoinsrp`
- Function base URL: `https://br-nameless-lake-b9zqg5sa-allcoinsrp.compute.c-7.eu-central-1.aws.neon.tech/`
- Health endpoint intended for checks: `/health`
- Neon Data API is enabled with external JWT verification. Do not expose a database connection string or signing secret to a browser/client.

The SQL schema migrations `001_initial.sql` and `002_rp_gameplay.sql` have been applied to the RP database. Database-level health, account creation, character creation and character listing were checked through Neon SQL. A full test using an external HTTP client is still required.

## Next steps

1. Verify `GET /health` and every intended HTTP route from an external client; a successful Neon deployment status alone is not proof that every route works.
2. Test unauthenticated requests and confirm they cannot create accounts, list data, or perform wallet actions.
3. Configure only server secrets in the function/service environment, never in the frontend or gamemode binary.
4. Implement and test the required internal AC wallet routes in the existing ALLCOINS backend before enabling real purchases or rewards.
5. The wallet API must do balance mutation and transaction logging atomically, use idempotency keys, and reject insufficient funds.
6. Host the dedicated open.mp server separately on a provider supporting persistent UDP port 7777; a normal HTTP service is not a replacement for the UDP game server.
7. Test the exact PC and Android clients together before announcing cross-play.

## Alternative portable host

The repository still contains `render.yaml` and a standalone Node.js API source for use as a separate Render web service. No separate ALLCOINS RP Render service has been confirmed as created, and these instructions must not be interpreted as claiming one is live.
