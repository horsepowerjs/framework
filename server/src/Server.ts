import { StorageSettings, Storage, FileStorage } from '@horsepower/storage'
import { Client, Response, log, MiddlewareManager } from '.'
import { Router } from '@horsepower/router'

import * as http from 'http'
import * as https from 'https'
import * as fs from 'fs'
import * as mime from 'mime-types'
import * as path from 'path'
import * as url from 'url'
import * as crypto from 'crypto'
import * as zlib from 'zlib'
import { Readable, PassThrough } from 'stream'

import { serialize, CookieSerializeOptions } from 'cookie'

import { Template } from './Template'
import { getConfig, configPath, applicationPath, isProduction } from './helper'
import { Plugin } from './Plugin';

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
  public static app?: AppSettings

  private static _clients: Client[] = []
  private static _plugins: Plugin[] = []

  public static get plugins(): Plugin[] { return this._plugins }

  public static start() {
    // Load the application env file if it exists
    let envPath = applicationPath('.env')
    let env = require('dotenv').config({ path: envPath })

    // Load the application configuration
    this.app = getConfig<AppSettings>('app')
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
      else { console.log(`      none`) }
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
            return await this.send(client, req, res)
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

      if (!resp) await this.getErrorPage(client, 400, { message: new Error().stack })
      else if (!(resp instanceof Response)) {
        if (typeof resp == 'string') client.response.html(resp)
        else client.response.json(resp)
      }

      await this.send(client, req, res)
    } catch (e) {
      await this.getErrorPage(client, 500, { message: e.stack })
      await this.send(client, req, res)
      log.error(e, client)
    }

    // Remove the client from the list of clients
    let idx = this._clients.indexOf(client)
    idx > -1 && this._clients.splice(idx, 1)
  }

  private static async _runMiddleware(routeInfo, client: Client, req: http.IncomingMessage, res: http.ServerResponse, type: 'post' | 'pre') {
    let result = await MiddlewareManager.run(routeInfo.route, client, type)
    if (result !== true && !(result instanceof Response)) {
      await this.getErrorPage(client, 400, { message: new Error().stack })
      this.send(client, req, res)
      return false
    }
    return true
  }

  /**
   * Sends a debug page that displays debug data.
   * If the app is in production mode, a 500 error page will be sent.
   *
   * @static
   * @param {Client} client
   * @param {{ [key: string]: any }} data
   * @returns
   * @memberof Server
   */
  public static async sendDebugPage(client: Client, data: { [key: string]: any }) {
    const prod = isProduction()
    return await this.getErrorPage(client, !prod ? 1000 : 500, !prod ? data : {})
  }

  /**
   * Sets the error page that should be displayed if something were to go wrong in the request.
   *
   * @static
   * @param {Client} client
   * @param {number} code
   * @param {{ [key: string]: any }} [data={}]
   * @returns {Promise<Response>}
   * @memberof Server
   */
  public static async getErrorPage(client: Client, code: number, data: { [key: string]: any } = {}): Promise<Response> {
    // Read the file
    let filePath = path.join(__dirname, '../error-pages/', `${(isProduction() ? code : 1000)}.html`)
    let fileUri = path.parse(filePath)
    let content = await new Promise<string>(resolve => fs.readFile(filePath, (err, data) => resolve(data.toString())))
    // let file = fs.readFileSync(filePath).toString()
    // Replace static placeholders
    content = content.replace(/\$\{(.+)\}/g, (a: string, b: string) => data[b] || '')
    // Replace executable placeholders
    content = content.replace(/\#\{(.+)\}/g, (a: string, b: string) => {
      // Replace "#{include('/path/to/file')}" with the file's contents
      if (b.startsWith('include(')) {
        return b.replace(/'|"/g, '').replace(/\include\((.+)\);?/i, (a: string, b: string) => {
          let inclFilePath = path.resolve(fileUri.dir, b)
          return fs.readFileSync(inclFilePath).toString()
        })
      }
      return ''
    })
    return client.response.setCode(code).setBody(content)
  }

  private static async send(client: Client, req: http.IncomingMessage, res: http.ServerResponse) {
    if (!this.app) return
    let fileSize = client.response.contentLength
    if (!fileSize && client.response.fileStore) {
      let { store, file } = client.response.fileStore
      fileSize = await store.fileSize(file)
    }
    let start = 0, end: number | undefined = fileSize - 1 < start ? start : fileSize - 1
    // If the file is larger than the defined chunk size then send the file in chunks.
    // If the chunk size isn't set then default to 5,000,000 bytes per chunk.
    if (fileSize > (this.app.chunkSize || 5e5)) {
      let range = (req.headers.range || '') as string
      let positions = range.replace(/bytes=/, '').trim().split('-')
      start = parseInt(positions[0] || '0', 10)
      end = parseInt(positions[1] || (fileSize - 1).toString(), 10)
      let chunkSize = (end - start) + 1
      if (!client.response.hasHeader('content-disposition')) client.response.setCode(206)
      client.response
        .setHeaders({
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Connection': 'Keep-Alive',
          'Content-Length': chunkSize
        })
    }
    if (client.response.fileStore) {
      let { store, file } = client.response.fileStore
      let contentType = mime.lookup(file) || 'text/plain'
      client.response.setHeader('Content-Type', contentType)
      // if (end < 1) end = await store.fileSize(file)
    }

    let headers: [string, string][] = []

    // Add the cookies to the header
    for (let c of client.response.cookies) {
      headers.push(['Set-Cookie', serialize(c.key, c.value, {
        domain: c.domain,
        expires: c.expires,
        path: c.path,
        httpOnly: c.httpOnly,
        maxAge: c.maxAge,
        sameSite: c.sameSite,
        secure: c.secure
      })])
    }

    // Add all of the other headers
    for (let h in client.response.headers) {
      let header = client.response.headers[h]
      if (header) headers.push([h, header.toString()])
    }

    // Log the request
    log.access(client)

    // If the method type is of 'head' or 'options' no body should be sent
    // In this case we send the headers only and the body should not be sent
    if (['head', 'options'].includes(client.method)) {
      res.end()
      // client.session && await client.session.close()
      return
    }

    // Generate the response body
    if (client.response.fileStore) {
      // We are sending a file to the user, open it and read it
      // If the file is sent in chunks this will handle it
      // Write the response headers
      res.writeHead(client.response.code, <any>headers)

      let { store, file } = client.response.fileStore

      // let stream: fs.ReadStream = fs.createReadStream(store.toPath(file), { start, end })
      let stream: PassThrough = (await store.readStream(file, { start, end, fileSize }))
      stream.on('data', chunk => res.write(chunk))
        .on('end', async () => {
          // res.end()
          // // Execute the middleware termination commands
          // await MiddlewareManager.run(client.route, client, 'terminate')
        })
        // .on('open', () => stream.pipe(res))
        .on('close', async () => {
          res.end()
          console.log('end')
          // Execute the middleware termination commands
          await MiddlewareManager.run(client.route, client, 'terminate')
        })
        .on('error', err => res.end(err))

    } else {
      let responseBody: string | Buffer = ''
      if (client.response.templatePath) {
        if (client.response.loadFromCache) {
          responseBody = await this._readCacheTemplate(client)
        } else {
          try {
            responseBody = await Template.render(client)
          } catch (e) {
            await this.getErrorPage(client, 500, { message: e.stack })
            responseBody = client.response.body
          }
        }
      } else if (client.response.buffer) {
        responseBody = client.response.buffer
      } else {
        responseBody = client.response.body
      }

      // Write the response body
      await this._zip(res, headers, client, responseBody)
      res.write(responseBody)

      // End the response
      res.end()

      // Execute the middleware termination commands
      await MiddlewareManager.run(client.route, client, 'terminate')
    }

  }

  private static async _readCacheTemplate(client: Client) {
    let responseBody = ''
    if (!client.response.templatePath) return ''
    let ttl = client.response.cacheTTL
    let md5 = crypto.createHash('md5').update(client.route.path).digest('hex')
    let tmp = Storage.mount<FileStorage>('tmp')
    let tmpPath = path.join('horsepower/cache', md5 + '.html')
    let info = await tmp.info(tmpPath)
    if (info) {
      let diff = Math.abs((info.ctime.getTime() - new Date().getTime()) / 1000)
      if (diff < ttl) {
        responseBody = (await tmp.read(tmpPath)).toString()
      } else {
        responseBody = await this._createTempFile(client, tmpPath, tmp)
      }
    } else {
      responseBody = await this._createTempFile(client, tmpPath, tmp)
    }
    return responseBody
  }

  private static async _createTempFile(client: Client, tmpPath: string, tmp: Storage<FileStorage>) {
    let responseBody = ''
    try {
      responseBody = await Template.render(client)
      await tmp.write(tmpPath, responseBody)
    } catch (e) {
      await this.getErrorPage(client, 500, { message: e.stack })
      responseBody = client.response.body
    }
    return responseBody
  }

  private static async _zip(res: http.ServerResponse, headers: [string, string][], client: Client, data: Buffer | string) {
    return new Promise(resolve => {
      let accept = client.headers.get<string>('Accept-Encoding', '')

      // Create a stream with the data
      let r = new Readable()
      r._read = () => { }
      r.push(data)
      r.push(null)

      let zip: zlib.Gzip | zlib.Deflate | null = null

      // Create a gzip compression if the browser supports it
      if (accept.includes('gzip')) {
        headers.push(['Content-Encoding', 'gzip'])
        zip = zlib.createGzip()
      }
      // Create a deflate compression if the browser supports it
      else if (accept.includes('deflate')) {
        headers.push(['Content-Encoding', 'deflate'])
        zip = zlib.createDeflate()
      }

      // Write the headers
      res.writeHead(client.response.code, <any>headers);

      // Zip the response or send without compression
      (zip ? r.pipe(zip) : r).pipe(res)
        .on('finish', () => resolve(true))
        .on('error', () => resolve(false))
    })
  }
}