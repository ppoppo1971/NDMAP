# VMAP vs new_dmap 지도 로드 방식 비교

## 요약

- **지도 타일이 안 나오던 원인**: 좌표계나 KML vs DXF 변환 방식이 아니라, **지도 컨테이너(#map)가 처음에 `display: none` 안에 있어 크기가 0이었기 때문**입니다.
- VMAP은 **#map이 페이지 로드 시부터 항상 보이는 영역**에 있어, 초기화 시점에 이미 크기가 있어 타일이 정상 로드됩니다.
- 이에 맞춰 new_dmap은 **뷰어 화면이 숨겨져 있을 때도 #map이 크기를 유지**하도록 CSS를 수정했습니다.

---

## 1. VMAP (WMAP-main) 지도 로드 방식

- **HTML 구조**: `#map`이 **body 직속**, 항상 화면에 노출.
  ```html
  <body>
    <h1>WMAP</h1>
    <div id="map"></div>
    ...
  </body>
  ```
- **CSS**: `#map { width: 100vw; height: 100vh; }` → 로드 시점부터 전체 뷰포트 크기.
- **초기화**: Google Maps API `callback=initMap`으로 페이지 로드 시 `initMap()` 실행 → 이때 **#map은 이미 보이고 크기가 있음** → 타일 정상 로드.
- **데이터**: KML/KMZ 파일 로드 후 Google Maps API로 오버레이. 지도 타일과 별개.

---

## 2. new_dmap (수정 전) 문제점

- **HTML 구조**: `#map`이 **#viewer-screen** 안에 있고, viewer-screen은 **처음에 `.hidden`(display: none)**.
  ```html
  <div id="viewer-screen" class="screen hidden">
    <div class="map-container"><div id="map"></div></div>
  </div>
  ```
- **결과**: API 로드 시 `initMap()`이 실행될 때 **#map의 부모가 display: none** → #map 크기 0×0 → Google Maps가 타일을 요청/표시하지 않음 → “지도 타일에 이미지가 없다” 현상.
- **데이터**: DXF → GeoJSON 변환 후 `map.data`로 로드. KML이 아니어도 **좌표계는 동일(WGS84)** 이므로 데이터 방식 자체는 원인 아님.

---

## 3. new_dmap 수정 내용 (VMAP 참고)

### 3.1 CSS (index.html)

- **뷰어가 숨겨져 있을 때도 #map이 크기를 가지도록** VMAP처럼 “숨김 시에도 영역 유지” 방식 적용.
- `#viewer-screen.hidden` 에 대해:
  - `display: none` 대신 **`display: flex` 유지**
  - **`visibility: hidden`** + **`pointer-events: none`** 으로만 숨김
  - **`position: fixed`** + **`width: 100vw`** + **`height: 100vh`** 로 전체 뷰포트 크기 유지
  - `z-index: 0` 으로 파일 목록 화면(#file-list-screen, z-index: 1) 뒤에 깔리도록 처리

→ 초기 로드 시에도 #map이 100vw×100vh 크기를 가져, `initMap()` 시점에 타일이 로드되도록 함.

### 3.2 기존 보조 조치 (app.js)

- `showViewer()` 에서 **`google.maps.event.trigger(map, 'resize')`** 호출 유지.
- 뷰어로 전환할 때 한 번 더 크기 갱신해 타일이 다시 그려지도록 함.

---

## 4. KML vs DXF 변환

| 구분       | VMAP              | new_dmap                    |
|------------|-------------------|-----------------------------|
| 데이터 형식 | KML/KMZ           | DXF → GeoJSON (WGS84)       |
| 로드 API   | KML 레이어 등     | `map.data.addGeoJson()`     |
| 좌표계     | WGS84             | WGS84                       |

- **지도 타일이 안 나오던 문제와는 무관**: 타일은 “지도 배경 이미지”이고, KML/GeoJSON은 그 위에 그리는 **오버레이**입니다. 컨테이너 크기가 0이면 타일만 안 나오고, 크기가 있으면 동일 좌표계로 정상 표시됩니다.

---

## 5. 지연 초기화(Lazy init) 적용

- **추가 대응**: 지도 생성 시점을 **뷰어가 화면에 보인 뒤**로 미룸.
  - API 로드 시 `initMap()` 은 DOM/UI만 준비하고 **지도를 생성하지 않음**.
  - DXF 선택 → `showViewer()` 호출 시 뷰어 화면 표시 후 **`ensureMap()`** 에서 최초 1회만 지도 생성.
  - 이때 **#map은 이미 보이는 상태**이므로 컨테이너 크기가 확보되어 타일이 정상 요청됨.
- **loadDxfFile 순서**: `showViewer()` → `ensureMap()` → `applyDxfToMap()` 순으로 호출.
- **setMapType 후**: 배경 지도 전환 시 `google.maps.event.trigger(map, 'resize')` 로 타일 갱신 유도.

## 6. 다각적 점검 체크리스트

| 항목 | 확인 내용 |
|------|-----------|
| **실행 환경** | `file://` 가 아닌 **http://localhost** 등 HTTP 서버로 열었는지 |
| **API 키** | config.js `GMAPS_API_KEY` 유효·Maps JavaScript API 사용·리퍼러 제한(현재 출처 포함) |
| **지도 생성 시점** | 콘솔에 `new_dmap: #map 크기 (지도 생성 시점) WxH` 가 0이 아닌지 |
| **배경 선택** | "도로/위성/하이브리드" 선택 시 `setMapType` + resize 호출 여부 |

## 7. 정리

- **원인**: 지도 **컨테이너가 처음에 display: none 안에 있어 크기가 0**이었음.
- **해결**: (1) VMAP처럼 숨겨진 뷰어에서도 #map 크기 유지 CSS, (2) **뷰어 표시 후에만 지도 생성(ensureMap)**.
- **KML vs DXF**: 지도 타일 미로드와는 별개이며, 좌표계도 동일하게 맞춰져 있음.
