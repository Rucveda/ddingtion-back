import { PostServiceError } from "../../services/posts/postErrors.js";

export const sendPostError = (res, error, fallbackMessage) => {
  if (error instanceof PostServiceError) {
    return res.status(error.status).json({ error: error.message });
  }
  console.error(error);
  return res.status(500).json({ error: fallbackMessage });
};

export const handlePostRoute = (handler, fallbackMessage) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    sendPostError(res, error, fallbackMessage);
  }
};
