import { Outlet } from 'react-router-dom';
import Header from './Header';

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8">
        <Outlet />
      </main>
      <footer className="bg-gray-100 border-t border-gray-200 py-6">
        <div className="container mx-auto px-4 text-center text-gray-600 text-sm">
          <p>Website Cloner Pro - Performance Optimization & Platform Transfer Tool</p>
          <p className="mt-2">Built with React, TypeScript, Puppeteer, Lighthouse & Sharp</p>
        </div>
      </footer>
    </div>
  );
}
