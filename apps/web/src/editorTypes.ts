export type EditorTool = 'select' | 'pan' | 'move' | 'rotate' | 'measure';
export type CameraPreset = 'isometric' | 'top' | 'perspective' | 'interior';
export interface CameraCommand {
  action: CameraPreset | 'fit' | 'reset' | 'zoom_in' | 'zoom_out';
  serial: number;
}
export interface ViewSettings {
  grid: boolean;
  cutaway: boolean;
  ceilings: boolean;
  furniture: boolean;
}
