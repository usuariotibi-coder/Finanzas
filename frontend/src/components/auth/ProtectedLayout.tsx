import { Outlet } from 'react-router-dom';
import Layout from '../layout/Layout';
import RequireAuth from './RequireAuth';

export default function ProtectedLayout() {
  return (
    <RequireAuth>
      <Layout>
        <Outlet />
      </Layout>
    </RequireAuth>
  );
}
