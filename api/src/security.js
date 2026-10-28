import crypto from 'node:crypto';
import { config } from './config.js';

function safeEqual(a, b) {
  const left = Buffer.from(String(a ?? ''), 'utf8');
  const right = Buffer.from(String(b ?? ''), 'utf8');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function requireGameServer(req, res, next) {
  if (!safeEqual(req.get('x-rp-server-key'), config.serverKey)) {
    return res.status(401).json({ ok: false, error: 'UNAUTHORIZED_GAME_SERVER' });
  }
  next();
}

export function requireAllcoinsBackend(req, res, next) {
  if (!safeEqual(req.get('x-allcoins-internal-key'), config.internalKey)) {
    return res.status(401).json({ ok: false, error: 'UNAUTHORIZED_ALLCOINS_BACKEND' });
  }
  next();
}

export function hashCode(code) {
  return crypto.createHash('sha256').update(code, 'utf8').digest('hex');
}

export function newLinkCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(8);
  let result = '';
  for (const byte of bytes) result += alphabet[byte % alphabet.length];
  return result;
}
