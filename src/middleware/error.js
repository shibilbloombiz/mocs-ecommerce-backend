exports.notFound = (req, _res, next) => {
  const err = new Error(`Not found - ${req.originalUrl}`);
  err.status = 404;
  next(err);
};

exports.errorHandler = (err, _req, res, _next) => {
  const status = err.status || (res.statusCode === 200 ? 500 : res.statusCode);
  res.status(status).json({
    message: err.message,
    ...(process.env.NODE_ENV === "production" ? {} : { stack: err.stack }),
  });
};
