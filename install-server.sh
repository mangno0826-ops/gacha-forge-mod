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

say()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
ok()   { printf '  \033[32mOK %s\033[0m\n' "$*"; }
warn() { printf '  \033[33m! %s\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*"; exit 1; }

[ "$(id -u)" = 0 ] || die "Run as root."
command -v systemctl >/dev/null || die "systemctl not found. This script is for systemd servers."
systemctl cat "${SERVICE}" >/dev/null 2>&1 || die "Service '${SERVICE}' not found."

show() { systemctl show "${SERVICE}" -p "$1" --value 2>/dev/null || true; }

check() {
  say "Patch status (log since last service start)"
  local since
  since="$(show ActiveEnterTimestamp | awk '{print $2" "$3}')"
  journalctl -u "${SERVICE}" --since "${since:-10 min ago}" --no-pager 2>/dev/null \
    | grep -E "gf-mod|gf-customizer|gallery-webp|gacha-cg" | tail -n 20 || true
  echo
  echo "  Success = lines with 'applied ... edits' and a 'gallery-webp]' line."
  echo "  No 'applied' yet? Open Gacha Forge in the browser once, then run --check again."
  echo "  'fail closed' / 'signature mismatch' = only that patch is off; the game still works."
}

uninstall() {
  say "Removing the patches from the service"
  if [ -f "${DROPIN}" ]; then rm -f "${DROPIN}"; ok "removed ${DROPIN}"; else warn "No drop-in installed."; fi
  systemctl daemon-reload
  systemctl restart "${SERVICE}"
  sleep 3
  systemctl is-active --quiet "${SERVICE}" && ok "Service is running again." || die "Service did not start: journalctl -u ${SERVICE} -n 50"
  echo "  /opt/gf-patches was kept. Delete it with: rm -rf /opt/gf-patches"
}

case "${1:-}" in
  --check) check; exit 0 ;;
  --uninstall) uninstall; exit 0 ;;
esac

# ── 1. Service and Node ───────────────────────────────────────────
say "1/5 Checking service and Node"
systemctl is-active --quiet "${SERVICE}" || warn "'${SERVICE}' is stopped now. It will be started after install."
PID="$(show MainPID)"; [ "${PID}" = 0 ] && PID=""
# ExecStart may be pnpm/npm/a shell script, so walk the process tree and find the real node.
descendants() {
  local q="$1" kids k
  echo "${q}"
  kids="$(awk -v pp="${q}" '{ sub(/^.*\) /, ""); if ($2 == pp) print FILENAME }' /proc/[0-9]*/stat 2>/dev/null | sed 's#/proc/\([0-9]*\)/stat#\1#')"
  for k in ${kids}; do descendants "${k}"; done
}
is_node() { case "$(basename "$1")" in node|node[0-9]*|nodejs) "$1" -v 2>/dev/null | grep -q '^v[0-9]' ;; *) return 1 ;; esac; }
NODE_BIN=""; NODE_PID=""
if [ -n "${PID}" ]; then
  for p in $(descendants "${PID}"); do
    b="$(readlink -f "/proc/${p}/exe" 2>/dev/null || true)"
    if [ -n "${b}" ] && is_node "${b}"; then NODE_BIN="${b}"; NODE_PID="${p}"; fi
  done
fi
if [ -z "${NODE_BIN}" ]; then
  for c in $(show ExecStart | grep -o 'path=[^ ;]*' | cut -d= -f2) $(command -v node 2>/dev/null) /usr/local/bin/node /usr/bin/node /root/node22*/bin/node /opt/node*/bin/node; do
    [ -x "${c}" ] && is_node "${c}" && { NODE_BIN="$(readlink -f "${c}")"; break; }
  done
fi
[ -n "${NODE_BIN}" ] || die "Could not find the node binary. Send me the output of: systemctl cat ${SERVICE}"
NODE_VER="$("${NODE_BIN}" -v)"
ok "Node ${NODE_VER} (${NODE_BIN})"
IFS=. read -r MAJ MIN _ <<<"${NODE_VER#v}"
if [ "${MAJ}" -lt 22 ] || { [ "${MAJ}" = 22 ] && [ "${MIN}" -lt 15 ]; }; then
  die "Node 22.15+ is required (found ${NODE_VER}). The patches use module.registerHooks."
fi
SVC_USER="$(show User)"; SVC_USER="${SVC_USER:-root}"
ok "Service user: ${SVC_USER}"

# 지금 NODE_OPTIONS: 실행 중인 프로세스의 실제 값이 가장 정확합니다.
CUR_OPTS=""
for p in "${NODE_PID}" "${PID}"; do
  [ -n "${p}" ] && [ -r "/proc/${p}/environ" ] || continue
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
ok "Current NODE_OPTIONS: ${BASE_OPTS:-(none)}"
# EnvironmentFile에 NODE_OPTIONS가 있으면 그쪽이 Environment보다 우선이라 설정 조각이 안 먹습니다.
ENV_FILES="$(systemctl cat "${SERVICE}" 2>/dev/null | sed -n 's/^EnvironmentFile=-\{0,1\}//p')"
for f in ${ENV_FILES}; do
  if [ -f "${f}" ] && grep -q '^ *NODE_OPTIONS=' "${f}"; then
    die "NODE_OPTIONS is set in ${f}, so auto install stopped. Send me the output of: systemctl cat ${SERVICE}"
  fi
