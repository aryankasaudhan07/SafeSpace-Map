import "leaflet";

declare module "leaflet" {
  type HeatPoint = [number, number, number?];

  interface HeatLayer extends Layer {
    setLatLngs(latlngs: HeatPoint[]): this;
  }

  function heatLayer(
    latlngs: HeatPoint[],
    options?: {
      minOpacity?: number;
      maxZoom?: number;
      max?: number;
      radius?: number;
      blur?: number;
      gradient?: Record<number, string>;
    },
  ): HeatLayer;
}
