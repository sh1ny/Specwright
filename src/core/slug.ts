export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug.length > 0 ? slug : "change";
}

export function nextChangeId(existingIds: Iterable<string>): string {
  let maxId = 0;
  for (const id of existingIds) {
    if (/^\d{4}$/.test(id)) {
      maxId = Math.max(maxId, Number(id));
    }
  }

  return String(maxId + 1).padStart(4, "0");
}
