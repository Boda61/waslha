import { Routes, Route } from 'react-router-dom';
import { ProtectedRoute, RedirectIfAuthed } from './components/ProtectedRoute.jsx';
import Navbar from './components/Navbar.jsx';
import Toast from './components/Toast.jsx';
import Home from './pages/Home.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Profile from './pages/Profile.jsx';
import CreateRoom from './pages/CreateRoom.jsx';
import JoinRoom from './pages/JoinRoom.jsx';
import RoomPage from './pages/RoomPage.jsx';
import HebdHome from './pages/hebd/HebdHome.jsx';
import HebdRoomPage from './pages/hebd/HebdRoomPage.jsx';
import NotFound from './pages/NotFound.jsx';

function App() {
  return (
    <div className="game-bg flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route
            path="/login"
            element={
              <RedirectIfAuthed>
                <Login />
              </RedirectIfAuthed>
            }
          />
          <Route
            path="/register"
            element={
              <RedirectIfAuthed>
                <Register />
              </RedirectIfAuthed>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/create"
            element={
              <ProtectedRoute>
                <CreateRoom />
              </ProtectedRoute>
            }
          />
          <Route
            path="/join"
            element={
              <ProtectedRoute>
                <JoinRoom />
              </ProtectedRoute>
            }
          />
          <Route
            path="/room/:roomId"
            element={
              <ProtectedRoute>
                <RoomPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/hebd"
            element={
              <ProtectedRoute>
                <HebdHome />
              </ProtectedRoute>
            }
          />
          <Route
            path="/hebd/lobby/:roomId"
            element={
              <ProtectedRoute>
                <HebdRoomPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Toast />
    </div>
  );
}

export default App;
