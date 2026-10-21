import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext.jsx';
import { AppRoutes } from './routes.jsx';

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
      <Toaster
        position="top-right"
        richColors
        toastOptions={{ duration: 4000 }}
      />
    </AuthProvider>
  );
}
