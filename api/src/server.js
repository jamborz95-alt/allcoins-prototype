import crypto from 'node:crypto';
import express from 'express';
import helmet from 'helmet';
import { config } from './config.js';
import { pool } from './db.js';
import { requireGameServer, requireAllcoinsBackend, hashCode, newLinkCode } from './security.js';
import { getBalance, createTransaction } from './allcoins-client.js';

const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use(express.json({ limit: '16kb', strict: true }));

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, service: 'allcoins-rp-api', database: 'connected' });
  } catch {
    res.status(503).json({ ok: false, service: 'allcoins-rp-api', database: 'unavailable' });
  }
});

app.post('/api/rp/server/accounts', requireGameServer, async (req, res, next) => {
  try {
    const accountId = crypto.randomUUID();
    await pool.query('INSERT INTO rp_accounts (id) VALUES ($1)', [accountId]);
    res.status(201).json({ ok: true, accountId });
  } catch (error) { next(error); }
});

app.post('/api/rp/server/characters', requireGameServer, async (req, res, next) => {
  try {
    const { accountId, characterName } = req.body ?? {};
    if (!isUuid(accountId) || !validCharacterName(characterName)) {
      return res.status(400).json({ ok: false, error: 'INVALID_CHARACTER' });
    }
    const result = await pool.query(
      `INSERT INTO rp_characters (account_id, character_name)
       VALUES ($1, $2) RETURNING id, account_id, character_name, level, location, created_at`,
      [accountId, characterName.trim()]
    );
    res.status(201).json({ ok: true, character: result.rows[0] });
  } catch (error) {
    if (error.code === '23503') return res.status(404).json({ ok: false, error: 'ACCOUNT_NOT_FOUND' });
    if (error.code === '23505') return res.status(409).json({ ok: false, error: 'CHARACTER_NAME_EXISTS' });
    next(error);
  }
});

app.post('/api/rp/server/link-codes', requireGameServer, async (req, res, next) => {
  try {
    const { accountId } = req.body ?? {};
    if (!isUuid(accountId)) return res.status(400).json({ ok: false, error: 'INVALID_ACCOUNT_ID' });
    const exists = await pool.query('SELECT 1 FROM rp_accounts WHERE id = $1', [accountId]);
    if (!exists.rowCount) return res.status(404).json({ ok: false, error: 'ACCOUNT_NOT_FOUND' });
    const code = newLinkCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await pool.query(
      'INSERT INTO rp_link_codes (account_id, code_hash, expires_at) VALUES ($1, $2, $3)',
      [accountId, hashCode(code), expiresAt]
    );
    res.status(201).json({ ok: true, code, expiresAt: expiresAt.toISOString(), instructions: 'Enter this one-time code in the official ALLCOINS Telegram Mini App. It expires in 10 minutes.' });
  } catch (error) { next(error); }
});

// Only the existing ALLCOINS backend may call this after verifying Telegram WebApp initData.
app.post('/api/rp/internal/confirm-link', requireAllcoinsBackend, async (req, res, next) => {
  const client = await pool.connect().catch(next);
  if (!client) return;
  try {
    const { telegramUserId, code } = req.body ?? {};
    if (!/^\d{1,20}$/.test(String(telegramUserId ?? '')) || !/^[A-HJ-NP-Z2-9]{8}$/.test(String(code ?? ''))) {
      return res.status(400).json({ ok: false, error: 'INVALID_LINK_REQUEST' });
    }
    await client.query('BEGIN');
    const found = await client.query(
      'SELECT id, account_id FROM rp_link_codes WHERE code_hash = $1 AND consumed_at IS NULL AND expires_at > now() FOR UPDATE',
      [hashCode(code)]
    );
    if (!found.rowCount) {
      await client.query('ROLLBACK');
      return res.status(410).json({ ok: false, error: 'LINK_CODE_INVALID_OR_EXPIRED' });
    }
    const { id: codeId, account_id: accountId } = found.rows[0];
    const alreadyLinked = await client.query(
      'SELECT 1 FROM rp_account_links WHERE account_id = $1 OR telegram_user_id = $2 FOR UPDATE',
      [accountId, String(telegramUserId)]
    );
    if (alreadyLinked.rowCount) {
      await client.query('ROLLBACK');
      return res.status(409).json({ ok: false, error: 'ACCOUNT_ALREADY_LINKED' });
    }
    await client.query('INSERT INTO rp_account_links (account_id, telegram_user_id) VALUES ($1, $2)', [accountId, String(telegramUserId)]);
    await client.query('UPDATE rp_link_codes SET consumed_at = now() WHERE id = $1', [codeId]);
    await client.query('COMMIT');
    res.json({ ok: true, linked: true });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (error.code === '23505') return res.status(409).json({ ok: false, error: 'ACCOUNT_ALREADY_LINKED' });
    next(error);
  } finally { client.release(); }
});