done
# A patch that is already wired in (e.g. webp installed by hand) is kept as is, not added twice.
ADD=()
for r in "${REQUIRES[@]}"; do
  have=""
  for tok in ${BASE_OPTS}; do case "${tok}" in *"/${r##*/}") have="${tok#--require=}" ;; esac; done
  if [ -n "${have}" ]; then ok "${r##*/} already installed (${have}), keeping it"; else ADD+=("${r}"); fi
done
[ "${#ADD[@]}" -gt 0 ] || die "All patches are already installed. Nothing to do."

# ── 2. 백업 ────────────────────────────────────────────────────────
say "2/5 Backing up current service config"
STAMP="$(date +%Y%m%d-%H%M%S)"
BK="${DIR}/backup-${STAMP}"
mkdir -p "${BK}"
systemctl cat "${SERVICE}" >"${BK}/service-full.txt" 2>&1 || true
[ -d "${DROPIN_DIR}" ] && cp -a "${DROPIN_DIR}" "${BK}/dropins" || true
printf '%s\n' "${CUR_OPTS}" >"${BK}/NODE_OPTIONS.txt"
ok "${BK}"

# ── 3. 파일 받기 ───────────────────────────────────────────────────
say "3/5 Downloading patch files"
TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT
fetch() { curl -fsSL --retry 3 "$1" -o "${TMP}/$2" || die "Download failed: $1"; [ -s "${TMP}/$2" ] || die "Empty file: $1"; }
fetch "${MOD_URL}" gf-mod-runtime.cjs
fetch "${CUST_BASE}/gf-customizer-runtime.cjs" gf-customizer-runtime.cjs
fetch "${CUST_BASE}/gf-customizer-edits.json" gf-customizer-edits.json
fetch "${WEBP_BASE}/webp-upload-runtime.cjs" webp-upload-runtime.cjs
fetch "${WEBP_BASE}/global-gallery-png-to-webp.mjs" global-gallery-png-to-webp.mjs
curl -fsSL --retry 3 "${SELF_URL}" -o "${TMP}/install-server.sh" 2>/dev/null || cp "$0" "${TMP}/install-server.sh" 2>/dev/null || true
for f in gf-mod-runtime.cjs gf-customizer-runtime.cjs webp-upload-runtime.cjs; do
  "${NODE_BIN}" --check "${TMP}/${f}" || die "${f} failed syntax check"
done
"${NODE_BIN}" -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))' "${TMP}/gf-customizer-edits.json" || die "Customizer JSON is broken."
install -d -m 755 "${DIR}" "${DIR}/data"
install -m 644 "${TMP}"/*.cjs "${TMP}"/*.json "${TMP}"/*.mjs "${DIR}/"
[ -s "${TMP}/install-server.sh" ] && install -m 755 "${TMP}/install-server.sh" "${DIR}/install-server.sh"
chown "${SVC_USER}" "${DIR}/data" 2>/dev/null || true
ok "${DIR}"

# ── 4. 설정 조각 쓰기 ──────────────────────────────────────────────
say "4/5 Wiring patches into the service (keeping existing NODE_OPTIONS)"
NEW_OPTS="${BASE_OPTS}"
for r in "${ADD[@]}"; do NEW_OPTS="${NEW_OPTS:+${NEW_OPTS} }--require=${r}"; done
CUST_ENV=""
case " ${ADD[*]} " in *gf-customizer-runtime.cjs*) CUST_ENV="Environment=\"GF_CUSTOMIZER_EDITS_PATH=${DIR}/gf-customizer-edits.json\"
Environment=\"GF_CUSTOMIZER_CONFIG_FILE=${DIR}/data/gacha-customizer-settings.json\"
Environment=\"GF_CUSTOMIZER_ENABLE_EXCHANGE=1\"" ;; esac
OLD_DROPIN=""
[ -f "${DROPIN}" ] && OLD_DROPIN="$(cat "${DROPIN}")"
mkdir -p "${DROPIN_DIR}"
cat >"${DROPIN}" <<EOF
# gacha-forge-mod install-server.sh ${STAMP}. 지우면 패치가 빠집니다: bash ${DIR}/install-server.sh --uninstall
[Service]
Environment="NODE_OPTIONS=${NEW_OPTS}"
${CUST_ENV}
Environment="GF_MOD_RANK_REFILL=1"
Environment="GF_MOD_AETHER=1"
EOF
ok "${DROPIN}"
echo "  NODE_OPTIONS=${NEW_OPTS}"

# ── 5. 다시 시작 ───────────────────────────────────────────────────
say "5/5 Restarting the service"
rollback() {
  warn "Service did not come up. Restoring the previous config."
  if [ -n "${OLD_DROPIN}" ]; then printf '%s\n' "${OLD_DROPIN}" >"${DROPIN}"; else rm -f "${DROPIN}"; fi
  systemctl daemon-reload
  systemctl restart "${SERVICE}" || true
  sleep 5
  journalctl -u "${SERVICE}" -n 30 --no-pager || true
  die "Install rolled back. Screenshot the log above and send it."
}
systemctl daemon-reload
systemctl restart "${SERVICE}" || rollback
for _ in $(seq 1 20); do sleep 2; systemctl is-active --quiet "${SERVICE}" && break; done
sleep 6
systemctl is-active --quiet "${SERVICE}" || rollback
ok "Service is running"
check
echo
echo "Next: open Gacha Forge in the browser, then run --check below."
echo "      Check:      bash ${DIR}/install-server.sh --check"
echo "      Uninstall:  bash ${DIR}/install-server.sh --uninstall"
