const { query } = require('../../db/pool');
const { hashPassword } = require('../../utils/crypto');

class AdminUsuariosService {
  async listarAdmins() {
    const result = await query(`
      SELECT id, email, nombre, activo, ultimo_login, created_at, updated_at
      FROM usuarios
      WHERE rol = 'ADMIN'
      ORDER BY nombre ASC, email ASC
    `);
    return result.rows;
  }

  async obtenerAdmin(id) {
    const result = await query(`
      SELECT id, email, nombre, activo, ultimo_login, created_at, updated_at
      FROM usuarios
      WHERE id = $1::uuid AND rol = 'ADMIN'
    `, [id]);
    if (!result.rows[0]) {
      const err = new Error('Administrador no encontrado');
      err.statusCode = 404;
      throw err;
    }
    return result.rows[0];
  }

  async crearAdmin({ email, password, nombre }) {
    const emailNorm = String(email).trim().toLowerCase();
    const dup = await query(
      'SELECT id FROM usuarios WHERE LOWER(email) = $1',
      [emailNorm]
    );
    if (dup.rows.length > 0) {
      const err = new Error('Ya existe un usuario con ese correo');
      err.statusCode = 409;
      throw err;
    }

    const passwordHash = await hashPassword(password);
    const result = await query(`
      INSERT INTO usuarios (email, password_hash, nombre, rol, activo)
      VALUES ($1, $2, $3, 'ADMIN', true)
      RETURNING id, email, nombre, activo, ultimo_login, created_at, updated_at
    `, [emailNorm, passwordHash, String(nombre).trim()]);

    return result.rows[0];
  }

  async actualizarAdmin(id, { email, password, nombre, activo }) {
    await this.obtenerAdmin(id);

    const fields = [];
    const params = [];
    let p = 0;

    if (nombre !== undefined) {
      p++;
      fields.push(`nombre = $${p}`);
      params.push(String(nombre).trim());
    }

    if (email !== undefined) {
      const emailNorm = String(email).trim().toLowerCase();
      const dup = await query(
        'SELECT id FROM usuarios WHERE LOWER(email) = $1 AND id <> $2::uuid',
        [emailNorm, id]
      );
      if (dup.rows.length > 0) {
        const err = new Error('Ya existe otro usuario con ese correo');
        err.statusCode = 409;
        throw err;
      }
      p++;
      fields.push(`email = $${p}`);
      params.push(emailNorm);
    }

    if (password !== undefined && String(password).length > 0) {
      const passwordHash = await hashPassword(password);
      p++;
      fields.push(`password_hash = $${p}`);
      params.push(passwordHash);
    }

    if (activo !== undefined) {
      p++;
      fields.push(`activo = $${p}`);
      params.push(!!activo);
    }

    if (fields.length === 0) {
      const err = new Error('No hay campos para actualizar');
      err.statusCode = 400;
      throw err;
    }

    p++;
    params.push(id);
    const result = await query(`
      UPDATE usuarios
      SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${p}::uuid AND rol = 'ADMIN'
      RETURNING id, email, nombre, activo, ultimo_login, created_at, updated_at
    `, params);

    return result.rows[0];
  }
}

module.exports = new AdminUsuariosService();
