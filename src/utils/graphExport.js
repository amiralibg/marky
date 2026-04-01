import { save } from '@tauri-apps/plugin-dialog';
import { writeFile, writeTextFile } from '@tauri-apps/plugin-fs';

const EXPORT_PADDING = 100;

const escapeXml = (value = '') =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const normalizeHex = (value, fallback) => {
  if (!value) return fallback;
  const trimmed = value.trim();
  if (/^#[0-9a-f]{3}$/i.test(trimmed)) {
    return `#${trimmed.slice(1).split('').map((char) => char + char).join('')}`;
  }
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) {
    return trimmed;
  }
  return fallback;
};

const hexToRgb = (hex) => {
  const normalized = normalizeHex(hex, '#000000').slice(1);
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
};

const mixHexColors = (from, to, ratio) => {
  const safeRatio = Math.max(0, Math.min(1, ratio));
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  const r = Math.round(a.r + (b.r - a.r) * safeRatio);
  const g = Math.round(a.g + (b.g - a.g) * safeRatio);
  const bValue = Math.round(a.b + (b.b - a.b) * safeRatio);
  return `#${[r, g, bValue].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
};

const getBounds = (nodes) => {
  if (nodes.length === 0) {
    return { minX: 0, minY: 0, width: 1200, height: 900 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  nodes.forEach((node) => {
    const radius = Math.max(6, 8 + Math.min(node.backlinkCount, 6) * 2);
    minX = Math.min(minX, node.x - radius);
    minY = Math.min(minY, node.y - radius);
    maxX = Math.max(maxX, node.x + radius + 50);
    maxY = Math.max(maxY, node.y + radius + 28);
  });

  return {
    minX: minX - EXPORT_PADDING,
    minY: minY - EXPORT_PADDING,
    width: Math.max(800, maxX - minX + EXPORT_PADDING * 2),
    height: Math.max(600, maxY - minY + EXPORT_PADDING * 2),
  };
};

export const buildGraphSvg = ({ nodes, edges, currentNoteId, title = 'Marky Graph' }) => {
  const styles = getComputedStyle(document.documentElement);
  const accent = normalizeHex(styles.getPropertyValue('--color-accent'), '#3b82f6');
  const background = normalizeHex(styles.getPropertyValue('--color-bg-editor'), '#0c0c0e');
  const textPrimary = normalizeHex(styles.getPropertyValue('--color-text-primary'), '#f4f4f5');
  const textSecondary = normalizeHex(styles.getPropertyValue('--color-text-secondary'), '#a1a1aa');
  const textMuted = normalizeHex(styles.getPropertyValue('--color-text-muted'), '#71717a');
  const border = normalizeHex(styles.getPropertyValue('--color-border'), '#3f3f46');

  const bounds = getBounds(nodes);
  const edgeStroke = mixHexColors(border, textSecondary, 0.3);
  const nodeBaseFill = mixHexColors(background, accent, 0.35);
  const nodeBaseStroke = mixHexColors(border, accent, 0.45);

  const svgNodes = nodes.map((node) => {
    const isActive = node.id === currentNoteId;
    const radius = Math.max(6, 8 + Math.min(node.backlinkCount, 6) * 2);
    const fill = isActive
      ? accent
      : mixHexColors(nodeBaseFill, accent, Math.min(0.55, node.backlinkCount * 0.08));
    const stroke = isActive ? accent : nodeBaseStroke;
    const strokeWidth = isActive ? 3 : 1.6;
    const label = escapeXml(node.name.length > 28 ? `${node.name.slice(0, 28)}...` : node.name);
    const labelColor = isActive ? accent : textSecondary;
    const badge = node.backlinkCount > 0
      ? `<text x="${node.x + radius + 5}" y="${node.y - radius + 2}" font-size="9" font-family="Helvetica, Arial, sans-serif" fill="${textMuted}" opacity="0.85">${node.backlinkCount}</text>`
      : '';

    return `
      <g>
        ${isActive ? `<circle cx="${node.x}" cy="${node.y}" r="${radius + 6}" fill="none" stroke="${accent}" stroke-opacity="0.28" stroke-width="1.2" />` : ''}
        <circle cx="${node.x}" cy="${node.y}" r="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />
        <text x="${node.x}" y="${node.y + radius + 16}" text-anchor="middle" font-size="11" font-family="Helvetica, Arial, sans-serif" fill="${labelColor}">${label}</text>
        ${badge}
      </g>`;
  }).join('');

  const svgEdges = edges.map((edge) => `
    <line
      x1="${edge.source.x}"
      y1="${edge.source.y}"
      x2="${edge.target.x}"
      y2="${edge.target.y}"
      stroke="${edgeStroke}"
      stroke-width="1.4"
      stroke-opacity="0.55"
    />`).join('');

  return {
    width: bounds.width,
    height: bounds.height,
    svg: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.width}" height="${bounds.height}" viewBox="${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}">
  <title>${escapeXml(title)}</title>
  <rect x="${bounds.minX}" y="${bounds.minY}" width="${bounds.width}" height="${bounds.height}" fill="${background}" />
  <g>
    ${svgEdges}
    ${svgNodes}
  </g>
  <text x="${bounds.minX + 24}" y="${bounds.minY + 34}" font-size="16" font-family="Helvetica, Arial, sans-serif" fill="${textPrimary}">${escapeXml(title)}</text>
</svg>`
  };
};

const requestSavePath = async (defaultPath, extensions, name) => {
  const selected = await save({
    defaultPath,
    filters: [{ name, extensions }]
  });
  if (!selected) return null;
  return typeof selected === 'string' ? selected : selected.path;
};

export const saveGraphSvg = async (svg, defaultName = 'marky-graph.svg') => {
  const filePath = await requestSavePath(defaultName, ['svg'], 'SVG');
  if (!filePath) return null;
  await writeTextFile(filePath, svg);
  return filePath;
};

export const saveGraphPng = async (svg, width, height, defaultName = 'marky-graph.png') => {
  const filePath = await requestSavePath(defaultName, ['png'], 'PNG');
  if (!filePath) return null;

  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  try {
    const image = await new Promise((resolve, reject) => {
      const nextImage = new Image();
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = () => reject(new Error('Failed to render graph image'));
      nextImage.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas is not available');
    }

    context.drawImage(image, 0, 0, width, height);

    const pngBlob = await new Promise((resolve, reject) => {
      canvas.toBlob((nextBlob) => {
        if (nextBlob) {
          resolve(nextBlob);
        } else {
          reject(new Error('Failed to encode PNG'));
        }
      }, 'image/png');
    });

    const buffer = new Uint8Array(await pngBlob.arrayBuffer());
    await writeFile(filePath, buffer);
    return filePath;
  } finally {
    URL.revokeObjectURL(url);
  }
};
