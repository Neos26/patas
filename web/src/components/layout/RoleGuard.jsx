import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { Button, ErrorState, FullScreenLoader } from '../ui/index.jsx';

/**
 * Guards children behind one or more roles.
 * - loading   → full-screen spinner
 * - signed out → redirect /login
 * - role pending → retry screen (API offline or claims not set)
 * - wrong role → redirect to their own dashboard
 */
export function RoleGuard({ roles, children }) {
  const { loading, user, role, roleError, retryRole } = useAuth();

  if (loading) return <FullScreenLoader label="Checking your session…" />;

  if (!user) return <Navigate to="/login" replace />;

  if (!role) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <ErrorState
          title="We couldn’t determine your role"
          message={
            roleError ||
            'Your account has no role assigned yet. Contact your administrator.'
          }
          onRetry={retryRole}
        />
        <div className="mt-4 text-center">
          <Button variant="ghost" size="sm" onClick={() => (window.location.href = '/login')}>
            Back to sign in
          </Button>
        </div>
      </div>
    );
  }

  if (role !== 'admin' && !roles.includes(role)) {
    return <Navigate to="/" replace />;
  }

  return children;
}
