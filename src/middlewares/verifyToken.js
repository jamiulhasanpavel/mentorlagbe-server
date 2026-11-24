import jwt from "jsonwebtoken";

export const verifyToken = (req, res, next) => {
  const authorization = req.headers.authorization;
  const bearerToken =
    typeof authorization === "string" && /^Bearer\s+/i.test(authorization)
      ? authorization.replace(/^Bearer\s+/i, "").trim()
      : null;
  const token = bearerToken || req.cookies?.token;

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
  }

  if (!process.env.JWT_SECRET) {
    return res.status(500).json({
      success: false,
      message: "JWT_SECRET is not configured",
    });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    return next();
  } catch (error) {
    const expired = error instanceof jwt.TokenExpiredError;

    return res.status(401).json({
      success: false,
      message: expired ? "Token expired" : "Invalid token",
    });
  }
};
