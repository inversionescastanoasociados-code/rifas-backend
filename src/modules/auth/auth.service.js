const { query } = require('../../db/pool');
const { comparePassword } = require('../../utils/crypto');
const { generateToken } = require('../../utils/crypto');
const logger = require('../../utils/logger');

class AuthService {
  async login(email, password) {
    try {
      // Buscar usuario por email
      const userQuery = `
        SELECT id, email, password_hash, nombre, rol, activo 
        FROM usuarios 
        WHERE email = $1
      `;
      
      const userResult = await query(userQuery, [email]);
      
      if (userResult.rows.length === 0) {
        throw new Error('Invalid credentials');
      }
      
      const user = userResult.rows[0];
      
      // Verificar si el usuario está activo
      if (!user.activo) {
        throw new Error('User account is inactive');
      }
      
      // Verificar contraseña
      const isPasswordValid = await comparePassword(password, user.password_hash);
      
      if (!isPasswordValid) {
        throw new Error('Invalid credentials');
      }
      
      // Generar token JWT
      const token = generateToken({
        id: user.id,
        email: user.email,
        rol: user.rol
      });
      
      // Actualizar último login
      await query(
        'UPDATE usuarios SET ultimo_login = NOW() WHERE id = $1',
        [user.id]
      );
      
      return {
        token,
        user: {
          id: user.id,
          email: user.email,
          nombre: user.nombre,
          rol: user.rol
        }
      };
      
    } catch (error) {
      logger.error('Error in auth service:', error);
      throw error;
    }
  }
}

module.exports = new AuthService();
