import React from 'react';
import { useDialerStore } from '../../store/dialerStore';

interface DTMFKeypadProps {
  onClose: () => void;
}

export default function DTMFKeypad({ onClose }: DTMFKeypadProps) {
  const activeCall = useDialerStore((state) => state.activeCall);

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

  const handleKeyPress = (key: string) => {
    if (activeCall) {
      console.log(`[DTMF] Sending digit: ${key}`);
      activeCall.sendDigits(key);
    } else {
      console.log(`[MOCK DTMF] Sending digit: ${key}`);
    }
  };

  return (
    <div className="absolute bottom-full mb-3 right-0 bg-zinc-900 border border-zinc-800 p-4 rounded-2xl shadow-2xl z-50 w-64">
      <div className="flex justify-between items-center mb-3">
        <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Keypad</span>
        <button
          type="button"
          onClick={onClose}
          className="text-xs font-semibold text-zinc-500 hover:text-white"
        >
          Close
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {keys.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => handleKeyPress(key)}
            className="h-12 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 flex flex-col items-center justify-center font-bold text-lg active:scale-95 active:bg-blue-600 transition-all text-zinc-100"
          >
            {key}
          </button>
        ))}
      </div>
    </div>
  );
}
