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
      VAPID_PUBLIC_KEY: bindings.text("BAw2-rfpCvk0Hm6UMBRBz6aLEJRuDYwMPE_c6yNlqa_aid9VuSLwKvxHqaD6_0YiUXpnBXxgfMrqP4XU5_nsgCk"),   // public by design
      VAPID_PRIVATE_JWK: bindings.secret(),
    },
    // Every hour; each person is notified at 8 am in their own time zone.
    triggers: [triggers.scheduled({ schedule: "0 * * * *" })],
  },
});
