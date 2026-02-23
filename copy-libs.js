/**
 * new_dmap - 라이브러리 복사 스크립트
 * npm run copy-libs → node_modules/dxf-parser → libs/dxf-parser.min.js
 */
const fs = require('fs');
const path = require('path');

const libsDir = path.join(__dirname, 'libs');
if (!fs.existsSync(libsDir)) {
  fs.mkdirSync(libsDir);
  console.log('✅ libs 폴더 생성');
}

function copyFile(source, dest) {
  try {
    fs.copyFileSync(source, dest);
    console.log('✅ 복사 완료: ' + path.basename(dest));
    return true;
  } catch (err) {
    console.error('❌ 복사 실패: ' + path.basename(dest), err.message);
    return false;
  }
}

const dxfSource = path.join(__dirname, 'node_modules', 'dxf-parser', 'dist', 'dxf-parser.min.js');
const dxfDest = path.join(libsDir, 'dxf-parser.min.js');

console.log('\n📦 라이브러리 복사 시작...\n');
const ok = fs.existsSync(dxfSource) && copyFile(dxfSource, dxfDest);
if (ok) {
  console.log('\n✅ 완료. index.html에서 libs/dxf-parser.min.js 주석 해제 후 사용 가능.');
} else {
  console.log('\n⚠️ npm install 후 다시 실행하세요.');
}
