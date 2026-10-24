# Gacha Forge · 마개조 (비공식) v0.1.0

말랑나라(Marinara Engine) **2.5.1**의 **Gacha Forge 1.8.13**용 개인 확장입니다. 화면 확장과 서버 패치 두 부분으로 되어 있습니다.

> 원본 Gacha Forge와 무관한 팬 제작 확장입니다. 원본: [Pasta-Devs/Marinara-Agents · gacha-forge](https://github.com/Pasta-Devs/Marinara-Agents/tree/main/packages/gacha-forge)

## 기능

| 기능 | 어디서 | 필요한 것 |
|---|---|---|
| 스토리 챕터 10개씩 묶기 | 스토리 챕터 목록. 최신 챕터가 있는 묶음만 펼쳐 둡니다 | 확장 |
| 챕터 목록을 최신 챕터에서 열기 | 스토리에 들어가면 클리어하지 않은 챕터로 바로 이동 | 확장 |
| 챕터 자동 진행 | 왼쪽 **마개조** 탭 → `챕터 자동 진행`. 장면 읽기(게임 Auto) → 팀 확인 → 전투 시작 → 자동 전투 → 결과 → 다음 노드를 챕터 끝까지 반복합니다. 패배, 행동력 부족, 전투 준비 실패면 멈춥니다 | 확장 |
| 재료던전 반복 전투 | 전투 시작 화면이나 결과 화면에서 **마개조** 탭 → 횟수 고르고 `반복 전투`. 게임의 `Run it again`을 대신 눌러 줍니다 | 확장 |
| UI 테마 2종 | 마개조 → 설정 → UI 테마: `말랑 파스텔`, `미드나잇` | 확장 |
| 말랑나라 글꼴 적용 | 마개조 → 설정. 말랑나라 화면의 글꼴을 게임 안에도 씁니다. 글꼴 이름을 직접 적을 수도 있습니다 | 확장 |
| 홈 배경 위치 조정 | 마개조 → 설정 → 좌우/위아래 슬라이더. 월드마다 따로 저장 | 확장 |
| 메신저 사진 앨범 | 마개조 → 앨범. 메신저(Talk)에서 받은 사진을 자동으로 모아 크게 보고 저장 | 확장 |
| 지휘관 랭크업 시 행동력 풀충전 | 원래 랭크업마다 +20 → 최대치까지 채움 | **서버 패치** |
| 에테르 충전소 | 상점 → 왼쪽 맨 아래 `에테르 충전소`. 결제 없이 300 / 1,600 / 8,000 / 16,000 충전 | **서버 패치** + 확장 |

설정과 앨범은 **브라우저에 저장**됩니다(기기마다 따로). 앨범은 사진 주소만 저장하고, 사진 파일은 원래대로 말랑나라 글로벌 갤러리에 있습니다.

## 설치

### 1. 확장

GitHub 확장 관리자에 이 저장소 주소를 넣어 설치합니다. 게임 화면 안에 들어가야 해서 **Full page access** 권한을 씁니다.

### 2. 서버 패치 — systemd 서버

root로 SSH 접속 후 `curl -fsSL https://raw.githubusercontent.com/mangno0826-ops/gacha-forge-mod/main/install-server.sh | bash` 한 줄이면 커스터마이저·webp 패치까지 같이 설치됩니다. 자세한 내용은 [INSTALL-ALL.md](INSTALL-ALL.md).

### 2-1. 서버 패치 (Docker)

Marinara의 `docker-compose.yml`이 있는 폴더에서:

```bash
mkdir -p gf-mod
curl -fL https://raw.githubusercontent.com/mangno0826-ops/gacha-forge-mod/main/server/gf-mod-runtime.cjs -o gf-mod/gf-mod-runtime.cjs
```

`docker-compose.gf-mod.example.yml`을 참고해서 `gf-mod-runtime.cjs`를 `/app/gf-mod-runtime.cjs`로 마운트하고, `NODE_OPTIONS`에 `--require=/app/gf-mod-runtime.cjs`를 넣습니다. **다른 서버 패치를 이미 쓰고 있다면 기존 `NODE_OPTIONS` 값 끝에 이어 붙여야 합니다.** 그대로 덮으면 기존 패치가 빠집니다.

```bash
docker compose up -d --force-recreate marinara
docker compose logs --since 10m marinara | grep gf-mod
```

게임을 한 번 연 뒤 아래 줄이 보이면 성공입니다.

```
[gf-mod] v0.1.0 applied 2 edits in memory (rank refill on, aether shelf on)
```

`fail closed`가 보이면 Gacha Forge가 1.8.13이 아닌 것입니다. 패치는 꺼지고 게임은 원래대로 동작합니다.

### 설정 (환경 변수)

| 변수 | 기본 | 뜻 |
|---|---|---|
| `GF_MOD_RANK_REFILL` | `1` | `0`이면 랭크업 풀충전을 끄고 게임 기본(+20)으로 |
| `GF_MOD_AETHER` | `1` | `0`이면 에테르 충전소를 닫음 |
| `GF_MOD_AETHER_PACKS` | (기본 4종) | JSON으로 충전 상품 지정. 예: `[{"id":"a","amount":3200,"label":"20연","price":"₩13,000"}]` |
| `GF_MOD_OFF` | | `1`이면 서버 패치 전체를 끔 |

## 같이 써도 되는 패치

실제 1.8.13 서버 코드로 아래와 함께 켜서 모두 적용되는 것을 확인했습니다(순서 무관).

- [gacha-forge-customizer](https://github.com/tlsiddl/gacha-forge-customizer) `versions/gf1813` (확장 화면도 상점 탭이 나란히 붙고 서로 간섭하지 않음)
- [gacha-forge-cg-patch](https://github.com/tlsiddl/gacha-forge-cg-patch) `v1.2-gf1813`
- [marinara-global-gallery-webp](https://github.com/boricha417/marinara-global-gallery-webp)
- [퀘스트 확장](https://github.com/tlsiddl/Gacha-Forge-Quest-Extension), [배경 관리자](https://github.com/tlsiddl/Gacha-Forge-Background-Manager), [통합 한글화](https://github.com/tlsiddl/Gacha-Forge-GACHA-FORGE-UI-KR-UI-)는 화면 확장이라 서버와 무관합니다.

## 제거

확장을 끄고, `NODE_OPTIONS`에서 `--require=/app/gf-mod-runtime.cjs`와 마운트 줄을 지운 뒤 다시 띄웁니다. 게임 파일을 바꾼 적이 없어서 바로 원래 상태가 됩니다. 이미 충전한 에테르와 채운 행동력은 세이브에 남습니다.

## 알려진 제한

- 서버 패치는 Gacha Forge **1.8.13 전용**입니다. 게임이 업데이트되면 꺼지고(게임은 정상), 새 버전용이 나올 때까지 랭크업 풀충전과 에테르 충전소가 멈춥니다. 화면 확장의 나머지 기능은 화면 구조가 크게 바뀌지 않는 한 계속 동작합니다.
- 자동 진행은 화면의 버튼을 대신 누르는 방식입니다. 게임 화면이 열려 있어야 하고, 탭을 다른 곳으로 옮기면 브라우저가 느리게 돌릴 수 있습니다.
- 앨범은 확장을 설치한 뒤에 받은(또는 다시 연) 메신저 사진부터 모입니다.

## 테스트

`tests/`는 실제 Gacha Forge 1.8.13 클라이언트와 서버를 Chromium에서 띄워 확인하는 스크립트입니다. 메모리 저장소 하네스(`host.mjs`, `seed.mjs`)는 [gacha-forge-customizer](https://github.com/tlsiddl/gacha-forge-customizer) `tests/realtest`의 것을 그대로 씁니다.

확인한 것: 챕터 25개를 10/10/5로 묶고 최신 묶음만 펼침, 최신 챕터로 스크롤, 새 장면 자동 읽기 → 완료 → 전투 노드 → 팀 → 전투 요청까지 자동 진행, 재료던전 3회 반복 후 정확히 멈춤, 랭크 21→22에서 행동력 4 → 81/81, 에테르 1,600 충전과 상단 잔액 갱신, 커스터마이저 상점 탭과 번갈아 열기, 테마·글꼴 적용, 페이지 오류 없음.

확인하지 못한 것: 스토리 전투 자체(테스트 환경에 AI 연결이 없어 적 생성이 안 됨), 실제 말랑나라 인증, 휴대폰 실기기.
