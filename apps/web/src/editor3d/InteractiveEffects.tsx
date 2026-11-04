import { EffectComposer, SSAO, ToneMapping } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import type { SSAOEffect } from 'postprocessing';
import { useCallback, useRef } from 'react';
import type { Texture } from 'three';

export default function InteractiveEffects() {
  // SSAOEffect owns its noise texture, but its nested material's dispose does
  // not release texture uniforms. Ref detachment covers replacements too.
  const noiseTexture = useRef<Texture | null>(null);
  const noiseLifecycle = useCallback((effect: SSAOEffect | null) => {
    // noiseTexture is setter-only in postprocessing 6.38; read its uniform.
    const noise = effect?.ssaoMaterial.uniforms.noiseTexture.value as
      Texture | null | undefined;
    if (noiseTexture.current && noiseTexture.current !== noise)
      noiseTexture.current.dispose();
    noiseTexture.current = noise || null;
  }, []);
  return (
    <EffectComposer multisampling={0} enableNormalPass resolutionScale={0.5}>
      <SSAO
        ref={noiseLifecycle}
        samples={8}
        rings={3}
        radius={0.08}
        intensity={8}
        luminanceInfluence={0.7}
      />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}
