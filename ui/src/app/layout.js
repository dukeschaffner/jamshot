'use client';
import { useState } from 'react';
import Link from 'next/link';
import Cookies from 'js-cookie';
import './globals.css';

export default function RootLayout({ children }) {
  const [isLoggedIn, setIsLoggedIn] = useState(!!Cookies.get('token'));

  const handleLogout = () => {
    Cookies.remove('token');
    setIsLoggedIn(false);
  };

  return (
    <html lang="en">
      <body className="bg-gray-100">
        <nav className="bg-blue-600 p-4 text-white">
          <div className="max-w-4xl mx-auto flex justify-between">
            <Link href="/" className="text-xl font-bold">ChanceLayer</Link>
            <div>
              {isLoggedIn ? (
                <>
                  <Link href="/upload" className="mr-4">Upload</Link>
                  <button onClick={handleLogout} className="bg-red-500 px-2 py-1 rounded">Logout</button>
                </>
              ) : (
                <>
                  <Link href="/login" className="mr-4">Login</Link>
                  <Link href="/register">Register</Link>
                </>
              )}
            </div>
          </div>
        </nav>
        <main className="max-w-4xl mx-auto p-4">{children}</main>
      </body>
    </html>
  );
}