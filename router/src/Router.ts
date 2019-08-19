import { UrlWithStringQuery } from 'url'
import * as path from 'path'
import { Route } from './Route'
import { Middleware, Client, log } from '@horsepower/server'

export type RequestMethod = 'get' | 'head' | 'post' | 'put' | 'patch' | 'delete' | 'options' | 'any' | 'event'

// declare interface Client { }

// declare interface Middleware {
//   handle?(client: Client): any
//   postHandle?(client: Client): any
// }

function isNewable(classRef) {
  try {
    new classRef()
  } catch (e) {
    return false
  }
  return true
}

export interface RouterOptions {
  middleware?: ((new () => Middleware) | Middleware | string)[]
  name?: string
}

export type RouteFunction = (client: Client) => void
export type RouteClass = new () => void
export type RouteCallback = string | RouteFunction | RouteClass | Promise<RouteFunction | RouteClass | string | void>

declare type RouteInfo = Promise<{
  route: Route | undefined
  callback: Function | undefined
} | null>

export interface Domain {
  domain: string | RegExp
  routes: Route[]
}

export class Router {

  // private static readonly _routes: Route[] = []
  private static readonly groupPath: string[] = []
  private static readonly groupOptions: RouterOptions[] = []
  private static currentDomain: string | RegExp = 'default'
  private static readonly _domains: Domain[] = []
  private static controllerRoots: string[] = [
    path.join((path.dirname(require.main && require.main.filename || __filename)), 'app/controllers')
  ]
  private static middlewareRoots: string[] = []

  public static routes(domainName: string = 'default') {
    let domain = this.findDomain(domainName)
    if (domain) return domain.routes
    return []
  }

  public static get domains() { return this._domains }

  public static addControllerRoot(root: string) {
    this.controllerRoots.push(root)
  }

  public static addMiddlewareRoot(root: string) {
    this.middlewareRoots.push(root)
  }

  public static async route(route: UrlWithStringQuery, method: RequestMethod): RouteInfo {
    // Try to find the route
    let theRoute = this._find(route, method || 'get')

    if (theRoute) {
      // client.setRoute(theRoute)

      // Validate the constraints
      if (Object.keys(theRoute.constraints).length > 0) {
        let params = theRoute.params
        for (let i in theRoute.constraints) {
          if (!theRoute.constraints[i].test(params[i])) {
            return null
          }
        }
      }
    }
    let callback

    // If the callback is a string load the module from the controllers
    // Then get the function in the file
    // try {
    if (theRoute && typeof theRoute.callback == 'string') {
      let [controller, method] = theRoute.callback.split('@')
      if (!method) method = 'main'
      if (controller && method && controller.length > 0 && method.length > 0) {
        for (let root of this.controllerRoots) {
          try {
            let module = await import(path.join(root, controller))
            if (module && module.default && isNewable(module.default)) {
              callback = new module.default()[method]
              break
            } else if (module && isNewable(module)) {
              callback = new module()[method]
              break
            } else {
              callback = module[method]
              break
            }
          } catch (e) {
            log.error(e)
            throw e
          }
        }
      }
    } else if (theRoute && typeof theRoute.callback == 'function') {
      callback = theRoute.callback
    }
    // } catch (e) {
    //   throw e
    // }
    // If a valid route was found run the callback, otherwise send a 404
    return { route: theRoute, callback: callback || null }
    // return callback ? await callback(client) : null
  }

  /**
   * Creates a group of routes that all share the same path prefix
   *
   * @static
   * @param {string} routePrefix The url prefix
   * @param {Function} callback The callback containing routes
   * @memberof Router
   */
  public static group(routePrefix: string, callback: Function): void

  /**
   * Creates a group of routes that all share the same path prefix and options
   *
   * @static
   * @param {string} routePrefix The url prefix
   * @param {RouterOptions} options The options to apply to the child routes
   * @param {Function} callback The callback containing routes
   * @memberof Router
   */
  public static group(routePrefix: string, options: RouterOptions, callback: Function): void
  public static group(...args: any[]): void {
    let path = args[0] as string
    let callback = args.length == 3 ? args[2] : args[1]
    this.groupOptions.push(args.length == 3 ? args[1] : {})
    this.groupPath.push(path)
    callback()
    this.groupPath.pop()
    this.groupOptions.pop()
  }

