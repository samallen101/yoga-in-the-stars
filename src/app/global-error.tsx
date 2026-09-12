"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui", padding: "3rem 1.5rem", textAlign: "center" }}>
        <h1>Something went wrong</h1>
        <p>We have been told about it. Please try again in a moment, or message the team on WhatsApp.</p>
        <button onClick={() => window.location.reload()}>Try again</button>
      </body>
    </html>
  );
}
