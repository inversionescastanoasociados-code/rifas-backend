const authService = require('./auth.service');
const logger = require('../../utils/logger');

class AuthController {
  async login(req, res) {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Email and password are required'
        });
      }
      
      const result = await authService.login(email, password);
      
      res.status(200).json({
        success: true,
        message: 'Login successful',
        data: {
          token: result.token,
          user: {
            id: result.user.id,
            email: result.user.email,
            nombre: result.user.nombre,
            rol: result.user.rol
          }
        }
      });
    } catch (error) {
      logger.error('Error in login controller:', error);
      res.status(401).json({
        success: false,
        message: error.message || 'Login failed'
      });
    }
  }
}

module.exports = new AuthController();
