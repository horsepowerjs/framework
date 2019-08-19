import { Client, Response, getConfig } from '.'
import { Route } from '@horsepower/router'
import { Server } from './Server'

declare type MiddlewareType = 'pre' | 'post' | 'terminate'

declare type MiddlewareRunType = (new () => Middleware) | Middleware | string

declare interface MiddlewareSettings {
  namedMiddleware: { [key: string]: Middleware }
}

export interface Middleware {
  /**
   * Handles the request before the controller
   *
   * @param {client} client The client
   * @param {any[]} args Additional arguments
   * @returns {boolean | Response}
   */
  handle?(client: Client, ...args: any[]): boolean | Response | Promise<boolean | Response>

  /**
   * Handles the request after the controller
   *
   * @param {client} client The client
   * @param {any[]} args Additional arguments
   * @returns {boolean | Response}
   */
  postHandle?(client: Client, ...args: any[]): boolean | Response

  /**
   * Runs once the response is ready to be sent to the client
   */
  terminate?(client: Client, ...args: any[]): void
}

export class MiddlewareManager {

  public static async run(theRoute: Route, client: Client, type: MiddlewareType = 'pre'): Promise<boolean | Response> {
    // Execute the middleware that is attached to the route
    if (theRoute) {
      // Test the group middleware
      for (let c of theRoute.groupOptions) {
        if (!c.middleware) continue
        let result
        switch (type) {
          case 'pre': result = await this._runPreMiddleware(c.middleware as MiddlewareRunType[], client); break;
          case 'post': result = await this._runPostMiddleware(c.middleware as MiddlewareRunType[], client); break;
          case 'terminate': result = await this._runTerminateMiddleware(c.middleware as MiddlewareRunType[], client); break;
        }
        if (result instanceof Response) return result
        if (result === false) return result
      }
      // Test the route specific middleware
      if (theRoute.routeOptions.middleware) {
        let middleware = theRoute.routeOptions.middleware as MiddlewareRunType[]
        let result
        switch (type) {
          case 'pre': result = await this._runPreMiddleware(middleware, client); break;
          case 'post': result = await this._runPostMiddleware(middleware, client); break;
          case 'terminate': result = await this._runTerminateMiddleware(middleware, client); break;
        }
        return result
      }
      return true
    }
    return false
  }

  private static async _runPreMiddleware(middleware: MiddlewareRunType[], client: Client): Promise<boolean | Response> {
    for (let callback of middleware) {
      let result
      if (typeof callback == 'string') {
        let cb = await this.parseStringMiddleware(callback)
        if (cb && cb.callback && cb.callback.handle) return await cb.callback.handle(client, ...cb.params)
      } else if (typeof callback == 'function') {
        callback = new callback
        if (callback.handle) {
          result = await callback.handle(client)
          if (result instanceof Response) return result
          if (!result) return false
        }
      }
    }
    return true
  }

  private static async _runPostMiddleware(middleware: MiddlewareRunType[], client: Client): Promise<boolean | Response> {
    for (let callback of middleware) {
      let result
      if (typeof callback == 'string') {
        let cb = await this.parseStringMiddleware(callback)
        if (cb && cb.callback && cb.callback.postHandle) return await cb.callback.postHandle(client, ...cb.params)
      } else if (typeof callback == 'function') {
        callback = new callback
        if (callback.postHandle) {
          result = await callback.postHandle(client)
          if (result instanceof Response) return result
          if (!result) return false
        }
      }
    }
    return true
  }

  private static async _runTerminateMiddleware(middleware: MiddlewareRunType[], client: Client): Promise<boolean> {
    for (let callback of middleware) {
      if (typeof callback == 'string') {
        let cb = await this.parseStringMiddleware(callback)
        if (cb && cb.callback && cb.callback.terminate) await cb.callback.terminate(client, ...cb.params)
      } else if (typeof callback == 'function') {
        callback = new callback
        if (callback.terminate) {
          await callback.terminate(client)
        }
      }
    }
    return true
  }

  private static async parseStringMiddleware(string: string) {
    // Attempt to load middleware from a plugin
    try {
      let [name, action] = string.split(/\./)
      if (name && action) {
        const [, middleware, parameters] = Array.from(action.match(/(.+)(:(.+))?/) || [])
        let p = Server.plugins.find(i => i.name == name)
        if (p) {
          let m = await import(p.middleware)
          return {
            callback: new (<new () => Middleware>m[middleware]),
            params: (parameters || '').split(',')
          }
        }
      }
    } catch (e) { }

    // Attempt to load named middleware
    try {
      const refs = getConfig<MiddlewareSettings>('middleware', true)
      if (refs && refs.namedMiddleware) {
        const [, middleware, parameters] = Array.from(string.match(/(.+):(.+)/) || [])
        if (!refs.namedMiddleware[middleware]) return
        return {
          callback: new (<new () => Middleware>refs.namedMiddleware[middleware]),
          params: parameters.split(',')// /,(?=(?:[^'"`]*(['"`])[^'"`]*\1)*[^'"`]*$)/)
        }
      }
    } catch (e) {
      throw new Error('You are calling middleware using a string, however, "/config/middleware.js" was not found with "namedMiddleware"')
    }
  }
}