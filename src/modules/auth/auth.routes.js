const express = require('express');
const router = express.Router();
const authController = require('./auth.controller');
const { validate } = require('../../middlewares/validate');
const { loginLimiter } = require('../../middlewares/rateLimiter');
const Joi = require('joi');

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required()
});

router.post('/login', 
  loginLimiter,
  validate(loginSchema), 
  authController.login
);

module.exports = router;
