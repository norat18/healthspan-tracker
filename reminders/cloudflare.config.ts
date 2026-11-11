import { bindings, defineConfig, triggers } from "cf/config";

export default defineConfig({
  worker: {
    name: "healthspan-reminders",
    entrypoint: "./src/index.js",
    compatibilityDate: "2026-10-01",
    env: {
      DB: bindings.d1({ name: "healthspan-reminders" }),
      FIREBASE_PROJECT_ID: bindings.text("healthspan-tracker-app"),
      ALLOWED_ORIGINS: bindings.text("https://healthspantracker.web.app,https://healthspantracker.pages.dev"),
      VAPID_PUBLIC_KEY: bindings.text(process.env.VAPID_PUBLIC_KEY ?? ""),
      VAPID_PRIVATE_JWK: bindings.secret(),
    },
    // Every day at 16:00 UTC (8–9 am Pacific, 11 am–noon Eastern).
    triggers: [triggers.scheduled({ schedule: "0 16 * * *" })],
  },
});
