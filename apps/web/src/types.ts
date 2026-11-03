export type Point = [number, number];
export type RoomType = 'living' | 'bedroom' | 'kitchen' | 'bathroom' | 'office';
export interface RoomRequirement {
  type: RoomType;
  min_area_m2: number;
}
export interface Room {
  id: string;
  type: RoomType;
  name: string;
  polygon: Point[];
  color: string;
  provenance: string;
}
export interface Wall {
  id: string;
  start: Point;
  end: Point;
  thickness: number;
  height: number;
}
export interface Opening {
  id: string;
  type: 'door' | 'window';
  wall_id: string;
  offset_m: number;
  width_m: number;
  height_m: number;
  sill_m: number;
}
export interface Furniture {
  id: string;
  product_id: string;
  room_id: string;
  position: Point;
  rotation_deg: 0 | 90 | 180 | 270;
}
export interface Scene {
  id: string;
  units: 'm';
  width_m: number;
  depth_m: number;
  scale_confirmed: boolean;
  style: string;
  budget_mad: number;
  rooms: Room[];
  walls: Wall[];
  openings: Opening[];
  furniture: Furniture[];
  materials: {
    id: string;
    product_id: string;
    room_id: string;
    surface: 'floor' | 'walls';
    area_m2: number;
    waste_fraction: number;
    units: number;
  }[];
  notes: string[];
}
export interface Product {
  id: string;
  name: string;
  category: string;
  width_m: number;
  depth_m: number;
  height_m: number;
  price_mad: number;
  color: string;
  kind: 'furniture' | 'material';
  room_types: RoomType[];
  brand: string;
  material: string;
  design_style: string;
  image_url: string | null;
  model_3d_path: string | null;
  verified_url: boolean;
  source_provider: string;
  mock_data: boolean;
  availability_status: string;
  coverage_m2_per_unit: number | null;
  unit: string;
  pack_size: number;
  coverage_note: string | null;
  product_url: string | null;
  checked_at: string | null;
}
export interface ValidationReport {
  valid: boolean;
  issues: {
    code: string;
    message: string;
    severity: 'error' | 'warning';
    object_id: string | null;
    related_object_ids: string[];
  }[];
  total_mad: number;
  sample_prices: boolean;
}
export interface Project {
  id: string;
  name: string;
  revision: number;
  created_at: string;
  updated_at: string;
  candidate_scene: Scene | null;
  committed_scene: Scene | null;
  reference: {
    url: string;
    filename: string;
    width_px: number;
    height_px: number;
    page: number;
  } | null;
  report: ValidationReport | null;
  undo_stack: (Scene | null)[];
  redo_stack: (Scene | null)[];
  recommendations: {
    id: string;
    product_id: string;
    room_id: string;
    reason: string;
    surface: 'floor' | 'walls' | null;
    status: 'pending' | 'accepted' | 'rejected';
    mock_data: boolean;
  }[];
  perception: {
    provider: string;
    width_px: number;
    height_px: number;
    wall_candidates: [Point, Point][];
    warnings: string[];
  } | null;
}
export interface Operation {
  type:
    | 'move_furniture'
    | 'update_wall'
    | 'update_opening'
    | 'set_material'
    | 'delete_furniture';
  object_id: string;
  position?: Point;
  rotation_deg?: number;
  start?: Point;
  end?: Point;
  color?: string;
  height?: number;
  thickness?: number;
  offset_m?: number;
  width_m?: number;
  height_m?: number;
  sill_m?: number;
}
