import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type {
  BodyKitStyleId,
  DecalStyleId,
  SpoilerStyleId,
  WheelStyleId,
} from '../core/types';
import type { VehicleModelComponentProps } from './VehicleAssetRegistry';

function createBodyShellGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-2.14, -0.26); // Rear diffuser bottom
  shape.lineTo(1.75, -0.28); // Flat underbody
  shape.lineTo(2.18, -0.22); // Front splitter tip
  shape.lineTo(2.22, -0.06); // Front nose lip
  shape.lineTo(1.88, 0.14); // Front hood slope
  shape.lineTo(0.88, 0.22); // Base of windshield
  shape.lineTo(0.18, 0.44); // Lower beltline shoulder
  shape.lineTo(-1.15, 0.42); // Rear fender haunch
  shape.lineTo(-2.05, 0.34); // Rear decklid
  shape.lineTo(-2.22, 0.18); // Rear fascia top
  shape.lineTo(-2.14, -0.26);

  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: 1.76,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.06,
    bevelSegments: 3,
    curveSegments: 8,
  });

  geom.translate(0, 0, -1.76 / 2);
  geom.rotateY(Math.PI / 2);
  geom.computeVertexNormals();
  return geom;
}

function createCabinCanopyGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-1.35, 0.36);
  shape.lineTo(0.88, 0.20);
  shape.lineTo(0.24, 0.64);
  shape.lineTo(-0.52, 0.66);
  shape.lineTo(-1.35, 0.36);

  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: 1.24,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.04,
    bevelSegments: 2,
  });
  geom.translate(0, 0, -1.24 / 2);
  geom.rotateY(Math.PI / 2);
  geom.computeVertexNormals();
  return geom;
}

interface WheelAssemblyProps {
  index: number;
  xPos: number;
  zPos: number;
  isFront: boolean;
  isLeft: boolean;
  radius: number;
  width: number;
  caliperColor: string;
  rimColor: string;
  wheelStyle: WheelStyleId;
  mountRef?: React.RefObject<THREE.Group | null>;
  spinRef?: React.RefObject<THREE.Group | null>;
}

