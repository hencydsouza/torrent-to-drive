import { useEffect, useRef } from 'react';

// h=have, d=downloading, w=wanted, s=skipped (see backend TorrentDetails.pieces)
const LEGEND = [
  { key: 'h', label: 'Have', color: '--tone-accent' },
  { key: 'd', label: 'Downloading', color: '--tone-info' },
  { key: 'w', label: 'Missing', color: '--border-strong' },
  { key: 's', label: 'Skipped', color: '--border-subtle' },
] as const;

const CELL = 8;
const GAP = 2;

// Canvas, not DOM: big torrents have 50k+ pieces.
export default function PieceGrid({ pieces }: { pieces: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const css = getComputedStyle(canvas);
    const color = Object.fromEntries(LEGEND.map((l) => [l.key, css.getPropertyValue(l.color).trim()]));
    const width = canvas.parentElement?.clientWidth || 600;
    const cols = Math.max(1, Math.floor((width + GAP) / (CELL + GAP)));
    // Squash very large torrents so the grid stays under ~240px tall: one cell = several pieces.
    const perCell = Math.max(1, Math.ceil(pieces.length / (cols * 24)));
    const cells = Math.ceil(pieces.length / perCell);
    const rows = Math.ceil(cells / cols);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = rows * (CELL + GAP) * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${rows * (CELL + GAP)}px`;
    ctx.scale(dpr, dpr);
    for (let c = 0; c < cells; c++) {
      const chunk = pieces.slice(c * perCell, (c + 1) * perCell);
      // Worst state wins so a half-done cell never looks complete.
      const k = chunk.includes('d') ? 'd' : chunk.includes('w') ? 'w' : chunk.includes('h') ? 'h' : 's';
      ctx.fillStyle = color[k];
      ctx.fillRect((c % cols) * (CELL + GAP), Math.floor(c / cols) * (CELL + GAP), CELL, CELL);
    }
  }, [pieces]);

  const count = (k: string) => pieces.split(k).length - 1;
  return (
    <div className="piece-grid">
      <canvas ref={ref} role="img" aria-label={`${count('h')} of ${pieces.length} pieces downloaded`} />
      <ul className="piece-legend">
        {LEGEND.map((l) => (
          <li key={l.key}>
            <span className="piece-swatch" style={{ background: `var(${l.color})` }} />
            {l.label} <span className="num muted">{count(l.key).toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
