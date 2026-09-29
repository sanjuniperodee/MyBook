export function photoUrl(photoId: string, size: "thumb" | "full" = "thumb") {
  return `/api/photos/${photoId}?size=${size}`;
}
