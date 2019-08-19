import { OutgoingHttpHeaders } from 'http'
import { Router, Route } from '@horsepower/router'
import { parse } from 'url'
import { Client } from './Client';

export interface CookieOptions {
  path?: string
  domain?: string
  expires?: Date
  httpOnly?: boolean
  maxAge?: number
  sameSite?: boolean | 'lax' | 'strict'
  secure?: boolean
}

export interface Cookie {
  key: string
  value: string
}

export class Response {

  private _filePath: string | null = null
  private _templatePath: string | null = null
  private _templateData: {} | null = null
  // private _media: MediaFile | null = null
  private _buffer: Buffer | null = null
  private _cookies: (Cookie & CookieOptions)[] = []

  public constructor(private _client: Client, private _body: string = '', private _headers: OutgoingHttpHeaders = {
    'Content-Type': 'text/html; charset=utf-8'
  }, private _code: number = 200, private _length: number = 0) { }

  public get code(): number { return this._code }
  public get body(): string { return this._body }
  public get headers(): OutgoingHttpHeaders { return this._headers }
  public get cookies(): (Cookie & CookieOptions)[] { return this._cookies }
  public get contentLength(): number { return this._length }
  public get filePath(): string | null { return this._filePath }
  public get templatePath(): string | null { return this._templatePath }
  public get templateData(): {} | null { return this._templateData }
  public get buffer(): Buffer | null { return this._buffer }

  /**
   * Sets the length in bytes of the response
   *
   * @param {number} length The number of bytes
   * @returns
   * @memberof Response
   */
  public setContentLength(length: number) {
    this._length = length
    return this
  }

  /**
   * Sets the status code for the http response
   *
   * @param {number} code The code number to use
   * @returns
   * @memberof Response
   */
  public setCode(code: number) {
    this._code = code
    return this
  }

  /**
   * Sets the body of the http response
   *
   * @param {string} body The body data
   * @returns
   * @memberof Response
   */
  public setBody(body: string) {
    this._body = body
    return this
  }

  /**
   * Sets the body data as a buffer instead of a string
   *
   * @param {Buffer} data The buffer to use
   * @returns
   * @memberof Response
   */
  public setBuffer(data: Buffer) {
    this._buffer = data
    return this.setContentLength(data.byteLength)
  }

  /**
   * Sets the path of the file to use for a download or stream
   *
   * @param {string} path The path to the file on the server
   * @returns
   * @memberof Response
   */
  public setFile(path: string) {
    this._filePath = path
    return this
  }

  /**
   * Removes all of the headers in the response
   *
   * @returns
   * @memberof Response
   */
  public clearHeaders() {
    this._headers = {}
    return this
  }

  /**
   * Sets the headers all at once replacing old headers with new values if they exist
   *
   * @param {OutgoingHttpHeaders} headers
   * @returns
   * @memberof Response
   */
  public setHeaders(headers: OutgoingHttpHeaders) {
    this._headers = Object.assign(this._headers, headers)
    return this
  }

  /**
   * Sets a single header replacing the old header if it exists
   *
   * @param {string} key The key portion of the header such as `Content-Type`
   * @param {string} value The value portion of the header such as `text/html`
   * @returns
   * @memberof Response
   */
  public setHeader(key: string, value: string) {
    this._headers[key] = value
    return this
  }

  /**
   * Checks to see if a header exists in the current list of response headers
   *
   * @param {string} key The key of the header such as `Content-Type`
   * @returns {boolean}
   * @memberof Response
   */
  public hasHeader(key: string) {
    return Object.keys(this._headers)
      .findIndex(i => i.toLowerCase() == key.toLowerCase()) > -1
  }

  /**
   * Sets a cookie on the clients browser
   *
   * @param {string} key The cookie key
   * @param {string} value The cookie value
   * @param {CookieOptions} options Cookie settings such as the path, domain, expiration, etc.
   * @returns
   * @memberof Response
   */
  public setCookie(key: string, value: string, options: CookieOptions) {
    this._cookies.push(Object.assign<Cookie, CookieOptions>({ key, value }, options))
    return this
  }

  /**
   * Deletes a cookie from the clients browser
   *
   * @param {string} key The key for the cookie
   * @param {CookieOptions} [options] Optional options for the cookie, any expire option will be overwritten.
   * @returns
   * @memberof Response
   */
  public deleteCookie(key: string, options?: CookieOptions) {
    this._cookies.push(
      Object.assign<Cookie, CookieOptions>({ key, value: '' },
        Object.assign<CookieOptions, CookieOptions>(options || {}, { expires: new Date(0, 0, 0) })
      )
    )
    return this
  }

