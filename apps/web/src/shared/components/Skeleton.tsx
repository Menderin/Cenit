import type { CSSProperties } from 'react';

export function LoadingLabel({ children }: { children: string }) {
  return <span className="cenit-loading-label" role="status">{children}</span>;
}

export function Skeleton({ width, height, className = '' }: {
  width?: CSSProperties['width']; height?: CSSProperties['height']; className?: string;
}) {
  return <span aria-hidden="true" className={`cenit-skeleton ${className}`.trim()} style={{ width, height }} />;
}

export function TableSkeleton({ className, columns, rows = 7 }: { className: string; columns: number[]; rows?: number }) {
  const template = columns.map(width => `minmax(0, ${width}fr)`).join(' ');
  return <div className={`${className} cenit-table-skeleton`} aria-hidden="true" style={{ '--skeleton-columns': template } as CSSProperties}>
    {Array.from({ length: rows + 1 }, (_, row) => <div key={row}>
      {columns.map((_, column) => <Skeleton key={column} width={column % 2 === 0 ? '72%' : '57%'} />)}
    </div>)}
  </div>;
}
