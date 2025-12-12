import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/layout/Layout';
import Dashboard from './pages/Dashboard';
import Proyectos from './pages/proyectos/Proyectos';
import Viaticos from './pages/viaticos/Viaticos';
import Dispersion from './pages/dispersion/Dispersion';
import Recuperacion from './pages/recuperacion/Recuperacion';
import Conciliacion from './pages/conciliacion/Conciliacion';
import Amex from './pages/amex/Amex';
import Flotilla from './pages/flotilla/Flotilla';
import Reportes from './pages/reportes/Reportes';
import UsuarioView from './pages/usuario/UsuarioView';

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/proyectos" element={<Proyectos />} />
          <Route path="/viaticos" element={<Viaticos />} />
          <Route path="/dispersion" element={<Dispersion />} />
          <Route path="/recuperacion" element={<Recuperacion />} />
          <Route path="/conciliacion" element={<Conciliacion />} />
          <Route path="/amex" element={<Amex />} />
          <Route path="/flotilla" element={<Flotilla />} />
          <Route path="/reportes" element={<Reportes />} />
          <Route path="/mi-portal" element={<UsuarioView />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
