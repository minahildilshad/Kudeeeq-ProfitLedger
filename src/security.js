import {randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt = promisify(scryptCallback);
export const token = () => randomBytes(32).toString('hex');
export const digest = value => createHash('sha256').update(value).digest('hex');
export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) throw new Error('Use a password containing 12 to 128 characters.');
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64);
  return `${salt}:${hash.toString('hex')}`;
}
export async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || password.length > 128) return false;
  const [salt, encoded] = stored.split(':');
  const hash = await scrypt(password, salt, 64);
  const expected = Buffer.from(encoded, 'hex');
  return hash.length === expected.length && timingSafeEqual(hash, expected);
}
export function sessionToken(req) {
  return (req.headers.cookie || '').split(';').map(v=>v.trim()).find(v=>v.startsWith('kundeeeq_session='))?.slice(17) || '';
}
export function cookie(value, expired=false) {
  return `kundeeeq_session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${expired?0:43200}${process.env.NODE_ENV==='production'?'; Secure':''}`;
}
