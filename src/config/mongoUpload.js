const multer = require("multer");

const storage = multer.memoryStorage();

const mongoUpload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    if (!/^image\//.test(file.mimetype)) {
      return cb(new Error("Only image files are allowed"));
    }

    cb(null, true);
  },
});

module.exports = { mongoUpload };
