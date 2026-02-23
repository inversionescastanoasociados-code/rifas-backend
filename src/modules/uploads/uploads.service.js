const multer = require('multer');
const fs = require('fs');
const path = require('path');

const STORAGE_DIR = path.join(process.cwd(), 'storage');

// Ensure storage directory exists
try {
	if (!fs.existsSync(STORAGE_DIR)) {
		fs.mkdirSync(STORAGE_DIR, { recursive: true });
	}
} catch (err) {
	throw err;
}

const storage = multer.diskStorage({
	destination: function (req, file, cb) {
		cb(null, STORAGE_DIR);
	},
	filename: function (req, file, cb) {
		const ext = (file.originalname && file.originalname.includes('.')) ? file.originalname.split('.').pop() : '';
		const timestamp = Date.now();
		const safeExt = ext ? `.${ext}` : '';
		cb(null, `rifa-${timestamp}${safeExt}`);
	}
});

const allowedExt = ['.jpg', '.jpeg', '.png', '.webp'];

const fileFilter = (req, file, cb) => {
	const ext = (file.originalname && file.originalname.includes('.')) ? `.${file.originalname.split('.').pop()}`.toLowerCase() : '';
	if (allowedExt.includes(ext)) {
		cb(null, true);
	} else {
		cb(new Error('Invalid file type'));
	}
};

const upload = multer({
	storage,
	limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
	fileFilter
});

module.exports = upload;

