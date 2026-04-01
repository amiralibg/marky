import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { marked } from 'marked';

const PAGE_SIZE = { width: 595.28, height: 841.89 };
const PAGE_MARGIN = 50;
const CONTENT_WIDTH = PAGE_SIZE.width - PAGE_MARGIN * 2;
const DEFAULT_TEXT_COLOR = rgb(0.12, 0.12, 0.14);
const MUTED_TEXT_COLOR = rgb(0.38, 0.41, 0.46);
const CODE_BG_COLOR = rgb(0.96, 0.97, 0.98);
const BLOCKQUOTE_BAR_COLOR = rgb(0.81, 0.84, 0.87);

const escapeHtml = (value = '') =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const sanitizeFileName = (value = 'note') =>
  value.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim() || 'note';

const flattenInlineTokens = (tokens = []) =>
  tokens.map((token) => {
    if (!token) return '';
    if (typeof token.text === 'string' && Array.isArray(token.tokens)) {
      return flattenInlineTokens(token.tokens) || token.text;
    }
    if (token.type === 'link' || token.type === 'strong' || token.type === 'em' || token.type === 'codespan' || token.type === 'del') {
      return token.text || flattenInlineTokens(token.tokens || []);
    }
    if (token.type === 'image') {
      return token.text || token.href || '';
    }
    if (token.type === 'br') {
      return '\n';
    }
    if (token.type === 'text') {
      return token.raw && Array.isArray(token.tokens)
        ? flattenInlineTokens(token.tokens)
        : (token.text || token.raw || '');
    }
    return token.text || token.raw || '';
  }).join('');

const plainText = (value = '') =>
  value
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[`*_~>#-]/g, '')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const textFromToken = (token) => {
  if (!token) return '';
  if (Array.isArray(token.tokens)) {
    return plainText(flattenInlineTokens(token.tokens));
  }
  return plainText(token.text || token.raw || '');
};

const splitParagraphLines = (text = '') =>
  text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

const wrapText = (font, text, size, width) => {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [''];

  const words = normalized.split(' ');
  const lines = [];
  let currentLine = '';

  words.forEach((word) => {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width || !currentLine) {
      currentLine = candidate;
      return;
    }

    lines.push(currentLine);
    currentLine = word;
  });

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [''];
};

export const buildStandaloneHtml = (noteName, markdownContent, markedParser = marked) => {
  const htmlContent = markedParser(markdownContent || '');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(noteName)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', sans-serif;
      line-height: 1.6;
      color: #1e1e1e;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 20px;
      background: #ffffff;
    }
    h1, h2, h3, h4, h5, h6 {
      margin-top: 24px;
      margin-bottom: 16px;
      font-weight: 600;
      line-height: 1.25;
      color: #1a1a1a;
    }
    h1 { font-size: 2em; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
    h2 { font-size: 1.5em; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
    h3 { font-size: 1.25em; }
    h4 { font-size: 1em; }
    p { margin-bottom: 16px; }
    a { color: #0969da; text-decoration: none; }
    a:hover { text-decoration: underline; }
    code {
      background-color: rgba(175, 184, 193, 0.2);
      padding: 0.2em 0.4em;
      border-radius: 6px;
      font-size: 85%;
      font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace;
    }
    pre {
      background-color: #f6f8fa;
      border-radius: 6px;
      padding: 16px;
      overflow: auto;
      margin-bottom: 16px;
    }
    pre code {
      background-color: transparent;
      padding: 0;
      font-size: 100%;
    }
    blockquote {
      border-left: 4px solid #d0d7de;
      padding-left: 16px;
      color: #656d76;
      margin-bottom: 16px;
    }
    ul, ol { margin-bottom: 16px; padding-left: 2em; }
    li { margin-bottom: 4px; }
    table {
      border-collapse: collapse;
      width: 100%;
      margin-bottom: 16px;
    }
    table th, table td {
      border: 1px solid #d0d7de;
      padding: 6px 13px;
    }
    table th {
      background-color: #f6f8fa;
      font-weight: 600;
    }
    hr {
      height: 0.25em;
      padding: 0;
      margin: 24px 0;
      background-color: #d0d7de;
      border: 0;
    }
    img {
      max-width: 100%;
      height: auto;
    }
    input[type="checkbox"] {
      margin-right: 0.5em;
    }
  </style>
</head>
<body>
  ${htmlContent}
</body>
</html>`;
};

