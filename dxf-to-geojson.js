/**
 * new_dmap - DXF → GeoJSON 변환 및 DXF ↔ WGS84 좌표 변환
 * 지도 엔진(WGS84)에 맞게 도면 좌표를 변환
 */
(function (global) {
  'use strict';

  var C = global.DMAP_CONFIG || {};
  var lat0 = C.MAP_ORIGIN_LAT != null ? C.MAP_ORIGIN_LAT : 36.3;
  var lng0 = C.MAP_ORIGIN_LNG != null ? C.MAP_ORIGIN_LNG : 127.8;
  var unitsPerMeter = C.DXF_UNITS_PER_METER != null ? C.DXF_UNITS_PER_METER : 1;

  // 1도 위도 ≈ 111320m, 1도 경도 ≈ 111320*cos(lat) m
  var METERS_PER_DEG_LAT = 111320;
  function metersPerDegLng() {
    return 111320 * Math.cos((lat0 * Math.PI) / 180);
  }

  /**
   * DXF 좌표 (x, y) → WGS84 [longitude, latitude]
   * GeoJSON 순서는 [lng, lat]
   */
  function dxfToLngLat(x, y) {
    if (typeof x !== 'number' || typeof y !== 'number' || !isFinite(x) || !isFinite(y)) {
      return null;
    }
    var metersX = x / unitsPerMeter;
    var metersY = y / unitsPerMeter;
    var lng = lng0 + metersX / metersPerDegLng();
    var lat = lat0 + metersY / METERS_PER_DEG_LAT;
    return [lng, lat];
  }

  /**
   * WGS84 (lng, lat) → DXF (x, y)
   */
  function lngLatToDxf(lng, lat) {
    if (typeof lng !== 'number' || typeof lat !== 'number' || !isFinite(lng) || !isFinite(lat)) {
      return null;
    }
    var metersX = (lng - lng0) * metersPerDegLng();
    var metersY = (lat - lat0) * METERS_PER_DEG_LAT;
    return {
      x: metersX * unitsPerMeter,
      y: metersY * unitsPerMeter
    };
  }

  /** AutoCAD ACI 256색 → hex (ADMAP/dxf-parser와 동일) */
  var ACI_COLORS = [
    0x000000, 0xFF0000, 0xFFFF00, 0x00FF00, 0x00FFFF, 0x0000FF, 0xFF00FF, 0xFFFFFF,
    0x414141, 0x808080, 0xFF0000, 0xFFAAAA, 0xBD0000, 0xBD7E7E, 0x810000, 0x815656,
    0x680000, 0x684545, 0x4F0000, 0x4F3535, 0xFF3F00, 0xFFBFAA, 0xBD2E00, 0xBD8D7E,
    0x811F00, 0x816056, 0x681900, 0x684E45, 0x4F1300, 0x4F3B35, 0xFF7F00, 0xFFD4AA,
    0xBD5E00, 0xBD9D7E, 0x814000, 0x816B56, 0x683400, 0x685645, 0x4F2700, 0x4F4235,
    0xFFBF00, 0xFFEAAA, 0xBD8D00, 0xBDAD7E, 0x816000, 0x817656, 0x684E00, 0x685F45,
    0x4F3B00, 0x4F4935, 0xFFFF00, 0xFFFFAA, 0xBDBD00, 0xBDBD7E, 0x818100, 0x818156,
    0x686800, 0x686845, 0x4F4F00, 0x4F4F35, 0xBFFF00, 0xEAFFAA, 0x8DBD00, 0xADBD7E,
    0x608100, 0x768156, 0x4E6800, 0x5F6845, 0x3B4F00, 0x494F35, 0x7FFF00, 0xD4FFAA,
    0x5EBD00, 0x9DBD7E, 0x408100, 0x6B8156, 0x346800, 0x566845, 0x274F00, 0x424F35,
    0x3FFF00, 0xBFFFAA, 0x2EBD00, 0x8DBD7E, 0x1F8100, 0x608156, 0x196800, 0x4E6845,
    0x134F00, 0x3B4F35, 0x00FF00, 0xAAFFAA, 0x00BD00, 0x7EBD7E, 0x008100, 0x568156,
    0x006800, 0x456845, 0x004F00, 0x354F35, 0x00FF3F, 0xAAFFBF, 0x00BD2E, 0x7EBD8D,
    0x00811F, 0x568160, 0x006819, 0x45684E, 0x004F13, 0x354F3B, 0x00FF7F, 0xAAFFD4,
    0x00BD5E, 0x7EBD9D, 0x008140, 0x56816B, 0x006834, 0x456856, 0x004F27, 0x354F42,
    0x00FFBF, 0xAAFFEA, 0x00BD8D, 0x7EBDAD, 0x008160, 0x568176, 0x00684E, 0x45685F,
    0x004F3B, 0x354F49, 0x00FFFF, 0xAAFFFF, 0x00BDBD, 0x7EBDBD, 0x008181, 0x568181,
    0x006868, 0x456868, 0x004F4F, 0x354F4F, 0x00BFFF, 0xAAEAFF, 0x008DBD, 0x7EADBD,
    0x006081, 0x567681, 0x004E68, 0x455F68, 0x003B4F, 0x35494F, 0x007FFF, 0xAAD4FF,
    0x005EBD, 0x7E9DBD, 0x004081, 0x566B81, 0x003468, 0x455668, 0x00274F, 0x35424F,
    0x003FFF, 0xAABFFF, 0x002EBD, 0x7E8DBD, 0x001F81, 0x566081, 0x001968, 0x454E68,
    0x00134F, 0x353B4F, 0x0000FF, 0xAAAAFF, 0x0000BD, 0x7E7EBD, 0x000081, 0x565681,
    0x000068, 0x454568, 0x00004F, 0x35354F, 0x3F00FF, 0xBFAAFF, 0x2E00BD, 0x8D7EBD,
    0x1F0081, 0x605681, 0x190068, 0x4E4568, 0x13004F, 0x3B354F, 0x7F00FF, 0xD4AAFF,
    0x5E00BD, 0x9D7EBD, 0x400081, 0x6B5681, 0x340068, 0x564568, 0x27004F, 0x42354F,
    0xBF00FF, 0xEAAAFF, 0x8D00BD, 0xAD7EBD, 0x600081, 0x765681, 0x4E0068, 0x5F4568,
    0x3B004F, 0x49354F, 0xFF00FF, 0xFFAAFF, 0xBD00BD, 0xBD7EBD, 0x810081, 0x815681,
    0x680068, 0x684568, 0x4F004F, 0x4F354F, 0xFF00BF, 0xFFAAEA, 0xBD008D, 0xBD7EAD,
    0x810060, 0x815676, 0x68004E, 0x68455F, 0x4F003B, 0x4F3549, 0xFF007F, 0xFFAAD4,
    0xBD005E, 0xBD7E9D, 0x810040, 0x81566B, 0x680034, 0x684556, 0x4F0027, 0x4F3542,
    0xFF003F, 0xFFAABF, 0xBD002E, 0xBD7E8D, 0x81001F, 0x815660, 0x680019, 0x68454E,
    0x4F0013, 0x4F353B, 0x333333, 0x505050, 0x696969, 0x828282, 0xBEBEBE, 0xFFFFFF
  ];

  function aciToHex(colorIndex) {
    if (typeof colorIndex !== 'number' || colorIndex < 0 || colorIndex > 255) return null;
    var rgb = ACI_COLORS[colorIndex];
    return rgb != null ? '#' + rgb.toString(16).padStart(6, '0').toUpperCase() : null;
  }

  function getEntityColor(entity, dxfData) {
    var color = null;
    if (entity.colorIndex === 256 || entity.colorIndex === undefined) {
      if (entity.layer && dxfData && dxfData.tables) {
        var layersObj = dxfData.tables.layers || dxfData.tables.layer;
        var layer = null;
        if (layersObj) {
          if (!Array.isArray(layersObj) && typeof layersObj === 'object' && layersObj[entity.layer]) {
            layer = layersObj[entity.layer];
          }
          if (!layer && layersObj.layers) {
            if (Array.isArray(layersObj.layers)) {
              for (var i = 0; i < layersObj.layers.length; i++) {
                if (layersObj.layers[i].name === entity.layer) { layer = layersObj.layers[i]; break; }
              }
            } else {
              layer = layersObj.layers[entity.layer];
            }
          }
          if (!layer && Array.isArray(layersObj)) {
            for (var j = 0; j < layersObj.length; j++) {
              if (layersObj[j].name === entity.layer) { layer = layersObj[j]; break; }
            }
          }
        }
        if (layer) {
          if (layer.colorIndex !== undefined && layer.colorIndex != null) {
            color = aciToHex(layer.colorIndex);
          } else if (layer.color !== undefined && layer.color != null) {
            if (typeof layer.color === 'string') color = layer.color;
            else if (typeof layer.color === 'number') color = '#' + layer.color.toString(16).padStart(6, '0').toUpperCase();
          }
        }
      }
    } else if (entity.colorIndex >= 0 && entity.colorIndex < 256) {
      color = aciToHex(entity.colorIndex);
    }
    if (!color && entity.color !== undefined && entity.color != null) {
      if (typeof entity.color === 'string') color = entity.color;
      else if (typeof entity.color === 'number') color = '#' + entity.color.toString(16).padStart(6, '0').toUpperCase();
    }
    if (!color) color = '#000000';
    if (color.toUpperCase() === '#FFFFFF' || color.toUpperCase() === '#FFF') color = '#000000';
    return color;
  }

  /**
   * DXF 파싱 결과(entities)를 GeoJSON FeatureCollection 으로 변환
   */
  function dxfToGeoJSON(dxfData) {
    if (!dxfData || !dxfData.entities || !Array.isArray(dxfData.entities)) {
      return { type: 'FeatureCollection', features: [] };
    }

    var features = [];
    var entities = dxfData.entities;

    for (var i = 0; i < entities.length; i++) {
      var entity = entities[i];
      var feature = entityToFeature(entity, dxfData);
      if (feature) {
        feature.id = i;
        features.push(feature);
      }
    }

    return {
      type: 'FeatureCollection',
      features: features
    };
  }

  function pt(x, y) {
    var ll = dxfToLngLat(x, y);
    return ll ? ll : null;
  }

  function entityToFeature(entity, dxfData) {
    if (!entity || !entity.type) return null;
    var strokeColor = getEntityColor(entity, dxfData);

    switch (entity.type) {
      case 'LINE':
        return lineToFeature(entity, strokeColor);
      case 'LWPOLYLINE':
      case 'POLYLINE':
        return polylineToFeature(entity, strokeColor);
      case 'CIRCLE':
        return circleToFeature(entity, strokeColor);
      case 'ARC':
        return arcToFeature(entity, strokeColor);
      case 'POINT':
        return pointToFeature(entity, strokeColor);
      case 'TEXT':
      case 'MTEXT':
      case 'INSERT':
        return positionToFeature(entity, strokeColor);
      case 'SPLINE':
        return splineToFeature(entity, strokeColor);
      default:
        return null;
    }
  }

  function lineToFeature(entity, strokeColor) {
    var sp = entity.startPoint;
    var ep = entity.endPoint;
    if (!sp || !ep) return null;
    var c1 = pt(sp.x, sp.y);
    var c2 = pt(ep.x, ep.y);
    if (!c1 || !c2) return null;
    return {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [c1, c2] },
      properties: { layer: entity.layer || '', strokeColor: strokeColor }
    };
  }

  function polylineToFeature(entity, strokeColor) {
    var verts = entity.vertices;
    if (!verts || verts.length < 2) return null;
    var coords = [];
    for (var v = 0; v < verts.length; v++) {
      var vx = verts[v].x;
      var vy = verts[v].y;
      var ll = pt(vx, vy);
      if (ll) coords.push(ll);
    }
    if (coords.length < 2) return null;
    var closed = entity.closed || entity.shape || (entity.vertices[0] && entity.vertices[entity.vertices.length - 1] &&
      entity.vertices[0].x === entity.vertices[entity.vertices.length - 1].x &&
      entity.vertices[0].y === entity.vertices[entity.vertices.length - 1].y);
    if (closed && coords.length >= 4) {
      coords.push(coords[0]);
      return {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [coords] },
        properties: { layer: entity.layer || '', strokeColor: strokeColor, fillColor: strokeColor }
      };
    }
    return {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: coords },
      properties: { layer: entity.layer || '', strokeColor: strokeColor }
    };
  }

  function circleToFeature(entity, strokeColor) {
    var cx = entity.center && entity.center.x;
    var cy = entity.center && entity.center.y;
    var r = entity.radius;
    if (typeof cx !== 'number' || typeof cy !== 'number' || typeof r !== 'number' || r <= 0) return null;
    var segments = 32;
    var coords = [];
    for (var i = 0; i <= segments; i++) {
      var angle = (i / segments) * 2 * Math.PI;
      var ll = pt(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
      if (ll) coords.push(ll);
    }
    if (coords.length < 4) return null;
    return {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [coords] },
      properties: { layer: entity.layer || '', strokeColor: strokeColor, fillColor: strokeColor }
    };
  }

  function arcToFeature(entity, strokeColor) {
    var cx = entity.center && entity.center.x;
    var cy = entity.center && entity.center.y;
    var r = entity.radius;
    var startAngle = entity.startAngle != null ? entity.startAngle * Math.PI / 180 : 0;
    var endAngle = entity.endAngle != null ? entity.endAngle * Math.PI / 180 : 2 * Math.PI;
    if (typeof cx !== 'number' || typeof cy !== 'number' || typeof r !== 'number' || r <= 0) return null;
    var segments = Math.max(8, Math.min(64, Math.ceil(Math.abs(endAngle - startAngle) / (Math.PI / 16))));
    var coords = [];
    for (var i = 0; i <= segments; i++) {
      var t = i / segments;
      var angle = startAngle + t * (endAngle - startAngle);
      var ll = pt(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
      if (ll) coords.push(ll);
    }
    if (coords.length < 2) return null;
    return {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: coords },
      properties: { layer: entity.layer || '', strokeColor: strokeColor }
    };
  }

  function pointToFeature(entity, strokeColor) {
    var pos = entity.position;
    if (!pos) return null;
    var ll = pt(pos.x, pos.y);
    if (!ll) return null;
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: ll },
      properties: { layer: entity.layer || '', strokeColor: strokeColor }
    };
  }

  function positionToFeature(entity, strokeColor) {
    var pos = entity.position;
    if (!pos) return null;
    var ll = pt(pos.x, pos.y);
    if (!ll) return null;
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: ll },
      properties: { layer: entity.layer || '', text: entity.text || '', strokeColor: strokeColor }
    };
  }

  function splineToFeature(entity, strokeColor) {
    var cps = entity.controlPoints;
    if (!cps || cps.length < 2) return null;
    var coords = [];
    for (var k = 0; k < cps.length; k++) {
      var ll = pt(cps[k].x, cps[k].y);
      if (ll) coords.push(ll);
    }
    if (coords.length < 2) return null;
    return {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: coords },
      properties: { layer: entity.layer || '', strokeColor: strokeColor }
    };
  }

  global.DxfToGeoJSON = {
    dxfToLngLat: dxfToLngLat,
    lngLatToDxf: lngLatToDxf,
    dxfToGeoJSON: dxfToGeoJSON
  };
})(typeof window !== 'undefined' ? window : this);
