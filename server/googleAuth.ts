import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";
import { getPool } from "./db";

export async function getSession() {
  console.log(" :: debug :: googleAuth.getSession() : ");
  const sessionTtl = 24 * 60 * 60;
  const pgStore = connectPg(session);
  const pool = await getPool();
  const isProd = process.env.ACADEMY_NODE_ENV === "production";

  const sessionStore = new pgStore({
    pool,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
    schemaName: process.env.ACADEMY_DB_SCHEMA
  });

  return session({
    secret: process.env.ACADEMY_SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    proxy: isProd,           // important behind ALB/CloudFront
    cookie: {
      httpOnly: true,
      secure: isProd,          // must be true on HTTPS,
      sameSite: isProd? "none": "lax",     // good default for OAuth redirects: "lax"
      maxAge: sessionTtl * 1000,  // (milliseconds) keep consistent
    },    
  });  
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  const sessionMiddleware = await getSession();
  app.use(sessionMiddleware);
  // app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  if (
    !process.env.ACADEMY_GOOGLE_CLIENT_ID ||
    !process.env.ACADEMY_GOOGLE_CLIENT_SECRET
  ) {
    console.error(
      "Missing ACADEMY_GOOGLE_CLIENT_ID or ACADEMY_GOOGLE_CLIENT_SECRET",
    );
    throw new Error("Google OAuth credentials not configured");
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.ACADEMY_GOOGLE_CLIENT_ID,
        clientSecret: process.env.ACADEMY_GOOGLE_CLIENT_SECRET,
        // IMPORTANT: this must match your Google console redirect URI
        callbackURL:
          process.env.ACADEMY_GOOGLE_CALLBACK_URL ||
          "http://localhost:5000/api/auth/google/callback",
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const userData = {
            id: profile.id,
            email: profile.emails?.[0]?.value || null,
            firstName: profile.name?.givenName || null,
            lastName: profile.name?.familyName || null,
            profileImageUrl: profile.photos?.[0]?.value || null,
          };

          await storage.upsertUser(userData);

          const sessionUser = {
            claims: {
              sub: profile.id,
              email: userData.email,
              first_name: userData.firstName,
              last_name: userData.lastName,
              profile_image_url: userData.profileImageUrl,
            },
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
          };

          done(null, sessionUser);
        } catch (err) {
          done(err as Error);
        }
      },
    ),
  );

  passport.serializeUser((user: Express.User, done) => {
    done(null, user);
  });

  passport.deserializeUser((user: Express.User, done) => {
    done(null, user);
  });

  // Start Google OAuth
  app.get(
    "/api/login",
    passport.authenticate("google", {
      scope: ["profile", "email"],
      prompt: "select_account",
    }),
  );

  // ✅ Google redirect URI handler
  app.get(
    "/api/auth/google/callback",
    passport.authenticate("google", {
      failureRedirect: "/login", // front-end route
    }),
    (req, res) => {
      // ✅ After successful login, send user to a valid SPA route
      res.redirect("/dashboard");
    },
  );

  app.get("/api/logout", (req, res) => {
    req.logout((err) => {
      if (err) {
        console.error("Logout error:", err);
      }
      res.redirect("/login");
    });
  });
}

// unchanged
export const isAuthenticated: RequestHandler = (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  return next();
};
