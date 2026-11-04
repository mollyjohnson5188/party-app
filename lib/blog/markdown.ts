/**
 * 轻量 Markdown 渲染（服务端）。
 * 只实现博客需要的子集：标题、段落、列表、引用、代码块、加粗、链接、分割线。
 * 输出前统一转义 HTML，避免 XSS；不引入第三方依赖。
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 行内元素：粗体、行内代码、链接 */
function inline(text: string): string {
  let t = escapeHtml(text);
  t = t.replace(/`([^`]+)`/g, '<code class="bd-code">$1</code>');
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // [文字](链接) —— 仅允许 http/https/站内路径
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label, url) => {
    const safe = /^(https?:\/\/|\/)/.test(url) ? url : '#';
    return `<a href="${safe}" class="bd-link" rel="noopener">${label}</a>`;
  });
  return t;
}

/** 拆分表格行：| a | b | -> ['a','b'] */
function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

export function renderMarkdown(src: string): string {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;
  let inList = false;

  const closeList = () => {
    if (inList) {
      out.push('</ul>');
      inList = false;
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    // 代码块
    if (/^```/.test(line.trim())) {
      closeList();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        buf.push(lines[i]);
        i++;
      }
      i++;
      out.push(`<pre class="bd-pre"><code>${escapeHtml(buf.join('\n'))}</code></pre>`);
      continue;
    }

    // 表格：| a | b |  +  | --- | --- |
    if (/^\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      closeList();
      const head = splitRow(line);
      i += 2; // 跳过表头与分隔行
      const body: string[][] = [];
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) {
        body.push(splitRow(lines[i]));
        i++;
      }
      const th = head.map((c) => `<th>${inline(c)}</th>`).join('');
      const trs = body
        .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
        .join('');
      out.push(
        `<div class="bd-table-wrap"><table class="bd-table"><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table></div>`
      );
      continue;
    }

    // 标题
    const h = line.match(/^(#{1,5})\s+(.*)$/);
    if (h) {
      closeList();
      // h1 留给页面标题，正文里写成 # 的降级为 h2，避免出现两个 h1
      const level = Math.min(Math.max(h[1].length, 2), 5);
      out.push(`<h${level} class="bd-h${level}">${inline(h[2])}</h${level}>`);
      i++;
      continue;
    }

    // 分割线
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      closeList();
      out.push('<hr class="bd-hr" />');
      i++;
      continue;
    }

    // 引用
    if (/^>\s?/.test(line)) {
      closeList();
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      out.push(`<blockquote class="bd-quote">${inline(buf.join(' '))}</blockquote>`);
      continue;
    }

    // 无序列表
    if (/^[-*]\s+/.test(line)) {
      if (!inList) {
        out.push('<ul class="bd-ul">');
        inList = true;
      }
      out.push(`<li>${inline(line.replace(/^[-*]\s+/, ''))}</li>`);
      i++;
      continue;
    }

    // 有序列表
    if (/^\d+\.\s+/.test(line)) {
      closeList();
      const buf: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        buf.push(`<li>${inline(lines[i].replace(/^\d+\.\s+/, ''))}</li>`);
        i++;
      }
      out.push(`<ol class="bd-ol">${buf.join('')}</ol>`);
      continue;
    }

    // 空行
    if (line.trim() === '') {
      closeList();
      i++;
      continue;
    }

    // 段落
    closeList();
    const buf: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^(#{1,5}\s|>\s?|[-*]\s+|\d+\.\s+|```|-{3,}|\|)/.test(lines[i])
    ) {
      buf.push(lines[i]);
      i++;
    }
    out.push(`<p class="bd-p">${inline(buf.join(' '))}</p>`);
  }

  closeList();
  return out.join('\n');
}

/** 从正文提取纯文本摘要 */
export function plainSummary(content: string, max = 150): string {
  const t = content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*`\-]/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/** 生成 URL 友好的 slug（中文保留转拼音成本高，这里用短随机 + 英文下标） */
export function makeSlug(title: string): string {
  const ascii = title
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const suffix = Date.now().toString(36).slice(-5);
  return ascii ? `${ascii}-${suffix}` : `post-${suffix}`;
}
