import React from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useAgentStore, AgentStatus } from '../../store/agentStore';
import { toast } from 'sonner';
import NotificationBell from '../ui/NotificationBell';
import { 
  LayoutDashboard, 
  Phone, 
  Users, 
  Megaphone, 
  BarChart3, 
  Settings, 
  LogOut, 
  Bell, 
  User, 
  Check, 
  Power,
  Volume2,
  Clock,
  Coffee,
  XCircle
} from 'lucide-react';

export default function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  
  const { user, logout } = useAuthStore();
  const { status, setStatus } = useAgentStore();

  const handleLogout = async () => {
    try {
      await setStatus('offline');
      await logout();
      toast.success('Logged out successfully.');
      navigate('/login');
    } catch (err) {
      toast.error('Logout failed.');
    }
  };

  const handleStatusChange = async (newStatus: AgentStatus) => {
    try {
      await setStatus(newStatus);
      toast.success(`Status updated to ${newStatus}`);
    } catch (error) {
      toast.error('Failed to update agent status.');
    }
  };

  const getPageTitle = () => {
    const path = location.pathname;
    if (path === '/dashboard') return 'Dashboard';
    if (path === '/dialer') return 'Softphone Dialer';
    if (path === '/leads') return 'Lead CRM Management';
    if (path === '/campaigns') return 'Campaign Queues';
    if (path === '/reports') return 'Performance Analytics';
    if (path === '/settings') return 'Tenant Configuration';
    return 'PropDial';
  };

  // Check roles permissions
  const isAdminOrManager = user?.role === 'admin' || user?.role === 'manager';

  const menuItems = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, visible: isAdminOrManager },
    { name: 'Dialer', path: '/dialer', icon: Phone, visible: true },
    { name: 'Leads', path: '/leads', icon: Users, visible: true },
    { name: 'Campaigns', path: '/campaigns', icon: Megaphone, visible: true },
    { name: 'Reports', path: '/reports', icon: BarChart3, visible: isAdminOrManager },
    { name: 'Settings', path: '/settings', icon: Settings, visible: user?.role === 'admin' },
  ];

  // Helper for agent status colors & icons
  const getStatusConfig = (agentStatus: AgentStatus) => {
    switch (agentStatus) {
      case 'available':
        return { color: 'bg-emerald-500', text: 'Available', icon: Check };
      case 'calling':
        return { color: 'bg-blue-500', text: 'On Call', icon: Volume2 };
      case 'wrapup':
        return { color: 'bg-amber-500', text: 'Wrap-up', icon: Clock };
      case 'break':
        return { color: 'bg-purple-500', text: 'Break', icon: Coffee };
      default:
        return { color: 'bg-zinc-500', text: 'Offline', icon: XCircle };
    }
  };

  const activeStatus = getStatusConfig(status);

  return (
    <div className="flex h-screen bg-zinc-950 text-white overflow-hidden">
      {/* 1. SIDEBAR (240px) */}
      <aside className="w-60 bg-zinc-900 border-r border-zinc-800 flex flex-col justify-between h-full relative z-20">
        <div>
          {/* Logo */}
          <div className="h-16 flex items-center px-6 gap-3 border-b border-zinc-800">
            <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <Phone className="h-4 w-4 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
              PropDial
            </span>
          </div>

          {/* Navigation links */}
          <nav className="p-4 space-y-1">
            {menuItems
              .filter((item) => item.visible)
              .map((item) => {
                const isActive = location.pathname === item.path;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-500/10'
                        : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.name}
                  </Link>
                );
              })}
          </nav>
        </div>

        {/* Footer Area: Status & Logout */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-900/60 space-y-4">
          
          {/* Status Selector */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              Agent Call State
            </label>
            <div className="relative group">
              <button className="w-full flex items-center justify-between px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xs font-semibold hover:border-zinc-700 transition-colors">
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${activeStatus.color}`} />
                  <span>{activeStatus.text}</span>
                </div>
                <activeStatus.icon className="h-3 w-3 text-zinc-500" />
              </button>
              
              {/* Dropdown status options */}
              <div className="absolute bottom-full left-0 w-full mb-1 bg-zinc-950 border border-zinc-800 rounded-lg shadow-xl overflow-hidden hidden group-hover:block z-50">
                {(['available', 'wrapup', 'break', 'offline'] as AgentStatus[]).map((st) => {
                  const cfg = getStatusConfig(st);
                  const SvgIcon = cfg.icon;
                  return (
                    <button
                      key={st}
                      type="button"
                      onClick={() => handleStatusChange(st)}
                      className="w-full flex items-center justify-between px-4 py-2 hover:bg-zinc-900 text-left text-xs font-medium text-zinc-300 hover:text-white transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${cfg.color}`} />
                        <span>{cfg.text}</span>
                      </div>
                      {status === st && <Check className="h-3.5 w-3.5 text-blue-500" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* User profile / Logout */}
          <div className="flex items-center justify-between gap-2 bg-zinc-950 border border-zinc-800 p-2.5 rounded-xl">
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-8 w-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
                <User className="h-4 w-4 text-zinc-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold truncate leading-none text-zinc-200">
                  {user?.firstName ? `${user.firstName} ${user.lastName || ''}` : 'Agent'}
                </p>
                <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider mt-0.5">
                  {user?.role}
                </p>
              </div>
            </div>
            
            <button
              onClick={handleLogout}
              className="p-1.5 text-zinc-500 hover:text-red-400 transition-colors rounded-lg hover:bg-zinc-900 shrink-0"
              title="Sign Out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* 2. MAIN BODY (Content + Header) */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between px-8 relative z-10 shrink-0">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold tracking-tight text-white">
              {getPageTitle()}
            </h1>
          </div>

          <div className="flex items-center gap-4">
            {/* Tenant Org Indicator */}
            <div className="text-xs font-bold text-zinc-400 bg-zinc-950 border border-zinc-800 px-3 py-1.5 rounded-lg select-none">
              Tenant: {user?.companyName || 'Corporate'}
            </div>

            {/* Notification bell */}
            <NotificationBell />
          </div>
        </header>

        {/* Content canvas */}
        <main className="flex-1 overflow-y-auto p-8 bg-zinc-950 relative">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
