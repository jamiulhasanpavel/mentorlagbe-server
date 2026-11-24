import { toNodeHandler } from "better-auth/node";
import { createAuth } from "../config/auth.js";

export const mountAuthRoutes = (app, db) => {
  const auth = createAuth(db);
  const handler = toNodeHandler(auth);

  app.use((req, res, next) => {
    if (!req.originalUrl.startsWith("/api/auth")) {
      return next();
    }

    return handler(req, res);
  });
};
