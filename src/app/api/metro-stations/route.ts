import { metroStations } from "@/lib/places";

export function GET() {
  return Response.json({ stations: metroStations() });
}
