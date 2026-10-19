const MIN_JWT_SECRET_LENGTH = 32;

function secretLooksLikePlaceholder(value) {
  return /^(replace|change|example|development|your)[-_ ]/i.test(value);
}

export function getJwtSecrets(env = process.env) {
  const access = env.JWT_ACCESS_SECRET;
  const refresh = env.JWT_REFRESH_SECRET;

  for (const [name, value] of [
    ["JWT_ACCESS_SECRET", access],
    ["JWT_REFRESH_SECRET", refresh],
  ]) {
    if (typeof value !== "string" || value.length < MIN_JWT_SECRET_LENGTH || secretLooksLikePlaceholder(value)) {
      throw new Error(`${name} must be configured with a non-placeholder secret of at least ${MIN_JWT_SECRET_LENGTH} characters.`);
    }
  }
  if (access === refresh) {
    throw new Error("JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different.");
  }
  return { access, refresh };
}

export function getAppOrigin(env = process.env) {
  const value = env.APP_ORIGIN || (env.NODE_ENV === "production" ? "" : "http://localhost:3000");
  if (!value) throw new Error("APP_ORIGIN must be configured in production.");

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("APP_ORIGIN must be an exact origin such as https://shop.example.com.");
  }

  if (parsed.origin !== value || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error("APP_ORIGIN must contain only the exact origin, with no path, query, or credentials.");
  }
  if (env.NODE_ENV === "production" && parsed.protocol !== "https:") {
    throw new Error("APP_ORIGIN must use HTTPS in production.");
  }
  return parsed.origin;
}

export function getRefreshCookieOptions(env = process.env) {
  const production = env.NODE_ENV === "production";
  const configuredSameSite = String(env.COOKIE_SAME_SITE || "lax").toLowerCase();
  if (!["strict", "lax", "none"].includes(configuredSameSite)) {
    throw new Error("COOKIE_SAME_SITE must be Strict, Lax, or None.");
  }

  const secure = production || env.COOKIE_SECURE === "true";
  if (configuredSameSite === "none" && !secure) {
    throw new Error("COOKIE_SECURE=true is required when COOKIE_SAME_SITE=None.");
  }
  return {
    httpOnly: true,
    secure,
    sameSite: configuredSameSite,
    path: "/api/auth",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  };
}

export function isAllowedRequestOrigin(origin, expectedOrigin) {
  return typeof origin === "string" && origin === expectedOrigin;
}
