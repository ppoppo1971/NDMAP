# new_dmap 최적화 검토 보고서

검토일: 2025  
범위: `new_dmap/app.js`, `new_dmap/local-storage.js`, `new_dmap/index.html`  
목표: **배터리 효율**, **메모리 누수**, **기능 향상** 최적화 방안 검토  
원칙: **기존 기능 유지**, **촬영 사진·메타데이터 누락/삭제 없음** (삭제는 사용자 직접 삭제 시에만)

---

## 1. 데이터 안전성 (최우선)

### 1.1 저장 구조

| 저장소 | 용도 | 비고 |
|--------|------|------|
| **IndexedDB** `dmap-map` (v1) | 프로젝트 메타(texts), 사진(blob·메타) | object store: `projects`, `photos` |
| **localStorage** | `dmap:imageSize` (용량 설정만) | 사진/메타와 무관 |

- **projects**: keyPath `dxfFile`. 항목: `dxfFile`, `texts`, `lastModified`.
- **photos**: keyPath `id`, index `dxfFile`. 항목: `id`, `dxfFile`, `fileName`, `memo`, `x`, `y`, `width`, `height`, `blob`, `createdAt`, `updatedAt`.

### 1.2 쓰기·삭제 경로 및 사용자 의도

**쓰기 (모두 사용자 동작에 따른 명시적 저장)**

| 위치 | 동작 | 사용자 의도 |
|------|------|-------------|
| `local-storage.js` | `saveProject(dxfFile, data)` | 텍스트 저장/삭제/날짜범위 삭제 후 |
| `local-storage.js` | `savePhoto(dxfFile, photo)` | 사진 추가·저장 |
| `local-storage.js` | `updatePhotoMemo(id, memo)` | 사진 모달에서 메모 저장 |
| `app.js` | `localStorage.setItem('dmap:imageSize', size)` | 용량조정 모달에서 선택 |

**삭제 (모두 사용자 확인 후에만)**

| 위치 | 동작 | 사용자 의도 |
|------|------|-------------|
| `local-storage.js` | `deletePhoto(id)` | 사진 모달에서 "삭제" 버튼 + 확인 후 |
| `local-storage.js` | `deletePhotosByDateRange(dxfFile, startMs, endMs)` | 자료 삭제 모달에서 날짜 선택 + "삭제" 확인 후 |

**결론 (데이터 안전성)**

- 사진·메타데이터 **자동 삭제/덮어쓰기 경로 없음**. 삭제는 위 두 경로뿐이며, 모두 사용자 확인 후 수행됨.
- `saveProject`는 해당 DXF의 **프로젝트 레코드 1건만** 갱신하며, **photos 스토어는 건드리지 않음**. 따라서 사진이 프로젝트 저장으로 인해 지워지지 않음.
- `loadMetadataAndDisplay()`는 메모리만 `photos = []; texts = [];` 후 DB에서 다시 로드할 뿐, DB를 덮어쓰지 않음.

**권장 (선택)**

- IndexedDB `tx.onerror` 시 사용자에게 저장 실패를 명확히 안내하고, 필요 시 재시도 또는 로컬 임시 보관 후 재시도 로직을 검토할 수 있음. (기능 변경 없이 안정성만 강화)

---

## 2. 메모리 누수

### 2.1 이벤트 리스너

- **일반 DOM/UI 리스너**: `addEventListener`만 사용, `removeEventListener` 없음. 앱이 단일 페이지이고 한 번만 초기화되므로, 뷰어를 "완전히 해제"하는 플로우가 없다면 현재 구조에서는 "누수"라기보다 **의도된 영구 바인딩**에 가깝습니다.
- **Google Maps 리스너**: `map.addListener`, `map.data.addListener`, 마커 `addListener` 등도 지도/뷰어 생명주기 동안 하나만 유지되므로, 뷰어 해제 플로우를 도입할 때만 `clearInstanceListeners(map)` 등 해제를 추가하면 됩니다.

### 2.2 컨텍스트 메뉴 "지도 밖 클릭 시 닫기" 미동작

| 파일:위치 | 내용 | 권장 |
|-----------|------|------|
| `app.js` 73 | `initMap()`에서 `bindContextMenuCloseOnMap()` 호출 | 이 시점에는 **map이 아직 null** (지도는 `ensureMap()`에서 뷰어 표시 시 생성됨) |
| `app.js` 1468–1483 | `bindContextMenuCloseOnMap()` 내부 `if (!map \|\| !contextMenuEl) return;` | 따라서 **document의 touchstart/mousedown 리스너가 한 번도 붙지 않음** → 지도 밖 클릭 시 컨텍스트 메뉴가 닫히지 않을 수 있음 |

**권장**: `ensureMap()` 안에서 `mapBindingsDone` 체크 후 한 번만 `bindContextMenuCloseOnMap()`를 호출하도록 옮기기. (기존 기능 유지 + 의도한 "바깥 클릭 시 닫기" 동작 복구)

### 2.3 마커·오버레이 해제

