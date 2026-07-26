# WebCanvas

브라우저에서 이미지 보정, 드로잉, 지우기, 부분 블러와 PNG/프로젝트 내보내기를 할 수 있는 Vue 기반 캔버스 편집기입니다.

## 시작하기

Node.js 22와 pnpm이 필요합니다.

```bash
pnpm install
pnpm dev
```

개발 서버 주소는 `http://localhost:4080`입니다.

## 사용 방법

첫 화면에서 작업 방식을 선택합니다.

- **Canvas drawing**: 빈 아트보드에 펜으로 그리고, 참조 이미지 한 장을 배치할 수 있습니다.
- **Edit an image**: 이미지별로 밝기, 대비, 채도, 전체 블러, 색조를 보정하고 그 위에 그리거나 지울 수 있습니다.

공통 기능:

- 펜, 지우개, 부분 블러
- 마우스 휠 확대/축소, `Space`를 누른 채 드래그하여 이동
- `Ctrl`/`Cmd` + `Z` 실행 취소, `Shift` + `Ctrl`/`Cmd` + `Z` 다시 실행
- PNG 내보내기 및 편집 가능한 JSON 프로젝트 저장/가져오기

## 확인 명령

```bash
pnpm typecheck
pnpm lint
pnpm build
```

## Docker 실행

```bash
docker compose up --build
```

실행 후 [http://localhost:4090/WebCanvas/](http://localhost:4090/WebCanvas/)에서 엽니다.
