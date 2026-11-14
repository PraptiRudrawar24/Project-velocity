import type { Group, MeshStandardMaterial } from 'three';
import type { VehicleSpec } from '../core/types';

export interface VehicleVisualRefs {
  chassisGroupRef: React.RefObject<Group | null>;
  wheelMountRefs: [
    React.RefObject<Group | null>, // 0: Front Left
    React.RefObject<Group | null>, // 1: Front Right
    React.RefObject<Group | null>, // 2: Rear Left
    React.RefObject<Group | null>, // 3: Rear Right
  ];
  wheelSpinRefs: [
    React.RefObject<Group | null>,
    React.RefObject<Group | null>,
    React.RefObject<Group | null>,
    React.RefObject<Group | null>,
  ];
  steeringWheelRef: React.RefObject<Group | null>;
  brakeLightMatRef: React.RefObject<MeshStandardMaterial | null>;
  reverseLightMatRef: React.RefObject<MeshStandardMaterial | null>;
}

export interface VehicleModelComponentProps {
  spec: VehicleSpec;
  visualRefs: VehicleVisualRefs;
}

/**
 * Resolves whether an external GLB/GLTF vehicle asset is configured or
 * falls back cleanly to the procedural sports car builder.
 */
export function hasExternalVehicleAsset(spec: VehicleSpec): boolean {
  return Boolean(spec.assetModelPath && spec.assetModelPath.trim().length > 0);
}

