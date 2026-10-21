import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { auth, isFirebaseConfigured } from '../config/firebase.js';
import { api } from '../lib/api.js';
import { getServerMode } from '../lib/serverMode.js';
import { DEMO_ACCOUNTS, DEMO_USER_CHANGED, getDemoUser, setDemoUser } from '../lib/demoUser.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [mode, setMode] = useState(null); // 'demo' | 'firebase'
  const [state, setState] = useState({
    loading: true,
    user: null,
    role: null,
    claims: null,
    roleError: null,
  });

  const resolveRole = useCallback(async (user, forceRefresh = false) => {
    try {
      let tokenResult = await user.getIdTokenResult(forceRefresh);
      if (!tokenResult.claims.role) {
        await api.post('/auth/session-claims', {});
        tokenResult = await user.getIdTokenResult(true);
      }
      setState({
        loading: false,
        user,
        role: tokenResult.claims.role || null,
        claims: tokenResult.claims,
        roleError: tokenResult.claims.role ? null : 'No role assigned.',
      });
    } catch (err) {
      setState({
        loading: false,
        user,
        role: null,
        claims: null,
        roleError: err.message,
      });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsub = null;

    (async () => {
      const m = await getServerMode();
      if (cancelled) return;
      setMode(m);

      if (m === 'firebase') {
        if (!isFirebaseConfigured || !auth) {
          setState({
            loading: false,
            user: null,
            role: null,
            claims: null,
            roleError:
              'The server requires Firebase sign-in, but this web build has no VITE_FIREBASE_* config in web/.env.',
          });
          return;
        }
        unsub = onAuthStateChanged(auth, (user) => {
          if (cancelled) return;
          if (!user) {
            setState({ loading: false, user: null, role: null, claims: null, roleError: null });
          } else {
            resolveRole(user);
          }
        });
        return;
      }

      // Local demo mode — identity comes from localStorage.
      const demo = getDemoUser();
      setState({
        loading: false,
        user: demo,
        role: demo?.role || null,
        claims: null,
        roleError: null,
      });
    })();

    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, [resolveRole]);

  // Demo session sync: a sign-out/login in ANY tab (or any stale in-memory
  // state) must apply here immediately — otherwise the old account keeps
  // looking signed in after logout.
  useEffect(() => {
    if (mode !== 'demo') return undefined;
    const sync = () => {
      const demo = getDemoUser();
      setState((prev) =>
        prev.user?.uid === demo?.uid && prev.role === (demo?.role || null)
          ? prev
          : {
              loading: false,
              user: demo,
              role: demo?.role || null,
              claims: null,
              roleError: null,
            },
      );
    };
    window.addEventListener(DEMO_USER_CHANGED, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(DEMO_USER_CHANGED, sync);
      window.removeEventListener('storage', sync);
    };
  }, [mode]);

  const signInDemo = useCallback(
    (demoRole) => {
      if (mode && mode !== 'demo') {
        throw new Error('Demo login is disabled when the server runs in Firebase mode.');
      }
      const user = DEMO_ACCOUNTS[demoRole];
      if (!user) throw new Error(`Unknown demo role: ${demoRole}`);
      setDemoUser(user);
      setState({ loading: false, user, role: user.role, claims: null, roleError: null });
      return user;
    },
    [mode],
  );

  /** Adopt an account returned by /auth/login or /auth/register (demo mode). */
  const signInSession = useCallback((user) => {
    if (!user?.uid || !user?.role) throw new Error('Invalid session response.');
    setDemoUser(user);
    setState({ loading: false, user, role: user.role, claims: null, roleError: null });
    return user;
  }, []);

  const retryRole = useCallback(() => {
    if (mode === 'firebase' && auth?.currentUser) return resolveRole(auth.currentUser, true);
    return Promise.resolve();
  }, [mode, resolveRole]);

  const signOut = useCallback(async () => {
    if (mode === 'firebase' && auth) await firebaseSignOut(auth);
    setDemoUser(null);
    setState({ loading: false, user: null, role: null, claims: null, roleError: null });
  }, [mode]);

  const configured = mode === 'firebase' && isFirebaseConfigured;

  const value = useMemo(
    () => ({
      ...state,
      mode,
      configured,
      isDemo: mode === 'demo',
      signInDemo,
      signInSession,
      retryRole,
      signOut,
    }),
    [state, mode, configured, signInDemo, signInSession, retryRole, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
