// Lazy-loaded GeoJSON, KML (Google Earth), and Dedicated Printable GIS Report & PNG Snapshot exporters
import { PROBLEM_TEXT, type Marker } from "@/components/ParcelMap";
import { computePathDistanceKm, computePolygonMetrics, type DrawPoint } from "@/lib/ph-geo";
import { formatAreaSqm, haToSqm } from "@/lib/area";

function triggerDownload(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Exports filtered parcels and any active drawn boundary/ruler geometry as a standard GeoJSON FeatureCollection.
 */
export function exportToGeoJSON(
  markers: Marker[],
  drawnPoints: DrawPoint[],
  drawMode: "off" | "polygon" | "ruler",
) {
  const features: unknown[] = markers.map((m) => ({
    type: "Feature",
    properties: {
      id: m.id,
      name: m.name,
      region: m.region ?? null,
      province: m.province,
      municipality: m.municipality ?? null,
      titleNo: m.titleNo ?? null,
      taxDecNo: m.taxDecNo ?? null,
      classification: m.classification ?? "TITLED",
      areaSqm: typeof m.areaHa === "number" ? haToSqm(m.areaHa) : null,
      areaHa: m.areaHa ?? null,
      complianceStatus: m.problem ?? "verified",
    },
    geometry: {
      type: "Point",
      coordinates: [m.lng, m.lat],
    },
  }));

  if (drawMode === "polygon" && drawnPoints.length >= 3) {
    const metrics = computePolygonMetrics(drawnPoints);
    const ring = [
      ...drawnPoints.map((p) => [p.lng, p.lat]),
      [drawnPoints[0].lng, drawnPoints[0].lat],
    ];
    features.push({
      type: "Feature",
      properties: {
        kind: "drawn-lot-boundary",
        surveyedAreaHa: metrics.areaHa,
        surveyedAreaSqm: metrics.areaSqm,
        perimeterKm: metrics.perimeterKm,
      },
      geometry: {
        type: "Polygon",
        coordinates: [ring],
      },
    });
  } else if (drawMode === "ruler" && drawnPoints.length >= 2) {
    features.push({
      type: "Feature",
      properties: {
        kind: "drawn-distance-measurement",
        distanceKm: computePathDistanceKm(drawnPoints, false),
      },
      geometry: {
        type: "LineString",
        coordinates: drawnPoints.map((p) => [p.lng, p.lat]),
      },
    });
  }

  const geojson = {
    type: "FeatureCollection",
    metadata: {
      system: "Eagle Property Ledger",
      exportedAt: new Date().toISOString(),
      parcelCount: markers.length,
    },
    features,
  };

  const stamp = new Date().toISOString().slice(0, 10);
  triggerDownload(
    JSON.stringify(geojson, null, 2),
    `eagle-parcels-${stamp}.geojson`,
    "application/geo+json;charset=utf-8",
  );
}

/**
 * Exports filtered parcels and any active drawn boundary polygon as a Google Earth / GIS KML 2.2 document.
 */
export function exportToKML(
  markers: Marker[],
  drawnPoints: DrawPoint[],
  drawMode: "off" | "polygon" | "ruler",
) {
  const placemarks = markers
    .map((m) => {
      const desc = [
        `Location: ${[m.municipality, m.province, m.region].filter(Boolean).join(", ")}`,
        `Title / Tax Dec: ${m.titleNo || m.taxDecNo || "Untitled"}`,
        `Area: ${typeof m.areaHa === "number" ? formatAreaSqm(m.areaHa, { includeHa: true }) : "N/A"}`,
        `Status: ${m.problem ?? "Clear & Verified"}`,
      ].join(" | ");

      return `    <Placemark>
      <name>${escapeXml(m.name)}</name>
      <description>${escapeXml(desc)}</description>
      <Point>
        <coordinates>${m.lng},${m.lat},0</coordinates>
      </Point>
    </Placemark>`;
    })
    .join("\n");

  let drawnKml = "";
  if (drawMode === "polygon" && drawnPoints.length >= 3) {
    const metrics = computePolygonMetrics(drawnPoints);
    const coords = [...drawnPoints, drawnPoints[0]]
      .map((p) => `${p.lng},${p.lat},0`)
      .join(" ");
    drawnKml = `\n    <Placemark>
      <name>Measured Lot Boundary (${metrics.areaHa} ha)</name>
      <description>Area: ${metrics.areaHa} ha (${metrics.areaSqm.toLocaleString()} sqm) | Perimeter: ${metrics.perimeterKm} km</description>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>${coords}</coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>`;
  } else if (drawMode === "ruler" && drawnPoints.length >= 2) {
    const dist = computePathDistanceKm(drawnPoints, false);
    const coords = drawnPoints.map((p) => `${p.lng},${p.lat},0`).join(" ");
    drawnKml = `\n    <Placemark>
      <name>Measured Distance (${dist} km)</name>
      <LineString>
        <coordinates>${coords}</coordinates>
      </LineString>
    </Placemark>`;
  }

  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Eagle Property Ledger — Spatial Portfolio</name>
    <description>Exported ${escapeXml(new Date().toLocaleString())}</description>
${placemarks}${drawnKml}
  </Document>
</kml>`;

  const stamp = new Date().toISOString().slice(0, 10);
  triggerDownload(
    kml,
    `eagle-parcels-${stamp}.kml`,
    "application/vnd.google-earth.kml+xml;charset=utf-8",
  );
}

/**
 * Captures the live WebGL MapLibre canvas image and generates a dedicated,
 * clean Printable GIS Report window (with zero mobile navbars or floating UI chrome).
 */
export function triggerMapPrintSnapshot(
  markers: Marker[] = [],
  drawnPoints: DrawPoint[] = [],
  drawMode: "off" | "polygon" | "ruler" = "off",
) {
  if (typeof window === "undefined") return;

  const canvas = document.querySelector(".maplibregl-canvas") as HTMLCanvasElement | null;
  let mapDataUrl = "";
  try {
    if (canvas) {
      mapDataUrl = canvas.toDataURL("image/png");
    }
  } catch {
    mapDataUrl = "";
  }

  const totalHa = markers.reduce((s, m) => s + (m.areaHa ?? 0), 0);
  const clearCount = markers.filter((m) => !m.problem).length;
  const attentionCount = markers.filter(
    (m) => m.problem === "due_soon" || m.problem === "open_issue",
  ).length;
  const criticalCount = markers.filter(
    (m) => m.problem === "integrity" || m.problem === "overdue",
  ).length;

  let measureNote = "";
  if (drawMode === "polygon" && drawnPoints.length >= 3) {
    const m = computePolygonMetrics(drawnPoints);
    measureNote = `Measured Lot Boundary: ${m.areaHa} ha (${m.areaSqm.toLocaleString()} m²) · Perimeter ${m.perimeterKm} km`;
  } else if (drawMode === "ruler" && drawnPoints.length >= 2) {
    measureNote = `Measured Distance: ${computePathDistanceKm(drawnPoints, false)} km`;
  }

  const rowsHtml = markers
    .map((m, idx) => {
      const status = m.problem ? PROBLEM_TEXT[m.problem] : "Clear & Verified";
      const loc = [m.municipality, m.province, m.region].filter(Boolean).join(", ");
      const idDoc = m.titleNo || m.taxDecNo || "—";
      const area = formatAreaSqm(m.areaHa, { includeHa: true });
      const coords = `${m.lat.toFixed(4)}°N, ${m.lng.toFixed(4)}°E`;
      return `<tr>
        <td>${idx + 1}</td>
        <td><strong>${escapeXml(m.name)}</strong></td>
        <td>${escapeXml(loc)}</td>
        <td class="mono">${escapeXml(idDoc)}</td>
        <td class="mono">${area}</td>
        <td class="mono">${coords}</td>
        <td>${escapeXml(status)}</td>
      </tr>`;
    })
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Eagle Property Ledger — Spatial Portfolio Snapshot</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 28px 32px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #121D17;
      background: #ffffff;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #1A472A;
      padding-bottom: 14px;
      margin-bottom: 18px;
    }
    .eyebrow {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #1A472A;
    }
    h1 {
      margin: 4px 0 0;
      font-size: 20px;
      letter-spacing: -0.02em;
    }
    .meta {
      text-align: right;
      font-size: 11px;
      color: #56685E;
      line-height: 1.5;
    }
    .kpis {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 18px;
    }
    .kpi {
      border: 1px solid #DCE3DC;
      border-radius: 10px;
      padding: 10px 14px;
      background: #F8FAF8;
    }
    .kpi-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #56685E;
    }
    .kpi-val {
      margin-top: 4px;
      font-size: 18px;
      font-weight: 700;
      font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
      color: #121D17;
    }
    .map-frame {
      width: 100%;
      border: 1px solid #DCE3DC;
      border-radius: 12px;
      overflow: hidden;
      background: #DCE6DF;
      margin-bottom: 18px;
      text-align: center;
    }
    .map-frame img {
      display: block;
      width: 100%;
      max-height: 410px;
      object-fit: cover;
    }
    .measure-banner {
      margin-bottom: 14px;
      padding: 8px 12px;
      border-radius: 8px;
      background: #EAF2EC;
      border: 1px solid #B7D3BF;
      font-size: 12px;
      font-weight: 600;
      color: #1A472A;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
    }
    th {
      background: #F4F6F3;
      color: #2A3B31;
      text-align: left;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 8px 10px;
      border-bottom: 1px solid #DCE3DC;
    }
    td {
      padding: 8px 10px;
      border-bottom: 1px solid #E6ECE6;
    }
    .mono {
      font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
    }
    @media print {
      body { padding: 12px; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="eyebrow">Eagle Cement Corporation · Spatial Land Ledger</div>
      <h1>Philippines Spatial Portfolio Snapshot</h1>
    </div>
    <div class="meta">
      <div>Generated: ${escapeXml(new Date().toLocaleString())}</div>
      <div>Jurisdiction: Philippine Archipelago (WGS 84)</div>
    </div>
  </div>

  <div class="kpis">
    <div class="kpi">
      <div class="kpi-label">Approved Parcels</div>
      <div class="kpi-val">${markers.length}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Total Land Area</div>
      <div class="kpi-val">${formatAreaSqm(totalHa)}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Clear &amp; Verified</div>
      <div class="kpi-val" style="color:#1A472A;">${clearCount}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Attention / Critical</div>
      <div class="kpi-val" style="color:${criticalCount > 0 ? "#B42318" : "#B54708"};">${attentionCount} / ${criticalCount}</div>
    </div>
  </div>

  ${measureNote ? `<div class="measure-banner">${escapeXml(measureNote)}</div>` : ""}

  ${
    mapDataUrl
      ? `<div class="map-frame"><img id="snapshot-img" src="${mapDataUrl}" alt="Philippines Spatial Portfolio Map Snapshot" /></div>`
      : ""
  }

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Parcel Name</th>
        <th>Administrative Location</th>
        <th>Title / Tax Dec</th>
        <th>Area</th>
        <th>Coordinates</th>
        <th>Compliance</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>

  <script>
    window.addEventListener("load", function() {
      setTimeout(function() {
        window.focus();
        window.print();
      }, 250);
    });
  </script>
</body>
</html>`;

  const printWin = window.open("", "_blank", "width=1080,height=820");
  if (printWin) {
    printWin.document.open();
    printWin.document.write(html);
    printWin.document.close();
  } else {
    // Fallback if popup blocked: download the captured PNG directly
    if (mapDataUrl) {
      const a = document.createElement("a");
      a.href = mapDataUrl;
      a.download = `eagle-map-snapshot-${new Date().toISOString().slice(0, 10)}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } else {
      window.print();
    }
  }
}
