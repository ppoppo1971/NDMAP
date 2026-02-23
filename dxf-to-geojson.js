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
      var feature = entityToFeature(entity);
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

  function entityToFeature(entity) {
    if (!entity || !entity.type) return null;

    switch (entity.type) {
      case 'LINE':
        return lineToFeature(entity);
      case 'LWPOLYLINE':
      case 'POLYLINE':
        return polylineToFeature(entity);
      case 'CIRCLE':
        return circleToFeature(entity);
      case 'ARC':
        return arcToFeature(entity);
      case 'POINT':
        return pointToFeature(entity);
      case 'TEXT':
      case 'MTEXT':
      case 'INSERT':
        return positionToFeature(entity);
      case 'SPLINE':
        return splineToFeature(entity);
      default:
        return null;
    }
  }

  function lineToFeature(entity) {
    var sp = entity.startPoint;
    var ep = entity.endPoint;
    if (!sp || !ep) return null;
    var c1 = pt(sp.x, sp.y);
    var c2 = pt(ep.x, ep.y);
    if (!c1 || !c2) return null;
    return {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [c1, c2] },
      properties: { layer: entity.layer || '' }
    };
  }

  function polylineToFeature(entity) {
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
        properties: { layer: entity.layer || '' }
      };
    }
    return {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: coords },
      properties: { layer: entity.layer || '' }
    };
  }

  function circleToFeature(entity) {
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
      properties: { layer: entity.layer || '' }
    };
  }

  function arcToFeature(entity) {
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
      properties: { layer: entity.layer || '' }
    };
  }

  function pointToFeature(entity) {
    var pos = entity.position;
    if (!pos) return null;
    var ll = pt(pos.x, pos.y);
    if (!ll) return null;
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: ll },
      properties: { layer: entity.layer || '' }
    };
  }

  function positionToFeature(entity) {
    var pos = entity.position;
    if (!pos) return null;
    var ll = pt(pos.x, pos.y);
    if (!ll) return null;
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: ll },
      properties: { layer: entity.layer || '', text: entity.text || '' }
    };
  }

  function splineToFeature(entity) {
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
      properties: { layer: entity.layer || '' }
    };
  }

  global.DxfToGeoJSON = {
    dxfToLngLat: dxfToLngLat,
    lngLatToDxf: lngLatToDxf,
    dxfToGeoJSON: dxfToGeoJSON
  };
})(typeof window !== 'undefined' ? window : this);
