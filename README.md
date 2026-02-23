# new_dmap

지도 엔진(Google Maps) 기반 DXF 도면 뷰어입니다.  
ADMAP의 기능을 유지하면서 대용량 DXF도 부드럽게 보이도록, VMAP을 참고해 구현했습니다.

## 요구사항

- 웹 브라우저 (Chrome, Safari 등)
- Google Maps API 키 (config.js에 설정, VMAP과 동일 키 사용 가능)
- DXF 파일 (로컬 선택)

## 실행 방법

1. **로컬 서버로 열기** (파일 직접 열면 CORS/스크립트 제한 가능)
   ```bash
   cd new_dmap
   npx serve .
   # 또는 python -m http.server 8080
   ```
2. 브라우저에서 `http://localhost:3000` (또는 사용한 포트) 접속
3. "로컬 DXF 선택"으로 DXF 파일 선택 → 지도 위에 도면 표시

## 구성

- **config.js** – API 키, DXF↔지도 좌표 원점·단위, 배경 없음 스타일
- **dxf-to-geojson.js** – DXF 파싱 결과 → GeoJSON 변환, DXF (x,y) ↔ WGS84 (lng,lat) 변환
- **app.js** – 지도 초기화, DXF 로드, 지도에 도면 레이어 표시, 메뉴·줌·배경 선택
- **index.html** – 파일 선택 화면, 지도 뷰어, 슬라이드 메뉴, 배경 지도 선택 UI

## 현재 구현

- [x] 지도 엔진 연동 (Google Maps, VMAP 참조)
- [x] DXF 파싱 후 GeoJSON 변환, 지도 Data 레이어로 표시
- [x] 배경 기본 "없음", 사용자 선택 (도로/위성/하이브리드)
- [x] 전체보기, 줌 인/아웃, 목록으로 돌아가기
- [x] 사진/텍스트 오버레이: 지도 롱프레스 → 컨텍스트 메뉴 → 사진 또는 텍스트 추가
- [x] 사진·텍스트 DXF 좌표 (x,y) 저장, 지도 위 마커 표시, 클릭 시 편집·삭제
- [x] local-storage (IndexedDB, DB 이름 dmap-map), 자료 내보내기 (순차 다운로드)
- [ ] Google Drive 연동 (선택)
- [ ] 사진누락확인, 자료 삭제(날짜 범위), 용량 조정 등 (선택)

## DXF 파서 (오프라인)

- **libs/dxf-parser.min.js** 를 포함해 두었습니다. 오프라인에서도 DXF 파싱이 가능합니다.
- index.html 은 이 로컬 파일을 로드합니다. 새로 받을 때는 `npm run copy-libs` 또는 ADMAP-main/libs 에서 복사하면 됩니다.

## 계획·피드백

자세한 단계별 계획과 사용자 피드백 요청 사항은 **PLAN.md**를 참고하세요.
