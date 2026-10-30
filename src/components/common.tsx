import type { JSX } from 'preact';
import type { Project } from '../lib/types';
import { budgetStatus } from '../lib/store';

const Svg = ({ children }: { children: JSX.Element | JSX.Element[] }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">{children}</svg>
);

export const Icon = {
  back: () => <Svg><path d="M15 5l-7 7 7 7" /></Svg>,
  chevron: () => <Svg><path d="M9 5l7 7-7 7" /></Svg>,
  edit: () => <Svg><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></Svg>,
  calendar: () => <Svg><rect x="4" y="5.5" width="16" height="14" rx="3" /><path d="M8 3.5v4M16 3.5v4M4 10h16" /></Svg>,
  del: () => <Svg><path d="M9 6h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-6-6z" /><path d="M12 10l4 4M16 10l-4 4" /></Svg>,
  plus: () => <Svg><path d="M12 5v14M5 12h14" /></Svg>,
  pie: () => <Svg><circle cx="12" cy="12" r="8" /><path d="M12 4a8 8 0 0 1 8 8h-8z" /></Svg>,
  heart: () => <Svg><path d="M12 20.5s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.9c0 5.4-7.5 10-7.5 10z" /></Svg>,
};

function Ring({ pct, color, size, stroke }: { pct: number; color: string; size: number; stroke: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.min(Math.max(pct, 0), 1);
  const mid = size / 2;
  return (
    <svg class="ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={mid} cy={mid} r={r} class="ring-bg" stroke-width={stroke} />
      <circle cx={mid} cy={mid} r={r} stroke={color} stroke-width={stroke} stroke-dasharray={c}
        stroke-dashoffset={c * (1 - p)} stroke-linecap="round" transform={`rotate(-90 ${mid} ${mid})`} class="ring-fg" />
    </svg>
  );
}

/** Budget ring for a project: full and soft when it has no budget, red when over. */
export function ProjectRing({ project, large }: { project: Project; large?: boolean }) {
  const b = budgetStatus(project);
  const color = b.over ? 'var(--danger)' : project.budget ? project.color : `color-mix(in srgb, ${project.color} 35%, transparent)`;
  return (
    <div class={`ring-wrap ${large ? 'lg' : ''}`}>
      <Ring pct={project.budget ? b.pct : 1} color={color} size={large ? 112 : 56} stroke={large ? 11 : 7} />
      <span>{project.budget ? `${Math.round(b.pct * 100)}%` : ''}</span>
    </div>
  );
}

export const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;