function WheelAssembly({
  xPos,
  zPos,
  isLeft,
  radius,
  width,
  caliperColor,
  rimColor,
  wheelStyle,
  mountRef,
  spinRef,
}: WheelAssemblyProps) {
  const rimRadius = radius * 0.68;
  const sideSign = isLeft ? -1 : 1;

  const spokeCount =
    wheelStyle === 'twin-spoke' ? 10 : wheelStyle === 'gold-mesh' ? 8 : 5;
  const spokeAngles = Array.from(
    { length: spokeCount },
    (_, i) => (i * Math.PI * 2) / spokeCount
  );
  const spokeWidth = wheelStyle === 'five-spoke' ? 0.048 : 0.026;

  return (
    <group ref={mountRef} position={[xPos, -0.16, zPos]}>
      {/* Non-spinning brake caliper mounted to hub upright */}
      <mesh position={[sideSign * 0.03, 0.02, 0.14]} castShadow>
        <boxGeometry args={[0.1, 0.14, 0.11]} />
        <meshStandardMaterial
          color={caliperColor}
          metalness={0.55}
          roughness={0.28}
        />
      </mesh>

      {/* Spinning tire + alloy rim + brake rotor */}
      <group ref={spinRef}>
        {/* Main Rubber Tire */}
        <mesh rotation={[0, 0, Math.PI / 2]} castShadow receiveShadow>
          <cylinderGeometry args={[radius, radius, width, 28]} />
          <meshStandardMaterial color="#16181d" roughness={0.86} metalness={0.05} />
        </mesh>

        {/* Inner Alloy Rim Barrel */}
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[rimRadius, rimRadius, width + 0.008, 24]} />
          <meshStandardMaterial color="#1e2430" roughness={0.35} metalness={0.8} />
        </mesh>

        {/* Ventilated Brake Disc Rotor */}
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[rimRadius * 0.82, rimRadius * 0.82, 0.04, 24]} />
          <meshStandardMaterial color="#94a3b8" roughness={0.35} metalness={0.9} />
        </mesh>

        {/* Outer Rim Lip */}
        <mesh
          position={[sideSign * (width * 0.46), 0, 0]}
          rotation={[0, sideSign > 0 ? Math.PI / 2 : -Math.PI / 2, 0]}
        >
          <ringGeometry args={[rimRadius * 0.82, rimRadius * 0.99, 24]} />
          <meshStandardMaterial
            color={rimColor}
            metalness={0.88}
            roughness={0.2}
          />
        </mesh>

        {wheelStyle === 'turbofan' ? (
          /* Aero Carbon Turbofan Wheel Cover */
          <group>
            <mesh
              position={[sideSign * (width * 0.47), 0, 0]}
              rotation={[0, sideSign > 0 ? Math.PI / 2 : -Math.PI / 2, 0]}
            >
              <circleGeometry args={[rimRadius * 0.84, 24]} />
              <meshStandardMaterial
                color="#111827"
                metalness={0.5}
                roughness={0.32}
              />
            </mesh>
            {[0, 1, 2, 3, 4, 5].map((i) => {
              const ang = (i * Math.PI * 2) / 6;
              return (
                <mesh
                  key={i}
                  position={[
                    sideSign * (width * 0.48),
                    Math.cos(ang) * (rimRadius * 0.54),
                    Math.sin(ang) * (rimRadius * 0.54),
                  ]}
                  rotation={[ang, 0, 0]}
                >
                  <boxGeometry args={[0.015, rimRadius * 0.45, 0.025]} />
                  <meshStandardMaterial color={rimColor} metalness={0.8} roughness={0.25} />
                </mesh>
              );
            })}
          </group>
        ) : (
          /* Radial Alloy Spokes */
          spokeAngles.map((ang, idx) => (
            <mesh
              key={idx}
              position={[
                sideSign * (width * 0.46),
                Math.cos(ang) * (rimRadius * 0.44),
                Math.sin(ang) * (rimRadius * 0.44),
              ]}
              rotation={[ang, 0, 0]}
            >
              <boxGeometry args={[0.032, rimRadius * 0.84, spokeWidth]} />
              <meshStandardMaterial
                color={rimColor}
                metalness={0.88}
                roughness={0.22}
              />
            </mesh>
          ))
        )}

        {/* Centerlock Hub Cap */}
        <mesh
          position={[sideSign * (width * 0.485), 0, 0]}
          rotation={[0, 0, Math.PI / 2]}
        >
          <cylinderGeometry args={[0.055, 0.055, 0.04, 14]} />
          <meshStandardMaterial color={caliperColor} metalness={0.7} roughness={0.25} />
        </mesh>
      </group>
    </group>
  );
}

