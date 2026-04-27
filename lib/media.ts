export function getYouTubeId(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtu.be")) {
      return parsed.pathname.replace("/", "");
    }

    if (parsed.hostname.includes("youtube.com")) {
      return parsed.searchParams.get("v") ?? parsed.pathname.split("/").filter(Boolean).pop() ?? null;
    }
  } catch {
    return null;
  }

  return null;
}

export function getYouTubeThumbnail(url: string) {
  const id = getYouTubeId(url);
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
}
