// Rich text editor for the ticket Description (toolbar like Trello's).
// The text is stored as Markdown in the hidden #tDescription field, so existing descriptions
// (including the ones imported from Trello) keep working. Links are highlighted and clickable.
(function () {
  const editor = document.getElementById('richEditor');
  if (!editor) return;
  const store = document.getElementById('tDescription');
  const toolbar = document.getElementById('richToolbar');
  const blockSelect = document.getElementById('rtBlock');
  const linkBar = document.getElementById('richLinkBar');
  const linkUrl = document.getElementById('richLinkUrl');
  const esc = MdLite.esc;

  // Default text for every newly filed ticket
  const TEMPLATE = [
    'Account: ', 'Password: ', 'Build Version: ', 'Device Version: ', 'Device: ', '',
    'Step by Step:', '', 'Actual Results:', '', 'Expectations:'
  ].join('\n');

  let readOnly = false;
  let dirty = false;   // true only after the user actually changes the text
  try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) { /* ignore */ }

  // =====================  HTML (editor)  ->  Markdown  =====================
  const BLOCK = /^(UL|OL|P|DIV|H[1-6]|BLOCKQUOTE|PRE|HR)$/;

  function escText(t) {
    t = t.replace(/\u00a0/g, ' ');
    // never escape inside a URL, so links keep working
    return t.split(/(https?:\/\/\S+)/g).map((part, i) => i % 2 ? part : part.replace(/([\\`*_\[\]~])/g, '\\$1')).join('');
  }
  function escLines(text) {
    return text.split('\n').map(l => {
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) return l.replace(/^(\s*)/, '$1\\');
      return l.replace(/^(\s*)(#{1,6})(\s)/, '$1\\$2$3')
              .replace(/^(\s*)>/, '$1\\>')
              .replace(/^(\s*)([-+])(\s)/, '$1\\$2$3')
              .replace(/^(\s*)(\d+)\.(\s)/, '$1$2\\.$3');
    }).join('\n');
  }
  function normTrail(t) {
    return t.split('\n').map(l => (/ +$/.test(l) && l.trim()) ? l.replace(/ +$/, ' ') : l.replace(/ +$/, '')).join('\n');
  }
  function wrap(marker, inner) {
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner);
    return m[2] ? m[1] + marker + m[2] + marker + m[3] : inner;
  }

  function inlineNode(n) {
    if (n.nodeType === 3) return escText(n.nodeValue);
    if (n.nodeType !== 1) return '';
    const tag = n.tagName;
    if (tag === 'BR') return '\n';
    if (BLOCK.test(tag)) return '\n' + blockMd(n) + '\n';
    if (tag === 'CODE') return '`' + n.textContent + '`';
    if (tag === 'A') {
      const href = n.getAttribute('href') || '';
      const text = inlineMd(n);
      if (!/^https?:\/\//i.test(href)) return text;
      if (n.textContent.trim() === href) return href;
      return '[' + text.replace(/[\[\]]/g, '\\$&') + '](' + href.replace(/\)/g, '%29').replace(/\s/g, '%20') + ')';
    }
    let inner = inlineMd(n);
    const st = n.style || {};
    const bold = tag === 'B' || tag === 'STRONG' || parseInt(st.fontWeight, 10) >= 600 || st.fontWeight === 'bold';
    const ital = tag === 'I' || tag === 'EM' || st.fontStyle === 'italic';
    const strike = tag === 'S' || tag === 'STRIKE' || tag === 'DEL' || /line-through/.test(st.textDecoration || st.textDecorationLine || '');
    if (strike) inner = wrap('~~', inner);
    if (ital) inner = wrap('*', inner);
    if (bold) inner = wrap('**', inner);
    return inner;
  }
  function inlineMd(node) {
    let out = '';
    node.childNodes.forEach(n => { out += inlineNode(n); });
    return out;
  }

  function listMd(el, depth) {
    const ordered = el.tagName === 'OL';
    const lines = [];
    let idx = 0;
    el.childNodes.forEach(li => {
      if (li.nodeType !== 1 || li.tagName !== 'LI') return;
      idx++;
      let text = '';
      const nested = [];
      li.childNodes.forEach(c => {
        if (c.nodeType === 1 && (c.tagName === 'UL' || c.tagName === 'OL')) nested.push(listMd(c, depth + 1));
        else text += inlineNode(c);
      });
      text = escLines(text.replace(/\n+/g, ' ').trim());
      lines.push('  '.repeat(depth) + (ordered ? idx + '. ' : '- ') + text);
      nested.forEach(n => { if (n) lines.push(n); });
    });
    return lines.join('\n');
  }

  function blockMd(el) {
    const tag = el.tagName;
    if (/^H[1-6]$/.test(tag)) return '#'.repeat(+tag[1]) + ' ' + inlineMd(el).replace(/\n+/g, ' ').trim();
    if (tag === 'UL' || tag === 'OL') return listMd(el, 0);
    if (tag === 'HR') return '---';
    if (tag === 'PRE') return '```\n' + el.textContent.replace(/\n$/, '') + '\n```';
    if (tag === 'BLOCKQUOTE') return blocksMd(el).join('\n\n').split('\n').map(l => '> ' + l).join('\n');
    // P / DIV
    if ([...el.childNodes].some(c => c.nodeType === 1 && BLOCK.test(c.tagName))) return blocksMd(el).join('\n\n');
    return escLines(normTrail(inlineMd(el).replace(/^\n+/, '').replace(/\n+$/, '')).replace(/^ +$/, ''));
  }

  function blocksMd(parent) {
    const blocks = [];
    let buf = '';
    const flush = () => {
      const t = normTrail(buf.replace(/^\n+/, '').replace(/\n+$/, ''));
      if (t.trim()) blocks.push(escLines(t));
      buf = '';
    };
    parent.childNodes.forEach(n => {
      if (n.nodeType === 1 && BLOCK.test(n.tagName)) {
        flush();
        const b = blockMd(n);
        if (b && b.trim()) blocks.push(b);
      } else {
        buf += inlineNode(n);
      }
    });
    flush();
    return blocks;
  }

  function htmlToMd(root) {
    return blocksMd(root).join('\n\n').replace(/\s+$/, '');
  }

  // =====================  editor state  =====================
  function sync() {
    store.value = htmlToMd(editor);
    editor.classList.toggle('is-empty', !editor.textContent.trim() && !editor.querySelector('hr, li'));
  }
  function fixLinks() {
    editor.querySelectorAll('a').forEach(a => {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
      a.setAttribute('title', 'Ctrl+click to open');
    });
  }
  function afterChange() { dirty = true; fixLinks(); sync(); updateToolbar(); }

  function render() {
    const html = MdLite.toHtml(store.value, { editor: !readOnly });
    editor.innerHTML = html || (readOnly ? '<p class="rt-none">No description provided.</p>' : '<p><br></p>');
    editor.classList.toggle('is-empty', !readOnly && !store.value.trim());
  }

  function load(md) {
    store.value = md || '';
    dirty = false;
    render();
  }
  function setReadOnly(ro) {
    readOnly = !!ro;
    editor.contentEditable = readOnly ? 'false' : 'true';
    editor.classList.toggle('readonly', readOnly);
    toolbar.style.display = readOnly ? 'none' : '';
    linkBar.style.display = 'none';
    dirty = false;
    render();
  }

  // =====================  toolbar  =====================
  let saved = null;
  const sel = () => window.getSelection();
  function inEditor() { const s = sel(); return s.rangeCount && editor.contains(s.anchorNode); }
  function restore() {
    editor.focus();
    if (saved) { const s = sel(); s.removeAllRanges(); s.addRange(saved); }
  }
  function closest(tag) {
    const s = sel();
    let n = s.anchorNode;
    if (n && n.nodeType === 3) n = n.parentNode;
    return n && editor.contains(n) ? n.closest(tag) : null;
  }

  function run(cmd, val) {
    restore();
    document.execCommand(cmd, false, val);
    afterChange();
  }

  function toggleCode() {
    restore();
    const code = closest('code');
    if (code) {
      const t = document.createTextNode(code.textContent);
      code.replaceWith(t);
    } else {
      const text = sel().toString();
      if (!text) return;
      document.execCommand('insertHTML', false, '<code>' + esc(text) + '</code>');
    }
    afterChange();
  }

  function toggleQuote() {
    restore();
    document.execCommand('formatBlock', false, closest('blockquote') ? 'P' : 'BLOCKQUOTE');
    afterChange();
  }

  function insertTemplate() {
    if (!editor.textContent.trim()) {
      load(TEMPLATE);
    } else {
      editor.insertAdjacentHTML('beforeend', MdLite.toHtml(TEMPLATE, { editor: true }));
    }
    dirty = true;
    sync();
    editor.focus();
  }

  // ----- links -----
  let linkEl = null;
  function openLink() {
    if (readOnly) return;
    if (inEditor()) saved = sel().getRangeAt(0).cloneRange();
    linkEl = closest('a');
    linkUrl.value = linkEl ? linkEl.getAttribute('href') : '';
    linkUrl.style.borderColor = '';
    linkBar.style.display = 'flex';
    linkUrl.focus();
    linkUrl.select();
  }
  function closeLink() { linkBar.style.display = 'none'; editor.focus(); }
  function applyLink() {
    let url = linkUrl.value.trim();
    if (url && !/^https?:\/\//i.test(url)) url = /^[\w-]+(\.[\w-]+)+/.test(url) ? 'https://' + url : '';
    if (!url) { linkUrl.style.borderColor = '#ef4444'; return; }
    linkBar.style.display = 'none';
    restore();
    if (linkEl && editor.contains(linkEl)) {
      linkEl.setAttribute('href', url);
    } else if (sel().isCollapsed) {
      document.execCommand('insertHTML', false, `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(url)}</a>&nbsp;`);
    } else {
      document.execCommand('createLink', false, url);
    }
    afterChange();
  }

  toolbar.addEventListener('mousedown', e => { if (e.target.closest('button')) e.preventDefault(); });
  toolbar.addEventListener('click', e => {
    const b = e.target.closest('button[data-cmd]');
    if (!b) return;
    const cmd = b.dataset.cmd;
    if (cmd === 'code') toggleCode();
    else if (cmd === 'blockquote') toggleQuote();
    else if (cmd === 'link') openLink();
    else if (cmd === 'hr') run('insertHorizontalRule');
    else if (cmd === 'template') insertTemplate();
    else run(cmd);
  });
  blockSelect.addEventListener('change', () => {
    run('formatBlock', blockSelect.value);
  });
  document.getElementById('richLinkOk').onclick = applyLink;
  document.getElementById('richLinkCancel').onclick = closeLink;
  linkUrl.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); applyLink(); }
    if (e.key === 'Escape') { e.preventDefault(); closeLink(); }
  });

  function updateToolbar() {
    if (readOnly || !inEditor()) return;
    ['bold', 'italic', 'strikeThrough', 'insertUnorderedList', 'insertOrderedList'].forEach(cmd => {
      const b = toolbar.querySelector(`[data-cmd="${cmd}"]`);
      let on = false;
      try { on = document.queryCommandState(cmd); } catch (e) { /* ignore */ }
      if (b) b.classList.toggle('on', on);
    });
    toolbar.querySelector('[data-cmd="code"]').classList.toggle('on', !!closest('code'));
    toolbar.querySelector('[data-cmd="blockquote"]').classList.toggle('on', !!closest('blockquote'));
    toolbar.querySelector('[data-cmd="link"]').classList.toggle('on', !!closest('a'));
    let blk = '';
    try { blk = String(document.queryCommandValue('formatBlock') || '').toLowerCase(); } catch (e) { /* ignore */ }
    blockSelect.value = /^h[1-3]$/.test(blk) ? blk.toUpperCase() : 'P';
  }
  document.addEventListener('selectionchange', () => {
    if (inEditor()) { saved = sel().getRangeAt(0).cloneRange(); updateToolbar(); }
  });

  // =====================  typing behaviour  =====================
  const URL_TAIL = /(https?:\/\/\S+)$/;

  // Turns a URL typed just before the caret into a link when space/Enter is pressed
  function autolinkAtCaret() {
    const s = sel();
    if (!s.rangeCount || !s.isCollapsed) return;
    const r = s.getRangeAt(0);
    const node = r.startContainer;
    if (node.nodeType !== 3 || (node.parentElement && node.parentElement.closest('a, code, pre'))) return;
    const before = node.data.slice(0, r.startOffset);
    const m = URL_TAIL.exec(before);
    if (!m) return;
    let url = m[1];
    const punct = (url.match(/[.,;:!?)\]]+$/) || [''])[0];
    if (punct) url = url.slice(0, -punct.length);
    if (url.length < 9) return;
    const start = r.startOffset - m[1].length;

    const rng = document.createRange();
    rng.setStart(node, start);
    rng.setEnd(node, start + url.length);
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank'; a.rel = 'noopener noreferrer'; a.title = 'Ctrl+click to open';
    rng.surroundContents(a);

    const next = a.nextSibling;
    const caret = document.createRange();
    if (next && next.nodeType === 3) caret.setStart(next, Math.min(punct.length, next.length));
    else caret.setStartAfter(a);
    caret.collapse(true);
    s.removeAllRanges();
    s.addRange(caret);
  }

  editor.addEventListener('keydown', e => {
    if (readOnly) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openLink(); return; }
    if (e.key === ' ' || e.key === 'Enter') autolinkAtCaret();
  });
  editor.addEventListener('input', () => { dirty = true; fixLinks(); sync(); });
  editor.addEventListener('blur', () => { if (!readOnly && dirty) { fixLinks(); sync(); } });

  // Paste as plain text (keeps the page clean) and make URLs clickable
  function linkifyEscaped(line) {
    return line.replace(/(https?:\/\/(?:(?!&quot;|&lt;|&gt;)[^\s<])+)/g, (m0, url) => {
      let tail = '';
      const t = url.match(/(?:[.,;:!?)\]]|&amp;)+$/);
      if (t) { tail = t[0]; url = url.slice(0, -tail.length); }
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" title="Ctrl+click to open">${url}</a>${tail}`;
    });
  }
  editor.addEventListener('paste', e => {
    if (readOnly) return;
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    const html = text.replace(/\r\n?/g, '\n').split('\n').map(l => linkifyEscaped(esc(l))).join('<br>');
    document.execCommand('insertHTML', false, html);
    afterChange();
  });

  // Links: Ctrl/Cmd + click opens them while editing (a plain click just places the cursor)
  editor.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a');
    if (!a) return;
    if (readOnly) return;                         // read-only links behave like normal links
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) window.open(a.href, '_blank', 'noopener');
  });

  window.richDesc = { load, setReadOnly, sync, insertTemplate, TEMPLATE, htmlToMd };
})();
