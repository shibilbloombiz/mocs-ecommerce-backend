module.exports =
  (schema, key = "body") =>
  (req, _res, next) => {
    const result = schema.safeParse(req[key]);
    if (!result.success) {
      const err = new Error(result.error.issues.map((i) => i.message).join(", "));
      err.status = 400;
      return next(err);
    }
    req[key] = result.data;
    next();
  };
