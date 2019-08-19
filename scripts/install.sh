CYAN='\033[0;36m'
NC='\033[0m'

# Go to the inital start location
SCRIPT="$(readlink -f "$0")"
SCRIPT_DIR="$(dirname "$SCRIPT")"
cd $SCRIPT_DIR
cd ..
ROOT=$SCRIPT_DIR/..

printf "cd ${SCRIPT_DIR}\n"

printf "${CYAN}Installing @horsepower packages${NC}\n"

printf "${CYAN}MySQL${NC}\n"
cd $ROOT/mysql && npm install

printf "${CYAN}Router${NC}\n"
cd $ROOT/router && npm install

printf "${CYAN}Server${NC}\n"
cd $ROOT/server && npm install

printf "${CYAN}Storage${NC}\n"
cd $ROOT/storage && npm install

printf "${CYAN}Template${NC}\n"
cd $ROOT/template && npm install

printf "${CYAN}Auth${NC}\n"
cd $ROOT/plugins/auth && npm install

printf "${CYAN}Session${NC}\n"
cd $ROOT/plugins/session && npm install

printf "${CYAN}Sockets${NC}\n"
cd $ROOT/plugins/sockets && npm install