  /**
   * Assigns the routes to a specific domain
   * **Note:** this method should not be nested within other items
   *
   * @static
   * @param {Exclude<string, 'default'>} domain The domain to assign the routes to
   * @param {Function} callback The callback to add the routes to
   * @memberof Router
   */
  public static domain(domain: string | RegExp, callback: Function): void {
    if (typeof domain == 'string') domain = domain.toLowerCase()
    if (domain == 'default') throw new Error('Domain "default" is a reserved word.')
    this.currentDomain = domain
    callback()
    this.currentDomain = 'default'
  }

  /**
   * For `GET` http requests that go to "/" or the prefix root if in a group
   *
   * **REST:** Read - Reads from a resource without modification
   *
   * @static
   * @param {RouteCallback} controller The controller to use
   * @returns {Route}
   * @memberof Router
   */
  public static get(controller: RouteCallback): Route

  /**
   * For `GET` http requests without options
   *
   * **REST:** Read - Reads from a resource without modification
   *
   * @static
   * @param {(string | RegExp)} routePath
   * @param {RouteCallback} controller The controller to use
   * @returns {Route}
   * @memberof Router
   */
  public static get(routePath: string | RegExp, controller: RouteCallback): Route

  /**
   * For `GET` http requests with options
   *
   * **REST:** Read - Reads from a resource without modification
   *
   * @static
   * @param {(string | RegExp)} routePath The route path to watch
   * @param {RouterOptions} options The options for the route
   * @param {RouteCallback} controller The controller to use
   * @returns {Route}
   * @memberof Router
   */
  public static get(routePath: string | RegExp, options: RouterOptions, controller: RouteCallback): Route
  public static get(...args: any[]): Route {
    return this.createRoute('get', ...args)
  }

  /**
    * For `POST` http requests that go to "/" or the prefix root if in a group
    *
    * **REST:** Create - Creates a brand new resource
    *
    * @static
    * @param {RouteCallback} controller The controller to use
    * @returns {Route}
    * @memberof Router
    */
  public static post(controller: RouteCallback): Route

  /**
   * For `POST` http requests without options
   *
   * **REST:** Create - Creates a brand new resource
   *
   * @static
   * @param {(string | RegExp)} routePath The route path to watch
   * @param {RouteCallback} controller The controller to use
   * @returns {Route}
   * @memberof Router
   */
  public static post(routePath: string | RegExp, controller: RouteCallback): Route

  /**
   * For `POST` http requests with options
   *
   * **REST:** Create - Creates a brand new resource
   *
   * @static
   * @param {(string | RegExp)} routePath The route path to watch
   * @param {RouterOptions} options The options for the route
   * @param {RouteCallback} controller The controller to use
   * @returns {Route}
   * @memberof Router
   */
  public static post(routePath: string | RegExp, options: RouterOptions, controller: RouteCallback): Route
  public static post(...args: any[]): Route {
    return this.createRoute('post', ...args)
  }

  /**
    * For `PUT` http requests that go to "/" or the prefix root if in a group
    *
    * **REST:** Update/Replace - Full modification of a resource
    *
    * @static
    * @param {RouteCallback} controller The controller to use
    * @returns {Route}
    * @memberof Router
    */
  public static put(controller: RouteCallback): Route

  /**
   * For `PUT` http requests without options
   *
   * **REST:** Update/Replace - Full modification of a resource
   *
   * @static
   * @param {(string | RegExp)} routePath The route path to watch
   * @param {RouteCallback} controller The controller to use
   * @returns {Route}
   * @memberof Router
   */
  public static put(routePath: string | RegExp, controller: RouteCallback): Route

  /**
   * For `PUT` http requests with options
   *
   * **REST:** Update/Replace - Full modification of a resource
   *
   * @static
   * @param {(string | RegExp)} routePath The route path to watch
   * @param {RouterOptions} options The options for the route
   * @param {RouteCallback} controller The controller to use
   * @returns {Route}
   * @memberof Router
   */
  public static put(routePath: string | RegExp, options: RouterOptions, controller: RouteCallback): Route
  public static put(...args: any[]): Route {
    return this.createRoute('put', ...args)
  }

  /**
    * For `DELETE` http requests that go to "/" or the prefix root if in a group
    *
    * **REST:** Delete - Deletes all related resources
    *
    * @static
    * @param {RouteCallback} controller The controller to use
    * @returns {Route}
    * @memberof Router
    */
  public static delete(controller: RouteCallback): Route

  /**
   * For `DELETE` http requests without options
   *
   * **REST:** Delete - Deletes all related resources
   *
   * @static
   * @param {(string | RegExp)} routePath The route path to watch
   * @param {RouteCallback} controller The controller to use
   * @returns {Route}
   * @memberof Router
   */
  public static delete(routePath: string | RegExp, controller: RouteCallback): Route