function SpoilerAttachment({
  spoilerStyle,
  bodyColor,
  accentColor,
}: {
  spoilerStyle: SpoilerStyleId;
  bodyColor: string;
  accentColor: string;
}) {
  if (spoilerStyle === 'stock') {
    return (
      <group position={[0, 0.36, 2.08]}>
        <mesh rotation={[-0.22, 0, 0]} castShadow>
          <boxGeometry args={[1.68, 0.06, 0.20]} />
          <meshPhysicalMaterial
            color={bodyColor}
            metalness={0.62}
            roughness={0.22}
            clearcoat={1}
          />
        </mesh>
      </group>
    );
  }

  if (spoilerStyle === 'high-downforce') {
    return (
      <group position={[0, 0.68, 2.08]}>
        {/* Lower Main Carbon Airfoil */}
        <mesh rotation={[-0.1, 0, 0]} castShadow>
          <boxGeometry args={[1.98, 0.045, 0.36]} />
          <meshStandardMaterial
            color={accentColor}
            roughness={0.25}
            metalness={0.55}
          />
        </mesh>
        {/* Upper Secondary Flap */}
        <mesh position={[0, 0.09, 0.14]} rotation={[-0.24, 0, 0]} castShadow>
          <boxGeometry args={[1.94, 0.03, 0.16]} />
          <meshStandardMaterial
            color={accentColor}
            roughness={0.25}
            metalness={0.55}
          />
        </mesh>
        {/* Tall Oversized Endplates */}
        {[-0.99, 0.99].map((xPos, idx) => (
          <mesh key={idx} position={[xPos, -0.02, 0.04]} castShadow>
            <boxGeometry args={[0.035, 0.30, 0.48]} />
            <meshPhysicalMaterial
              color={bodyColor}
              metalness={0.6}
              roughness={0.22}
              clearcoat={1}
            />
          </mesh>
        ))}
        {/* Tall Uprights */}
        {[-0.48, 0.48].map((xPos, idx) => (
          <mesh key={idx} position={[xPos, -0.22, -0.03]} castShadow>
            <boxGeometry args={[0.045, 0.42, 0.16]} />
            <meshStandardMaterial color="#1e293b" metalness={0.75} roughness={0.32} />
          </mesh>
        ))}
      </group>
    );
  }

  // Default: 'gt-wing'
  return (
    <group position={[0, 0.56, 2.04]}>
      <mesh rotation={[-0.08, 0, 0]} castShadow>
        <boxGeometry args={[1.86, 0.04, 0.32]} />
        <meshStandardMaterial
          color={accentColor}
          roughness={0.28}
          metalness={0.5}
        />
      </mesh>
      {[-0.93, 0.93].map((xPos, idx) => (
        <mesh key={idx} position={[xPos, -0.02, 0.02]} castShadow>
          <boxGeometry args={[0.03, 0.18, 0.38]} />
          <meshPhysicalMaterial
            color={bodyColor}
            metalness={0.6}
            roughness={0.22}
            clearcoat={1}
          />
        </mesh>
      ))}
      {[-0.42, 0.42].map((xPos, idx) => (
        <mesh key={idx} position={[xPos, -0.14, -0.02]} castShadow>
          <boxGeometry args={[0.04, 0.26, 0.14]} />
          <meshStandardMaterial color="#1e293b" metalness={0.7} roughness={0.35} />
        </mesh>
      ))}
    </group>
  );
}

function BodyKitAttachment({
  bodyKitStyle,
  bodyColor,
  accentColor,
  frontZ,
  rearZ,
}: {
  bodyKitStyle: BodyKitStyleId;
  bodyColor: string;
  accentColor: string;
  frontZ: number;
  rearZ: number;
}) {
  if (bodyKitStyle === 'factory') {
    return null;
  }

  const isWide = bodyKitStyle === 'widebody-gt';

  return (
    <group name="AftermarketBodyKit">
      {/* Extended Aero Front Splitter Blade */}
      <mesh position={[0, -0.265, -2.20]} castShadow>
        <boxGeometry args={[isWide ? 2.06 : 1.98, 0.035, 0.30]} />
        <meshStandardMaterial color={accentColor} roughness={0.32} metalness={0.48} />
      </mesh>

      {/* Front Splitter Side Winglets / Canards */}
      {[-1, 1].map((sign, idx) => (
        <mesh
          key={`canard-${idx}`}
          position={[sign * (isWide ? 1.0 : 0.96), -0.18, -2.14]}
          rotation={[0, 0, sign * -0.15]}
          castShadow
        >
          <boxGeometry args={[0.04, 0.14, 0.26]} />
          <meshStandardMaterial color={accentColor} roughness={0.32} metalness={0.45} />
        </mesh>
      ))}

      {/* Extended Carbon Side Skirt Extensions */}
      {[-0.99, 0.99].map((xPos, idx) => (
        <mesh key={`ext-skirt-${idx}`} position={[xPos, -0.275, 0.02]} castShadow>
          <boxGeometry args={[isWide ? 0.14 : 0.10, 0.035, 2.25]} />
          <meshStandardMaterial color={accentColor} roughness={0.35} metalness={0.45} />
        </mesh>
      ))}

      {isWide && (
        <>
          {/* Front Bumper Dive Planes */}
          {[-0.98, 0.98].map((xPos, idx) => (
            <mesh
              key={`dive-${idx}`}
              position={[xPos, -0.08, -2.02]}
              rotation={[0.18, xPos < 0 ? 0.25 : -0.25, 0]}
              castShadow
            >
              <boxGeometry args={[0.12, 0.025, 0.24]} />
              <meshStandardMaterial color={accentColor} roughness={0.32} metalness={0.5} />
            </mesh>
          ))}

          {/* Flared Widebody Fender Overfenders over Front & Rear Wheels */}
          {[
            { x: -0.94, z: frontZ },
            { x: 0.94, z: frontZ },
            { x: -0.95, z: rearZ },
            { x: 0.95, z: rearZ },
          ].map((f, idx) => (
            <mesh key={`arch-${idx}`} position={[f.x, -0.01, f.z]} castShadow>
              <boxGeometry args={[0.12, 0.28, 0.86]} />
              <meshPhysicalMaterial
                color={bodyColor}
                metalness={0.62}
                roughness={0.22}
                clearcoat={1}
              />
            </mesh>
          ))}
        </>
      )}
    </group>
  );
}

