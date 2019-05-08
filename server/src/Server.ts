import * as http from 'http'
import * as https from 'https'
import * as fs from 'fs'
import * as mime from 'mime-types'
import * as path from 'path'
import * as url from 'url'
import { Template } from './Template'
import * as helpers from './helper'
import * as shell from 'shelljs'
import { serialize, CookieSerializeOptions } from 'cookie'

import { Router } from '@red5/router'
import { Storage, StorageSettings } from '@red5/storage'
import { MiddlewareManager } from '@red5/middleware'
import { Client, Response, log } from '.'
import { env, getConfig, storagePath, configPath, isProduction } from './helper'

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
  session?: {
    store?: 'file'
    cookie?: CookieSerializeOptions
  }
  https?: https.ServerOptions | false
  chunkSize?: number
  static?: string[],
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

  public static start() {
    // Load the application env file if it exists
    let envPath = helpers.applicationPath('.env')
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
    this.instance.listen(this.app.port, () => {
      if (!this.app) return
      // Output the config settings
      console.log(`Red5 is now listening on port "${this.app.port}" (Not yet accepting connections)`)

      // Config locations
      let views = getConfig<ViewSettings>('view')
      let storage = getConfig<StorageSettings>('storage')
      let db = getConfig<DBSettings>('db')
      let route = getConfig<RouterSettings>('route')

      // Setup dependencies
      route && Router.setControllersRoot(route.controllers)
      views && Template.setTemplatesRoot(views.path)
      storage && Storage.setConfig(storage)

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
      if (appConfig && appConfig.session && appConfig.session.store) {
        shell.mkdir('-p', storagePath('framework/session'))
      }
      if (storage) {
        console.log(`    disks:`)
        for (let i in storage.disks) console.log(`      ${i}: "${storage.disks[i].root || ''}"`)
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
      console.log('--- End Config Settings -----')
      console.log(' ')
      if (route) {
        try {
          console.log(`--- Start Route Setup -----`)
          require(route.routes)
          // Get the longest route
          let longestRoute = Router.routes.reduce((num, val) => {
            let len = val.pathAlias instanceof RegExp ? `RegExp(${val.pathAlias.source})`.length : val.pathAlias.length
            return len > num ? len : num
          }, 'Route'.length)
          // Get the longest controller
          let longestController = Router.routes.reduce((num, val) => {
            let len = typeof val.callback == 'string' ? val.callback.length : 'Closure'.length
            return len > num ? len : num
          }, 'Controller'.length)
          // Get the longest name
          let longestName = Router.routes.reduce((num, val) => {
            let len = val.routeName.length || 0
            return len > num ? len : num
          }, 'Name'.length)
          console.log(`    ${'Method'.padEnd(10)}${'Route'.padEnd(longestRoute + 3)}${'Controller'.padEnd(longestController + 3)}${'Name'}`)
          console.log(`${''.padEnd(longestController + longestRoute + longestName + 20, '-')}`)
          Router.routes.forEach(route => {
            let method = route.method.toUpperCase()
            let routeAlias = route.pathAlias instanceof RegExp ? `RegExp(${route.pathAlias.source})` : route.pathAlias
            let routeCtrl = typeof route.callback == 'string' ? `${route.callback}` : 'Closure'
            console.log(`    ${method.padEnd(10)}${routeAlias.padEnd(longestRoute + 3)}${routeCtrl.padEnd(longestController + 3)}${route.routeName}`)
          })
          console.log(`--- End Routes Setup -----`)
        } catch (e) {
          console.error(`Could not load routes from "${route.routes}":\n  - ${e.message}`)
        }
      }
      console.log('Red5 is now accepting connections!')
    })
  }

  public static stop() {
    console.log('Red5 is shutting down')
    this.instance.close((err?: Error) => {
      if (err) {
        console.error(err)
        process.exit(1)
      }
      console.log('Red5 has shut down')
      process.exit(0)
    })
  }

  private static async request(req: http.IncomingMessage, res: http.ServerResponse) {
    if (!this.app) return
    let urlInfo = url.parse('http://' + req.headers.host + (req.url || '/'))
    let client = new Client(req)

    // Get the body of the request
    let body = await new Promise<string>(resolve => {
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

      // Attempt to send the file from the public folder
      if (urlInfo.pathname) {
        let filePath = path.join(helpers.applicationPath('public'), urlInfo.pathname)
        try {
          let stats = await new Promise<fs.Stats>(resolve => fs.stat(filePath, (err, stat) => resolve(stat)))
          if (stats.isFile()) {
            client.response.setFile(filePath).setContentLength(stats.size)
            return await this.send(client, req, res)
          }
        } catch (e) { }

        // If the file isn't found in the public folder attempt to find it in the defined static folder(s)
        if (this.app.static && Array.isArray(this.app.static) && this.app.static.length > 0) {
          for (let staticFolder in this.app.static) {
            let filePath = path.join(staticFolder, urlInfo.pathname)
            try {
              let stats = await new Promise<fs.Stats>(resolve => fs.stat(filePath, (err, stat) => resolve(stat)))
              if (stats.isFile()) {
                client.response.setFile(filePath).setContentLength(stats.size)
                return await this.send(client, req, res)
              }
            } catch (e) { }
          }
        }
      }

      let routeInfo = await Router.route(urlInfo, client.method)
      let resp: Response | null = null
      if (routeInfo && routeInfo.route && routeInfo.callback) {
        client.setRoute(routeInfo.route)
        // Run the pre request middleware `MyMiddleware.handle()`
        if (!await this._runMiddleware(routeInfo, client, req, res, 'pre')) return
        // Run the controller
        resp = await routeInfo.callback(client)
        // Run the post request middleware `MyMiddleware.postHandle()`
        if (!await this._runMiddleware(routeInfo, client, req, res, 'post')) return
      }

      !resp && await this.getErrorPage(client, 400)
      await this.send(client, req, res)
    } catch (e) {
      await this.getErrorPage(client, 500)
      await this.send(client, req, res)
      log.error(e, client)
    }
  }

  private static async _runMiddleware(routeInfo, client: Client, req: http.IncomingMessage, res: http.ServerResponse, type: 'post' | 'pre') {
    let result = await MiddlewareManager.run(routeInfo.route, client, type)
    if (result !== true && !(result instanceof Response)) {
      await this.getErrorPage(client, 400)
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
    let filePath = path.join(__dirname, '../error-pages/', code + '.html')
    let fileUri = path.parse(filePath)
    let file = await new Promise<string>(resolve => fs.readFile(filePath, (err, data) => resolve(data.toString())))
    // let file = fs.readFileSync(filePath).toString()
    // Replace static placeholders
    file = file.replace(/\$\{(.+)\}/g, (a: string, b: string) => data[b] || '')
    // Replace executable placeholders
    file = file.replace(/\#\{(.+)\}/g, (a: string, b: string) => {
      // Replace "#{include('/path/to/file')}" with the file's contents
      if (b.startsWith('include(')) {
        return b.replace(/'|"/g, '').replace(/\include\((.+)\);?/i, (a: string, b: string) => {
          let inclFilePath = path.resolve(fileUri.dir, b)
          return fs.readFileSync(inclFilePath).toString()
        })
      }
      return ''
    })
    return client.response.setCode(code).setBody(file)
  }

  private static async send(client: Client, req: http.IncomingMessage, res: http.ServerResponse) {
    if (!this.app) return
    let fileSize = client.response.contentLength
    let start = 0, end = fileSize - 1 < start ? start : fileSize - 1
    // If the file is larger than the defined chunk size then send the file in chunks.
    // If the chunk size isn't set then default to 5,000,000 bytes per chunk.
    if (fileSize > (this.app.chunkSize || 5e6)) {
      let range = (req.headers.range || '') as string
      let positions = range.replace(/bytes=/, '').split('-')
      start = parseInt(positions[0], 10)
      end = positions[1] ? parseInt(positions[1], 10) : fileSize - 1
      let chunkSize = (end - start) + 1
      client.response.setCode(206).setHeaders({
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Connection': 'Keep-Alive',
        'Content-Length': chunkSize
      })
    }
    if (client.response.filePath) {
      let contentType = mime.lookup(client.response.filePath) || 'text/plain'
      client.response.setHeader('Content-Type', contentType)
      if (end < 1) {
        end = await new Promise(r => client.response.filePath && fs.stat(client.response.filePath, (err, stat) => r(stat.size)))
      }
    }

    // Execute the middleware termination commands
    await MiddlewareManager.run(client.route, client, 'terminate')

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

    // Write the response headers
    res.writeHead(client.response.code, <any>headers)

    // Log the request
    log.access(client)

    // If the method type is of 'head' or 'options' no body should be sent
    // In this case we send the headers only and the body should not be sent
    if (['head', 'options'].includes(client.method)) {
      res.end()
      client.session && await client.session.end()
      return
    }

    // Generate the response body
    if (client.response.filePath) {
      // We are sending a file to the user, open it and read it
      // If the file is sent in chunks this will handle it
      let stream: fs.ReadStream = fs.createReadStream(client.response.filePath, { start, end })
        .on('open', () => stream.pipe(<any>res))
        .on('close', () => res.end())
        .on('error', err => res.end(err))
    } else {
      if (client.response.templatePath) {
        res.write(await Template.render(client))
      } else if (client.response.buffer) {
        res.write(client.response.buffer)
      } else {
        res.write(client.response.body)
      }
      res.end()
    }
    client.session && await client.session.end()
  }
}