  /**
   * For `DELETE` http requests with options
   *
   * **REST:** Delete - Deletes all related resources
   *
   * @static
   * @param {(string | RegExp)} routePath The route path to watch
   * @param {RouterOptions} options The options for the route
   * @param {RouteCallback} controller The controller to use
   * @returns {Route}
   * @memberof Router
   */
  public static delete(routePath: string | RegExp, options: RouterOptions, controller: RouteCallback): Route
  public static delete(...args: any[]): Route {
    return this.createRoute('delete', ...args)
  }

  /**
    * For `PATCH` http requests that go to "/" or the prefix root if in a group
    *
    * **REST:** Update/Modify - Partial modification to a resource
    *
    * @static
    * @param {RouteCallback} controller The controller to use
    * @returns {Route}
    * @memberof Router
    */
  public static patch(controller: RouteCallback): Route

  /**
   * For `PATCH` http requests without options
   *
   * **REST:** Update/Modify - Partial modification to a resource
   *
   * @static
   * @param {(string | RegExp)} routePath The route path to watch
   * @param {RouteCallback} controller The controller to use
   * @returns {Route}
   * @memberof Router
   */
  public static patch(routePath: string | RegExp, controller: RouteCallback): Route

  /**
   * For `PATCH` http requests with options
   *
   * **REST:** Update/Modify - Partial modification to a resource
   *
   * @static
   * @param {(string | RegExp)} routePath The route path to watch
   * @param {RouterOptions} options The options for the route
   * @param {RouteCallback} controller The controller to use
   * @returns {Route}
   * @memberof Router
   */
  public static patch(routePath: string | RegExp, options: RouterOptions, controller: RouteCallback): Route
  public static patch(...args: any[]): Route {
    return this.createRoute('patch', ...args)
  }

  /**
    * For `HEAD` http requests that go to "/" or the prefix root if in a group
    *
    * **REST:** Response Headers - Identical to `get` but without a body
    *
    * @static
    * @param {RouteCallback} controller The controller to use
    * @returns {Route}
    * @memberof Router
    */
  public static head(controller: RouteCallback): Route

  /**
   * For `HEAD` http requests without options
   *
   * **REST:** Response Headers - Identical to `get` but without a body
   *
   * @static
   * @param {(string | RegExp)} routePath The route path to watch
   * @param {RouteCallback} controller The controller to use
   * @returns {Route}
   * @memberof Router
   */
  public static head(routePath: string | RegExp, controller: RouteCallback): Route

  /**
   * For `HEAD` http requests with options
   *
   * **REST:** Response Headers - Identical to `get` but without a body
   *
   * @static
   * @param {(string | RegExp)} routePath The route path to watch
   * @param {RouterOptions} options The options for the route
   * @param {RouteCallback} controller The controller to use
   * @returns {Route}
   * @memberof Router
   */
  public static head(routePath: string | RegExp, options: RouterOptions, controller: RouteCallback): Route
  public static head(...args: any[]): Route {
    return this.createRoute('head', ...args)
  }

  /**
    * For `OPTIONS`http requests that go to "/" or the prefix root if in a group
    *
    * Describes the communication options for the resource
    *
    * @static
    * @param {RouteCallback} controller The controller to use
    * @returns {Route}
    * @memberof Router
    */
  public static options(controller: RouteCallback): Route

  /**
   * For `OPTIONS`http requests without options
   *
   * Describes the communication options for the resource
   *
   * @static
   * @param {(string | RegExp)} routePath The route path to watch
   * @param {RouteCallback} controller The controller to use
   * @returns {Route}
   * @memberof Router
   */
  public static options(routePath: string | RegExp, controller: RouteCallback): Route

  /**
   * For `OPTIONS`http requests with options
   *
   * Describes the communication options for the resource
   *
   * @static
   * @param {(string | RegExp)} routePath The route path to watch
   * @param {RouterOptions} options The options for the route
   * @param {RouteCallback} controller The controller to use
   * @returns {Route}
   * @memberof Router
   */
  public static options(routePath: string | RegExp, options: RouterOptions, controller: RouteCallback): Route
  public static options(...args: any[]): Route {
    return this.createRoute('options', ...args)
  }

  /**
    * For `any` http requests that go to "/" or the prefix root if in a group
    *
    * @static
    * @param {RouteCallback} controller The controller to use
    * @returns {Route}
    * @memberof Router
    */
  public static any(controller: RouteCallback): Route

  /**
   * For `any` http requests without options
   *
   * @static
   * @param {(string | RegExp)} routePath The route path to watch
   * @param {RouteCallback} controller The controller to use
   * @returns {Route}
   * @memberof Router
   */
  public static any(routePath: string | RegExp, controller: RouteCallback): Route

