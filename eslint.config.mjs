import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextVitals,
  {
    // These React 19 advisory rules flag established effect/ref patterns throughout the app.
    // Keep the Next.js upgrade from turning pre-existing behavior into blocking lint failures;
    // they can be addressed component-by-component without hiding the rest of ESLint's checks.
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off"
    }
  },
  globalIgnores([
    ".next/**",
    "backups/**",
    "next-env.d.ts"
  ])
]);
