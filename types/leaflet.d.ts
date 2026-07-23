// `leaflet` não publica tipos próprios e `@types/leaflet` não está instalado
// nesta fase (não podemos rodar `npm install`). Sem uma declaração de módulo,
// o TypeScript trata `leaflet` (e, por consequência, `react-leaflet`, que
// importa tipos dele) como `any` implícito e os componentes perdem a maior
// parte de suas props conhecidas (`center`, `zoom`, `attribution`, `icon`,
// `radius`, etc.).
//
// Esta declaração mínima cobre só a superfície usada por `react-leaflet` v5 e
// por `app/(app)/mapa/MapView.tsx`. Se `@types/leaflet` for instalado no
// futuro, este arquivo pode ser removido.
declare module "leaflet" {
  export type LatLngExpression = [number, number] | { lat: number; lng: number } | (number[] & { length: 2 });
  export type LatLngBoundsExpression = unknown;
  export type FitBoundsOptions = Record<string, unknown>;

  export interface MapOptions {
    center?: LatLngExpression;
    zoom?: number;
    [key: string]: unknown;
  }

  export interface TileLayerOptions {
    attribution?: string;
    [key: string]: unknown;
  }

  export interface MarkerOptions {
    icon?: unknown;
    [key: string]: unknown;
  }

  export interface PathOptions {
    color?: string;
    fillColor?: string;
    fillOpacity?: number;
    opacity?: number;
    weight?: number;
    [key: string]: unknown;
  }

  export interface CircleMarkerOptions extends PathOptions {
    radius?: number;
  }

  export interface CircleOptions extends PathOptions {
    radius?: number;
  }

  export interface PopupOptions {
    [key: string]: unknown;
  }
  export interface TooltipOptions {
    [key: string]: unknown;
  }
  export interface PolylineOptions {
    [key: string]: unknown;
  }
  export interface LayerOptions {
    [key: string]: unknown;
  }
  export interface GeoJSONOptions {
    [key: string]: unknown;
  }
  export interface VideoOverlayOptions {
    [key: string]: unknown;
  }
  export interface WMSOptions {
    [key: string]: unknown;
  }
  export type WMSParams = Record<string, unknown>;
  export type LeafletEventHandlerFnMap = Record<string, unknown>;

  export class Layer {
    [key: string]: unknown;
  }
  export class Path extends Layer {}
  export class FeatureGroup extends Layer {}
  export class Map extends Layer {}
  export class Circle<P = unknown> extends Path {}
  export class CircleMarker<P = unknown> extends Path {}
  export class Control {
    static extend(props: unknown): unknown;
    [key: string]: unknown;
  }
  export class ImageOverlay extends Layer {}
  export class SVGOverlay extends Layer {}
  export class TileLayer extends Layer {}
  export class VideoOverlay extends Layer {}
  export class GeoJSON extends Layer {}
  export class Rectangle extends Path {}
  export class Marker<P = unknown> extends Layer {}
  export class Polygon extends Path {}
  export class Polyline extends Path {}
  export class Popup {}
  export class Tooltip {}
  export class LayerGroup extends Layer {}

  export class DivIcon {
    constructor(options?: Record<string, unknown>);
  }
  export class Icon<T = unknown> {
    constructor(options?: Record<string, unknown>);
    static Default: unknown;
  }
  export function divIcon(options?: Record<string, unknown>): DivIcon;

  const L: {
    divIcon: typeof divIcon;
    DivIcon: typeof DivIcon;
    Icon: typeof Icon;
    Map: typeof Map;
    Marker: typeof Marker;
    [key: string]: unknown;
  };
  export default L;
}
