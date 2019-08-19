CYAN='\033[0;36m'
NC='\033[0m'

# Go to the inital start location
SCRIPT="$(readlink -f "$0")"
SCRIPT_DIR="$(dirname "$SCRIPT")"
cd $SCRIPT_DIR
cd ..
ROOT=$SCRIPT_DIR/..

printf "cd ${SCRIPT_DIR}\n"

printf "${CYAN}Updating @horsepower packages${NC}\n"

printf "${CYAN}MySQL${NC}\n"
cd $ROOT/mysql && npm update && npm audit fix

printf "${CYAN}Router${NC}\n"
cd $ROOT/router && npm update && npm audit fix

printf "${CYAN}Server${NC}\n"
cd $ROOT/server && npm update && npm audit fix

printf "${CYAN}Storage${NC}\n"
cd $ROOT/storage && npm update && npm audit fix

printf "${CYAN}Template${NC}\n"
cd $ROOT/template && npm update && npm audit fix

printf "${CYAN}Auth${NC}\n"
cd $ROOT/plugins/auth && npm update && npm audit fix

printf "${CYAN}Session${NC}\n"
cd $ROOT/plugins/session && npm update && npm audit fix

printf "${CYAN}Sockets${NC}\n"
cd $ROOT/plugins/sockets && npm update && npm audit fix