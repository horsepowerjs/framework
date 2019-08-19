import { parse } from 'url'
import * as path from 'path'
import * as querystring from 'querystring'
import { parse as parseCookie } from 'cookie'
import { IncomingMessage, IncomingHttpHeaders } from 'http'

import { RequestMethod, Route } from '@horsepower/router'
import { Response, getConfig, AppSettings } from '.'
import { Storage, FileStorage } from '@horsepower/storage'
import { collect } from './util'

export interface FileType {
  /**
   * The name of the form field
   *
   * @type {string}
   * @memberof FileType
   */
  key: string
  /**
   * The original name of the uploaded file `example.jpg`
   *
   * @type {string}
   * @memberof FileType
   */
  filename: string
  /**
   * The full location of the tmp file `/tmp/dir/horsepower/uploads/xxxyyyzzz.tmp`
   *
   * @type {string}
   * @memberof FileType
   */
  tmpFilePath: string
  /**
   * The name of the tmp file `xxxyyyzzz.tmp`
   *
   * @type {string}
   * @memberof FileType
   */
  tmpFilename: string
  /**
   * The location of the tmp file relative to the storage disk's root `/horsepower/uploads/xxxyyyzzz.tmp`
   *
   * @type {string}
   * @memberof FileType
   */
  tmpStoragePath: string
}

export type Lang = { [key: string]: any }
export declare type Helpers = { [key: string]: Function }

export class Client {

  public readonly method: RequestMethod
  public readonly ajax: boolean = false

  private _post: any = {}
  private readonly _get: any
  private readonly _files: FileType[] = []
  private readonly _headers: IncomingHttpHeaders
  private readonly _response: Response
  private readonly _id: string
  private _req: IncomingMessage
  // private _helpers: Helpers = {}

  public route!: Route
  public session?: import('@horsepower/session').Session

  public get request() { return this._req }

  public constructor(req: IncomingMessage) {
    this._req = req
    this._get = querystring.parse(parse(req.url || '').query || '')
    this.ajax = req.headers['x-requested-with'] == 'XMLHttpRequest'
    this._response = new Response(<any>this)
    this._headers = req.headers
    this._id = (Math.random() * 10e15).toString(36).replace(/\W/g, '')
    this._post = {}

    // Attempt to get the request type.
    //   1. Check the post/get data for a '_method'
    //   2. Check the request for a method
    //   3. Fallback to a 'get' method
    this.method = (this.data.request<string>('_method', null) || req.method || 'get').toLowerCase() as RequestMethod
  }

  /**
   * Initialize anything that shouldn't be initialized in the constructor
   *
   * @memberof Client
   */
  public async init() {
    try {
      if (!this.session && require.resolve('@horsepower/session')) {
        let sess = await import('@horsepower/session')
        this.session = new sess.Session(<any>this)
      }
    } catch (e) { }
  }

  /**
   * Attempts to read the information about the body of the request, such as attachments
   *
   * @param {string} body The received body string from the request
   * @memberof Client
   */
  public async setBody(body: string) {
    let contentType = this.headers.get<string>('content-type')
    if (contentType.includes('boundary=')) {
      // Get the boundary for each item
      let [/* contentType */, boundary] = contentType.split('boundary=')
      // Get an array of items within each boundary
      let boundaries = body.split(new RegExp(`(--${boundary}|--${boundary}--)`))
      for (let item of boundaries) {
        if (item.trim().toLowerCase().startsWith('content-disposition')) {
          item = item.trim()

          // Attempt to get the name and filename from a file upload
          let result = item.split(':')[1]
            .split(';')
            .map(i => i.trim())
            .reduce((obj, itm) => {
              if (itm.startsWith('name=')) obj.name = (itm.match(/^name="(.+)"/) || [''])[1]
              if (itm.startsWith('filename=')) obj.filename = (itm.match(/^filename="(.+)"/) || [''])[1]
              return obj
            }, { name: '', filename: '' })

          // If a filename was found, this item must be from a file upload
          if (result.filename.length > 0) {
            // Creates a temporary filename to store the upload
            let temp = path.posix.join('horsepower', 'uploads', (Math.random() * 10000).toString(12).substr(5, 10) + '.tmp')
            let [/* fullMatch */, /* newlines */, file] = Array.from(item.match(/^.+?(\r\n\r\n|\n\n)(.+)/s) || [])
            if (file) {
              // Write the file to the temp directory
              await Storage.mount<FileStorage>('tmp').write(temp, file, { encoding: 'binary' })

              // Add the file to the list of files
              this._files.push({
                key: result.name,
                filename: result.filename,
                tmpFilename: path.posix.parse(temp).base,
                tmpFilePath: Storage.mount<FileStorage>('tmp').toPath(temp),
                tmpStoragePath: temp
              })
            }
          } else {
            // No filename was found, this is just post data
            this._post[result.name] = item.split(/\r\n\r\n|\n\n/)[1]
          }
        }
      }
    } else {
      try {
        this._post = JSON.parse(body)
      } catch (e) {
        try {
          let d = querystring.parse(body)
          this._post = d
        } catch (e) {
          this._post = body
        }
      }
    }
  }

  /**
   * Gets the path from the route, if it isn't found return `/` as the path
   *
   * @readonly
   * @type {string}
   * @memberof Client
   */
  public get path(): string {
    return this.route && this.route.path || '/'
  }

  public get response() {
    return this._response
  }

  public all() {
    return collect(Object.entries(this.data.requestAll).map(i => ({ key: i[0], value: i[1] })))
  }

  public only(...fields: string[]) {
    return collect(Object.entries(this.data.requestAll).filter(i => fields.includes(i[0])).map(i => ({ key: i[0], value: i[1] })))
  }

