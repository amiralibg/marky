/**
 * Lightweight line-level diff using a simplified LCS (Longest Common Subsequence) approach.
 * No external dependencies.
 *
 * Returns an array of { type: 'equal' | 'add' | 'remove', line: string } objects.
 *
 * Convention (snapshot → current):
 *   - 'remove' = line exists in oldText but not newText (will be lost on restore)
 *   - 'add'    = line exists in newText but not oldText (will be gained on restore)
 *   - 'equal'  = line is identical in both
 */

/**
 * Compute the diff between two strings, line by line.
 * @param {string} oldText - The "old" text (current note content).
 * @param {string} newText - The "new" text (snapshot content).
 * @returns {Array<{type: 'equal'|'add'|'remove', line: string}>}
 */
export function computeLineDiff(oldText, newText) {
  if (oldText === newText) return [];

  const oldLines = (oldText || "").split("\n");
  const newLines = (newText || "").split("\n");

  const m = oldLines.length;
  const n = newLines.length;

  // Build LCS table
  // Use Uint16Array for memory efficiency when possible; fall back to regular arrays for large files
  const createRow = (len) => (len <= 65535 ? new Uint16Array(len + 1) : new Array(len + 1).fill(0));

  const dp = [];
  for (let i = 0; i <= m; i++) {
    dp[i] = createRow(n);
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to build diff
  const result = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.push({ type: "equal", line: oldLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ type: "add", line: newLines[j - 1] });
      j--;
    } else {
      result.push({ type: "remove", line: oldLines[i - 1] });
      i--;
    }
  }

  result.reverse();
  return result;
}
