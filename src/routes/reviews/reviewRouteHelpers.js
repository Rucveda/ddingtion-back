import { ReviewServiceError } from "../../services/reviews/reviewErrors.js";

export const sendReviewError = (res, error, fallbackMessage) => {
  if (error instanceof ReviewServiceError) {
    return res.status(error.status).json({ error: error.message });
  }
  console.error(error);
  return res.status(500).json({ error: fallbackMessage });
};

export const handleReviewRoute = (handler, fallbackMessage) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    sendReviewError(res, error, fallbackMessage);
  }
};
