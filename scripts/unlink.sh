CYAN='\033[0;36m'
NC='\033[0m'

# Go to the inital start location
SCRIPT="$(readlink -f "$0")"
SCRIPT_DIR="$(dirname "$SCRIPT")"
cd $SCRIPT_DIR
cd ..
ROOT=$SCRIPT_DIR/..

printf "${CYAN}Removing global @horsepower packages${NC}\n"
npm rm -g @horsepower/auth &
npm rm -g @horsepower/mysql &
npm rm -g @horsepower/middleware &
npm rm -g @horsepower/router &
npm rm -g @horsepower/server &
npm rm -g @horsepower/session &
npm rm -g @horsepower/storage &
npm rm -g @horsepower/template &
wait