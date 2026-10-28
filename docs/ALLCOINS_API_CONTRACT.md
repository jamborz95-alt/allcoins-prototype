# Required ALLCOINS wallet API contract

The RP API deliberately calls internal routes on the existing ALLCOINS backend. Those routes are **not assumed to exist** until they are implemented and tested in the main backend.

## Required endpoints

### GET /api/internal/rp/wallet/balance?telegramUserId=<id>
- Require a server-to-server credential; never accept a credential from the game client.
- Return `{ "ok": true, "balanceAC": "50000" }` with the balance represented as a decimal string.
- Confirm that the Telegram account exists and is eligible to use the wallet.

### POST /api/internal/rp/wallet/transactions
- Require a server-to-server credential and an idempotency key.
- Body: `{ "telegramUserId": "...", "direction": "debit|credit", "amountAC": "1000", "reason": "vehicle_purchase", "reference": "vehicle-model-or-reward-id", "idempotencyKey": "UUID" }`.
- Perform balance mutation and transaction-log insert atomically in the existing ALLCOINS database.
- A repeated idempotency key with the same payload must return the original result; a repeated key with a different payload must fail.
- Debit must reject insufficient balance. Credits must be restricted to server-authorized reward types and amounts.
- Return `{ "ok": true, "transactionId": "...", "balanceAC": "49000" }`.

## Telegram account linking
The main ALLCOINS backend must validate Telegram WebApp `initData` itself, extract the authenticated Telegram user ID, then call the RP API `POST /api/rp/internal/confirm-link` using the internal secret. Never trust a Telegram user ID sent directly by the browser or game client.

## Rollout gate
Do not enable live AC purchases or rewards until these endpoints are implemented, reviewed, and tested against the production wallet schema. Keep the RP wallet fail-closed until then.
