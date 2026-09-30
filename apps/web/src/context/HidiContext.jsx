import React, { createContext, useContext } from 'react';

const HidiContext = createContext(null);
export function HidiProvider({ value, children }) {
  return <HidiContext.Provider value={value}>{children}</HidiContext.Provider>;
}
export function useHidi() {
  const context = useContext(HidiContext);
  if (!context) throw new Error('HIDI components must be inside HidiProvider.');
  return context;
}
