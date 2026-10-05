// Shows every date/time in Philippine time (Asia/Manila), no matter where the server or the
// viewer's computer is. The database stores times in UTC; this converts them for display.
(function (root) {
  const TZ = 'Asia/Manila';

  // "2026-10-04 06:13:00" (UTC from the database) or an ISO string -> Date
  function parse(v) {
    if (!v) return null;
    if (v instanceof Date) return v;
    let s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(s) && !/(Z|[+-]\d{2}:?\d{2})$/i.test(s)) s = s.replace(' ', 'T') + 'Z';
    const d = new Date(s);
    return isNaN(d) ? null : d;
  }
  const fmt = (v, opts) => { const d = parse(v); return d ? d.toLocaleString([], Object.assign({ timeZone: TZ }, opts)) : ''; };

  root.PhTime = {
    TZ,
    parse,
    date: v => fmt(v, { year: 'numeric', month: 'short', day: 'numeric' }),
    dateTime: v => fmt(v, { dateStyle: 'medium', timeStyle: 'short' }),
    time: v => fmt(v, { hour: 'numeric', minute: '2-digit', second: '2-digit' }),
    now: () => new Date()
  };
})(typeof window !== 'undefined' ? window : globalThis);
