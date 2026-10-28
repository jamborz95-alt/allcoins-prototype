import { config } from './config.js';

async function call(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(`${config.allcoinsApiUrl}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.allcoinsApiKey}`,
        ...(options.headers ?? {})
      }
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.ok !== true) {
      const error = new Error(body.error ?? `ALLCOINS API returned HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return body;
  } finally {
    clearTimeout(timeout);
  }
}

// These internal routes must be implemented and audited in the main ALLCOINS backend before enabling wallet actions.
export function getBalance(telegramUserId) {
  return call(`/api/internal/rp/wallet/balance?telegramUserId=${encodeURIComponent(telegramUserId)}`);
}

export function createTransaction(payload) {
  return call('/api/internal/rp/wallet/transactions', {
    method: 'POST',
    headers: { 'idempotency-key': payload.idempotencyKey },
    body: JSON.stringify(payload)
  });
}
