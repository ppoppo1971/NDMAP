# new_dmap 최적화 점검 보고서

**원칙**: 현 기능 유지, **현장 작업(사진/텍스트) 저장·내보내기 누락 없음**을 최우선으로 함.

**적용 완료**: 아래 §1.2의 1·2·3번, §2.2 축척 디바운스 180ms, §4 권장 저장 실패 시 사용자 알림(사진/텍스트/메모/삭제 후 저장).

---

## 1. 메모리 누수·참조 관리

### 1.1 발견 사항

| 위치 | 내용 | 위험도 | 비고 |
|------|------|--------|------|
| `hidePhotoModal()` | 사진 모달의 `img.src`에 설정된 data URL을 닫을 때 해제하지 않음 | 중 | 모달을 여러 번 열면 이전 data URL이 img에 남아 메모리 유지 |
| `hideExportMethodModal()` | `exportInfo`에 보관된 `photos`(blob 포함) 배열을 모달 닫을 때 null로 비우지 않음 | 중 | 내보내기 창만 열고 닫은 경우에도 blob 참조가 유지됨 |
| `scaleDisplayTimeout` | `bounds_changed` 디바운스용 setTimeout을 페이지 이탈 시 정리하지 않음 | 하 | SPA 단일 페이지라 보통 이탈 시 전체 해제되나, 정리 시 일관성 확보 |
| Google Maps 리스너 | `idle`, `bounds_changed`, `click`, `mousedown`, `mouseup`, `mousemove`, `dragstart`, `zoom_changed` 등 등록 후 해제 없음 | 하 | 페이지 종료 시 map이 사라지면 함께 해제. 장시간 사용 시 리스너 해제 정책 고려 가능 |
| `document` 전역 리스너 | `bindContextMenuCloseOnMap`에서 `touchstart`/`mousedown`을 document에 등록, 제거 없음 | 하 | 앱 생명주기와 동일해 실사용 시 문제 적음 |

### 1.2 권장 조치 (기능 유지)

- **즉시 적용 권장**
  - **사진 모달 닫을 때**: `hidePhotoModal()` 내에서 `photo-modal-img`의 `src`를 `''`로 설정해 data URL 참조 해제. ✅ 적용됨
  - **내보내기 모달 닫을 때**: `hideExportMethodModal()` 내에서 `exportInfo = null` 처리해 blob 참조 해제. ✅ 적용됨
- **선택 적용**
  - `beforeunload` 또는 SPA 라우트 이탈 시 `scaleDisplayTimeout`을 clear하고, 필요 시 Google Maps 리스너를 `google.maps.event.clearInstanceListeners(map)` 등으로 정리.

---

## 2. 배터리·CPU 절약

### 2.1 발견 사항

| 위치 | 내용 | 영향 |
|------|------|------|
| `bounds_changed` + `updateScaleDisplay` | 지도 드래그/줌 시 100ms 디바운스로 축척 표시 갱신 | 드래그 중에도 100ms마다 한 번씩 호출. 디바운스 150~200ms로 늘리면 CPU/배터리 절감 |
| `map.data.setStyle(function (feature) { ... })` | 줌/패닝 시 feature 수만큼 스타일 콜백 호출 | Maps API 동작. 데이터 레이어 feature 수가 많으면 비용 증가 가능 |
| 롱프레스 타이머 | `setTimeout(longPressDuration)` 사용, 해제는 `cancelLongPress`에서 정상 처리 | 누수 없음. 400ms 단일 타이머라 부담 적음 |
| 터치 이벤트 | `touchstart`/`touchmove`/`touchend`에 `passive: true` 사용 | 스크롤/제스처 시 스크롤 성능에 유리 |

### 2.2 권장 조치

- **즉시 적용 권장**
  - 축척 표시 디바운스를 100ms → 150ms 또는 200ms로 증가 (화면 표시 체감 거의 동일). ✅ 180ms로 적용됨
- **선택 적용**
  - 축척 표시를 `idle`에서만 갱신하고 `bounds_changed` 디바운스는 제거하거나 더 드물게 호출 (표시 갱신이 다소 느려질 수 있음).
  - 대형 DXF의 경우 `map.data` feature 수를 줄이거나, 뷰포트 밖 feature는 스타일에서 제외하는 방식은 Maps API 제약상 난이도 높음 → 중장기 검토.

---

## 3. 속도·반응성

### 3.1 발견 사항

