const path = require('path')
const gulp = require('gulp')
const ts = require('gulp-typescript')
const sourcemaps = require('gulp-sourcemaps')
const rimraf = require('rimraf')

const projects = {
  red5: './core',
  router: './router',
  server: './server',
  storage: './storage',
  session: './session',
  template: './template',
  middleware: './middleware',
  // Optional dependencies
  mysql: './mysql'
}

const tasks = [
  'router', 'middleware', 'template', 'storage', 'session', 'server',
  // Optional dependencies
  'mysql'
]

/**
 * Builds the project
 * @param {string} projectRoot
 * @returns {Promise<boolean>}
 */
function makeProject(projectRoot) {
  return new Promise(resolve => {
    let tsProject = ts.createProject(path.join(projectRoot, 'tsconfig.json'))
    let tsResult = tsProject.src()
      .pipe(sourcemaps.init())
      .pipe(tsProject())
    tsResult.js
      .pipe(sourcemaps.write())
      .pipe(gulp.dest(path.join(projectRoot, 'lib')).on('end', () => {
        tsResult.dts.pipe(gulp.dest(path.join(projectRoot, 'types'))).on('end', () => resolve(true))
        // gulp.src(path.join(projectRoot,'src/**/*.ts')).pipe(sourcemaps.init())
      }))
  })
}

/**
 * @param {string} projectRoot
 * @returns {Promise<boolean>}
 */
function deleteTypes(projectRoot) {
  return new Promise(resolve => {
    try {
      rimraf.sync(path.join(projectRoot, 'types'))
      resolve(true)
    } catch (e) {
      resolve(false)
    }
  })
}

// gulp.task('red5', () => makeProject(projects.red5))
gulp.task('router', () => deleteTypes(projects.router) && makeProject(projects.router))
gulp.task('server', () => deleteTypes(projects.server) && makeProject(projects.server))
gulp.task('storage', () => deleteTypes(projects.storage) && makeProject(projects.storage))
gulp.task('session', () => deleteTypes(projects.session) && makeProject(projects.session))
gulp.task('template', () => deleteTypes(projects.template) && makeProject(projects.template))
gulp.task('middleware', () => deleteTypes(projects.middleware) && makeProject(projects.middleware))
// Optional dependencies
gulp.task('mysql', () => deleteTypes(projects.mysql) && makeProject(projects.mysql))

gulp.task('build:watch', gulp.series([...tasks, () => {
  gulp.watch('./router/src/**', gulp.series('router'))
  gulp.watch('./server/src/**', gulp.series('server'))
  gulp.watch('./storage/src/**', gulp.series('storage'))
  gulp.watch('./session/src/**', gulp.series('session'))
  gulp.watch('./template/src/**', gulp.series('template'))
  gulp.watch('./middleware/src/**', gulp.series('middleware'))
  // Optional dependencies
  gulp.watch('./mysql/src/**', gulp.series('mysql'))
}]))

gulp.task('build', gulp.series(...tasks))