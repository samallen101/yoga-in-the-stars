import * as Sentry from "@sentry/nextjs";

// Browser-side error reporting. Only errors, no session replay, no performance
// sampling: the club does not need the volume and the free plan has limits.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === "production",
  tracesSampleRate: 0,
  sendDefaultPii: false,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
