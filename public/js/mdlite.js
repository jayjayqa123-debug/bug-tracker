// Tiny, SAFE Markdown renderer for ticket descriptions (same style of Markdown Trello uses).
// Everything is HTML-escaped first and only a fixed set of tags is produced, so stored text can
// never inject HTML or scripts. Links are limited to http(s). Bare URLs become clickable links.
(function (root) {
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function anchor(url, innerHtml, editor) {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer"${editor ? ' title="Ctrl+click to open"' : ''}>${innerHtml}</a>`;
  }

  // ---- inline: **bold** *italic* ~~strike~~ `code` [text](url) and bare URLs ----
  function inline(src, editor) {
    const stash = [];
    const keep = html => { stash.push(html); return '\u0000' + (stash.length - 1) + '\u0000'; };

    let s = esc(src);
    s = s.replace(/`([^`\n]+)`/g, (m, c) => keep('<code>' + c + '</code>'));
    s = s.replace(/\\([\\`*_\[\]~#>+\-.!])/g, (m, c) => keep(c));            // \* style escapes -> literal char

    const fmt = t => t
      .replace(/\*\*([^\s*](?:[^*]*[^\s*])?)\*\*/g, '<strong>$1</strong>')
      .replace(/__([^\s_](?:[^_]*[^\s_])?)__/g, '<strong>$1</strong>')
      .replace(/~~([^\s~](?:[^~]*[^\s~])?)~~/g, '<s>$1</s>')
      .replace(/(^|[^*\w])\*([^\s*](?:[^*]*[^\s*])?)\*(?!\*)/g, '$1<em>$2</em>')
      .replace(/(^|[^_\w])_([^\s_](?:[^_]*[^\s_])?)_(?![_\w])/g, '$1<em>$2</em>');

    s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, text, url) => keep(anchor(url, fmt(text), editor)));
    s = s.replace(/(^|[^\w"'=>\u0000])(https?:\/\/(?:(?!&quot;|&lt;|&gt;)[^\s<])+)/g, (m, pre, url) => {
      let tail = '';
      const trim = url.match(/(?:[.,;:!?)\]]|&amp;)+$/);
      if (trim) { tail = trim[0]; url = url.slice(0, -tail.length); }
      return pre + keep(anchor(url, url, editor)) + tail;
    });
    s = fmt(s);

    for (let guard = 0; guard < 5 && /\u0000\d+\u0000/.test(s); guard++) {
      s = s.replace(/\u0000(\d+)\u0000/g, (m, i) => stash[+i]);
    }
    return s;
  }

  const LIST_RE = /^(\s*)([-*+]|\d+\.)\s+(.*)$/;

  function buildList(items, start, indent, editor) {
    const ordered = /\d/.test(items[start].marker);
    let html = ordered ? '<ol>' : '<ul>';
    let i = start;
    while (i < items.length && items[i].indent >= indent) {
      if (items[i].indent > indent) { i++; continue; }
      html += '<li>' + inline(items[i].text, editor);
      i++;
      if (i < items.length && items[i].indent > indent) {
        const nested = buildList(items, i, items[i].indent, editor);
        html += nested.html; i = nested.next;
      }
      html += '</li>';
    }
    return { html: html + (ordered ? '</ol>' : '</ul>'), next: i };
  }

  function toHtml(md, opts) {
    const editor = !!(opts && opts.editor);
    const lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    let i = 0;

    const startsBlock = l => /^(#{1,6})\s+/.test(l) || /^```/.test(l) || /^>\s?/.test(l) || LIST_RE.test(l) ||
      /^\s*([-*_])(\s*\1){2,}\s*$/.test(l);

    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }

      if (/^```/.test(line)) {
        const code = []; i++;
        while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
        i++;
        out.push('<pre><code>' + esc(code.join('\n')) + '</code></pre>');
        continue;
      }
      let m = /^(#{1,6})\s+(.*)$/.exec(line);
      if (m) { out.push(`<h${m[1].length}>${inline(m[2].trim(), editor)}</h${m[1].length}>`); i++; continue; }

      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { out.push('<hr>'); i++; continue; }

      if (/^>\s?/.test(line)) {
        const q = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, ''));
        out.push('<blockquote>' + toHtml(q.join('\n'), opts) + '</blockquote>');
        continue;
      }

      if (LIST_RE.test(line)) {
        const items = [];
        while (i < lines.length && LIST_RE.test(lines[i])) {
          const lm = LIST_RE.exec(lines[i++]);
          items.push({ indent: lm[1].replace(/\t/g, '  ').length, marker: lm[2], text: lm[3] });
        }
        const base = Math.min(...items.map(x => x.indent));
        let k = 0;
        while (k < items.length) {
          const res = buildList(items, k, items[k].indent === base ? base : items[k].indent, editor);
          out.push(res.html); k = res.next;
        }
        continue;
      }

      const para = [];
      while (i < lines.length && lines[i].trim() && (para.length === 0 || !startsBlock(lines[i]))) para.push(lines[i++]);
      out.push('<p>' + para.map(l => inline(l.replace(/ +$/, ''), editor) + (editor && / $/.test(l) ? '&nbsp;' : '')).join('<br>') + '</p>');
    }
    return out.join('');
  }

  root.MdLite = { toHtml, esc };
})(typeof window !== 'undefined' ? window : globalThis);
