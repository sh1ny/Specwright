export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug.length > 0 ? slug : "change";
}

export function nextChangeId(existingIds: Iterable<string>): string {
  return nextPrefixedId(existingIds, "", 4);
}

export function nextPrefixedId(existingIds: Iterable<string>, prefix: string, width: number): string {
  const pattern = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\d{${width}}$`);
  let maxId = 0;
  for (const id of existingIds) {
    if (pattern.test(id)) {
      const numeric = Number(id.slice(prefix.length));
      maxId = Math.max(maxId, numeric);
    }
  }
  const next = maxId + 1;
  const limit = Math.pow(10, width) - 1;
  if (next > limit) {
    const displayPrefix = prefix ? `${prefix.toUpperCase()} ` : "";
    throw new Error(`${displayPrefix}ID overflow: maximum of ${limit} ${displayPrefix.toLowerCase().trim() || "ID"}s reached.`);
  }
  return `${prefix}${String(next).padStart(width, "0")}`;
}

export function nextRoadmapId(existingIds: Iterable<string>): string {
  return nextPrefixedId(existingIds, "R", 3);
}

export function nextMilestoneId(existingIds: Iterable<string>): string {
  return nextPrefixedId(existingIds, "M", 3);
}

export function nextProgressId(existingIds: Iterable<string>): string {
  return nextPrefixedId(existingIds, "P", 4);
}

export function nextLearningId(existingIds: Iterable<string>): string {
  return nextPrefixedId(existingIds, "L", 4);
}