  /**
   * For `any` http requests with options
   *
   * @static
   * @param {(string | RegExp)} routePath The route path to watch
   * @param {RouterOptions} options The options for the route
   * @param {RouteCallback} controller The controller to use
   * @returns {Route}
   * @memberof Router
   */
  public static any(routePath: string | RegExp, options: RouterOptions, controller: RouteCallback): Route
  public static any(...args: any[]): Route {
    return this.createRoute('any', ...args)
  }

  /**
   * For event based messages
   *
   * @static
   * @param {(string | RegExp)} event The route path to watch
   * @param {RouteCallback} controller The controller to use
   * @returns {Route}
   * @memberof Router
   */
  public static on(event: string | RegExp, controller: RouteCallback): Route
  /**
   * For event based messages
   *
   * @param {string} event The event to listen for
   * @param {RouterOptions} options The options for the route
   * @param {RouteCallback} controller The controller to use
   * @memberof Router
   */
  public static on(event: string | RegExp, options: RouterOptions, controller: RouteCallback): Route
  public static on(...args: any[]): Route {
    return this.createRoute('event', ...args)
  }

  /**
    * For matching 2 or more method types that go to "/" or the prefix root if in a group
    *
    * @static
    * @param {RequestMethod[]} types The types to match
    * @param {RouteCallback} controller The controller to use
    * @returns {Route}
    * @memberof Router
    */
  public static match(types: RequestMethod[], controller: RouteCallback): void

  /**
   * For matching 2 or more method types without options
   *
   * @static
   * @param {RequestMethod[]} types The types to match
   * @param {(string | RegExp)} routePath The route path to watch
   * @param {RouteCallback} controller The controller to use
   * @memberof Router
   */
  public static match(types: RequestMethod[], routePath: string | RegExp, controller: RouteCallback): void

  /**
   * For matching 2 or more method types with options
   *
   * @static
   * @param {RequestMethod[]} types The types to match
   * @param {(string | RegExp)} routePath The route path to watch
   * @param {RouterOptions} options The options for the route
   * @param {RouteCallback} controller The controller to use
   * @memberof Router
   */
  public static match(types: RequestMethod[], routePath: string | RegExp, options: RouterOptions, controller: RouteCallback): void
  public static match(types: RequestMethod[], ...args: any[]): void {
    types.forEach(type => this.createRoute(type, ...args))
  }

