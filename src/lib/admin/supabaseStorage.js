import path from "path";
import { createClient } from "@supabase/supabase-js";
import { env } from "../../config/env.js";

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
const BUCKET = "images";

export const uploadItemImage = async (file) => {
  const fileName = `item-${Date.now()}${path.extname(file.originalname)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(fileName, file.buffer, {
    contentType: file.mimetype,
    upsert: true,
  });
  if (error) throw error;

  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(fileName);
  return publicUrl;
};

export const removeItemImageByUrl = async (iconUrl) => {
  if (!iconUrl || !iconUrl.includes("supabase.co")) return;
  const fileName = iconUrl.split("/").pop();
  await supabase.storage.from(BUCKET).remove([fileName]);
};
