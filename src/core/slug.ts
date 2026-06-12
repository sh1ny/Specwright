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

  const next = maxId + 1;
  if (next > 9999) {
    throw new Error("Change ID overflow: maximum of 9999 changes reached.");
  }
  return String(next).padStart(4, "0");
}
