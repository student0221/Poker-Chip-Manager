import { HashRouter, Routes, Route } from 'react-router-dom';
import PlayerPage from './pages/PlayerPage';
import AdminPage from './pages/AdminPage';
import RoomsPage from './pages/RoomsPage';
import RoomPage from './pages/RoomPage';

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<PlayerPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/rooms" element={<RoomsPage />} />
        <Route path="/room/:roomId" element={<RoomPage />} />
      </Routes>
    </HashRouter>
  );
}

export default App;
