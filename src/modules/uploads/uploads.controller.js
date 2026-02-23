const logger = require('../../utils/logger');

const subirImagen = (req, res) => {
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

		return res.json({ ok: true, url });
	} catch (err) {
		logger.error('Error al subir imagen:', err.message);
		return res.status(500).json({ ok: false, message: 'Error interno al procesar la imagen' });
	}
};

module.exports = {
	subirImagen
};

