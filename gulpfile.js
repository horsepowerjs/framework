const path = require('path')
const fs = require('fs')
const gulp = require('gulp')
const ts = require('gulp-typescript')
const sourcemaps = require('gulp-sourcemaps')

const projects = {
  red5: './core',
  router: './router',
  server: './server',
  storage: './storage',
  session: './session',
  template: './template'
}

function makeProject(projectRoot) {
  var tsProject = ts.createProject(path.join(projectRoot, 'tsconfig.json'))
  let tsResult = tsProject.src()
    .pipe(sourcemaps.init())
    .pipe(tsProject())
  return tsResult.js
    .pipe(sourcemaps.write())
    .pipe(gulp.dest(path.join(projectRoot, 'lib')).on('end', () => {
      tsResult.dts.pipe(gulp.dest(path.join(projectRoot, 'types')))
      // gulp.src(path.join(projectRoot,'src/**/*.ts')).pipe(sourcemaps.init())
    }))
}

gulp.task('red5', () => makeProject(projects.red5))
gulp.task('red5-router', () => makeProject(projects.router))
gulp.task('red5-server', () => makeProject(projects.server))
gulp.task('red5-storage', () => makeProject(projects.storage))
gulp.task('red5-session', () => makeProject(projects.session))
gulp.task('red5-template', () => makeProject(projects.template))

gulp.task('build', gulp.series(['red5-router', 'red5-template', 'red5-storage', 'red5-session', 'red5-server', 'red5', () => {
  gulp.watch('./red5-router/src/**', gulp.series('red5-router'))
  gulp.watch('./red5-server/src/**', gulp.series('red5-server'))
  gulp.watch('./red5-storage/src/**', gulp.series('red5-storage'))
  gulp.watch('./red5-session/src/**', gulp.series('red5-session'))
  gulp.watch('./red5-template/src/**', gulp.series('red5-template'))
  gulp.watch('./red5/src/**', gulp.series('red5'))
}]))