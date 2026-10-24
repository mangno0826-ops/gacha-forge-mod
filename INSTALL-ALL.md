# 한 번에 설치하기: 마개조 + 커스터마이저 + webp 패치

## 말랑나라가 시스템 서비스(systemd)로 돌아가는 서버 — 기영님 서버는 이쪽

SSH로 서버에 root로 들어간 뒤 **아래 한 줄**을 붙여 넣으세요.

```bash
curl -fsSL https://raw.githubusercontent.com/mangno0826-ops/gacha-forge-mod/main/install-server.sh | bash
```

스크립트가 알아서 이렇게 합니다.

1. `marinara` 서비스와 Node 버전(22.15 이상 필요)을 확인합니다.
2. 지금 서비스 설정을 `/opt/gf-patches/backup-<시각>/`에 백업합니다.
3. 마개조, 커스터마이저 1.8.13, webp 패치 파일을 `/opt/gf-patches/`에 받습니다.
4. 지금 쓰는 `NODE_OPTIONS`(CG 패치 등)는 **그대로 두고** 새 패치를 뒤에 이어 붙인 설정 조각을 만듭니다.
5. 서비스를 다시 시작합니다. 제대로 안 뜨면 **자동으로 원래대로 되돌립니다.**

끝나면 브라우저에서 가챠포지를 한 번 열고 확인하세요.

```bash
bash /opt/gf-patches/install-server.sh --check      # 패치가 적용됐는지 로그 보기
bash /opt/gf-patches/install-server.sh --uninstall  # 전부 빼고 원래대로
```

`--check`에서 `[gf-mod] ... applied 2 edits`, `[gf-customizer] applied 14 edits`, `[gallery-webp] 설치됨`이 보이면 성공입니다. 커스터마이저의 글리머 교환 구매는 켜진 상태로 설치됩니다.

이미 쌓인 PNG를 WebP로 바꾸는 작업(선택)은 서버를 꺼야 해서 자동으로 하지 않습니다. 필요하면 말씀해 주세요.

---

## Docker로 돌리는 서버

말랑나라 2.5.1 · 가챠포지 1.8.13 기준입니다. 서버(Docker)에 SSH로 들어가서 순서대로 붙여 넣으면 됩니다. 아래 경로는 `/root/Marinara-Engine` 기준이니, 다르면 `docker-compose.yml`이 있는 폴더로 바꿔 주세요.

## 0. 지금 상태 확인과 백업

```bash
cd /root/Marinara-Engine
docker compose config | grep -E "NODE_OPTIONS|\.cjs"
```

여기 나온 `NODE_OPTIONS` 줄을 **그대로 적어 두세요.** CG 패치나 한글화 패치가 이미 들어 있을 수 있고, 아래 3단계에서 그 값 끝에 이어 붙여야 합니다.

```bash
mkdir -p /root/backups
cp docker-compose.override.yml /root/backups/override-$(date +%Y%m%d).yml 2>/dev/null
docker compose stop marinara
docker run --rm -v marinara-engine_marinara-data:/data:ro -v /root/backups:/backup alpine \
  sh -c "cd /data && tar czf /backup/marinara-data-$(date +%Y%m%d).tar.gz ."
docker compose up -d marinara
```

볼륨 이름이 다르면 `docker volume ls`로 확인하세요(보통 `<폴더이름>_marinara-data`).

## 1. 확장 설치 (말랑나라 화면에서)

GitHub 확장 관리자에 아래 두 주소를 넣고 설치합니다.

```
https://github.com/tlsiddl/gacha-forge-customizer
https://github.com/mangno0826-ops/gacha-forge-mod
```

## 2. 서버 패치 파일 받기

```bash
cd /root/Marinara-Engine
mkdir -p patches
# 커스터마이저 1.8.13용 (런타임과 JSON은 반드시 한 쌍)
curl -fL https://raw.githubusercontent.com/tlsiddl/gacha-forge-customizer/main/versions/gf1813/gf-customizer-runtime.cjs -o patches/gf-customizer-runtime.cjs
curl -fL https://raw.githubusercontent.com/tlsiddl/gacha-forge-customizer/main/versions/gf1813/gf-customizer-edits.json  -o patches/gf-customizer-edits.json
# 마개조
curl -fL https://raw.githubusercontent.com/mangno0826-ops/gacha-forge-mod/main/server/gf-mod-runtime.cjs -o patches/gf-mod-runtime.cjs
# webp
curl -fL https://raw.githubusercontent.com/boricha417/marinara-global-gallery-webp/main/webp-upload-runtime.cjs -o patches/webp-upload-runtime.cjs
curl -fL https://raw.githubusercontent.com/boricha417/marinara-global-gallery-webp/main/global-gallery-png-to-webp.mjs -o patches/global-gallery-png-to-webp.mjs
ls -l patches
```

