const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config/env');

const hashPassword = async (password) => {
  return bcrypt.hash(password, config.security.bcryptRounds);
};

const comparePassword = async (password, hashedPassword) => {
  return bcrypt.compare(password, hashedPassword);
};

const generateToken = (payload) => {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn
  });
};

const verifyToken = (token) => {
  return jwt.verify(token, config.jwt.secret);
};

module.exports = {
  hashPassword,
  comparePassword,
  generateToken,
  verifyToken
};
