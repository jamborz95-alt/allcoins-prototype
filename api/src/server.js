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

app.get('/api/rp/server/characters/:characterId', requireGameServer, async (req, res, next) => {
  try {
    if (!isUuid(req.params.characterId)) {
      return res.status(400).json({ ok: false, error: 'INVALID_CHARACTER_ID' });
    }
    const result = await pool.query(
      `SELECT c.id, c.account_id, c.character_name, c.level, c.location, c.created_at, c.updated_at,
              COALESCE(to_jsonb(s), jsonb_build_object(
                'health', 100, 'hunger', 100, 'thirst', 100, 'experience', 0, 'job_code', 'unemployed'
              )) AS stats
         FROM rp_characters c
         LEFT JOIN rp_character_stats s ON s.character_id = c.id
        WHERE c.id = $1`,
      [req.params.characterId]
    );
    if (!result.rowCount) return res.status(404).json({ ok: false, error: 'CHARACTER_NOT_FOUND' });

    const inventory = await pool.query(
      `SELECT i.id, i.item_code AS "itemCode", catalog.display_name AS "displayName",
              i.quantity, i.metadata, i.updated_at AS "updatedAt"
         FROM rp_character_inventory i
         JOIN rp_items catalog ON catalog.item_code = i.item_code
        WHERE i.character_id = $1 ORDER BY i.created_at`,
      [req.params.characterId]
    );
    res.json({ ok: true, character: result.rows[0], inventory: inventory.rows });
  } catch (error) { next(error); }
});

app.patch('/api/rp/server/characters/:characterId/stats', requireGameServer, async (req, res, next) => {
  try {
    const { health, hunger, thirst, experience, jobCode } = req.body ?? {};
    const exp = String(experience ?? '');
    if (!isUuid(req.params.characterId) ||
        typeof health !== 'number' || !Number.isFinite(health) || health < 0 || health > 100 ||
        !Number.isInteger(hunger) || hunger < 0 || hunger > 100 ||
        !Number.isInteger(thirst) || thirst < 0 || thirst > 100 ||
        !/^(0|[1-9]\\d{0,18})$/.test(exp) || BigInt(exp) > 9223372036854775807n ||
        typeof jobCode !== 'string' || !/^[a-z][a-z0-9_]{1,39}$/.test(jobCode)) {
      return res.status(400).json({ ok: false, error: 'INVALID_CHARACTER_STATS' });
    }
    const result = await pool.query(
      `INSERT INTO rp_character_stats (character_id, health, hunger, thirst, experience, job_code, updated_at)
       SELECT id, $2, $3, $4, $5::bigint, $6, now() FROM rp_characters WHERE id = $1
       ON CONFLICT (character_id) DO UPDATE SET
         health = EXCLUDED.health, hunger = EXCLUDED.hunger, thirst = EXCLUDED.thirst,
         experience = EXCLUDED.experience, job_code = EXCLUDED.job_code, updated_at = now()
       RETURNING character_id, health, hunger, thirst, experience::text AS experience, job_code, updated_at`,
      [req.params.characterId, health, hunger, thirst, exp, jobCode]
    );
    if (!result.rowCount) return res.status(404).json({ ok: false, error: 'CHARACTER_NOT_FOUND' });
    res.json({ ok: true, stats: result.rows[0] });
  } catch (error) { next(error); }
});

app.get('/api/rp/server/characters/:characterId/inventory', requireGameServer, async (req, res, next) => {
  try {
    if (!isUuid(req.params.characterId)) {
      return res.status(400).json({ ok: false, error: 'INVALID_CHARACTER_ID' });
    }
    const exists = await pool.query('SELECT 1 FROM rp_characters WHERE id = $1', [req.params.characterId]);
    if (!exists.rowCount) return res.status(404).json({ ok: false, error: 'CHARACTER_NOT_FOUND' });
    const result = await pool.query(
      `SELECT i.id, i.item_code AS "itemCode", catalog.display_name AS "displayName",
              i.quantity, i.metadata, i.updated_at AS "updatedAt"
         FROM rp_character_inventory i
         JOIN rp_items catalog ON catalog.item_code = i.item_code
        WHERE i.character_id = $1 ORDER BY i.created_at`,
      [req.params.characterId]
    );
    res.json({ ok: true, items: result.rows });
  } catch (error) { next(error); }
});

app.post('/api/rp/server/characters/:characterId/inventory', requireGameServer, async (req, res, next) => {
  const client = await pool.connect().catch(next);
  if (!client) return;
  try {
    const { itemCode, quantity = 1, metadata = {} } = req.body ?? {};
    if (!isUuid(req.params.characterId) ||
        typeof itemCode !== 'string' || !/^[a-z][a-z0-9_]{1,47}$/.test(itemCode) ||
        !Number.isInteger(quantity) || quantity < 1 || quantity > 1000 ||
        !isPlainObject(metadata)) {
      return res.status(400).json({ ok: false, error: 'INVALID_INVENTORY_ITEM' });
    }
    await client.query('BEGIN');
    const character = await client.query('SELECT id FROM rp_characters WHERE id = $1 FOR UPDATE', [req.params.characterId]);
    if (!character.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'CHARACTER_NOT_FOUND' });
    }
    const catalog = await client.query('SELECT stackable, display_name FROM rp_items WHERE item_code = $1', [itemCode]);
    if (!catalog.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'UNKNOWN_ITEM' });
    }
    if (!catalog.rows[0].stackable && quantity !== 1) {
      await client.query('ROLLBACK');
      return res.status(400).json({ ok: false, error: 'NON_STACKABLE_QUANTITY_MUST_BE_ONE' });
    }

    let item;
    if (catalog.rows[0].stackable) {
      const found = await client.query(
        `SELECT * FROM rp_character_inventory
          WHERE character_id = $1 AND item_code = $2 AND metadata = $3::jsonb
          ORDER BY created_at LIMIT 1 FOR UPDATE`,
        [req.params.characterId, itemCode, JSON.stringify(metadata)]
      );
      if (found.rowCount) {
        if (found.rows[0].quantity + quantity > 1000000) {
          await client.query('ROLLBACK');
          return res.status(409).json({ ok: false, error: 'ITEM_QUANTITY_LIMIT' });
        }
        const updated = await client.query(
          `UPDATE rp_character_inventory SET quantity = quantity + $2, updated_at = now()
            WHERE id = $1 RETURNING id, item_code, quantity, metadata, updated_at`,
          [found.rows[0].id, quantity]
        );
        item = updated.rows[0];
      } else {
        const inserted = await client.query(
          `INSERT INTO rp_character_inventory (character_id, item_code, quantity, metadata)
           VALUES ($1, $2, $3, $4::jsonb)
           RETURNING id, item_code, quantity, metadata, updated_at`,
          [req.params.characterId, itemCode, quantity, JSON.stringify(metadata)]
        );
        item = inserted.rows[0];
      }
    } else {
      const inserted = await client.query(
        `INSERT INTO rp_character_inventory (character_id, item_code, quantity, metadata)
         VALUES ($1, $2, 1, $3::jsonb)
         RETURNING id, item_code, quantity, metadata, updated_at`,
        [req.params.characterId, itemCode, JSON.stringify(metadata)]
      );
      item = inserted.rows[0];
    }
    await client.query('COMMIT');
    res.status(201).json({
      ok: true,
      item: { id: item.id, itemCode: item.item_code, displayName: catalog.rows[0].display_name,
        quantity: item.quantity, metadata: item.metadata, updatedAt: item.updated_at }
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    next(error);
  } finally { client.release(); }
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
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
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
