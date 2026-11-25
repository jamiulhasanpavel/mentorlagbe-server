import { toNodeHandler } from "better-auth/node";
import { createAuth } from "../config/auth.js";

export const mountAuthRoutes = (app, db) => {
  const auth = createAuth(db);
  const handler = toNodeHandler(auth);

  const demoAccounts = {
    admin: {
      email: "admin@mentorlagbe.com",
      password: process.env.DEMO_ADMIN_PASSWORD,
    },
    tutor: {
      email: "tutor@mentorlagbe.com",
      password: process.env.DEMO_TUTOR_PASSWORD,
    },
    student: {
      email: "student@mentorlagbe.com",
      password: process.env.DEMO_STUDENT_PASSWORD,
    },
  };

  app.post("/api/auth/demo-login", async (req, res, next) => {
    const account = demoAccounts[req.body?.role];
    if (!account) {
      return res.status(400).json({ message: "Invalid demo account." });
    }

    if (!account.password) {
      return res.status(503).json({ message: "Demo login is not configured." });
    }

    try {
      const authResponse = await auth.api.signInEmail({
        body: {
          email: account.email,
          password: account.password,
          rememberMe: true,
        },
        headers: req.headers,
        asResponse: true,
      });

      for (const cookie of authResponse.headers.getSetCookie()) {
        res.append("Set-Cookie", cookie);
      }

      const responseBody = await authResponse.json();
      if (!authResponse.ok) {
        return res.status(authResponse.status).json(responseBody);
      }

      return res.status(authResponse.status).json({ user: responseBody.user });
    } catch (error) {
      return next(error);
    }
  });

  app.use((req, res, next) => {
    if (!req.originalUrl.startsWith("/api/auth")) {
      return next();
    }

    return handler(req, res);
  });
};
