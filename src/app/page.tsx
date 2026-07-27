import Dashboard from '@/components/Dashboard';
import AuthGate from '@/components/AuthGate';

export default function Home() {
  return (
    <AuthGate>
      <Dashboard />
    </AuthGate>
  );
}