## 3. Compose 파일에 붙이기

`docker-compose.override.yml`을 엽니다(`nano docker-compose.override.yml`). `services: → marinara:` 아래에 다음을 더합니다. `volumes:`나 `environment:`가 이미 있으면 그 목록에 줄만 추가하세요.

```yaml
services:
  marinara:
    volumes:
      - ./patches/gf-customizer-runtime.cjs:/app/gf-customizer-runtime.cjs:ro
      - ./patches/gf-customizer-edits.json:/app/gf-customizer-edits.json:ro
      - ./patches/gf-mod-runtime.cjs:/app/gf-mod-runtime.cjs:ro
      - ./patches/webp-upload-runtime.cjs:/app/webp-upload-runtime.cjs:ro
    environment:
      - NODE_OPTIONS=<0단계에서 적어 둔 기존 값> --require=/app/gf-customizer-runtime.cjs --require=/app/gf-mod-runtime.cjs --require=/app/webp-upload-runtime.cjs
      - GF_CUSTOMIZER_EDITS_PATH=/app/gf-customizer-edits.json
      - GF_CUSTOMIZER_ENABLE_EXCHANGE=1
      - GF_MOD_RANK_REFILL=1
      - GF_MOD_AETHER=1
```

- 기존 `NODE_OPTIONS`가 없었다면 `<...>` 부분을 지우고 `--require=`부터 쓰면 됩니다.
- **`NODE_OPTIONS` 줄은 하나만** 있어야 합니다. 기존 줄이 있으면 그 줄을 위 줄로 바꾸세요.
- `GF_CUSTOMIZER_ENABLE_EXCHANGE=1`은 글리머 캐릭터 교환 구매를 켭니다. 목록만 보려면 `0`.
- 들여쓰기는 공백 2칸, 탭 금지.

검사하고 다시 띄웁니다.

```bash
docker compose config -q && echo "설정 OK"
docker compose up -d --force-recreate marinara
```

## 4. 확인

가챠포지를 한 번 연 뒤:

```bash
docker compose logs --since 10m marinara | grep -E "gf-customizer|gf-mod|gallery-webp|gacha-cg"
```

다음 줄들이 보이면 성공입니다(CG 패치를 쓰고 있다면 그 줄도 같이 보입니다).

```
[gallery-webp] 설치됨 (품질 95, 범위 global) — 설치 파일은 건드리지 않음
[gf-customizer] applied 14 edits in memory, preserving upstream hook output
[gf-mod] v0.1.0 applied 2 edits in memory (rank refill on, aether shelf on)
```

`fail closed`나 `signature mismatch`가 보이면 그 패치만 꺼진 것이고 게임은 정상입니다. 로그를 보내 주시면 확인할게요.

## 5. (선택) 이미 쌓인 PNG를 WebP로 바꾸기

앞으로 생기는 그림은 4단계까지만으로 WebP로 저장됩니다. 이미 있는 PNG는 **서버를 끄고** 한 번만 바꿉니다. 0단계 백업이 있어야 합니다.

```bash
docker compose stop marinara
# 미리보기 (아무것도 안 바꿈)
docker compose run --rm --no-deps -e NODE_OPTIONS= \
  -v ./patches/global-gallery-png-to-webp.mjs:/app/global-gallery-png-to-webp.mjs:ro \
  --entrypoint node marinara /app/global-gallery-png-to-webp.mjs --data /app/data
# 적용
docker compose run --rm --no-deps -e NODE_OPTIONS= \
  -v ./patches/global-gallery-png-to-webp.mjs:/app/global-gallery-png-to-webp.mjs:ro \
  --entrypoint node marinara /app/global-gallery-png-to-webp.mjs --data /app/data --apply --server-stopped
docker compose up -d marinara
```

끝에 `검사 통과`가 나와야 합니다. 게임에서 앨범, 지난 스토리, 카드 그림이 잘 보이는지 확인한 뒤, 볼륨 안 백업을 지워 용량을 돌려받습니다.

```bash
docker compose exec marinara sh -c "du -sh /app/data/webp-migration-backup && rm -rf /app/data/webp-migration-backup"
```

자세한 설명과 되돌리는 방법은 [webp 패치 README](https://github.com/boricha417/marinara-global-gallery-webp)에 있습니다.

## 되돌리기

`docker-compose.override.yml`을 0단계 백업으로 되돌리고 `docker compose up -d --force-recreate marinara`. 패치는 모두 메모리에서만 고치므로 바로 원래 상태가 됩니다.
