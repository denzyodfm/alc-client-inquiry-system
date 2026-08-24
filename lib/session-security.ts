const DEVELOPMENT_SESSION_SECRET = "development-only-secret-change-me";
const MINIMUM_SESSION_SECRET_LENGTH = 32;

export function sessionSecret(environment: NodeJS.ProcessEnv = process.env) {
  const configured = environment.SESSION_SECRET?.trim();

  if (configured && configured.length >= MINIMUM_SESSION_SECRET_LENGTH) return configured;

  if (environment.NODE_ENV === "production") {
    throw new Error(`SESSION_SECRET must be configured with at least ${MINIMUM_SESSION_SECRET_LENGTH} characters in production.`);
  }

  return configured || DEVELOPMENT_SESSION_SECRET;
}

export const sessionSecurity = {
  minimumSecretLength: MINIMUM_SESSION_SECRET_LENGTH
} as const;
