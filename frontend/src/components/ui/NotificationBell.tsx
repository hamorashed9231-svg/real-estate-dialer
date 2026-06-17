import React, { useState, useRef, useEffect } from 'react';
import { Bell, Info, ShieldAlert, CheckCircle2, UserCheck, AlertTriangle } from 'lucide-react';

interface NotificationItem {
  id: string;
  type: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
  time: string;
  read: boolean;
}

export default function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Pre-load default system alert feeds
  const [notifications, setNotifications] = useState<NotificationItem[]>([
    {
      id: 'notif_1',
      type: 'error',
      title: 'Campaign Paused - TCPA Limit',
      message: 'Campaign FSBO Prospecting paused: Outbound abandonment rate exceeded 3.0%.',
      time: '10m ago',
      read: false,
    },
    {
      id: 'notif_2',
      type: 'success',
      title: 'CSV Lead Import Complete',
      message: 'Successfully loaded 342 contacts into Cold Calling Queue.',
      time: '2h ago',
      read: false,
    },
    {
      id: 'notif_3',
      type: 'warning',
      title: 'Agent Went Offline',
      message: 'Agent Ahmed (extension 104) state changed to offline.',
      time: '4h ago',
      read: false,
    },
    {
      id: 'notif_4',
      type: 'info',
      title: 'System Initialized',
      message: 'PropDial WebRTC client registered successfully.',
      time: 'Yesterday',
      read: true,
    },
  ]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleToggle = () => {
    setIsOpen(!isOpen);
    // Mark all as read when opening dropdown to improve UX
    if (!isOpen) {
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    }
  };

  const getIcon = (type: NotificationItem['type']) => {
    switch (type) {
      case 'error':
        return <ShieldAlert className="h-4 w-4 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case 'success':
        return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
      case 'info':
      default:
        return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={handleToggle}
        className="p-2.5 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-2xl text-zinc-400 hover:text-zinc-200 transition-all active:scale-95 relative"
      >
        <Bell className="h-4 w-4" />
        
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-red-600 text-[9px] font-bold text-white ring-2 ring-zinc-950 animate-in zoom-in-50 duration-200">
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-3.5 w-80 bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="p-4 border-b border-zinc-850 flex justify-between items-center bg-zinc-950/20">
            <span className="text-xs font-bold text-zinc-200">Activity Center</span>
            <button
              type="button"
              onClick={() => setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))}
              className="text-[10px] font-bold text-blue-500 hover:text-blue-400"
            >
              Clear Feed
            </button>
          </div>

          <div className="divide-y divide-zinc-900 max-h-72 overflow-y-auto">
            {notifications.map((notif) => (
              <div
                key={notif.id}
                className={`p-3.5 flex gap-3 hover:bg-zinc-950/40 transition-colors ${
                  !notif.read ? 'bg-zinc-950/20 border-l-2 border-l-blue-500' : ''
                }`}
              >
                <div className="p-1.5 bg-zinc-950 border border-zinc-850 rounded-xl h-8 w-8 flex items-center justify-center shrink-0">
                  {getIcon(notif.type)}
                </div>
                <div className="space-y-0.5">
                  <div className="flex justify-between items-baseline gap-2">
                    <p className="text-[11px] font-bold text-zinc-300 truncate max-w-[150px]">
                      {notif.title}
                    </p>
                    <span className="text-[9px] text-zinc-550 font-medium whitespace-nowrap">
                      {notif.time}
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-500 leading-normal">
                    {notif.message}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
