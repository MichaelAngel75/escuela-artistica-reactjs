// Google OAuth Authentication
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.ACADEMY_DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.ACADEMY_SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.ACADEMY_NODE_ENV === "production",
      maxAge: sessionTtl,
    },
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  // Validate required environment variables
  if (!process.env.ACADEMY_GOOGLE_CLIENT_ID || !process.env.ACADEMY_GOOGLE_CLIENT_SECRET) {
    console.error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET environment variables");
    throw new Error("Google OAuth credentials not configured");
  }

  // Configure Google OAuth Strategy
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.ACADEMY_GOOGLE_CLIENT_ID,
        clientSecret: process.env.ACADEMY_GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.ACADEMY_GOOGLE_CALLBACK_URL || "/api/callback",
        scope: ["profile", "email"],
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          // Extract user info from Google profile
          const userData = {
            id: profile.id,
            email: profile.emails?.[0]?.value || null,
            firstName: profile.name?.givenName || null,
            lastName: profile.name?.familyName || null,
            profileImageUrl: profile.photos?.[0]?.value || null,
          };

          // Upsert user in database
          await storage.upsertUser(userData);

          // Create session user object
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
            expires_at: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
          };

          done(null, sessionUser);
        } catch (error) {
          done(error as Error);
        }
      }
    )
  );

  // Serialize user to session
  passport.serializeUser((user: Express.User, done) => {
    done(null, user);
  });

  // Deserialize user from session
  passport.deserializeUser((user: Express.User, done) => {
    done(null, user);
  });

  // Login route - redirects to Google
  app.get("/api/login", passport.authenticate("google", {
    scope: ["profile", "email"],
    prompt: "select_account",
  }));

  // OAuth callback route
  app.get("/api/callback", 
    passport.authenticate("google", {
      failureRedirect: "/api/login",
    }),
    (req, res) => {
      // Successful authentication, redirect to home
      res.redirect("/");
    }
  );

  // Logout route
  app.get("/api/logout", (req, res) => {
    req.logout((err) => {
      if (err) {
        console.error("Logout error:", err);
      }
      res.redirect("/");
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const user = req.user as any;
  
  // Check if session has expired (optional - Google tokens are long-lived)
  if (user.expires_at) {
    const now = Math.floor(Date.now() / 1000);
    if (now > user.expires_at) {
      // Session expired, but we can still allow if user is authenticated
      // In a production app, you might want to refresh the token here
      user.expires_at = Math.floor(Date.now() / 1000) + 3600;
    }
  }

  return next();
};
