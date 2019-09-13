import { StorageSettings, Storage } from '@horsepower/storage'
import { Client, Response, log, MiddlewareManager } from '.'
import { Router } from '@horsepower/router'

import * as http from 'http'
import * as https from 'https'
import { IncomingMessage, ServerResponse } from 'http'
import * as url from 'url'

import { CookieSerializeOptions } from 'cookie'

import { Template } from './Template'
import { getConfig, configPath, applicationPath } from './helper'
import { Plugin } from './Plugin';
import { Sender } from './Sender'

export interface RouterSettings {
  controllers: string
  middleware: string
  routes: string
}

export interface ViewSettings {
  path: string
}

export interface AppSettings {
  port: number
  name?: string
  env?: string
  appKey?: string
  session?: {
    store?: 'file'
    cookie?: CookieSerializeOptions
  }
  https?: https.ServerOptions | false
  chunkSize?: number
  static?: string[]
  locale?: string
  logs?: {
    error?: {
      path?: string
      maxSize?: number
    }
    access?: {
      path?: string
      maxSize?: number
    }
  }
}

export interface DBMysqlSettings {
  driver: string, default?: boolean
  database: string, username: string, password: string, hostname: string
}

export interface DBSettings {
  [key: string]: DBMysqlSettings
}

export interface Connection {
  id: string
  client: Client
}

export class Server {
  private static instance: http.Server | https.Server
  public static app: AppSettings

  private static _clients: Client[] = []
  private static _plugins: Plugin[] = []

  public static get plugins(): Plugin[] { return this._plugins }

  public static start() {
    // Load the application env file if it exists
    let envPath = applicationPath('.env')
    let env = require('dotenv').config({ path: envPath })

    // Load the application configuration
    this.app = getConfig<AppSettings>('app') || {} as AppSettings
    if (!this.app) return log.error(`Cannot find the app config at "${configPath('app.js')}"`)

    // Create the server
    this.instance = !!this.app.https ?
      // Create an https server
      https.createServer(this.app.https, this.request.bind(this)) :
      // Create an http server
      http.createServer(this.request.bind(this))

    // Listen on the provided port
    this.instance.listen(this.app.port, async () => {
      if (!this.app) return
      // Output the config settings
      console.log(`horsepower is now listening on port "${this.app.port}" (Not yet accepting connections)`)

      // Get configurations
      let views = getConfig<ViewSettings>('view')
      let storage = getConfig<StorageSettings>('storage')
      let db = getConfig<DBSettings>('db')
      let route = getConfig<RouterSettings>('route')
      let plugins = getConfig<string[]>('plugin')

      // Setup dependencies
      route && Router.addControllerRoot(route.controllers)
      views && Template.setTemplatesRoot(views.path)

      let appConfig = getConfig<AppSettings>('app')

      // Log configuration settings
      console.log('--- Start Config Settings -----')
      console.log(`    --- File Paths ---`)
      console.log(`    environment: "${!env.error ? envPath : '.env file not found!'}"`)
      console.log(`    controllers: "${(route || { controllers: '' }).controllers}"`)
      console.log(`    views:       "${(views || { path: '' }).path}"`)
      console.log(`    routes:      "${(route || { routes: '' }).routes}"`)
      console.log(`    --- Storage settings ---`)
      console.log(`    storage:`)
      console.log(`      default: "${(storage || { default: '' }).default}"`)
      console.log(`      cloud:   "${(storage || { cloud: '' }).cloud || ''}"`)
      console.log(`      session: "${appConfig && appConfig.session && appConfig.session.store || ''}"`)
      if (storage) {
        console.log(`    disks:`)
        for (let disk in storage.disks) {
          console.log(`      ${disk}: "${storage.disks[disk].root || ''}"`)
          // Initialize the disk
          // Some disks need to be started up such as a mongodb file system
          await (<any>Storage.mount(disk)).boot(storage.disks[disk])
        }
      }
      else console.log(`      none`)
      if (db) {
        console.log(`    databases:`)
        for (let i in db) {
          let driver = (db[i] || { driver: '' }).driver.toLowerCase()
          switch (driver) {
            case 'mysql':
              let mysql = db[i] as DBMysqlSettings
              let dbPass = mysql.password.split('').map((i, idx, arr) => idx == 0 || arr.length == idx + 1 ? i : '*').join('')
              console.log(`      ${i}:`)
              console.log(`        driver: "${mysql.driver || ''}"`)
              console.log(`        default: "${mysql.default || false}"`)
              console.log(`        connect: "--host=${mysql.hostname || 'localhost'} --db=${mysql.database} --user=${mysql.username} --pass=${dbPass}"`)
              break
          }
        }
      }
      // Boot up any added plugins
      if (plugins) {
        console.log(`    --- Plugins ---`)
        let longestPluginName = Math.max(...plugins.map(i => i.length))
        for (let plugin of plugins) {
          let display = (plugin + ':').padEnd(longestPluginName + 1)
          try {
            let p = await import(plugin)
            let newPlugin = new p.default(plugin) as Plugin
            await newPlugin.boot()
            if (newPlugin.controllers) Router.addControllerRoot(newPlugin.controllers)
            if (newPlugin.middleware) Router.addMiddlewareRoot(newPlugin.middleware)
            this._plugins.push(newPlugin)
            console.log(`    ${display} Loaded`)
          } catch (e) {
            log.error(`Could not load the plugin '${plugin}': ${e.message}`)
            console.log(`    ${display} Not Loaded`)
            // throw e
          }
        }
      }
      console.log('--- End Config Settings -----')
      console.log(' ')
      if (route) {
        try {
          console.log(`--- Start Route Setup -----`)
          // Load the users defined routes
          await import(route.routes)
          // Load the builtin routes
          await import('./routes')
          // Load the plugin routes
          for (let plugin of this._plugins) {
            if (plugin.routes) await import(plugin.routes)
          }
          // Get the longest route
          let longestRoute = Math.max(...Router.domains.map(d => d.routes.reduce((num, val) => {
            let len = val.pathAlias instanceof RegExp ? `RegExp(${val.pathAlias.source})`.length : val.pathAlias.length
            return len > num ? len : num
          }, 'Route'.length)))

          // Get the longest controller
          let longestController = Math.max(...Router.domains.map(d => d.routes.reduce((num, val) => {
            let len = typeof val.callback == 'string' ? val.callback.length : 'Closure'.length
            return len > num ? len : num
          }, 'Controller'.length)))

          // Get the longest name
          let longestName = Math.max(...Router.domains.map(d => d.routes.reduce((num, val) => {
            let len = val.routeName.length || 0
            return len > num ? len : num
          }, 'Name'.length)))

          console.log(`    ${'Method'.padEnd(10)}${'Route'.padEnd(longestRoute + 3)}${'Controller'.padEnd(longestController + 3)}${'Name'}`)
          console.log(`${''.padEnd(longestController + longestRoute + longestName + 20, '-')}`)
          Router.domains.forEach(domain => {
            console.log(`${domain.domain}`)
            domain.routes.forEach(route => {
              let method = route.method.toUpperCase()
              let routeAlias = route.pathAlias instanceof RegExp ? `RegExp(${route.pathAlias.source})` : route.pathAlias
              let routeCtrl = typeof route.callback == 'string' ? `${route.callback}` : 'Closure'
              console.log(`    ${method.padEnd(10)}${routeAlias.padEnd(longestRoute + 3)}${routeCtrl.padEnd(longestController + 3)}${route.routeName}`)
            })
          })
          console.log(`--- End Routes Setup -----`)
        } catch (e) {
          console.error(`Could not load routes from "${route.routes}":\n  - ${e.message}`)
        }
      }
      console.log('horsepower is now accepting connections!')
    })
  }

