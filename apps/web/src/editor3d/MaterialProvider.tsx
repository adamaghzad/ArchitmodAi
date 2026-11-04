import { useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { MaterialContext, MaterialLibrary } from './materials';
import { useThree } from '@react-three/fiber';
import type { MaterialAsset } from './assetRegistry';

export function MaterialProvider({
  children,
  assets,
}: {
  children: ReactNode;
  assets?: MaterialAsset[];
}) {
  const invalidate = useThree((state) => state.invalidate);
  const library = useMemo(
    () => new MaterialLibrary(assets, invalidate),
    [assets, invalidate],
  );
  useEffect(() => {
    // React StrictMode replays effects. A deferred disposal is cancelled by the
    // replay but runs after a genuine unmount or library replacement.
    libraryUsers.set(library, (libraryUsers.get(library) || 0) + 1);
    return () => {
      libraryUsers.set(library, (libraryUsers.get(library) || 1) - 1);
      queueMicrotask(() => {
        if (!libraryUsers.get(library)) library.dispose();
      });
    };
  }, [library]);
  return (
    <MaterialContext.Provider value={library}>
      {children}
    </MaterialContext.Provider>
  );
}

const libraryUsers = new WeakMap<MaterialLibrary, number>();
