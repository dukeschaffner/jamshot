import { Link, Navigate, Route, Routes } from 'react-router-dom';
import './global.css';
import { CreatePage } from './pages/CreatePage';
import { EditPage } from './pages/EditPage';
import { HomePage } from './pages/HomePage';

export function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Issues visualizer</h1>
        <nav className="app-nav">
          <Link to="/">Home</Link>
          <Link to="/create">New issue</Link>
        </nav>
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/create" element={<CreatePage />} />
          <Route path="/edit" element={<EditPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