export const exportMarkdownToPdf = async (noteName, markdownContent) => {
  const pdfDoc = await PDFDocument.create();
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const monoFont = await pdfDoc.embedFont(StandardFonts.Courier);

  let page = pdfDoc.addPage([PAGE_SIZE.width, PAGE_SIZE.height]);
  let cursorY = PAGE_SIZE.height - PAGE_MARGIN;

  const ensurePageSpace = (heightNeeded = 0) => {
    if (cursorY - heightNeeded >= PAGE_MARGIN) return;
    page = pdfDoc.addPage([PAGE_SIZE.width, PAGE_SIZE.height]);
    cursorY = PAGE_SIZE.height - PAGE_MARGIN;
  };

  const drawLines = ({
    lines,
    font = regularFont,
    size = 12,
    color = DEFAULT_TEXT_COLOR,
    indent = 0,
    lineGap = 4,
    paragraphGap = 10,
  }) => {
    const lineHeight = size + lineGap;
    lines.forEach((line) => {
      ensurePageSpace(lineHeight);
      page.drawText(line || ' ', {
        x: PAGE_MARGIN + indent,
        y: cursorY - size,
        size,
        font,
        color,
      });
      cursorY -= lineHeight;
    });
    cursorY -= paragraphGap;
  };

  const drawParagraph = (text, options = {}) => {
    splitParagraphLines(text).forEach((line, lineIndex, allLines) => {
      const wrapped = wrapText(
        options.font || regularFont,
        line,
        options.size || 12,
        CONTENT_WIDTH - (options.indent || 0)
      );
      drawLines({
        ...options,
        lines: wrapped,
        paragraphGap: lineIndex === allLines.length - 1 ? (options.paragraphGap ?? 10) : 4,
      });
    });
  };

  const drawCodeBlock = (text) => {
    const codeLines = (text || '').replace(/\t/g, '  ').split('\n');
    const size = 10;
    const lineGap = 3;
    const lineHeight = size + lineGap;
    const blockPadding = 12;
    const blockHeight = codeLines.length * lineHeight + blockPadding * 2;

    ensurePageSpace(blockHeight + 8);
    page.drawRectangle({
      x: PAGE_MARGIN,
      y: cursorY - blockHeight,
      width: CONTENT_WIDTH,
      height: blockHeight,
      color: CODE_BG_COLOR,
      borderColor: rgb(0.87, 0.89, 0.91),
      borderWidth: 1,
    });

    let codeY = cursorY - blockPadding;
    codeLines.forEach((line) => {
      page.drawText(line || ' ', {
        x: PAGE_MARGIN + blockPadding,
        y: codeY - size,
        size,
        font: monoFont,
        color: DEFAULT_TEXT_COLOR,
      });
      codeY -= lineHeight;
    });

    cursorY -= blockHeight + 12;
  };

  const drawRule = () => {
    ensurePageSpace(12);
    page.drawLine({
      start: { x: PAGE_MARGIN, y: cursorY - 4 },
      end: { x: PAGE_MARGIN + CONTENT_WIDTH, y: cursorY - 4 },
      thickness: 1,
      color: rgb(0.85, 0.87, 0.89),
    });
    cursorY -= 14;
  };

  const renderTokens = (tokens = [], depth = 0) => {
    tokens.forEach((token) => {
      switch (token.type) {
        case 'space':
          cursorY -= 4;
          break;
        case 'heading': {
          const sizes = { 1: 24, 2: 20, 3: 16, 4: 14, 5: 13, 6: 12 };
          const size = sizes[token.depth] || 12;
          cursorY -= depth === 0 ? 4 : 0;
          drawParagraph(textFromToken(token), {
            font: boldFont,
            size,
            lineGap: 4,
            paragraphGap: 10,
          });
          break;
        }
        case 'paragraph':
        case 'text':
          drawParagraph(textFromToken(token), {
            font: regularFont,
            size: 12,
            lineGap: 4,
            paragraphGap: 10,
          });
          break;
        case 'blockquote': {
          const blockquoteTokens = token.tokens || [];
          const quoteText = blockquoteTokens
            .map((innerToken) => textFromToken(innerToken))
            .filter(Boolean)
            .join('\n');
          const indent = 20;
          const previewLines = splitParagraphLines(quoteText).flatMap((line) =>
            wrapText(regularFont, line, 12, CONTENT_WIDTH - indent - 8)
          );
          ensurePageSpace(previewLines.length * 16 + 12);
          page.drawRectangle({
            x: PAGE_MARGIN,
            y: cursorY - (previewLines.length * 16 + 8),
            width: 3,
            height: previewLines.length * 16 + 8,
            color: BLOCKQUOTE_BAR_COLOR,
          });
          drawLines({
            lines: previewLines,
            font: regularFont,
            size: 12,
            indent,
            color: MUTED_TEXT_COLOR,
            paragraphGap: 8,
          });
          break;
        }
        case 'list':
          token.items.forEach((item, index) => {
            const marker = token.ordered ? `${index + 1}.` : '•';
            const itemText = plainText(
              item.tokens ? flattenInlineTokens(item.tokens) : (item.text || '')
            );
            const wrappedLines = wrapText(regularFont, itemText, 12, CONTENT_WIDTH - 26);
            const bulletLines = wrappedLines.map((line, lineIndex) =>
              lineIndex === 0 ? `${marker} ${line}` : `   ${line}`
            );
            drawLines({
              lines: bulletLines,
              font: regularFont,
              size: 12,
              indent: depth * 8,
              paragraphGap: 4,
            });
            if (item.tokens) {
              const nestedTokens = item.tokens.filter((child) => child.type === 'list');
              if (nestedTokens.length > 0) {
                renderTokens(nestedTokens, depth + 1);
              }
            }
          });
          cursorY -= 6;
          break;
        case 'code':
          drawCodeBlock(token.text || '');
          break;
        case 'table': {
          const header = (token.header || []).map((cell) => plainText(cell.text || cell)).join(' | ');
          if (header) {
            drawParagraph(header, {
              font: boldFont,
              size: 11,
              lineGap: 3,
              paragraphGap: 4,
            });
          }
          (token.rows || []).forEach((row) => {
            const rowText = row.map((cell) => plainText(cell.text || cell)).join(' | ');
            drawParagraph(rowText, {
              font: regularFont,
              size: 11,
              lineGap: 3,
              paragraphGap: 4,
            });
          });
          cursorY -= 4;
          break;
        }
        case 'hr':
          drawRule();
          break;
        default: {
          const fallbackText = textFromToken(token);
          if (fallbackText) {
            drawParagraph(fallbackText, {
              font: regularFont,
              size: 12,
              lineGap: 4,
              paragraphGap: 10,
            });
          }
        }
      }
    });
  };

  const tokens = marked.lexer(markdownContent || '');
  if (tokens.length === 0) {
    drawParagraph(' ', { paragraphGap: 0 });
  } else {
    renderTokens(tokens);
  }

  const savePath = await save({
    defaultPath: `${sanitizeFileName(noteName)}.pdf`,
    filters: [{
      name: 'PDF',
      extensions: ['pdf']
    }]
  });

  if (!savePath) return null;

  const filePath = typeof savePath === 'string' ? savePath : savePath.path;
  const pdfBytes = await pdfDoc.save();
  await writeFile(filePath, pdfBytes);
  return filePath;
};
