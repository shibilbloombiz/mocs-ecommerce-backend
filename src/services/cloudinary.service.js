const { cloudinary } = require("../config/cloudinary");

exports.uploadFromUrl = (url, folder = "mocs/uploads") =>
  cloudinary.uploader.upload(url, { folder });

exports.destroy = (publicId) => cloudinary.uploader.destroy(publicId);
