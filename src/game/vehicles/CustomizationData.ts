import type {
  BodyKitStyleId,
  DecalStyleId,
  SpoilerStyleId,
  WheelStyleId,
} from '../core/types';

export interface PaintOption {
  id: string;
  name: string;
  hex: string;
  decalContrast: string;
  price: number;
}

export interface WheelOption {
  id: WheelStyleId;
  name: string;
  rimHex: string;
  price: number;
  description: string;
}

export interface SpoilerOption {
  id: SpoilerStyleId;
  name: string;
  price: number;
  description: string;
}

export interface BodyKitOption {
  id: BodyKitStyleId;
  name: string;
  price: number;
  description: string;
}

export interface DecalOption {
  id: DecalStyleId;
  name: string;
  price: number;
  description: string;
}

export const PAINT_OPTIONS: readonly PaintOption[] = [
  { id: 'crimson', name: 'Racing Crimson', hex: '#c81e2b', decalContrast: '#f8fafc', price: 0 },
  { id: 'cobalt', name: 'Electric Cobalt', hex: '#1d4ed8', decalContrast: '#f8fafc', price: 0 },
  { id: 'emerald', name: 'Apex Emerald', hex: '#059669', decalContrast: '#f8fafc', price: 0 },
  { id: 'amber', name: 'Solar Amber', hex: '#ea580c', decalContrast: '#0f172a', price: 0 },
  { id: 'pearl', name: 'Glacier Pearl', hex: '#e2e8f0', decalContrast: '#dc2626', price: 200 },
  { id: 'obsidian', name: 'Stealth Obsidian', hex: '#1e293b', decalContrast: '#38bdf8', price: 250 },
  { id: 'violet', name: 'Midnight Violet', hex: '#7c3aed', decalContrast: '#f8fafc', price: 300 },
  { id: 'gold', name: 'Championship Gold', hex: '#ca8a04', decalContrast: '#0f172a', price: 400 },
];

export const WHEEL_OPTIONS: readonly WheelOption[] = [
  {
    id: 'five-spoke',
    name: '5-Spoke Forged Alloy',
    rimHex: '#d4d8e0',
    price: 0,
    description: 'Clean satin forged 5-spoke track wheels',
  },
  {
    id: 'twin-spoke',
    name: '10-Spoke GT Gunmetal',
    rimHex: '#64748b',
    price: 350,
    description: 'Lightweight multi-spoke motorsport mesh',
  },
  {
    id: 'turbofan',
    name: 'Carbon Aero Turbofan',
    rimHex: '#334155',
    price: 500,
    description: 'High-speed brake-cooling aero disc covers',
  },
  {
    id: 'gold-mesh',
    name: 'Forged Gold Track Spec',
    rimHex: '#fbbf24',
    price: 650,
    description: 'Championship gold centerlock alloy rims',
  },
];

export const SPOILER_OPTIONS: readonly SpoilerOption[] = [
  {
    id: 'stock',
    name: 'Integrated Ducktail Lip',
    price: 0,
    description: 'Low-drag sculpted rear deck spoiler',
  },
  {
    id: 'gt-wing',
    name: 'Swan-Neck Carbon GT Wing',
    price: 0,
    description: 'Track-balanced rear airfoil with painted endplates',
  },
  {
    id: 'high-downforce',
    name: 'Dual-Element Time Attack Wing',
    price: 550,
    description: 'Wide dual-plane rear wing with tall carbon uprights',
  },
];

export const BODY_KIT_OPTIONS: readonly BodyKitOption[] = [
  {
    id: 'factory',
    name: 'Factory Aero Package',
    price: 0,
    description: 'Standard front splitter and carbon side sills',
  },
  {
    id: 'street-aero',
    name: 'Clubsport Aero Kit',
    price: 450,
    description: 'Extended front splitter lip, side blades & rear fins',
  },
  {
    id: 'widebody-gt',
    name: 'Widebody GT3 Endurance Kit',
    price: 800,
    description: 'Flared fender arches, front dive planes & deep side skirts',
  },
];

export const DECAL_OPTIONS: readonly DecalOption[] = [
  {
    id: 'none',
    name: 'Clean Factory Finish',
    price: 0,
    description: 'Unmarked clearcoat metallic bodywork',
  },
  {
    id: 'center-stripe',
    name: 'Twin Racing Stripes',
    price: 200,
    description: 'Dual centerline stripes across hood, roof & deck',
  },
  {
    id: 'side-livery',
    name: 'Motorsport Side Livery',
    price: 350,
    description: 'Flank racing spears & contrasting number roundels',
  },
  {
    id: 'apex-duo',
    name: 'Apex Two-Tone Hood Pack',
    price: 450,
    description: 'Contrasting aero hood spine & rear accent graphics',
  },
];

export type CosmeticCategory = 'paint' | 'wheel' | 'spoiler' | 'bodyKit' | 'decal';

export function getCosmeticKey(category: CosmeticCategory, id: string): string {
  return `${category}:${id}`;
}

export function getDefaultOwnedCosmeticKeys(): string[] {
  const keys: string[] = [];
  for (const p of PAINT_OPTIONS) if (p.price === 0) keys.push(getCosmeticKey('paint', p.id));
  for (const w of WHEEL_OPTIONS) if (w.price === 0) keys.push(getCosmeticKey('wheel', w.id));
  for (const s of SPOILER_OPTIONS) if (s.price === 0) keys.push(getCosmeticKey('spoiler', s.id));
  for (const b of BODY_KIT_OPTIONS) if (b.price === 0) keys.push(getCosmeticKey('bodyKit', b.id));
  for (const d of DECAL_OPTIONS) if (d.price === 0) keys.push(getCosmeticKey('decal', d.id));
  return keys;
}

