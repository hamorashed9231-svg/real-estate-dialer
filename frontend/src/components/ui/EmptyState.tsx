import React from 'react';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export default function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center bg-zinc-900/30 border border-zinc-800/80 rounded-3xl space-y-4 max-w-sm mx-auto">
      <div className="p-4 bg-zinc-950 border border-zinc-850 rounded-2xl text-zinc-650 shadow-inner">
        <Icon className="h-8 w-8 stroke-[1.5px]" />
      </div>
      
      <div className="space-y-1">
        <h3 className="font-bold text-sm text-zinc-300">{title}</h3>
        <p className="text-xs text-zinc-500 leading-relaxed">{description}</p>
      </div>

      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-blue-900/10 hover:shadow-blue-900/20"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