app.get('/api/rp/server/wallet/:accountId', requireGameServer, async (req, res) => {
  try {
    if (!isUuid(req.params.accountId)) return res.status(400).json({ ok: false, error: 'INVALID_ACCOUNT_ID' });
    const result = await pool.query('SELECT telegram_user_id FROM rp_account_links WHERE account_id = $1', [req.params.accountId]);
    if (!result.rowCount) return res.status(409).json({ ok: false, error: 'TELEGRAM_ACCOUNT_NOT_LINKED' });
    const wallet = await getBalance(result.rows[0].telegram_user_id);
    res.json({ ok: true, balanceAC: String(wallet.balanceAC) });
  } catch {
    res.status(502).json({ ok: false, error: 'ALLCOINS_WALLET_UNAVAILABLE' });
  }
});

app.post('/api/rp/server/wallet/transactions', requireGameServer, async (req, res) => {
  try {
    const { accountId, direction, amountAC, reason, reference, idempotencyKey } = req.body ?? {};
    if (!isUuid(accountId) || !['debit', 'credit'].includes(direction) ||
        !/^[1-9]\d{0,14}$/.test(String(amountAC ?? '')) ||
        !['vehicle_purchase', 'vehicle_sale', 'mission_reward', 'job_reward', 'item_purchase', 'refund'].includes(reason) ||
        !isUuid(idempotencyKey) || typeof reference !== 'string' || reference.length < 1 || reference.length > 100) {
      return res.status(400).json({ ok: false, error: 'INVALID_TRANSACTION' });
    }
    const linked = await pool.query('SELECT telegram_user_id FROM rp_account_links WHERE account_id = $1', [accountId]);
    if (!linked.rowCount) return res.status(409).json({ ok: false, error: 'TELEGRAM_ACCOUNT_NOT_LINKED' });
    const result = await createTransaction({
      telegramUserId: String(linked.rows[0].telegram_user_id), direction,
      amountAC: String(amountAC), reason, reference, idempotencyKey
    });
    res.json({ ok: true, transactionId: result.transactionId, balanceAC: String(result.balanceAC) });
  } catch (error) {
    if (error.status === 409 || error.message === 'INSUFFICIENT_FUNDS') return res.status(409).json({ ok: false, error: error.message });
    res.status(502).json({ ok: false, error: 'ALLCOINS_TRANSACTION_UNAVAILABLE' });
  }
});

app.use((error, _req, res, _next) => {
  console.error('Request failed:', error?.code ?? error?.name ?? 'Error');
  res.status(500).json({ ok: false, error: 'INTERNAL_ERROR' });
});

function isUuid(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function validCharacterName(value) {
  return typeof value === 'string' && value.trim().length >= 3 && value.trim().length <= 24 && /^[A-Za-z][A-Za-z0-9_]*$/.test(value.trim());
}

const server = app.listen(config.port, () => console.log(`ALLCOINS RP API listening on port ${config.port}`));
async function shutdown(signal) {
  console.log(`Received ${signal}; shutting down`);
  server.close(async () => {
    await pool.end().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
