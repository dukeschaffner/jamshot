'use client';

import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';

// Navigation guard context
const NavigationGuardContext = createContext({
  guards: [],
  addGuard: () => {},
  removeGuard: () => {},
  canNavigate: () => true,
  confirmNavigation: () => true
});

export const useNavigationGuard = () => {
  const context = useContext(NavigationGuardContext);
  if (!context) {
    throw new Error('useNavigationGuard must be used within a NavigationGuardProvider');
  }
  return context;
};

// Hook for components to register navigation guards
export const useNavigationGuardHook = ({ enabled, confirm }) => {
  const { addGuard, removeGuard } = useNavigationGuard();
  const guardIdRef = useRef(null);
  const confirmRef = useRef(confirm);

  // Update the confirm function reference when it changes
  confirmRef.current = confirm;

  useEffect(() => {
    if (enabled && confirm) {
      // If we already have a guard, update it by removing and re-adding
      if (guardIdRef.current) {
        removeGuard(guardIdRef.current);
      }
      guardIdRef.current = addGuard(() => confirmRef.current());
    } else if (guardIdRef.current) {
      // If disabled, remove the guard
      removeGuard(guardIdRef.current);
      guardIdRef.current = null;
    }

    return () => {
      if (guardIdRef.current) {
        removeGuard(guardIdRef.current);
        guardIdRef.current = null;
      }
    };
  }, [enabled, addGuard, removeGuard]);
};

export function NavigationGuardProvider({ children }) {
  const [guards, setGuards] = useState([]);
  const guardCounterRef = useRef(0);

  const addGuard = useCallback((confirmFn) => {
    const guardId = ++guardCounterRef.current;
    setGuards(prev => [...prev, { id: guardId, confirm: confirmFn }]);
    return guardId;
  }, []);

  const removeGuard = useCallback((guardId) => {
    setGuards(prev => prev.filter(guard => guard.id !== guardId));
  }, []);

  const canNavigate = () => {
    return guards.length === 0;
  };

  const confirmNavigation = () => {
    if (guards.length === 0) {
      return true;
    }

    // Check all guards - if any returns false, prevent navigation
    for (const guard of guards) {
      if (!guard.confirm()) {
        return false;
      }
    }
    return true;
  };

  // Handle external navigation (browser back/forward, refresh, closing tab)
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (!canNavigate()) {
        // Show browser's native confirmation dialog
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [guards]);

  const value = {
    guards,
    addGuard,
    removeGuard,
    canNavigate,
    confirmNavigation
  };

  return (
    <NavigationGuardContext.Provider value={value}>
      {children}
    </NavigationGuardContext.Provider>
  );
}