| 위치 | 내용 | 권장 |
|------|------|------|
| DXF 로드 | `file.text()` → `parser.parseSync(text)` → `extractConstantWidths` → `applyDxfToMap` 순서 | 이미 동기 파싱 후 한 번에 적용. 비동기 분리 시 UI 반응은 좋아질 수 있으나, 저장/내보내기 로직과 무관하므로 선택 사항 |
| `loadMetadataAndDisplay` | `Promise.all([loadProject, loadPhotos])` 후 `drawPhotoMarkers` + `drawTextMarkers` | 구조 적절. 사진 수가 매우 많을 때만 마커/오버레이 가상화 검토 |
| `compressImage` | 품질 이진 탐색 + 필요 시 스케일업, `fetch(dataUrl).then(r=>r.blob())`로 실제 크기 측정 | 목표 용량 근접을 위한 합리적 비용. 유지 권장 |
| `applyDxfToMap` | `map.data.forEach(remove)` 후 `addGeoJson` | 기존 데이터 제거 후 일괄 추가로 무난 |
| IndexedDB | 트랜잭션 단위 적절, `dbPromise` 단일 인스턴스 재사용 | 구조 유지 |
| `exportLocalData` | `loadPhotos`로 전체 목록 로드 후 모달 표시 | 내보내기 시점에만 로드. 저장/내보내기 무결성에 영향 없음 |

### 3.2 권장 조치

- **기능 변경 없음**
  - DXF 파싱/적용, 압축, IndexedDB, 내보내기 흐름은 현재 구조 유지.
- **선택 개선**
  - 매우 큰 DXF에서 `extractConstantWidths`의 `lines` 순회를 한 번으로 줄이거나, 정규식으로 43 코드만 추출하는 방식은 가능하나, 우선순위 낮음.
  - 사진 마커 수가 수백 개 이상일 때만 마커 클러스터링 또는 뷰포트 내만 그리기 등 고려.

---

## 4. 데이터 무결성·저장/내보내기 (최우선)

### 4.1 점검 결과

- **저장**
  - 사진: `addPhotoAtPosition` → `localStore.savePhoto(dxfFileFullName, photo)` 호출 후 `drawPhotoMarkers`만 갱신. 저장 실패 시 사용자 알림은 없음.
  - 텍스트: 추가/수정/삭제 시 `saveProject(dxfFileFullName, { texts, lastModified })` 호출. 동일 키로 덮어쓰기.
- **로드**
  - `loadMetadataAndDisplay`: `loadProject` + `loadPhotos`로 복원 후 `photos`/`texts` 배열과 마커/텍스트 오버레이 동기화.
- **내보내기**
  - ZIP: `exportAsZipOnly`에서 `loadProject` + `loadPhotos`로 최신 데이터 로드 후 메타데이터·blob 포함 ZIP 생성.
  - 개별: `exportProjectSequential`에서 동일하게 최신 로드 후 순차 다운로드.

**결론**: 저장·로드·내보내기 경로가 IndexedDB를 단일 소스로 사용하며, “저장 후 누락 없이 내보내기”에 필요한 흐름은 유지되고 있음.  
**적용함**: 저장 실패 시 사용자 알림 추가 — `savePhoto`, `saveProject`, `updatePhotoMemo` 호출 후 `.catch()`에서 alert로 안내. ✅

---

## 5. 기타·코드 품질

| 항목 | 내용 |
|------|------|
| 전역 변수 | `map`, `dxfData`, `photos`, `texts`, `photoMarkers`, `textMarkers` 등 앱 상태가 전역에 있음. 리팩터 시 모듈/네임스페이스로 묶을 수 있으나 기능 변경 아님. |
| 에러 처리 | `loadDxfFile`, `exportLocalData`, `addPhotoAtPosition` 등에서 catch 후 alert. 저장 실패 시에도 동일하게 사용자 피드백 권장. |
| Blob/URL | `downloadFile`에서 `URL.createObjectURL` 사용 후 500ms 뒤 `revokeObjectURL` 호출. 적절함. |

---

## 6. 적용 우선순위 요약

| 우선순위 | 조치 | 기능 영향 |
|----------|------|-----------|
| 1 | `hidePhotoModal`에서 `img.src = ''` 설정 | 없음. 메모리만 해제 |
| 2 | `hideExportMethodModal`에서 `exportInfo = null` 설정 | 없음. blob 참조만 해제 |
| 3 | 축척 표시 디바운스 100ms → 150ms 또는 200ms | 거의 없음. 약간 덜 자주 갱신 |
| 4 | (선택) 저장 실패 시 사용자 알림 추가 | 기능 향상 | ✅ 적용됨 |
| 5 | (선택) 페이지 이탈 시 `scaleDisplayTimeout` 정리 | 메모리/타이머 정리 | |

위 1~3번까지는 **현 기능을 그대로 유지**하면서 메모리와 배터리만 개선하는 안전한 변경이다.  
저장·내보내기 무결성과 직접 관련된 코드는 변경하지 않았으며, 저장 실패 알림만 추가하여 데이터 신뢰성을 높였다.