  /**
   * Renders a template.
   *
   * @param {string} path The location to the template
   * @param {{}} [data={}] Additional data for the template such as functions/variables
   * @param {number} [code=200] The status code to send with the template
   * @returns
   * @memberof Response
   */
  public render(path: string, data: {} = {}, code: number = 200) {
    this._templatePath = path
    this._templateData = data
    return this.setCode(code)
  }

  /**
   * Sends JSON data to the client. The content-type will automatically be set as `application/json`.
   *
   * @param {*} data The data to send
   * @param {number} [code=200] The status code to send with the data
   * @returns
   * @memberof Response
   */
  public json(data: any, code: number = 200) {
    return this
      .setBody(JSON.stringify(data))
      .setCode(code)
      .setHeader('Content-Type', 'application/json')
  }

  /**
   * Sends HTML to the client. The content-type will automatically be set as `text/html`.
   *
   * @param {string} data The html to set along with the response
   * @param {number} [code=200] The status code to send with the html
   * @returns
   * @memberof Response
   */
  public html(data: string, code: number = 200) {
    return this
      .setBody(data)
      .setCode(code)
      .setHeader('Content-Type', 'text/html; charset=utf-8')
  }

  /**
   * Sends a file to the client to download. The content-type will automatically be set by analyzing the file extension;
   * along with that, `content-disposition` will also be set.
   *
   * @param {string} name The name the file should be saved as
   * @param {Buffer} data The data to send to the client
   * @param {number} [code=200] The status code to send with the download
   * @returns
   * @memberof Response
   */
  public download(name: string, data: Buffer, code?: number): this
  /**
   * Sends a file to the client to download. The content-type will automatically be set by analyzing the file extension;
   * along with that, `content-disposition` will also be set.
   *
   * @param {string} name The name the file should be saved as
   * @param {string} path The location to the file on the server
   * @param {number} [code=200] The status code to send with the download
   * @returns
   * @memberof Response
   */
  public download(name: string, path: string, code?: number): this
  public download(name: string, path: string | Buffer, code: number = 200): this {
    if (typeof path == 'string') this.setFile(path)
    if (path instanceof Buffer) this.setBuffer(path)
    return this
      .setCode(code)
      .setHeader('Content-Disposition', `attachment; filename="${name}"`)
  }

  /**
   * Redirects a user to a new location
   *
   * @readonly
   * @memberof Response
   */
  public get redirect() {
    let $this: Response = this
    return {
      /**
       * Redirects to a named route
       *
       * @param {string} name
       * @param {{
       *         params: { [key: string]: any },
       *         query: { [key: string]: any }
       *       }} [options={}]
       * @returns
       */
      to(name: string, options: {
        params?: { [key: string]: any },
        query?: { [key: string]: any }
        body?: string,
        headers?: OutgoingHttpHeaders
      } = {}) {
        let route = Router.findByName(name, null)

        // The route was not found send the users to the main page
        if (!route) return $this
          .setCode(302)
          .setHeader('Location', '/')

        // Get the redirect url
        let location = route &&
          typeof route.pathAlias == 'string' &&
          route.pathAlias
            .split('/')
            // Replace the placeholders with the values from the "params" parameter
            .map(i => i.startsWith(':') && i.replace(i, options.params && options.params[i.replace(/^:/, '')] || '') || i)
            .join('/') || '/'

        // Replace the query data
        if (options.query) {
          let entries = Object.keys(options.query)
          location = entries.length > 0 ?
            `?${entries.map(i => `${encodeURIComponent(i[0])}=${encodeURIComponent(i[1])}`).join('&')}` : ''
        }

        // If the domain on the route is a string, prefix the location with the domain
        // This will allow for redirects between domains

        // If the domain on the route is a regexp, only allow redirects on the same domain
        // In this case, do not prefix anything onto the location
        if (typeof route.domain == 'string') {
          location = 'http://' + route.domain + location
        }

        // Set the body and headers if the are set in the options
        options.body && $this.setBody(options.body)
        options.headers && $this.setHeaders(options.headers)

        // Set the response information
        return $this
          .setCode(302)
          .setHeader('Location', location)
      },
      /**
       * Redirects to a new URL this can be an internal or external location
       *
       * @param {string} path The url or path to redirect to
       * @returns
       */
      location(path: string, options: { body?: string, headers?: OutgoingHttpHeaders } = {}) {
        // Set the body
        options.body && $this.setBody(options.body)
        options.headers && $this.setHeaders(options.headers)
        return $this
          .setCode(302)
          .setHeader('Location', path)
      }
    }
  }
}