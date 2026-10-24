#!/usr/bin/env bash
# Gacha Forge 서버 패치 한 번에 설치 (systemd로 돌아가는 Marinara Engine용)
#   마개조(gf-mod) + 커스터마이저 1.8.13 + 글로벌 갤러리 webp
#
# 설치:   curl -fsSL https://raw.githubusercontent.com/mangno0826-ops/gacha-forge-mod/main/install-server.sh | bash
# 확인:   bash /opt/gf-patches/install-server.sh --check
# 되돌리기: bash /opt/gf-patches/install-server.sh --uninstall
#
# 하는 일
#  1. marinara 서비스와 Node 버전(22.15 이상)을 확인합니다.
#  2. 지금 서비스 설정을 /opt/gf-patches/backup-<시각>/ 에 백업합니다.
#  3. 패치 파일을 /opt/gf-patches/ 에 내려받습니다.
#  4. 지금 쓰고 있는 NODE_OPTIONS(CG 패치 등)는 그대로 두고, 그 뒤에 새 패치를 이어 붙인
#     설정 조각(drop-in)을 /etc/systemd/system/marinara.service.d/zz-gf-patches.conf 로 만듭니다.
#  5. 서비스를 다시 시작하고, 실패하면 자동으로 원래대로 되돌립니다.
# 게임 파일과 세이브는 건드리지 않습니다. 모든 패치는 메모리에서만 고칩니다.
set -euo pipefail

SERVICE="${GF_SERVICE:-marinara}"
DIR="/opt/gf-patches"
DROPIN_DIR="/etc/systemd/system/${SERVICE}.service.d"
DROPIN="${DROPIN_DIR}/zz-gf-patches.conf"
SELF_URL="https://raw.githubusercontent.com/mangno0826-ops/gacha-forge-mod/main/install-server.sh"
MOD_URL="https://raw.githubusercontent.com/mangno0826-ops/gacha-forge-mod/main/server/gf-mod-runtime.cjs"
CUST_BASE="https://raw.githubusercontent.com/tlsiddl/gacha-forge-customizer/main/versions/gf1813"
WEBP_BASE="https://raw.githubusercontent.com/boricha417/marinara-global-gallery-webp/main"
REQUIRES=("${DIR}/gf-customizer-runtime.cjs" "${DIR}/gf-mod-runtime.cjs" "${DIR}/webp-upload-runtime.cjs")

say()  { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✔ %s\033[0m\n' "$*"; }
warn() { printf '  \033[33m! %s\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31m✘ %s\033[0m\n' "$*"; exit 1; }

[ "$(id -u)" = 0 ] || die "root로 실행해 주세요."
command -v systemctl >/dev/null || die "systemctl이 없습니다. 이 스크립트는 systemd 서버용입니다."
systemctl cat "${SERVICE}" >/dev/null 2>&1 || die "'${SERVICE}' 서비스를 찾지 못했습니다."

show() { systemctl show "${SERVICE}" -p "$1" --value 2>/dev/null || true; }

check() {
  say "패치 상태 확인 (마지막 서비스 시작 이후 로그)"
  local since
  since="$(show ActiveEnterTimestamp | awk '{print $2" "$3}')"
  journalctl -u "${SERVICE}" --since "${since:-10 min ago}" --no-pager 2>/dev/null \
    | grep -E "gf-mod|gf-customizer|gallery-webp|gacha-cg" | tail -n 20 || true
  echo
  echo "  'applied ... edits'와 'gallery-webp] 설치됨'이 보이면 성공입니다."
  echo "  'hook registered'만 있고 applied가 없으면, 가챠포지를 브라우저에서 한 번 연 뒤 다시 확인하세요."
  echo "  'fail closed'나 'signature mismatch'가 보이면 그 패치만 꺼진 것이고 게임은 정상입니다."
}

uninstall() {
  say "설치한 패치를 서비스 설정에서 뺍니다"
  if [ -f "${DROPIN}" ]; then rm -f "${DROPIN}"; ok "${DROPIN} 삭제"; else warn "설치된 설정 조각이 없습니다."; fi
  systemctl daemon-reload
  systemctl restart "${SERVICE}"
  sleep 3
  systemctl is-active --quiet "${SERVICE}" && ok "서비스가 다시 실행 중입니다." || die "서비스가 시작되지 않았습니다: journalctl -u ${SERVICE} -n 50"
  echo "  /opt/gf-patches 폴더는 남겨 두었습니다. 필요 없으면 rm -rf /opt/gf-patches"
}

case "${1:-}" in
  --check) check; exit 0 ;;
  --uninstall) uninstall; exit 0 ;;
esac