  public static stop() {
    console.log('horsepower is shutting down')
    this.instance.close((err?: Error) => {
      if (err) {
        console.error(err)
        process.exit(1)
      }
      console.log('horsepower has shut down')
      process.exit(0)
    })
  }

  private static async request(req: http.IncomingMessage, res: http.ServerResponse) {
    if (!this.app) return
    const urlInfo = url.parse('http://' + req.headers.host + (req.url || '/'))
    const client = new Client(req)
    for (let plugin of this._plugins) {
      plugin.request(client)
      // if(plugin.property)client[plugin.property] =
    }
    this._clients.push(client)
    // Get the body of the request
    const body = await new Promise<string>(resolve => {
      let reqBody = ''
      req.on('data', (data: Buffer) => {
        reqBody += data.toString('binary')
      }).on('end', async (data: Buffer) => {
        if (data) reqBody += data.toString('binary')
        resolve(reqBody)
      }).on('error', (err) => {
        log.error(err, client)
        resolve(reqBody)
      })
    })

    try {
      await client.init()
      client.setBody(body)

      if (urlInfo.pathname) {
        // Attempt to send the file from the public folder
        try {
          const pub = Storage.mount('public')
          if (await pub.isFile(urlInfo.pathname)) {
            client.response.setStore(pub, urlInfo.pathname)
            return await Sender.send(client, req, res, this.app)
          }
        } catch (e) { }
      }

      const routeInfo = await Router.route(urlInfo, client.method)
      let resp: string | object | any[] | Response | undefined | null = null
      if (routeInfo && routeInfo.route && routeInfo.callback) {
        client.setRoute(routeInfo.route)
        // Run the pre request middleware `MyMiddleware.handle()`
        if (!await this._runMiddleware(routeInfo, client, req, res, 'pre')) return
        // Run the controller
        resp = await routeInfo.callback(client)
        // Run the post request middleware `MyMiddleware.postHandle()`
        if (!await this._runMiddleware(routeInfo, client, req, res, 'post')) return
      }

      if (!resp) await Sender.getErrorPage(client, 400, { message: new Error().stack })
      else if (!(resp instanceof Response)) {
        if (typeof resp == 'string') client.response.html(resp)
        else client.response.json(resp)
      }

      await Sender.send(client, req, res, this.app)
    } catch (e) {
      await Sender.getErrorPage(client, 500, { message: e.stack })
      await Sender.send(client, req, res, this.app)
      log.error(e, client)
    }

    // Remove the client from the list of clients
    let idx = this._clients.indexOf(client)
    idx > -1 && this._clients.splice(idx, 1)
  }

  private static async _runMiddleware(routeInfo, client: Client, req: IncomingMessage, res: ServerResponse, type: 'post' | 'pre') {
    let result = await MiddlewareManager.run(routeInfo.route, client, type)
    if (result !== true && !(result instanceof Response)) {
      await Sender.getErrorPage(client, 400, { message: new Error().stack })
      Sender.send(client, req, res, this.app)
      return false
    }
    return true
  }

}