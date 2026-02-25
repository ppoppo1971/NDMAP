/**
 * new_dmap - 지도 엔진 기반 DXF 뷰어 설정
 * VMAP 참조, ADMAP 기능 유지
 */
(function (global) {
  'use strict';

  // Google Maps API 키 (VMAP과 동일 사용 가능, 필요 시 별도 키로 교체)
  var GMAPS_API_KEY = 'AIzaSyDVwJrvIcbqAOX24g9JODhD7DGtTz7z2Pg';

  // DXF → 지도 좌표 변환
  // 1) 평면직각좌표(EPSG) 사용 시: DXF_CRS에 EPSG 코드 지정 (proj4로 WGS84 변환)
  //    - EPSG:5186: 한국 2000 중부원점 (y_0=600000) 국토지리정보원 표준
  //    - EPSG:5181: 중부원점 y_0=500000 (카카오맵 등)
  //    - EPSG:5179: UTM-K 통합좌표계 (네이버지도 등)
  //    도면/메타데이터의 x,y가 해당 평면직각좌표(E,N)이면 이 값 사용. y가 음수일 수 있음.
  // 2) EPSG 미사용 시: DXF_CRS = null 로 두고, 도면 원점(0,0)을 MAP_ORIGIN 위경도에 둠.
  var DXF_CRS = 'EPSG:5186';

  // DXF_CRS가 null일 때만 사용: 도면 원점 (0,0)을 이 위경도에 둠
  var MAP_ORIGIN_LAT = 36.3;
  var MAP_ORIGIN_LNG = 127.8;

  // DXF_CRS가 null일 때만 사용: DXF 1단위 = 몇 m (1 = 1m)
  var DXF_UNITS_PER_METER = 1;

  // 배경 지도 기본값: 'none' | 'roadmap' | 'satellite' | 'hybrid'
  var DEFAULT_MAP_TYPE = 'none';

  // 배경 없음일 때 적용할 스타일 (모든 지도 요소 숨김)
  var BLANK_MAP_STYLE = [
    { featureType: 'all', elementType: 'geometry', stylers: [{ visibility: 'off' }] },
    { featureType: 'all', elementType: 'labels', stylers: [{ visibility: 'off' }] },
    { featureType: 'all', elementType: 'labels.text', stylers: [{ visibility: 'off' }] },
    { featureType: 'all', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ visibility: 'off' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ visibility: 'off' }] },
    { featureType: 'road', elementType: 'labels', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit', elementType: 'geometry', stylers: [{ visibility: 'off' }] },
    { featureType: 'poi', elementType: 'geometry', stylers: [{ visibility: 'off' }] },
    { featureType: 'landscape', elementType: 'geometry', stylers: [{ visibility: 'off' }] }
  ];

  global.DMAP_CONFIG = {
    GMAPS_API_KEY: GMAPS_API_KEY,
    DXF_CRS: DXF_CRS,
    MAP_ORIGIN_LAT: MAP_ORIGIN_LAT,
    MAP_ORIGIN_LNG: MAP_ORIGIN_LNG,
    DXF_UNITS_PER_METER: DXF_UNITS_PER_METER,
    DEFAULT_MAP_TYPE: DEFAULT_MAP_TYPE,
    BLANK_MAP_STYLE: BLANK_MAP_STYLE
  };
})(typeof window !== 'undefined' ? window : this);
