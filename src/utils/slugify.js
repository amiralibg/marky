/**
 * Generate a URL-friendly slug from heading text.
 * Used for heading IDs in both the markdown preview and Table of Contents.
 * @param {string} text - The heading text to slugify
 * @returns {string} The slugified ID
 */
export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-');
}