# ── 1. 서비스와 Node 확인 ──────────────────────────────────────────
say "1/5 서비스와 Node 확인"
systemctl is-active --quiet "${SERVICE}" || warn "'${SERVICE}' 서비스가 지금 꺼져 있습니다. 설치 후 켭니다."
EXEC="$(show ExecStart)"
NODE_BIN="$(printf '%s' "${EXEC}" | sed -n 's/.*path=\([^ ;]*\).*/\1/p' | head -n1)"
if [ -z "${NODE_BIN}" ] || ! "${NODE_BIN}" -v >/dev/null 2>&1; then NODE_BIN="$(command -v node || true)"; fi
# ExecStart가 npm/pnpm/스크립트일 수 있으니, 실행 중인 프로세스의 node도 봅니다.
PID="$(show MainPID)"
if [ -n "${PID}" ] && [ "${PID}" != 0 ]; then
  RUN_BIN="$(readlink -f "/proc/${PID}/exe" 2>/dev/null || true)"
  CHILD="$(pgrep -P "${PID}" -f node 2>/dev/null | head -n1 || true)"
  [ -n "${CHILD}" ] && RUN_BIN="$(readlink -f "/proc/${CHILD}/exe" 2>/dev/null || echo "${RUN_BIN}")"
  case "${RUN_BIN}" in *node*) NODE_BIN="${RUN_BIN}" ;; esac
fi
[ -n "${NODE_BIN}" ] || die "Node 실행 파일을 찾지 못했습니다."
NODE_VER="$("${NODE_BIN}" -v)"
ok "Node ${NODE_VER} (${NODE_BIN})"
IFS=. read -r MAJ MIN _ <<<"${NODE_VER#v}"
if [ "${MAJ}" -lt 22 ] || { [ "${MAJ}" = 22 ] && [ "${MIN}" -lt 15 ]; }; then
  die "Node 22.15 이상이 필요합니다 (지금 ${NODE_VER}). 패치들이 module.registerHooks를 씁니다."
fi
SVC_USER="$(show User)"; SVC_USER="${SVC_USER:-root}"
ok "서비스 사용자: ${SVC_USER}"

# 지금 NODE_OPTIONS: 실행 중인 프로세스의 실제 값이 가장 정확합니다.
CUR_OPTS=""
for p in "${PID}" "${CHILD:-}"; do
  [ -n "${p}" ] && [ "${p}" != 0 ] && [ -r "/proc/${p}/environ" ] || continue
  v="$(tr '\0' '\n' <"/proc/${p}/environ" | sed -n 's/^NODE_OPTIONS=//p' | head -n1)"
  [ -n "${v}" ] && CUR_OPTS="${v}" && break
done
if [ -z "${CUR_OPTS}" ]; then
  CUR_OPTS="$(show Environment | tr ' ' '\n' | sed -n 's/^"\{0,1\}NODE_OPTIONS=//p' | head -n1 | tr -d '"')"
fi
# 예전에 이 스크립트가 붙인 항목은 빼고 다시 붙입니다.
BASE_OPTS=""
for tok in ${CUR_OPTS}; do
  case "${tok}" in
    *"${DIR}/"*) ;;
    *) BASE_OPTS="${BASE_OPTS:+${BASE_OPTS} }${tok}" ;;
  esac
done
ok "지금 NODE_OPTIONS: ${BASE_OPTS:-(없음)}"
# EnvironmentFile에 NODE_OPTIONS가 있으면 그쪽이 Environment보다 우선이라 설정 조각이 안 먹습니다.
ENV_FILES="$(systemctl cat "${SERVICE}" 2>/dev/null | sed -n 's/^EnvironmentFile=-\{0,1\}//p')"
for f in ${ENV_FILES}; do
  if [ -f "${f}" ] && grep -q '^ *NODE_OPTIONS=' "${f}"; then
    die "NODE_OPTIONS가 ${f} 파일에 들어 있어서 자동 설치를 멈췄습니다. 'systemctl cat ${SERVICE}' 결과를 보내 주시면 맞춰 드릴게요."
  fi
done
for r in "${REQUIRES[@]}"; do
  case " ${BASE_OPTS} " in *"${r##*/}"*) die "${r##*/}가 이미 다른 경로로 설치되어 있습니다. 'systemctl cat ${SERVICE}' 결과를 보내 주세요." ;; esac
done

# ── 2. 백업 ────────────────────────────────────────────────────────
say "2/5 지금 서비스 설정 백업"
STAMP="$(date +%Y%m%d-%H%M%S)"
BK="${DIR}/backup-${STAMP}"
mkdir -p "${BK}"
systemctl cat "${SERVICE}" >"${BK}/service-full.txt" 2>&1 || true
[ -d "${DROPIN_DIR}" ] && cp -a "${DROPIN_DIR}" "${BK}/dropins" || true
printf '%s\n' "${CUR_OPTS}" >"${BK}/NODE_OPTIONS.txt"
ok "${BK}"