- `clearDxfImageMarkers()`, `clearPhotoMarkers()`, `clearTextMarkers()`에서 `setMap(null)` 및 배열/참조 정리 적절히 수행됨.
- `applyObjectVisibility()`는 표시만 숨기는 것이므로, 리소스 해제 목적의 "완전 제거"와는 별개로 두면 됨.

### 2.4 타이머

- `bounds_changed` 시 이전 `scaleDisplayTimeout`을 `clearTimeout` 후 새 `setTimeout(updateScaleDisplay, 180)` 사용 → 정리됨.
- 롱프레스용 `longPressTimer`도 `clearTimeout` 후 `null` 할당 → 정리됨.

### 2.5 텍스트 오버레이 draw 호출

| 파일:위치 | 내용 | 권장 |
|-----------|------|------|
| `app.js` 1425–1455 | `TextOnlyOverlay.prototype.draw()` — pan/zoom 시마다 호출, `innerHTML = ''` 후 전체 span 재생성 및 매 span에 `addEventListener('click', ...)` | pan/zoom이 잦으면 DOM·리스너 생성이 빈번해짐. **throttle**(예: requestAnimationFrame + 플래그로 한 프레임에 한 번만 그리기) 또는 "bounds/zoom이 실제로 바뀐 경우에만" 다시 그리기로 제한 권장. |

---

## 3. 배터리 효율

| 항목 | 현재 | 비고 |
|------|------|------|
| `setInterval` | 사용 없음 | — |
| `watchPosition` / `getCurrentPosition` | 사용 없음 | — |
| 스케일 표시 | `idle` + `bounds_changed`에서 `setTimeout(updateScaleDisplay, 180)` | 이미 180ms 디바운스. 부담 작음. |
| 마커 애니메이션 | `google.maps.Animation.NONE` | 적절함. |
| 텍스트 오버레이 | pan/zoom 시마다 `draw()` 호출 가능 | **배터리 측면**에서도 `draw` 호출을 throttle/제한하는 것이 유리. |

**권장**: `TextOnlyOverlay.draw()` 호출을 throttle하거나 "변경 시에만" 다시 그리기로 제한하면, 불필요한 DOM 조작과 CPU 사용이 줄어 배터리 효율에 도움이 됨.

---

## 4. 기능 향상 최적화 (동작 유지)

| 항목 | 내용 | 권장 |
|------|------|------|
| DXF 원문 재파싱 | `extractConstantWidths(dxfData, text)` 등에서 동일 DXF 원문을 여러 번 파싱할 수 있음 | 현재 로드된 DXF 원문을 캐시해 한 번만 파싱하거나, 파서 결과에 포함되면 생략. |
| IMAGE ref 추출 | `loadDxfFile` / `loadDxfFromFolder` 각각에서 `extractDxfImageRefs(text)` 호출 | DXF 로드 플로우를 한 곳으로 모아 원문/파싱 결과를 1회만 사용하도록 정리. |
| 텍스트 오버레이 | `draw()`가 zoom/pan마다 전체 span 재생성 | throttle 또는 "텍스트/위치 변경 시에만" 다시 그리기로 제한. |
| applyDxfToMap | DXF/파일 전환 시 전체 GeoJSON 재적재 | 동작상 필요. 대용량 DXF 시 불필요한 중간 그리기만 줄이는 정도 검토. |
| loadMetadataAndDisplay | `Promise.all([loadProject, loadPhotos])` 후 `drawPhotoMarkers` + `drawTextMarkers` | 구조 적절. 사진 수가 매우 많을 때만 마커/오버레이 가상화 검토. |

---

## 5. 요약 및 우선순위

### 반드시 유지할 것

- **사진·메타데이터**: 저장은 `savePhoto`/`saveProject`/`updatePhotoMemo`만, 삭제는 `deletePhoto`(사진 모달 삭제 확인) 및 `deletePhotosByDateRange`(자료 삭제 모달 확인)만 사용. **자동 삭제/덮어쓰기 경로 없음.**

### 권장 수정 (기능 유지·안정성·효율)

1. **동작 보완**: `bindContextMenuCloseOnMap()`를 `ensureMap()`에서 map 생성 후 1회만 호출하도록 이동 → "지도 밖 클릭 시 컨텍스트 메뉴 닫기" 동작 확실히 적용.
2. **메모리·배터리**: `TextOnlyOverlay.draw()`를 throttle하거나 "bounds/zoom 변경 시에만" 다시 그리기로 제한 → pan/zoom 시 불필요한 DOM/CPU 사용 감소.
3. **최적화**: DXF 원문/IMAGE ref 파싱을 1회만 하도록 로드 플로우 정리 (동작 동일).

### 선택 사항

- IndexedDB 저장 실패 시 사용자 안내 강화 및 재시도/임시 보관 전략 검토.
- 뷰어를 완전히 해제하는 플로우를 도입할 경우, 그 시점에 map 리스너 제거 및 `clearInstanceListeners(map)` 등 정리 추가.

---

*이 보고서는 기존 기능을 유지하면서, 촬영 사진과 메타데이터가 사용자 삭제 외에 누락·삭제되지 않음을 전제로 작성되었습니다.*
