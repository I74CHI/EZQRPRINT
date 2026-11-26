export function getShopPortalUrl(
  origin: string,
  basePath: string,
  slug: string,
) {
  const safeOrigin = origin || (typeof window !== "undefined" ? window.location.origin : "");
  const normalizedBase = basePath.endsWith("/") ? basePath : `${basePath}/`;
  return `${safeOrigin}${normalizedBase}#/s/${slug}`;
}
