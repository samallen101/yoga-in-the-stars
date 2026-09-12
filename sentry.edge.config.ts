import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === "production",
  tracesSampleRate: 0,
  sendDefaultPii: false,
  // "You need to be signed in" and "you are not allowed" are expected outcomes
  // (an expired session mid-form, a bookmarked admin link), not bugs.
  ignoreErrors: ["UNAUTHENTICATED", "FORBIDDEN"],
});
