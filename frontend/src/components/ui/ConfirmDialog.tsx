import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDestructive?: boolean;
}

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  isDestructive = false,
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-zinc-950/85 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 p-6 rounded-3xl shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-2.5">
            <div className={`p-1.5 rounded-lg ${isDestructive ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-blue-500/10 text-blue-500 border border-blue-500/20'}`}>
              <AlertTriangle className="h-4.5 w-4.5" />
            </div>
            <h3 className="font-bold text-zinc-100 text-sm">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1 hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-zinc-350 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Message */}
        <p className="text-xs text-zinc-450 leading-relaxed">
          {message}
        </p>

        {/* Footer actions */}
        <div className="flex gap-2.5 justify-end pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 bg-zinc-950 hover:bg-zinc-800 border border-zinc-850 hover:border-zinc-700 text-xs font-bold text-zinc-450 hover:text-zinc-200 rounded-xl transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 text-xs font-bold text-white rounded-xl transition-all active:scale-[0.98] ${
              isDestructive
                ? 'bg-red-600 hover:bg-red-700 shadow-lg shadow-red-950/20 hover:shadow-red-950/35'
                : 'bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-950/20 hover:shadow-blue-950/35'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
