// Converts a UTC time from the database ("2026-10-04 06:13:00") to Philippine time (UTC+8)
// in the same text format - used for CSV files.
function toPh(v) {
  if (!v) return '';
  const d = new Date(String(v).replace(' ', 'T') + 'Z');
  if (isNaN(d)) return String(v);
  return new Date(d.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');
}
module.exports = { toPh };
