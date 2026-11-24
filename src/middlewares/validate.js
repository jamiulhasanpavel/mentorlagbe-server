export const validate = (schema, source = "body") => (req, res, next) => {
  const parsed = schema.safeParse(req[source]);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: "Invalid request data",
      errors: parsed.error.flatten(),
    });
  }

  req[source] = parsed.data;
  return next();
};
