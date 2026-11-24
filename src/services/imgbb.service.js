const IMGBB_UPLOAD_URL = "https://api.imgbb.com/1/upload";

export const uploadImage = async (base64Image, name) => {
  const apiKey = process.env.IMGBB_API_KEY;
  if (!apiKey) {
    throw new Error("IMGBB_API_KEY is not configured");
  }

  const body = new URLSearchParams({
    key: apiKey,
    image: base64Image,
  });
  if (name) body.set("name", name);

  const response = await fetch(IMGBB_UPLOAD_URL, {
    method: "POST",
    body,
  });
  const result = await response.json();

  if (!response.ok || !result.success) {
    throw new Error(result?.error?.message || "Image upload failed");
  }

  return {
    url: result.data.url,
    displayUrl: result.data.display_url,
    deleteUrl: result.data.delete_url,
  };
};
