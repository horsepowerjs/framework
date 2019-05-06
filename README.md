# Contributing

To contribute code to the red5 framework take the following steps:

1. Clone the repository
2. Install the dependencies
3. Run the linkage tool
4. Build the packages
5. Testing
   * PM2
   * Manual

## Setting up the environment

The following steps will get you on the right path to make changes and contribute to the framework. There are a few optional steps that will be marked as so.

### Clone the repository

Clone the repository to a folder of your choosing. If you plan on contributing to multiple red5 repositories, it is recommended to place them in a `red5` or such directory.

```bash
# Optional commands
mkdir red5
cd red5

# Required commands
git clone git@github.com:red5-server/framework.git
```

### Install the dependencies

Some npm dependencies are needed for building the framework, so here is where we will install them.

```bash
cd framework
npm install
```

### Run the linkage tool

Not all dependencies rely on one another, but during development we will just link everything together by running the linker.

```bash
./link.sh
```

### Build the packages

The packages can be built one of two ways:

* A single build 
* A watching build

A single build will build all of the packages once and then exit, whereas a watching build will build all of the packages and watch for changes then rebuild individual packages only when they have changed.

```bash
# Runs a single build
gulp build

# Runs a build and watches for changes to individual packages
gulp build:watch
```

### Testing (Optional)

The simplest way to test is to install the `@red5/cli` tool, this will download and install the red5 packages from [Github](https://github.com/red5-server/red5)

```bash
# Install the cli
npm i -g @red5/cli

# CD into the parent directory of a test project
cd ~/Documents/www

# Run the new command from red5
# where "<website-name>" is the name of the new directory
red5 new <website-name>
cd <website-name>

# Create links to the framework
# We don't want to use the production versions here
# These should have already been created when `./link.sh` was executed
npm link @red5/router
npm link @red5/session
npm link @red5/storage
npm link @red5/middleware
npm link @red5/server
npm link @red5/template
npm link @red5/mysql
```

You may want to edit the `.env` file and if so do that now because it needs to be done before the server is started. Any changes to that file will require the server to be manually restarted.

Once ready, you can run the server however you would like.

#### PM2

PM2 is a process manager that allows you to manage one or more processes. This will help us by allowing us to automatically restart the server in the background when the project files change. This way we don't need to manually do it ourselves every time we save/create/delete etc.

The red5 install comes with a [PM2](https://www.npmjs.com/package/pm2) configuration file that is setup to watch directories. 


We may want to add an additional watch path in the PM2 configuration file for development purposes to also watch for changes to the framework within the `node_modules` directory:

```js
module.exports = {
  apps: [
    {
      watch: [
        // Previously listed paths
        path.join(__dirname, 'node_modules/@red5/*/lib/**/*.js')
      ]
    }
  ]
}
```

We can now install (if needed) and/or start the server via PM2.

```bash
# Optional: If you don't have pm2 installed
npm i -g pm2

# Start the pm2 server
pm2 start ./ecosystem.config.js
# Open the log file to view the errors and output
pm2 log
```

#### Manual

Manual testing is fairly straight forward. You will just need to execute the file in the classic nodejs manner. Whenever you change a file you will need to manually restart the node server unlike a process manager.

```bash
cd <website-name>
node ./index.js
```
