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

const createUserToken = (email, passwordHash, project = null) =>
  signToken({ email: email.toLowerCase(), password: passwordHash, project });

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
  passwordGen,
  JWT_SECRET,
  JWT_EXPIRY,
};
