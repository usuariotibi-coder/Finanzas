import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import ProtectedLayout from './components/auth/ProtectedLayout';
import RequireRole from './components/auth/RequireRole';
import Dashboard from './pages/Dashboard';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import Proyectos from './pages/proyectos/Proyectos';
import Viaticos from './pages/viaticos/Viaticos';
import Dispersion from './pages/dispersion/Dispersion';
import Recuperacion from './pages/recuperacion/Recuperacion';
import Conciliacion from './pages/conciliacion/Conciliacion';
import Amex from './pages/amex/Amex';
import TarjetasAmexAdmin from './pages/amex/TarjetasAmexAdmin';
import Flotilla from './pages/flotilla/Flotilla';
import Viajes from './pages/viajes/Viajes';
import Reportes from './pages/reportes/Reportes';
import UsuarioView from './pages/usuario/UsuarioView';
import PMPortal from './pages/pm-portal/PMPortal';
import AdminUsuarios from './pages/admin/AdminUsuarios';
import CatalogosPortal from './pages/catalogos/CatalogosPortal';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/registro" element={<Register />} />

        <Route element={<ProtectedLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/mi-portal" element={<UsuarioView />} />
          <Route
            path="/admin/usuarios"
            element={
              <RequireRole allowed={['admin']}>
                <AdminUsuarios />
              </RequireRole>
            }
          />
          <Route
            path="/portal-dropdowns"
            element={
              <RequireRole allowed={['admin', 'finance']}>
                <CatalogosPortal />
              </RequireRole>
            }
          />
          <Route
            path="/portal-pm"
            element={
              <RequireRole allowed={['admin', 'pm']}>
                <PMPortal />
              </RequireRole>
            }
          />
          <Route
            path="/proyectos"
            element={
              <RequireRole allowed={['admin', 'pm']}>
                <Proyectos />
              </RequireRole>
            }
          />
          <Route path="/viaticos" element={<Viaticos />} />
          <Route
            path="/dispersion"
            element={
              <RequireRole allowed={['admin', 'finance']}>
                <Dispersion />
              </RequireRole>
            }
          />
          <Route
            path="/recuperacion"
            element={
              <RequireRole allowed={['admin', 'finance']}>
                <Recuperacion />
              </RequireRole>
            }
          />
          <Route path="/conciliacion" element={<Conciliacion />} />
          <Route
            path="/amex"
            element={
              <RequireRole allowed={['admin', 'finance']}>
                <Amex />
              </RequireRole>
            }
          />
          <Route
            path="/amex/tarjetas"
            element={
              <RequireRole allowed={['admin', 'finance']}>
                <TarjetasAmexAdmin />
              </RequireRole>
            }
          />
          <Route
            path="/flotilla"
            element={
              <RequireRole allowed={['admin', 'finance']}>
                <Flotilla />
              </RequireRole>
            }
          />
          <Route
            path="/viajes"
            element={
              <RequireRole allowed={['admin', 'finance']}>
                <Viajes />
              </RequireRole>
            }
          />
          <Route
            path="/reportes"
            element={
              <RequireRole allowed={['admin', 'finance']}>
                <Reportes />
              </RequireRole>
            }
          />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
