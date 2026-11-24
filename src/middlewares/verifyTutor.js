export const verifyTutor = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
  }

  if (req.user.role !== "tutor") {
    return res.status(403).json({
      success: false,
      message: "Tutor access required",
    });
  }

  return next();
};
