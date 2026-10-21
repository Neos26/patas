import { useState } from 'react';
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { Badge, FullScreenLoader } from '../ui/index.jsx';

const NAV = {
  teacher: [
    { to: '/teacher', label: 'Dashboard', icon: '📊' },
    { to: '/teacher/quizzes', label: 'AI Quizzes', icon: '📝' },
  ],
  student: [
    { to: '/student', label: 'Dashboard', icon: '🎓' },
    { to: '/student/history', label: 'History', icon: '📈' },
  ],
  admin: [
    { to: '/admin', label: 'Dashboard', icon: '⚙️' },
    { to: '/admin/users', label: 'Users', icon: '👥', soon: true },
    { to: '/admin/classes', label: 'Classes', icon: '🏫', soon: true },
  ],
};

const ROLE_LABEL = { admin: 'Administrator', teacher: 'Teacher', student: 'Student' };
const ROLE_COLOR = { admin: 'amber', teacher: 'indigo', student: 'emerald' };

function SidebarContent({ role, email, onSignOut, onNavigate, isDemo }) {
  const items = NAV[role] || [];
  return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 px-5 py-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-lg text-white">
            🛡️
          </span>
          <div>
            <p className="text-sm font-bold text-white">Patas</p>
            <p className="text-[11px] text-slate-400">AI Smart Assessment</p>
          </div>
        </div>
        {isDemo && (
          <div className="px-5 pb-1">
            <span className="rounded bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-400">
              Local demo
            </span>
          </div>
        )}

      <nav className="flex-1 space-y-1 px-3">
        {items.map((item) =>
          item.soon ? (
            <div
              key={item.to}
              className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-500"
              title="Coming in a later module"
            >
              <span aria-hidden="true">{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                soon
              </span>
            </div>
          ) : (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to.split('/').length <= 2}
              onClick={onNavigate}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-500/20 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </NavLink>
          ),
        )}
      </nav>

      <div className="border-t border-slate-800 px-5 py-4">
        <p className="truncate text-xs text-slate-400">{email}</p>
        <div className="mt-2 flex items-center justify-between">
          <Badge color={ROLE_COLOR[role] || 'slate'}>{ROLE_LABEL[role] || role}</Badge>
          <button
            onClick={onSignOut}
            className="text-xs font-medium text-slate-400 hover:text-white"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

export function AppShell() {
  const { loading, user, role, signOut, isDemo } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  // Explicit sign-out: go to /login WITHOUT carrying the current page as
  // `from`, so the next (possibly different) account never lands back on the
  // previous account's quiz.
  async function handleSignOut() {
    await signOut();
    navigate('/login', { replace: true });
  }

  if (loading) return <FullScreenLoader label="Loading your dashboard…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;

  return (
    <div className="min-h-screen md:flex">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 bg-slate-900 md:block">
        <SidebarContent
          role={role}
          email={user.email}
          onSignOut={handleSignOut}
          isDemo={isDemo}
        />
      </aside>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-slate-900/60"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 left-0 w-72 bg-slate-900">
            <SidebarContent
              role={role}
              email={user.email}
              onSignOut={handleSignOut}
              isDemo={isDemo}
              onNavigate={() => setMenuOpen(false)}
            />
          </aside>
        </div>
      )}

      <div className="flex min-h-screen flex-1 flex-col md:pl-64">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur md:hidden">
          <button
            onClick={() => setMenuOpen(true)}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
            aria-label="Open menu"
          >
            ☰
          </button>
          <span className="text-sm font-bold text-slate-900">Patas</span>
          {isDemo && (
            <Badge color="amber" className="ml-auto">
              LOCAL DEMO
            </Badge>
          )}
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet context={{ role }} />
        </main>
      </div>
    </div>
  );
}

