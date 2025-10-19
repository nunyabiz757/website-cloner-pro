import { Link, useLocation } from 'react-router-dom';
import { Activity, Home, BarChart3, Zap, Eye, Download } from 'lucide-react';

export default function Header() {
  const location = useLocation();

  const isActive = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(path);
  };

  return (
    <header className="bg-white border-b border-gray-200 shadow-sm">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-600 rounded-lg flex items-center justify-center">
              <Activity className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Website Cloner Pro</h1>
              <p className="text-xs text-gray-500">Performance-First Migration Tool</p>
            </div>
          </Link>

          <nav className="hidden md:flex items-center space-x-1">
            <NavLink to="/" icon={Home} label="Home" active={location.pathname === '/'} />
            <NavLink to="/performance" icon={BarChart3} label="Performance" active={isActive('/performance')} />
            <NavLink to="/optimization" icon={Zap} label="Optimize" active={isActive('/optimization')} />
            <NavLink to="/preview" icon={Eye} label="Preview" active={isActive('/preview')} />
            <NavLink to="/export" icon={Download} label="Export" active={isActive('/export')} />
          </nav>

          <div className="flex items-center space-x-4">
            <button className="text-sm text-gray-600 hover:text-gray-900">
              Docs
            </button>
            <button className="btn-primary text-sm">
              New Project
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

interface NavLinkProps {
  to: string;
  icon: React.FC<{ className?: string }>;
  label: string;
  active: boolean;
}

function NavLink({ to, icon: Icon, label, active }: NavLinkProps) {
  return (
    <Link
      to={to}
      className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
        active
          ? 'bg-primary-50 text-primary-700 font-medium'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
      }`}
    >
      <Icon className="w-4 h-4" />
      <span className="text-sm">{label}</span>
    </Link>
  );
}
