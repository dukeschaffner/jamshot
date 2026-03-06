'use client';

import { createContext, useContext } from 'react';

const TreeInteractionsContext = createContext();

export function TreeInteractionsProvider({ children, navigateToPlayingTrack }) {
  return (
    <TreeInteractionsContext.Provider
      value={{
        navigateToPlayingTrack,
      }}
    >
      {children}
    </TreeInteractionsContext.Provider>
  );
}

export function useTreeInteractions() {
  const context = useContext(TreeInteractionsContext);
  if (!context) {
    throw new Error('useTreeInteractions must be used within TreeInteractionsProvider');
  }
  return context;
}

