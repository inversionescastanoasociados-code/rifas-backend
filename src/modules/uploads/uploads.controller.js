const logger = require('../../utils/logger');
const fs = require('fs');
const path = require('path');
const { query } = require('../../db/pool');

// Crear tabla si no existe (se ejecuta al importar el módulo)
(async () => {
	try {
		await query(`
			CREATE TABLE IF NOT EXISTS imagenes_storage (
				id SERIAL PRIMARY KEY,
				filename VARCHAR(500) UNIQUE NOT NULL,
				mime_type VARCHAR(100) NOT NULL DEFAULT 'image/jpeg',
				data TEXT NOT NULL,
				created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
			)
		`);
		logger.info('imagenes_storage table ready');
	} catch (err) {
		logger.error('Error creating imagenes_storage table:', err.message);
	}
})();

/**
 * Guardar imagen en la base de datos como base64
 */
async function guardarImagenEnDB(filename, filePath, mimeType) {
	try {
		const fileBuffer = fs.readFileSync(filePath);
		const base64 = fileBuffer.toString('base64');
		await query(
			`INSERT INTO imagenes_storage (filename, mime_type, data)
			 VALUES ($1, $2, $3)
			 ON CONFLICT (filename) DO UPDATE SET data = $3, mime_type = $2`,
			[filename, mimeType || 'image/jpeg', base64]
		);
		logger.info(`Imagen guardada en DB: ${filename}`);
	} catch (err) {
		logger.error(`Error guardando imagen en DB (${filename}):`, err.message);
	}
}

/**
 * Subir imagen: guarda en filesystem + base de datos
 */
const subirImagen = async (req, res) => {
	try {
		if (!req.file) {
			return res.status(400).json({
				ok: false,
				message: 'No se recibió ninguna imagen'
			});
		}

		const protocol = req.protocol;
		const host = req.get('host');
		const filename = req.file.filename;
		const url = `${protocol}://${host}/storage/${filename}`;

		// Guardar en DB como respaldo persistente
		const filePath = req.file.path;
		const mimeType = req.file.mimetype || 'image/jpeg';
		await guardarImagenEnDB(filename, filePath, mimeType);

		return res.json({ ok: true, url });
	} catch (err) {
		logger.error('Error al subir imagen:', err.message);
		return res.status(500).json({ ok: false, message: 'Error interno al procesar la imagen' });
	}
};

/**
 * Servir imagen: intenta filesystem primero, si no existe la busca en la DB
 * y la restaura al filesystem para futuras peticiones.
 */
const servirImagen = async (req, res) => {
	const { filename } = req.params;

	if (!filename || filename.includes('..')) {
		return res.status(400).json({ ok: false, message: 'Filename inválido' });
	}

	const STORAGE_DIR = path.join(process.cwd(), 'storage');
	const filePath = path.join(STORAGE_DIR, filename);

	// 1) Si existe en filesystem, servir directamente
	if (fs.existsSync(filePath)) {
		return res.sendFile(filePath);
	}

	// 2) Buscar en la base de datos
	try {
		const result = await query(
			'SELECT data, mime_type FROM imagenes_storage WHERE filename = $1',
			[filename]
		);

		if (result.rows.length === 0) {
			return res.status(404).json({ ok: false, message: 'Imagen no encontrada' });
		}

		const { data, mime_type } = result.rows[0];
		const buffer = Buffer.from(data, 'base64');

		// Restaurar al filesystem para futuras peticiones
		try {
			if (!fs.existsSync(STORAGE_DIR)) {
				fs.mkdirSync(STORAGE_DIR, { recursive: true });
			}
			fs.writeFileSync(filePath, buffer);
			logger.info(`Imagen restaurada desde DB al filesystem: ${filename}`);
		} catch (writeErr) {
			logger.warn(`No se pudo restaurar imagen al filesystem: ${writeErr.message}`);
		}

		res.set('Content-Type', mime_type || 'image/jpeg');
		res.set('Cache-Control', 'public, max-age=31536000');
		return res.send(buffer);
	} catch (err) {
		logger.error(`Error sirviendo imagen ${filename} desde DB:`, err.message);
		return res.status(500).json({ ok: false, message: 'Error al obtener imagen' });
	}
};

/**
 * Sincronizar imágenes existentes del filesystem a la DB (se ejecuta al inicio)
 */
async function sincronizarImagenesExistentes() {
	try {
		const STORAGE_DIR = path.join(process.cwd(), 'storage');
		if (!fs.existsSync(STORAGE_DIR)) return;

		const files = fs.readdirSync(STORAGE_DIR);
		const imageExts = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

		for (const file of files) {
			const ext = path.extname(file).toLowerCase();
			if (!imageExts.includes(ext)) continue;

			// Verificar si ya está en DB
			const exists = await query(
				'SELECT 1 FROM imagenes_storage WHERE filename = $1',
				[file]
			);

			if (exists.rows.length === 0) {
				const filePath = path.join(STORAGE_DIR, file);
				const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };
				await guardarImagenEnDB(file, filePath, mimeMap[ext] || 'image/jpeg');
			}
		}

		logger.info(`Sincronización de imágenes completada`);
	} catch (err) {
		logger.error('Error sincronizando imágenes:', err.message);
	}
}

// Ejecutar sincronización al iniciar
setTimeout(() => sincronizarImagenesExistentes(), 5000);

module.exports = {
	subirImagen,
	servirImagen
};

