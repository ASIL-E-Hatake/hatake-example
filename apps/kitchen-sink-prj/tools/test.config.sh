# 機能網羅のテストで、案件ごとに違うところ。道具そのものは ../../tools/run-tests.sh。
SCENARIO_PAGES="combo_form"
DB_NAME=""                       # DB を持たない（モック API）
# 戻し方も案件の担当。この案件は API に口が在る。
RESET_CMD="curl -s -o /dev/null -X POST http://localhost:3003/api/reset"
API_BASE="http://localhost:3003/api"
SCREEN_NETWORK="kitchen-sink-prj_default"
SCREEN_BASE="http://web:80"
