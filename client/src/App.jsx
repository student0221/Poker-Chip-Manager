import { HashRouter, Routes, Route } from 'react-router-dom';
import PlayerPage from './pages/PlayerPage';
import AdminPage from './pages/AdminPage';

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<PlayerPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </HashRouter>
  );
}

export default App;
