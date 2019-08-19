import { UrlWithStringQuery } from 'url'
import * as path from 'path'
import { RouterOptions, RequestMethod, Router } from './Router'
import { Middleware } from '@horsepower/server'

export class Route {

  private _name: string = ''
  private _paramConstraints: { [key: string]: RegExp } = {}
  private _path: UrlWithStringQuery = { query: '' }
  public routeOptions: RouterOptions = {}
  public groupOptions: RouterOptions[] = []

  public get routeName() { return this._name }
  public get path(): string {
    if (typeof this.pathAlias == 'string' && !this.pathAlias.split('/').find(i => i.startsWith(':'))) return this.pathAlias
    // console.log(this._path)
    return (this._path.pathname || '/')
  }

  public constructor(
    public readonly pathAlias: string | RegExp,
    public readonly method: RequestMethod,
    public readonly callback: string | Function | null,
    public readonly domain: string | RegExp
  ) {
    if (typeof this.pathAlias == 'string') {
      this.pathAlias = path.posix.join(this.pathAlias)
      if (!this.pathAlias.startsWith('/')) this.pathAlias = '/' + this.pathAlias
    }
    // console.log(`   ${(<string>method.toUpperCase())} ${this.pathAlias instanceof RegExp ? `RegExp(${this.pathAlias.source})` : this.pathAlias}${typeof callback == 'string' ? ` -> ${callback}` : ''}`)
  }

  public get constraints() { return this._paramConstraints }

  public get params(): { [key: string]: string } {
    let returnParams: { [key: string]: string } = {}
    if (this.pathAlias instanceof RegExp) return {}
    let crumbs = this.pathAlias.split('/').filter(i => i.trim().length > 0)
    let pathCrumbs = this.path.split('/').filter(i => i.trim().length > 0)
    let params = crumbs
      .map((i, idx) => { return { idx, val: i.startsWith(':') ? i : '' } })
      .filter(i => i.val.length > 0)
    params.forEach(p => {
      returnParams[p.val.replace(':', '')] = pathCrumbs[p.idx]
    })
    // console.log(this.route.path, this.route.pathAlias)
    return Object.freeze(returnParams)
  }

  /**
   * Sets the options for the route
   *
   * @param {RouterOptions} options
   * @memberof Route
   */
  public setRouteOptions(options: RouterOptions) {
    this.routeOptions = options
    if (options.name && options.name.length > 0) {
      this.name(options.name)
    }
  }

  public setGroupOptions(options: RouterOptions[]) {
    this.groupOptions = options
  }

  public name(name: string) {
    if (Router.findByName(name, null)) throw new Error(`Route name "${name}" already exists`)
    this._name = name
    return this
  }

  public middleware(...args: ((new () => Middleware) | Middleware | string)[]) {
    if (!this.routeOptions.middleware) this.routeOptions.middleware = []
    args.forEach(arg => {
      this.routeOptions.middleware && this.routeOptions.middleware.push(arg)
    })
    return this
  }

  public constrain(params: { [key: string]: RegExp }) {
    this._paramConstraints = params
  }

  public is(name: string | RegExp) {
    if (typeof name == 'string') {
      return this._name == name
    } else if (name instanceof RegExp) {
      name.test(this._name)
    }
    return false
  }

  public isPath(path: string | RegExp) {
    if (typeof path == 'string') {
      return this._path.pathname == path
    } else if (path instanceof RegExp) {
      return path.test(this._path.pathname || '')
    }
    return false
  }

  public setPath(path: UrlWithStringQuery) {
    this._path = path
  }
}