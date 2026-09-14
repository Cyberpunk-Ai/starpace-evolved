/**
 * Posts can carry one or many attachments while the database still keeps a
 * single `media_url` column. One attachment is stored as a plain URL; several
 * are stored as a JSON array, so older posts keep rendering unchanged.
 */

export function parseMediaList(value?: string | null): string[] {
  const raw = (value ?? "").trim();
  if (!raw) return [];
  if (raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((v) => String(v)).filter(Boolean);
      }
    } catch {
      /* fall through to the single-url case */
    }
  }
  return [raw];
}

export function serializeMediaList(urls: string[]): string | undefined {
  const clean = urls.filter(Boolean);
  if (clean.length === 0) return undefined;
  if (clean.length === 1) return clean[0];
  return JSON.stringify(clean);
}

export function isVideoUrl(url?: string | null): boolean {
  const value = (url ?? "").split("?")[0]?.toLowerCase() ?? "";
  if (value.startsWith("data:video")) return true;
  return /\.(mp4|webm|mov|m4v|ogv)$/.test(value);
}