function DecalAttachment({
  decalStyle,
  decalColor,
}: {
  decalStyle: DecalStyleId;
  decalColor: string;
}) {
  if (decalStyle === 'none') return null;

  if (decalStyle === 'center-stripe') {
    return (
      <group name="CenterRacingStripes">
        {[-0.16, 0.16].map((xOff, idx) => (
          <group key={idx}>
            {/* Hood & Nose Stripe */}
            <mesh position={[xOff, 0.195, -1.42]} rotation={[0.145, 0, 0]}>
              <boxGeometry args={[0.12, 0.012, 1.18]} />
              <meshStandardMaterial color={decalColor} roughness={0.28} metalness={0.2} />
            </mesh>
            {/* Roof Stripe */}
            <mesh position={[xOff, 0.702, -0.14]}>
              <boxGeometry args={[0.12, 0.012, 0.84]} />
              <meshStandardMaterial color={decalColor} roughness={0.28} metalness={0.2} />
            </mesh>
            {/* Rear Deck Stripe */}
            <mesh position={[xOff, 0.45, 1.56]} rotation={[-0.08, 0, 0]}>
              <boxGeometry args={[0.12, 0.012, 0.98]} />
              <meshStandardMaterial color={decalColor} roughness={0.28} metalness={0.2} />
            </mesh>
          </group>
        ))}
      </group>
    );
  }

  if (decalStyle === 'side-livery') {
    return (
      <group name="MotorsportSideLivery">
        {[-0.955, 0.955].map((xPos, idx) => (
          <group key={idx}>
            <mesh position={[xPos, -0.04, 0.05]}>
              <boxGeometry args={[0.014, 0.08, 2.7]} />
              <meshStandardMaterial color={decalColor} roughness={0.3} metalness={0.2} />
            </mesh>
            {/* Door Number Plate */}
            <mesh position={[xPos, 0.08, -0.15]}>
              <boxGeometry args={[0.016, 0.24, 0.42]} />
              <meshStandardMaterial color="#f8fafc" roughness={0.4} />
            </mesh>
          </group>
        ))}
        {/* Hood Roundel */}
        <mesh position={[0, 0.21, -1.40]} rotation={[-Math.PI / 2 + 0.145, 0, 0]}>
          <circleGeometry args={[0.26, 20]} />
          <meshStandardMaterial color={decalColor} roughness={0.35} />
        </mesh>
      </group>
    );
  }

  // 'apex-duo'
  return (
    <group name="ApexDuoDecal">
      <mesh position={[0, 0.198, -1.40]} rotation={[0.145, 0, 0]}>
        <boxGeometry args={[0.42, 0.012, 1.15]} />
        <meshStandardMaterial color={decalColor} roughness={0.28} metalness={0.25} />
      </mesh>
      <mesh position={[0, 0.452, 1.54]} rotation={[-0.08, 0, 0]}>
        <boxGeometry args={[0.42, 0.012, 0.94]} />
        <meshStandardMaterial color={decalColor} roughness={0.28} metalness={0.25} />
      </mesh>
    </group>
  );
}

