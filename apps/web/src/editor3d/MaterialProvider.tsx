import { useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { MaterialContext, MaterialLibrary } from './materials';

export function MaterialProvider({ children }: { children: ReactNode }) {
  const library = useMemo(() => new MaterialLibrary(), []);
  useEffect(() => () => library.dispose(), [library]);
  return (
    <MaterialContext.Provider value={library}>
      {children}
    </MaterialContext.Provider>
  );
}
