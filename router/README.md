# Installation

    npm i -s @horsepower/router

# Usage

## Initiating

To start creating routes, the `Router` class needs to be included. This can be done like this:

```js
const { Router } = require('@horsepower/router');
```

By default the controllers root will attempt to find the controllers folder as a sibling of `require.main.filename`. So, for example if the file is `node /root/app/index.js` the router will attempt to load controllers from `/root/app/controllers`. To change this location, call `Router.setControllersRoot()` like this:

```js
Router.setControllersRoot('/path/to/controllers')
```

## Creating routes

Once the `Router` class has been included and setup, routes can be created.

The controller to run can be a string separated by an `@` where the **first part** is the `path`, and the **second part** is the `function` name. When a second part is not included, `main` is the `function` name.

If a path is not set, then it is assumed to be `/`.

```js
Router.get('home') // Same as: 'home@main'
Router.post('/login', 'home@login')
```

Controllers can also be functions instead of strings, however, strings are recommended for ease of use and non-cluttered route files.

```js
// Not recommended but works.
// This will clutter up your routes file with lots of requires.
const Settings = require('./controllers/settings')
Router.get('/user/settings', Settings)

// This works better and doesn't clutter up the files with requires.
// However, this just makes the routes files massive if there are many lines.
// Keep the function small otherwise a string controller is recommended.
Router.get('/user/profile', (client) => {
  return client.response.html('<h1>Profile Page</h1>')
})
```

## Route Parameters

Routes can have parameters which are names prefixed with a semicolon. These parameters are placeholders for actual route values. For the below route will trigger when a value is passed to `:username`.

```js
Router.get('/profile/:username', 'user@profile')
```

In the controller the value of `username` can then be accessed like this:

```js
module.exports.profile = function(client) {
  console.log(client.params.username)
}
```

Example urls will look something like this:

* `http://example.com/profile/horsepower`
* `http://example.com/profile/horsepower-router`
* `http://example.com/profile/billy-bob`

## Route RegExp

Routes can also use Regular Expressions to match a multitude of routes, for example, matching on any route that starts with `/media` can be handled like this:

```js
// Note the trailing slash. Without it "/media-files/" would be caught and we might not want it to be.
Router.get(/^\/media\//, 'media@load')
```

Maybe we want to handle a particular file extension a certain way. This can be done like this:

```js
Router.get(/\.html$/, 'handleFile@html')
```

**Note:** RegExp paths ignore group path prefixes. See below example:

```js
Router.group('/api', () => {
  Router.get(/\/media\//, 'media')
})
```

You might assume that this creates the RegExp `/\/api\/media\//` however, it does not. It is still `/\/media\//` and will match anything containing `/media/` because it ignores the `/api` prefix, so the following paths will be caught by this route:

* `/api/media`
* `/web/media`
* `/media`
* `/media/abc`
* `/123/media/abc`

## Route Naming

Routes can be named for easy access with the helper functions. These helper functions can find routes based on the name, so if the path changes and not the name, the routes will then change throughout the app automatically. Duplicate names will throw an error and the app won't run.

```js
Router.get('/', 'home').name('home')
```

Now that the route has been named, the app route just needs to be searched for. This will return a route, which will have the alias, path, etc..

```js
let route = Router.findByName('home')
console.log(route.path)
```

## Middleware

Middleware is useful for running required steps before the controller executes. This could be something as simple as an **Under Construction** redirect, or **Ajax Validation** check. If the middleware passes move to the next middleware until the controller is reached. If it fails, return an error message.

Middleware can be applied to routes like so:

```js
Router.get('/api/ping', { middleware: [ RequireAjax ] }, 'api@ping')
```

## Groups

Groups are useful for creating groups of routes so you don't have to type the same path prefix over and over. They are also good for applying middleware to multiple routes at once, again, so you don't have to define middleware over and over.

```js
Router.group('/user', () => {
  Router.get('user')
  Router.get('/settings', 'user@settings')
  Router.get('/history', 'user@history')
})
```

Using the above group, we will be creating three routes:

* `/user` which points to `user@main`
* `/user/settings` which points to `user@settings`
* `/user/history` which points to `user@history`

Just like the routes themselves, middleware can also be applied to the group:

```js
Router.group('/api', { middleware: [ RequireAjax ] }, () => {
  Router.get('/ping', 'api@ping')
  Router.get('/pong', 'api@pong')
})
```

Using the above group, we will get two routes each with the middleware that was created on the group.

* `/api/ping` which points to `api@ping`
* `/api/pong` which points to `api@pong`

Groups can also be nested within each other:

```js
// Anything within this group requires the call to be made using ajax
Router.group('/api', { middleware: [ RequireAjax ] }, () => {
  // Anything in this group doesn't require anything extra.
  // All that is needed is for the outer group to pass.
  Router.group('/', () => {
    Router.post('/login', 'api@login')
    Router.post('/logout', 'api@logout')
  })

  // Anything in this group requires that the request have authorization.
  // It also requires that the outer group passed as well.
  Router.group('/auth', { middleware: [ RequireAuth ] }, () => {
    Router.get('/stats', 'api/auth@stats')
    Router.post('/update', 'api/auth@update')
  })
})
```

The above code will generate four routes:

* `/api/login`
  * Points to `api@login`
  * Requires Ajax
* `/api/logout`
  * Points to `api@logout`
  * Requires Ajax
* `/api/auth/stats`
  * Points to `api/auth@stats`
  * Requires Ajax
  * Requires Auth
* `/api/auth/update`
  * Points to `api/auth@update`
  * Requires Ajax
  * Requires Auth