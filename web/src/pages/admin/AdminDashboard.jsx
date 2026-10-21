import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../context/AuthContext.jsx';
import {
  Badge,
  Card,
  CardHeader,
  ErrorState,
  PageHeader,
  SkeletonCard,
  StatCard,
} from '../../components/ui/index.jsx';

export function AdminDashboard() {
  const { user, isDemo } = useAuth();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);

  async function load() {
    setError(null);
    try {
      setStats(await api.get('/system/stats'));
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <PageHeader
        title="System administration"
        subtitle="Platform-wide overview."
        action={<Badge color="amber">Administrator</Badge>}
      />

      {error && <ErrorState message={error} onRetry={load} />}

      {!stats && !error ? (
        <div className="grid gap-4">
          <SkeletonCard rows={2} />
        </div>
      ) : (
        stats && (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard label="Users" value={stats.users} accent="indigo" />
              <StatCard label="Teachers" value={stats.teachers} accent="sky" />
              <StatCard label="Students" value={stats.students} accent="emerald" />
              <StatCard label="Classes" value={stats.classes} accent="amber" />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard label="Quizzes created" value={stats.quizzes} accent="indigo" />
              <StatCard label="Attempts submitted" value={stats.submitted} accent="sky" />
              <StatCard
                label="Integrity flags"
                value={stats.flags}
                accent={stats.flags > 0 ? 'rose' : 'emerald'}
              />
              <StatCard
                label="Open flags"
                value={stats.openFlags}
                accent={stats.openFlags > 0 ? 'rose' : 'emerald'}
              />
            </div>
          </>
        )
      )}

      <Card className="mt-6">
        <CardHeader title="System status" subtitle="Live configuration of this deployment" />
        <dl className="grid gap-x-6 gap-y-3 px-5 py-4 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Signed in as</dt>
            <dd className="font-medium text-slate-800">{user?.email}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Auth mode</dt>
            <dd>
              <Badge color={isDemo ? 'amber' : 'emerald'}>
                {isDemo ? 'Local demo (no Firebase)' : 'Firebase Auth'}
              </Badge>
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">API base</dt>
            <dd className="font-mono text-slate-800">
              {import.meta.env.VITE_API_BASE_URL || '/api'}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Role system</dt>
            <dd>
              <Badge color="emerald">Role-based access active</Badge>
            </dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}
