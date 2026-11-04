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
  requirement_id?: string | null;
  support_id?: string | null;
  elevation_m?: number;
  fabric_color?: string | null;
  wood_color?: string | null;
  light_color?: string | null;
}
export interface RenderAuditEntry {
  id: string;
  productId: string;
  status: 'rendered' | 'missing';
  assetStatus: string;
  meshes: number;
  colors: string[];
}
export interface CompletionReport {
  complete: boolean;
  requested_count: number;
  placed_count: number;
  correction_attempts: number;
  items: {
    requirement_id: string;
    name: string;
    requested: number;
    placed: number;
    object_ids: string[];
    product_ids: string[];
    reason: string | null;
    validation_status: string;
    rendering_status: string;
    origin?: 'user' | 'template';
    priority?: string;
  }[];
  material_requirements: { name: string; satisfied: boolean; reason: string }[];
  budget_mad: number;
  total_mad: number;
  within_budget: boolean;
  geometry_valid: boolean;
  geometry_errors: string[];
  profile_id?: string | null;
  user_requirements_complete?: boolean;
  template_items?: CompletionReport['items'];
  style_preferences?: {
    preference: string;
    satisfied: boolean;
    reason: string;
  }[];
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
  design_brief?: {
    profile_id?: string | null;
    prompt: string;
    furniture: {
      role: string;
      name: string;
      quantity: number;
      room_type: RoomType;
      priority: string;
    }[];
    palette: string[];
    materials: string[];
  } | null;
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
  completeness?: CompletionReport | null;
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