# ── 3. 파일 받기 ───────────────────────────────────────────────────
say "3/5 패치 파일 받기"
TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT
fetch() { curl -fsSL --retry 3 "$1" -o "${TMP}/$2" || die "내려받기 실패: $1"; [ -s "${TMP}/$2" ] || die "빈 파일: $1"; }
fetch "${MOD_URL}" gf-mod-runtime.cjs
fetch "${CUST_BASE}/gf-customizer-runtime.cjs" gf-customizer-runtime.cjs
fetch "${CUST_BASE}/gf-customizer-edits.json" gf-customizer-edits.json
fetch "${WEBP_BASE}/webp-upload-runtime.cjs" webp-upload-runtime.cjs
fetch "${WEBP_BASE}/global-gallery-png-to-webp.mjs" global-gallery-png-to-webp.mjs
curl -fsSL --retry 3 "${SELF_URL}" -o "${TMP}/install-server.sh" 2>/dev/null || cp "$0" "${TMP}/install-server.sh" 2>/dev/null || true
for f in gf-mod-runtime.cjs gf-customizer-runtime.cjs webp-upload-runtime.cjs; do
  "${NODE_BIN}" --check "${TMP}/${f}" || die "${f} 문법 검사 실패"
done
"${NODE_BIN}" -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))' "${TMP}/gf-customizer-edits.json" || die "커스터마이저 JSON이 깨져 있습니다."
install -d -m 755 "${DIR}" "${DIR}/data"
install -m 644 "${TMP}"/*.cjs "${TMP}"/*.json "${TMP}"/*.mjs "${DIR}/"
[ -s "${TMP}/install-server.sh" ] && install -m 755 "${TMP}/install-server.sh" "${DIR}/install-server.sh"
chown "${SVC_USER}" "${DIR}/data" 2>/dev/null || true
ok "${DIR}"

# ── 4. 설정 조각 쓰기 ──────────────────────────────────────────────
say "4/5 서비스에 패치 연결 (기존 NODE_OPTIONS 유지)"
NEW_OPTS="${BASE_OPTS}"
for r in "${REQUIRES[@]}"; do NEW_OPTS="${NEW_OPTS:+${NEW_OPTS} }--require=${r}"; done
OLD_DROPIN=""
[ -f "${DROPIN}" ] && OLD_DROPIN="$(cat "${DROPIN}")"
mkdir -p "${DROPIN_DIR}"
cat >"${DROPIN}" <<EOF
# gacha-forge-mod install-server.sh ${STAMP}. 지우면 패치가 빠집니다: bash ${DIR}/install-server.sh --uninstall
[Service]
Environment="NODE_OPTIONS=${NEW_OPTS}"
Environment="GF_CUSTOMIZER_EDITS_PATH=${DIR}/gf-customizer-edits.json"
Environment="GF_CUSTOMIZER_CONFIG_FILE=${DIR}/data/gacha-customizer-settings.json"
Environment="GF_CUSTOMIZER_ENABLE_EXCHANGE=1"
Environment="GF_MOD_RANK_REFILL=1"
Environment="GF_MOD_AETHER=1"
EOF
ok "${DROPIN}"
echo "  NODE_OPTIONS=${NEW_OPTS}"

# ── 5. 다시 시작 ───────────────────────────────────────────────────
say "5/5 서비스 다시 시작"
rollback() {
  warn "서비스가 제대로 뜨지 않아 원래 설정으로 되돌립니다."
  if [ -n "${OLD_DROPIN}" ]; then printf '%s\n' "${OLD_DROPIN}" >"${DROPIN}"; else rm -f "${DROPIN}"; fi
  systemctl daemon-reload
  systemctl restart "${SERVICE}" || true
  sleep 5
  journalctl -u "${SERVICE}" -n 30 --no-pager || true
  die "설치를 취소했습니다. 위 로그를 캡처해서 보내 주세요."
}
systemctl daemon-reload
systemctl restart "${SERVICE}" || rollback
for _ in $(seq 1 20); do sleep 2; systemctl is-active --quiet "${SERVICE}" && break; done
sleep 6
systemctl is-active --quiet "${SERVICE}" || rollback
ok "서비스 실행 중"
check
echo
echo "다음: 브라우저에서 가챠포지를 열고 상점에 '에테르 충전소'가 보이는지 확인하세요."
echo "      서버 로그를 다시 보려면:  bash ${DIR}/install-server.sh --check"
echo "      되돌리려면:              bash ${DIR}/install-server.sh --uninstall"
