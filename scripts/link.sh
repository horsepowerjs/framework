# printf "This script is no longer used, the TypeScript files resolve their dependencies themselves in the tsconfig.json file"
# exit

: '
WARNING: This is for development usage only.
Execute this file to generate global development links.
This file will attempt the following:
  - Remove any current global links
  - Remove all node_modules/@horsepower in the source of each module
  - Generate new global links
  - Link all the modules to their dependencies
'

# npm link @horsepower/server @horsepower/router @horsepower/session @horsepower/storage @horsepower/template @horsepower/mysql @horsepower/auth @horsepower/sockets

CYAN='\033[0;36m'
NC='\033[0m'

# Go to the initial start location
SCRIPT="$(readlink -f "$0")"
SCRIPT_DIR="$(dirname "$SCRIPT")"
cd $SCRIPT_DIR
cd ..
ROOT=$SCRIPT_DIR/..

printf "${CYAN}Removing global @horsepower packages${NC}\n"
# npm rm -grf @horsepower/middleware &
npm rm -g @horsepower/router &
npm rm -g @horsepower/server &
npm rm -g @horsepower/session &
npm rm -g @horsepower/storage &
npm rm -g @horsepower/template &
npm rm -g @horsepower/mysql &
npm rm -g @horsepower/auth &
npm rm -g @horsepower/sockets &
wait

printf "${CYAN}Removing node_modules/@horsepower from modules${NC}\n"
# rm -rf ./middleware/node_modules/@horsepower &
rm -rf ./mysql/node_modules/@horsepower &
rm -rf ./router/node_modules/@horsepower &
rm -rf ./server/node_modules/@horsepower &
rm -rf ./storage/node_modules/@horsepower &
rm -rf ./template/node_modules/@horsepower &
rm -rf ./plugins/session/node_modules/@horsepower &
rm -rf ./plugins/auth/node_modules/@horsepower &
rm -rf ./plugins/sockets/node_modules/@horsepower &
wait

# Generate the links
printf "${CYAN}Generating npm links${NC}\n"
npm link ./router
npm link ./server
npm link ./storage
npm link ./template
# npm link ./middleware
npm link ./mysql
npm link ./plugins/session
npm link ./plugins/auth
npm link ./plugins/sockets

# Link the server to the dependencies
# These dependencies should be the same dependencies
# that are found in the modules "package.json"
printf "${CYAN}Linking the dependencies${NC}\n"
cd $ROOT/server
npm link @horsepower/router
npm link @horsepower/session
npm link @horsepower/storage
# npm link @horsepower/middleware
npm link @horsepower/server
# These modules are optional but may be needed for development.
# They are not required in the "package.json".
# The user should manually add them if they need these modules in production.
# However, we need them for development purposes.
npm link @horsepower/template
npm link @horsepower/mysql
npm link @horsepower/auth
npm link @horsepower/sockets

cd $ROOT/mysql
npm link @horsepower/server

cd $ROOT/router
# npm link @horsepower/middleware
npm link @horsepower/server

cd $ROOT/template
npm link @horsepower/storage

cd $ROOT/plugins/session
npm link @horsepower/server
npm link @horsepower/storage

cd $ROOT/plugins/auth
npm link @horsepower/mysql
npm link @horsepower/router
npm link @horsepower/server
npm link @horsepower/session

cd $ROOT/plugins/sockets
npm link @horsepower/server

# printf "${CYAN}Building packages${NC}\n"
# cd ..
# gulp build