import { RateLimitError } from "../../lib/rateLimit.js";
import { AuthServiceError } from "../../services/auth/authErrors.js";

export const sendAuthError = (res, error, fallbackMessage) => {
  if (error instanceof AuthServiceError) {
    const body = { error: error.message };
    if (error.code) body.code = error.code;
    return res.status(error.status).json(body);
  }
  if (error instanceof RateLimitError) {
    return res.status(error.status).json({
      code: "RATE_LIMITED",
      error: error.message,
      retryAfterSec: error.retryAfterSec,
    });
  }
  console.error(error);
  return res.status(500).json({ error: fallbackMessage });
};

export const handleAuthRoute = (handler, fallbackMessage) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    sendAuthError(res, error, fallbackMessage);
  }
};