  public except(...fields: string[]) {
    return collect(Object.entries(this.data.requestAll).filter(i => !fields.includes(i[0])).map(i => ({ key: i[0], value: i[1] })))
  }

  /**
   * Gets data from a request
   *
   * @readonly
   * @memberof Client
   */
  public get data() {
    let $this = this
    return {
      /**
       * Gets all of the items in the query string
       */
      get getAll(): object {
        return Object.freeze($this._get)
      },
      /**
       * Gets all of the items in the post data
       */
      get postAll(): object {
        return Object.freeze($this._post)
      },
      get requestAll(): object {
        return Object.freeze(Object.assign({}, $this._post, $this._get))
      },
      /**
       * Gets the file information from a request
       *
       * @param {string} key The key that was used to reference the file
       * @returns
       */
      files(key: string) {
        return ($this._files.find(i => i.key == key))
      },
      /**
       * Gets a query parameter and if it is not found return the default value
       *
       * @template T
       * @param {string} key The key to the query parameter
       * @param {*} [defaultValue=''] The default value if the key doesn't exist
       * @returns {T}
       */
      get<T extends any>(key: string, defaultValue: any = ''): T {
        if ($this._get[key]) return $this._get[key]
        else return defaultValue
      },
      /**
       * Gets a post parameter
       *
       * @template T
       * @param {string} key The key to the post parameter
       * @param {*} [defaultValue=''] The default value if the key doesn't exist
       * @returns {T}
       */
      post<T extends any>(key: string, defaultValue: any = ''): T {
        console.log('d', $this._post)
        if ($this._post[key]) return $this._post[key]
        return defaultValue
      },
      /**
       * Gets a parameter no matter if it is a `post` or `get` parameter.
       * If the key is in both the `get` and `post` data, the `get` key will be returned
       *
       * @template T
       * @param {string} key The key to the get or post parameter
       * @param {*} [defaultValue=''] The default value if the key doesn't exist
       * @returns {T}
       */
      request<T extends any>(key: string, defaultValue: any = ''): T {
        if ($this._get[key]) return $this._get[key]
        else if ($this._post[key]) return $this._post[key]
        else return defaultValue
      },
      /**
       * Gets the request data and converts it to an object
       *
       * @returns
       */
      toObject() {
        type ToObj = { get: { [key: string]: any }, post: { [key: string]: any }, files: { [key: string]: FileType } }
        let obj: ToObj = { get: {}, post: {}, files: {} }
        for (let key in $this._get) { obj.get[key] = $this._get[key] }
        for (let key in $this._post) { obj.post[key] = $this._post[key] }
        for (let key in $this._files) { obj.files[key] = <FileType>this.files(key) }
        return Object.freeze(obj)
      }
    }
  }

  /**
   * Reads the headers
   *
   * @readonly
   * @memberof Client
   */
  public get headers() {
    let $this = this
    return {
      /**
       * Gets a item from the headers
       *
       * @template T
       * @param {string} key The header key
       * @param {*} [defaultValue=''] The default value if the key doesn't exist
       * @returns {T}
       */
      get<T>(key: string, defaultValue: any = ''): T {
        let header = $this._headers[key.toLowerCase()]
        return header || defaultValue
      },
      /**
       * Checks if a header is set
       *
       * @param {string} key The header key
       * @returns
       */
      has(key: string) {
        return this.get<string>(key).length > 0
      },
      /**
       * Checks if a header is set with an exact value
       *
       * @param {string} key The header key
       * @param {*} value The value that the headers value MUST equal
       * @returns
       */
      is(key: string, value: any) {
        let v = this.get(key)
        if (v && value) return v == value
        return !!v
      },
      /**
       * All of the header values
       *
       * @returns
       */
      all() {
        return Object.freeze(JSON.parse(JSON.stringify($this._headers)))
      }
    }
  }


  /**
   * Gets the request's unique identifer which is created upon request
   *
   * @readonly
   * @type {string}
   * @memberof Client
   */
  public get id(): string { return this._id }

  public setRoute(route: Route) {
    this.route = route
    return this
  }

  public setLocale(locale: string) {
    let session = getConfig<any>('session')
    let cookieOptions = session && session.cookie ? session.cookie : {
      path: '/',
      // Expire the cookie in approximately 30 days
      expires: new Date(Date.now() + (30 * 24 * 60 * 60 * 1000))
    }
    this.response.setCookie('lang', locale, cookieOptions)
    return this
  }

  public getLocale() {
    let cookies = parseCookie(<string>this.request.headers.cookie || '')
    let lang = cookies.lang
    if (!lang) {
      let app = getConfig<AppSettings>('app')
      if (app && app.locale) lang = app.locale
    }
    return lang || 'en'
  }

  async trans(key: string, data: { [key: string]: any } = {}) {
    let store = Storage.mount('resources')
    let [file, ...keyPath] = key.split('.')
    let transValue = ''
    if (await store.exists(path.posix.join('lang', this.getLocale(), `${file}.json`))) {
      let langData = JSON.parse((await store.read(path.posix.join('lang', this.getLocale(), `${file}.json`)) || '{}').toString()) as Lang
      transValue = keyPath.reduce<any>((obj, val) => obj && obj[val] && obj[val] || '', langData || {}).toString()
    }

    for (let i of Object.entries(data)) {
      let key = i[0], val = i[1]
      transValue = transValue.replace(new RegExp(`:${key}`, 'g'), val)
    }

    return transValue
  }

  // public setHelpers(helpers: { [key: string]: Function }) {
  //   this._helpers = helpers
  // }
}