export function SportsCarModel({
  spec,
  visualRefs,
}: VehicleModelComponentProps) {
  const { bodyGeom, cabinGeom } = useMemo(
    () => ({
      bodyGeom: createBodyShellGeometry(),
      cabinGeom: createCabinCanopyGeometry(),
    }),
    []
  );

  useEffect(() => {
    return () => {
      bodyGeom.dispose();
      cabinGeom.dispose();
    };
  }, [bodyGeom, cabinGeom]);

  const wheelStyle = spec.appearance?.wheelStyle ?? 'five-spoke';
  const spoilerStyle = spec.appearance?.spoilerStyle ?? 'gt-wing';
  const bodyKitStyle = spec.appearance?.bodyKitStyle ?? 'factory';
  const decalStyle = spec.appearance?.decalStyle ?? 'none';
  const decalColor = spec.colors.decal ?? '#f8fafc';

  const wheelConfigs = [
    { x: -spec.wheels.halfTrackX, z: spec.wheels.frontZ, isFront: true, isLeft: true },
    { x: spec.wheels.halfTrackX, z: spec.wheels.frontZ, isFront: true, isLeft: false },
    { x: -spec.wheels.halfTrackX, z: spec.wheels.rearZ, isFront: false, isLeft: true },
    { x: spec.wheels.halfTrackX, z: spec.wheels.rearZ, isFront: false, isLeft: false },
  ];

  return (
    <group name="SportsCarVehicle">
      {/* Sprung Chassis Visual Group */}
      <group ref={visualRefs?.chassisGroupRef}>
        {/* Main Sculpted Clearcoat Body Shell */}
        <mesh geometry={bodyGeom} castShadow receiveShadow>
          <meshPhysicalMaterial
            color={spec.colors.body}
            metalness={0.62}
            roughness={0.22}
            clearcoat={1.0}
            clearcoatRoughness={0.08}
            envMapIntensity={1.35}
          />
        </mesh>

        {/* Tinted Aerodynamic Glass Canopy */}
        <mesh geometry={cabinGeom} castShadow>
          <meshPhysicalMaterial
            color="#0b1220"
            metalness={0.2}
            roughness={0.08}
            transparent
            opacity={0.42}
            clearcoat={1.0}
            envMapIntensity={1.6}
          />
        </mesh>

        {/* Carbon Roof Spine */}
        <mesh position={[0, 0.675, 0.14]} castShadow>
          <boxGeometry args={[1.08, 0.04, 0.88]} />
          <meshStandardMaterial
            color={spec.colors.accent}
            metalness={0.45}
            roughness={0.28}
          />
        </mesh>

        {/* Sculpted Hood Aero Intake Vent */}
        <mesh position={[0, 0.16, -1.32]} rotation={[0.1, 0, 0]}>
          <boxGeometry args={[0.68, 0.04, 0.55]} />
          <meshStandardMaterial color="#0b0f17" roughness={0.4} metalness={0.4} />
        </mesh>

        {/* Front Carbon Aero Splitter */}
        <mesh position={[0, -0.25, -2.06]} castShadow>
          <boxGeometry args={[1.92, 0.045, 0.42]} />
          <meshStandardMaterial
            color={spec.colors.accent}
            roughness={0.38}
            metalness={0.45}
          />
        </mesh>

        {/* Front Grille Intake */}
        <mesh position={[0, -0.14, -2.21]}>
          <boxGeometry args={[1.28, 0.16, 0.06]} />
          <meshStandardMaterial color="#090b10" roughness={0.7} />
        </mesh>

        {/* Carbon Side Skirts */}
        {[-0.95, 0.95].map((xPos, idx) => (
          <mesh key={`skirt-${idx}`} position={[xPos, -0.26, 0.02]} castShadow>
            <boxGeometry args={[0.1, 0.06, 2.15]} />
            <meshStandardMaterial
              color={spec.colors.accent}
              roughness={0.35}
              metalness={0.45}
            />
          </mesh>
        ))}

        {/* Side Intake Louvers */}
        {[-0.94, 0.94].map((xPos, idx) => (
          <mesh key={`intake-${idx}`} position={[xPos, 0.06, 0.65]}>
            <boxGeometry args={[0.05, 0.24, 0.52]} />
            <meshStandardMaterial color="#090c12" roughness={0.55} />
          </mesh>
        ))}

        {/* Side Mirrors */}
        {[-0.86, 0.86].map((xPos, idx) => (
          <group key={`mirror-${idx}`} position={[xPos, 0.34, -0.58]}>
            <mesh rotation={[0, 0, xPos < 0 ? 0.35 : -0.35]}>
              <boxGeometry args={[0.18, 0.04, 0.07]} />
              <meshStandardMaterial color={spec.colors.accent} roughness={0.4} />
            </mesh>
            <mesh position={[xPos < 0 ? -0.1 : 0.1, 0.03, 0.02]} castShadow>
              <boxGeometry args={[0.14, 0.08, 0.12]} />
              <meshPhysicalMaterial
                color={spec.colors.body}
                metalness={0.6}
                roughness={0.22}
                clearcoat={1}
              />
            </mesh>
          </group>
        ))}

        {/* Rear Diffuser + Vertical Aero Fins + Twin Dual Exhausts */}
        <mesh position={[0, -0.21, 2.14]} castShadow>
          <boxGeometry args={[1.76, 0.14, 0.22]} />
          <meshStandardMaterial color="#0b0e14" roughness={0.48} metalness={0.4} />
        </mesh>
        {[-0.62, -0.22, 0, 0.22, 0.62].map((fx, idx) => (
          <mesh key={`fin-${idx}`} position={[fx, -0.22, 2.24]}>
            <boxGeometry args={[0.025, 0.13, 0.12]} />
            <meshStandardMaterial color="#1e293b" roughness={0.4} metalness={0.5} />
          </mesh>
        ))}
        <mesh position={[0, 0.18, 2.20]}>
          <boxGeometry args={[1.74, 0.20, 0.05]} />
          <meshStandardMaterial color="#0c1017" roughness={0.45} metalness={0.35} />
        </mesh>
        {[0.88, 1.06, 1.24, 1.42].map((lz, idx) => (
          <mesh key={`louver-${idx}`} position={[0, 0.42 - idx * 0.015, lz]} rotation={[0.14, 0, 0]}>
            <boxGeometry args={[0.88, 0.025, 0.08]} />
            <meshStandardMaterial color="#0f141d" roughness={0.4} metalness={0.5} />
          </mesh>
        ))}
        {[-0.45, -0.32, 0.32, 0.45].map((xPos, idx) => (
          <mesh
            key={`exhaust-${idx}`}
            position={[xPos, -0.2, 2.24]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <cylinderGeometry args={[0.045, 0.045, 0.12, 12]} />
            <meshStandardMaterial
              color="#94a3b8"
              metalness={0.92}
              roughness={0.18}
            />
          </mesh>
        ))}

        {/* Customizable Body Kit, Spoiler & Decals */}
        <BodyKitAttachment
          bodyKitStyle={bodyKitStyle}
          bodyColor={spec.colors.body}
          accentColor={spec.colors.accent}
          frontZ={spec.wheels.frontZ}
          rearZ={spec.wheels.rearZ}
        />
        <SpoilerAttachment
          spoilerStyle={spoilerStyle}
          bodyColor={spec.colors.body}
          accentColor={spec.colors.accent}
        />
        <DecalAttachment decalStyle={decalStyle} decalColor={decalColor} />

        {/* LED DRL Headlights */}
        {[-0.64, 0.64].map((xPos, idx) => (
          <mesh
            key={`headlight-${idx}`}
            position={[xPos, 0.05, -2.18]}
            rotation={[0, xPos < 0 ? 0.24 : -0.24, 0]}
          >
            <boxGeometry args={[0.36, 0.06, 0.1]} />
            <meshStandardMaterial
              color="#f8fafc"
              emissive="#e0f2fe"
              emissiveIntensity={2.4}
              roughness={0.1}
            />
          </mesh>
        ))}

        {/* Full-width Reactive LED Taillight Bar */}
        <mesh position={[0, 0.22, 2.23]}>
          <boxGeometry args={[1.68, 0.065, 0.05]} />
          <meshStandardMaterial
            ref={visualRefs?.brakeLightMatRef}
            color="#991b1b"
            emissive="#ef4444"
            emissiveIntensity={0.85}
            roughness={0.2}
          />
        </mesh>

        {/* Reverse LED Accent Strip */}
        <mesh position={[0, 0.14, 2.23]}>
          <boxGeometry args={[0.42, 0.035, 0.04]} />
          <meshStandardMaterial
            ref={visualRefs?.reverseLightMatRef}
            color="#334155"
            emissive="#f8fafc"
            emissiveIntensity={0.0}
            roughness={0.2}
          />
        </mesh>

        {/* COCKPIT INTERIOR */}
        <group name="CockpitInterior">
          <mesh position={[0, 0.24, -0.52]}>
            <boxGeometry args={[1.22, 0.18, 0.42]} />
            <meshStandardMaterial color="#11161e" roughness={0.85} />
          </mesh>
          <mesh position={[-0.35, 0.30, -0.46]} rotation={[-0.25, 0, 0]}>
            <planeGeometry args={[0.26, 0.1]} />
            <meshStandardMaterial
              color="#082f49"
              emissive="#38bdf8"
              emissiveIntensity={1.1}
            />
          </mesh>
          <group
            ref={visualRefs?.steeringWheelRef}
            position={[-0.35, 0.28, -0.32]}
            rotation={[-0.32, 0, 0]}
          >
            <mesh>
              <torusGeometry args={[0.145, 0.02, 10, 24]} />
              <meshStandardMaterial color="#1e293b" roughness={0.6} />
            </mesh>
            <mesh position={[0, 0.145, 0]}>
              <boxGeometry args={[0.025, 0.045, 0.045]} />
              <meshStandardMaterial
                color="#ef4444"
                emissive="#ef4444"
                emissiveIntensity={0.5}
              />
            </mesh>
            <mesh>
              <boxGeometry args={[0.26, 0.03, 0.02]} />
              <meshStandardMaterial color="#475569" metalness={0.7} roughness={0.3} />
            </mesh>
            <mesh position={[0, -0.06, 0]}>
              <boxGeometry args={[0.035, 0.13, 0.02]} />
              <meshStandardMaterial color="#475569" metalness={0.7} roughness={0.3} />
            </mesh>
          </group>
          {[-0.35, 0.35].map((xPos, idx) => (
            <mesh key={`seat-${idx}`} position={[xPos, 0.34, 0.38]}>
              <boxGeometry args={[0.32, 0.42, 0.14]} />
              <meshStandardMaterial color="#181c24" roughness={0.85} />
            </mesh>
          ))}
        </group>
      </group>

      {/* 4 Detailed Wheel Assemblies */}
      {wheelConfigs.map((wc, idx) => (
        <WheelAssembly
          key={`wheel-${idx}`}
          index={idx}
          xPos={wc.x}
          zPos={wc.z}
          isFront={wc.isFront}
          isLeft={wc.isLeft}
          radius={spec.wheels.radius}
          width={spec.wheels.width}
          caliperColor={spec.colors.caliper}
          rimColor={spec.colors.rim}
          wheelStyle={wheelStyle}
          mountRef={visualRefs?.wheelMountRefs[idx]}
          spinRef={visualRefs?.wheelSpinRefs[idx]}
        />
      ))}
    </group>
  );
}
