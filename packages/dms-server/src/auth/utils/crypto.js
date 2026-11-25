const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dms-dev-secret-change-in-production';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '6h';

const hashPassword = (password) => bcrypt.hashSync(password, 10);

const comparePassword = (password, hash) => bcrypt.compareSync(password, hash);

const signToken = (payload, expiresIn = JWT_EXPIRY) =>
  new Promise((resolve, reject) => {
    jwt.sign(payload, JWT_SECRET, { expiresIn }, (err, token) => {
      if (err) reject(err);
      else resolve(token);
    });
  });

const verifyToken = (token) =>
  new Promise((resolve, reject) => {
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
      if (err) reject('Token cannot be verified');
      else resolve(decoded);
    });
  });

// A login token has to stop working when its user's password changes, so it carries a stamp of the password
// hash it was issued against. It used to carry the hash itself, which anyone holding the token (it lives in
// localStorage and the session cookie) could read and attack offline. The stamp is a keyed hash of it: it
// changes with the password and reveals nothing without the server's secret.
const passwordStamp = (passwordHash) =>
  crypto.createHmac('sha256', JWT_SECRET).update(String(passwordHash)).digest('base64url').slice(0, 22);

const createUserToken = (email, passwordHash, project = null) =>
  signToken({ email: email.toLowerCase(), pw: passwordStamp(passwordHash), project });

/** Was this decoded login token issued against the user's current password? */
const tokenMatchesPassword = (decoded, passwordHash) => {
  if (!decoded || !passwordHash) return false;
  if (decoded.pw) return decoded.pw === passwordStamp(passwordHash);
  // tokens issued before the stamp carry the hash itself; accepted until they expire (JWT_EXPIRY).
  // Remove this branch one release after the stamp ships.
  return decoded.password === passwordHash;
};

const passwordGen = () => {
  const numbers = '0123456789';
  const lowers = 'abcdefghijklmnopqrstuvwxyz';
  const uppers = lowers.toUpperCase();
  const specials = '!@#%&?';
  const pick = (s) => s[Math.floor(Math.random() * s.length)];

  const s = [pick(specials), pick(specials), pick(specials)];
  return [
    ...s,
    pick(numbers), pick(numbers), pick(numbers),
    pick(lowers), pick(uppers), pick(lowers), pick(uppers), pick(lowers),
    pick(numbers), pick(numbers), pick(numbers),
    ...s.reverse()
  ].join('');
};

module.exports = {
  hashPassword,
  comparePassword,
  signToken,
  verifyToken,
  createUserToken,
  tokenMatchesPassword,
  passwordGen,
  JWT_SECRET,
  JWT_EXPIRY,
};
