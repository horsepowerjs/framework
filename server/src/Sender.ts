import { IncomingMessage, ServerResponse } from 'http'
import { AppSettings } from './Server'

import * as mime from 'mime-types'
import * as path from 'path'
import * as crypto from 'crypto'
import * as zlib from 'zlib'
import * as fs from 'fs'
import { serialize } from 'cookie'
import { Client, Response, log, MiddlewareManager } from '.'
import { PassThrough, Readable } from 'stream'
import { Gzip, Deflate } from 'zlib'
import { Template } from './Template'
import { Storage, FileStorage } from '@horsepower/storage'
import { isProduction } from './helper'

export class Sender {
  public static async send(client: Client, req: IncomingMessage, res: ServerResponse, app: AppSettings) {
    let fileSize = client.response.contentLength
    if (!fileSize && client.response.fileStore) {
      let { store, file } = client.response.fileStore
      fileSize = await store.fileSize(file)
    }
    let start = 0, end: number | undefined = fileSize - 1 < start ? start : fileSize - 1
    // If the file is larger than the defined chunk size then send the file in chunks.
    // If the chunk size isn't set then default to 5,000,000 bytes per chunk.
    if (fileSize > (app.chunkSize || 5e5)) {
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
          res.end()
          // Execute the middleware termination commands
          await MiddlewareManager.run(client.route, client, 'terminate')
        })
        // .on('close', async () => {
        //   res.end()
        //   // Execute the middleware termination commands
        //   await MiddlewareManager.run(client.route, client, 'terminate')
        // })
        .on('error', async err => {
          res.end(err)
          // Execute the middleware termination commands
          await MiddlewareManager.run(client.route, client, 'terminate')
        })
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

  private static async _zip(res: ServerResponse, headers: [string, string][], client: Client, data: Buffer | string) {
    return new Promise(resolve => {
      let accept = client.headers.get<string>('Accept-Encoding', '')

      // Create a stream with the data
      let r = new Readable
      r._read = () => { }
      r.push(data)
      r.push(null)

      let zip: Gzip | Deflate | null = null

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
}