  /**
   * Creates a resource with the following routes where `name` is the resource name:
   * ```
   * GET      /name            name.main
   * GET      /name/create     name.create
   * POST     /name            name.store
   * GET      /name/:id        name.show
   * GET      /name/:id/edit   name.edit
   * PUT      /name/:id        name.update
   * DELETE   /name/:id        name.destroy
   * ```
   * @static
   * @param {string} resourceName
   * @param {string} controller
   * @memberof Router
   */
  public static resource(resourceName: string, controller: string) {
    let name = controller.replace(/\//g, '.')
    this.get(`/${resourceName}`, `${controller}@main`).name(`${name}.main`)
    this.get(`/${resourceName}/create`, `${controller}@create`).name(`${name}.create`)
    this.post(`/${resourceName}`, `${controller}@store`).name(`${name}.store`)
    this.get(`/${resourceName}/:id`, `${controller}@show`).name(`${name}.show`)
    this.get(`/${resourceName}/:id/edit`, `${controller}@edit`).name(`${name}.edit`)
    this.put(`/${resourceName}/:id`, `${controller}@update`).name(`${name}.update`)
    this.delete(`/${resourceName}/:id`, `${controller}@destroy`).name(`${name}.destroy`)
  }

  private static createRoute(method: RequestMethod, ...args: any[]) {
    // Get the route callback
    let callback = null
    // only one parameter
    if (args.length == 1) callback = args[0]
    // More than one parameter
    else callback = args.length == 3 ? args[2] : args[1]

    // Get the route path
    let routePath = args.length > 1 ? args[0] : '/'
    // Create the new route
    let route: Route
    if (routePath instanceof RegExp) {
      route = new Route(routePath, method, callback, this.currentDomain)
    } else {
      let pathAlias = path.join(...this.groupPath, routePath).replace(/\\/g, '/')
      let isAlreadyRoute = !!Router.findByAlias(method, pathAlias)
      if (isAlreadyRoute) throw new Error(`Path already exists: "${String(pathAlias)}"`)
      route = new Route(pathAlias, method, callback, this.currentDomain)
    }
    route.setGroupOptions(Object.assign([], this.groupOptions))
    args.length == 3 && route.setRouteOptions(args[1])

    // Add the route to the list of routes
    // this._routes.push(r)
    let domain = this._domains.find(i => i.domain == this.currentDomain)
    if (!domain) {
      this._domains.push({ domain: this.currentDomain, routes: [route] })
    } else {
      domain.routes.push(route)
    }
    return route
  }

  public static findDomain(domainName: string | RegExp) {
    return this._domains.find(d => {
      if (typeof domainName == 'string') {
        if (typeof d.domain == 'string' && d.domain == domainName) return true
        if (d.domain instanceof RegExp && d.domain.test(domainName)) return true
      } else if (domainName instanceof RegExp) {
        if (d.domain instanceof RegExp && domainName.source == d.domain.source && domainName.flags == d.domain.flags) return true
      }
      return false
    })
  }

  /**
   * Finds a path by it's given name
   *
   * @static
   * @param {string} name The name of the path
   * @param {(string | RegExp | null)} [domainName='default'] The domain in which to look for the route. A null value searches all domains
   * @returns
   * @memberof Router
   */
  public static findByName(name: string, domainName: string | RegExp | null = 'default') {
    // If a null domain is specified, search all domains
    if (!domainName) {
      for (let domain of this._domains) {
        let route = domain.routes.find(r => r.routeName == name)
        if (route) return route
      }
    } else {
      let domain = this.findDomain(domainName)
      if (domain) {
        return domain.routes.find(r => r.routeName == name)
      }
    }
  }

  public static findByAlias(method: RequestMethod, path: string, domainName: string | RegExp | null = 'default') {
    // If a null domain is specified, search all domains
    if (!domainName) {
      for (let domain of this._domains) {
        let route = domain.routes.find(r => r.method == method && String(r.pathAlias) == path)
        if (route) return route
      }
    } else {
      let domain = this.findDomain(domainName)
      if (domain) {
        return domain.routes.find(r => r.method == method && String(r.pathAlias) == path)
      }
    }
  }

  public static findByPath(method: RequestMethod, path: string, domainName: string | RegExp | null = 'default') {
    // If a null domain is specified, search all domains
    if (!domainName) {
      for (let domain of this._domains) {
        let route = domain.routes.find(r => r.method == method && r.path == path)
        if (route) return route
      }
    } else {
      let domain = this.findDomain(domainName)
      if (domain) {
        return domain.routes.find(r => r.method == method && r.path == path)
      }
    }
  }

  private static _find(route: UrlWithStringQuery, method: RequestMethod) {
    if (!route.pathname) return undefined
    let domain = this.findDomain(route.hostname || 'default')
    if (!domain) domain = this.findDomain('default')
    if (domain) {
      let theRoute = domain.routes.find(r => {
        if (typeof r.pathAlias == 'string')
          return r.pathAlias == route.pathname && method.toLowerCase() == r.method.toLowerCase()
        else if (r.pathAlias instanceof RegExp)
          return r.pathAlias.test(route.pathname || '')
        return false
      })
      // If no exact match was found
      if (!theRoute) {
        let routeCrumbs = route.pathname.split('/').filter(i => i.trim().length > 0)
        let routeDynParams = routeCrumbs.filter(i => i.startsWith(':'))
        let routeLen = routeCrumbs.length
        let routeDynParamsLen = routeDynParams.length

        for (let r of domain.routes) {
          // for (let r of this._routes) {
          if (r.pathAlias instanceof RegExp) break
          let crumbs = r.pathAlias.split('/').filter(i => i.trim().length > 0)
          let dynParams = crumbs.filter(i => i.startsWith(':'))
          // make sure the path lengths are the same and parameters exist
          if (dynParams.length == 0 || (routeLen != crumbs.length && routeDynParamsLen != dynParams.length)) continue
          // Make sure the methods are the same (get, post, etc.)
          if (r.method.toLowerCase() != method.toLowerCase()) continue
          // Make sure non-parameters are in the correct location
          if (!crumbs.every((crumb, idx) => routeCrumbs[idx] == crumb || crumb.startsWith(':'))) continue
          // Create a new instance of the route
          theRoute = Object.assign(Object.create(r), r) as Route
          // Set the current path of the route
          theRoute instanceof Route && theRoute.setPath(route)
          break
        }
      }

      if (theRoute) {
        theRoute = <Route>Object.create(theRoute)
        theRoute.setPath(route)
      }
      return theRoute
    }
  }

  private static _constrain(expression: RegExp, value: string) {
    return expression.test(value)
  }

}