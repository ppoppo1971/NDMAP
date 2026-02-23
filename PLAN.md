# new_dmap 작성 계획

ADMAP 기능을 유지하면서 DXF를 지도 엔진(Google Maps)으로 렌더링하는 버전입니다.  
VMAP을 참고하여 지도 엔진·배경 선택을 적용합니다.

---

## 단계별 작성 계획

### 1단계: 기본 구조 및 지도 뷰어
- **new_dmap** 폴더 생성, ADMAP과 동일한 파일 구성( index.html, app.js, local-storage.js, google-drive.js, libs 등 ) 유지
- **index.html**: 파일 선택 화면 + **지도 div** 기반 뷰어 화면(기존 SVG+Canvas 대신)
- **지도 엔진**: VMAP 참조 — Google Maps API 로드, `initMap()` 패턴, `gestureHandling: 'greedy'`, `disableDefaultUI: true`
- **배경**: 기본 "배경 없음"(스타일로 모든 지도 요소 숨김), 사용자 선택으로 도로/위성/하이브리드 등 제공(VMAP의 mapTypeSelector 참조)

### 2단계: DXF 파싱 및 GeoJSON 변환
- **dxf-parser** 그대로 사용하여 DXF 파싱
- **좌표계 규칙**: 지도는 VMAP과 동일 WGS84. DXF (x,y) → (lat,lng) 변환 모듈 추가  
  - 원점 (lat0, lng0) 및 단위(1 DXF 단위 = 1m) 상수화, 필요 시 설정 UI
- **DXF → GeoJSON 변환기** (메모리): LINE → LineString, LWPOLYLINE/POLYLINE → LineString/Polygon, CIRCLE/ARC → 궤적 근사 후 GeoJSON Feature 생성
- 파싱·변환 후 `map.data.addGeoJson(geoJson)` 로 도면 레이어 표시

### 3단계: 사진·텍스트 오버레이
- **저장 형식**: 기존과 동일하게 DXF 좌표 (x, y) 로 IndexedDB/메타데이터 저장
- **표시**: (x,y) → (lat,lng) 변환 후 지도 위 마커 또는 커스텀 오버레이로 표시
- **추가**: 지도 롱프레스/클릭 시 해당 지도 좌표를 DXF (x,y)로 역변환하여 사진·텍스트 추가
- 기존 ADMAP의 사진 촬영/갤러리 선택, 텍스트 입력, 메모, 그룹 보기 등 동작 유지

### 4단계: ADMAP 기능 연동
- **파일 목록·Drive**: 기존 로직 유지(로컬 DXF, Google Drive 선택)
- **슬라이드 메뉴**: 목록, 전체보기, 사진누락확인, 자료 내보내기, 자료 삭제, 용량조정, 콘솔 — 지도 뷰어와 연동
- **전체보기/줌**: 도면 bbox를 (lat,lng)로 변환 후 `map.fitBounds()` 등으로 구현
- **내보내기(ZIP/개별)·InsertPhotos.lsp 호환**: 저장 데이터는 계속 DXF (x,y) 유지

### 5단계: 배경 선택 UI 및 정리
- **배경 없음** 기본 적용 확인
- 지도 타입 선택 UI(배경 없음 / 도로 / 위성 / 하이브리드 등) VMAP 스타일로 추가
- 테스트 및 문서 정리

---

## 사용자 피드백 요청 사항

아래는 구현 시 **기본값으로 적용할 예정**이지만, 선호하시면 알려주시면 반영하겠습니다.

### 1. DXF 좌표계 기본값
- **원점 (lat0, lng0)**: VMAP과 동일하게 `(36.3, 127.8)` (한국 근처) 로 할까요, 아니면 **도면 bbox 중심**을 자동으로 해당 위경도로 매핑할까요?
- **단위**: DXF 1단위 = **1m** 로 고정할까요, 아니면 설정 화면에서 사용자가 선택하게 할까요?

### 2. Google Maps API 키
- VMAP과 **동일한 키**를 사용할까요, 아니면 **new_dmap 전용 키**를 별도로 두고 환경 변수 또는 설정 파일로 넣을까요?

### 3. 배경 “없음”의 표현
- **완전 단색**(예: `#f5f5f5`)만 보이게 할까요, 아니면 **그리드/가장자리** 등 최소한의 가이드 라인을 둘까요?

### 4. 기존 ADMAP 데이터 호환
- 기존 ADMAP(IndexedDB 등)에 저장된 **사진/텍스트 (x,y)** 는 **그대로** 사용할 예정입니다.  
  다른 프로젝트명(예: `dmap-map` )으로 DB를 두어 **기존 ADMAP과 별도**로 둘까요, 아니면 **같은 DB**를 쓰고 “지도 뷰어”만 켜는 방식으로 갈까요?

---

## 진행 방식

1. **PLAN.md** (본 문서) 로 계획 및 피드백 요청 제시 ✅  
2. **1단계**부터 순서대로 구현 후, 필요 시 사용자 피드백 반영하여 수정  
3. 피드백이 없으면 위 **기본값**으로 진행합니다.

---

## 1단계 완료

- [x] new_dmap 폴더 및 기본 구조
- [x] config.js (API 키, 원점, 배경 없음 스타일)
- [x] dxf-to-geojson.js (DXF↔WGS84 변환, DXF→GeoJSON)
- [x] index.html (파일 선택 화면, 지도 뷰어, 슬라이드 메뉴, 배경 선택 UI)
- [x] app.js (initMap, DXF 로드→GeoJSON→지도 표시, 전체보기/줌, 메뉴)
- [x] package.json, copy-libs.js, README.md

## 3·4단계 완료 (현재)

- [x] local-storage.js (DB 이름 dmap-map, save/load Project·Photo, 내보내기)
- [x] 지도 롱프레스 → 컨텍스트 메뉴 (사진 촬영 / 사진 선택 / 텍스트 입력)
- [x] 사진 추가: (x,y) 저장, 지도 위 마커 표시, 클릭 시 사진 모달 (메모·삭제)
- [x] 텍스트 추가: (x,y) 저장, 지도 위 라벨 마커, 클릭 시 텍스트 편집·삭제
- [x] DXF 로드 시 IndexedDB에서 메타데이터·사진 로드 후 마커 그리기
- [x] 슬라이드 메뉴: 자료 내보내기 (순차 다운로드)

## 구현 노트: 블록(INSERT) 표시

- **방식**: DXF에서 보이는 그대로 표시 **가능**. INSERT를 단일 마커가 아니라 **블록 정의(blocks[name].entities)를 전개**해 표시함.
- **구현**: INSERT 발생 시 블록 내부 엔티티(LINE, LWPOLYLINE, CIRCLE, ARC, SPLINE, POINT 등)에 **위치·축척·회전** 변환을 적용한 뒤, 기존과 동일한 GeoJSON(LineString/Polygon/Point)으로 변환해 Data 레이어에 추가. 변환 순서는 ADMAP과 동일(기준점 보정 → scale → rotate → insert 위치).
- 블록이 없거나 엔티티가 없으면 기존처럼 삽입 위치만 Point로 표시.

## 구현 노트: DXF 두께 표시

- **두께 판별**: DXF `constantWidth`(그룹코드 43) > 0 또는 `lineweight`(370) > 0 이면 "두꺼운 선"으로 간주.
- **표시 방식**: 두꺼운 선은 **strokeWeight: 3**, 그 외는 **strokeWeight: 1**로 Data 레이어에서 굵은 실선으로 구별함. (점선은 Polyline+Symbol로도 가능하나, 현재는 strokeWeight만 사용)

---

*작성일: 2025-02-23*
