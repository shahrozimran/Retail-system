import type { ReactNode } from 'react';

export default function PageHeading({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  return <div className="page-heading flex flex-col sm:flex-row sm:items-center justify-between gap-4">
    <div><h1>{title}</h1><p>{description}</p></div>
    {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
  </div>;
}
