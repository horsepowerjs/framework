import { Storage } from '..'
import { Readable } from 'stream'

let mongo
try {
  require.resolve('mongodb')
  mongo = require.main && require.main.require('mongodb')
} catch (e) {
  throw new Error(JSON.stringify({
    code: 'dependency-not-found',
    msg: 'The module "mongodb" is dependency of the mongo storage driver. It needs to be installed manually "npm i -s mongodb"'
  }))
}

type MongoClientStatic = typeof import('mongodb').MongoClient
type MongoClient = import('mongodb').MongoClient
type GridFSBucket = import('mongodb').GridFSBucket
type Collection = import('mongodb').Collection
type Db = import('mongodb').Db

type MongoOptions = {
  user?: string
  pass?: string
  host?: string
  port?: number
  db: string
}

export type MongoConfiguration = {
  /**
   * A mongodb driver
   *
   * @type {'mongo'}
   */
  driver: 'mongo'
  /**
   * The root storage path
   *
   * @type {string}
   */
  root: string
  /**
   * Mongodb connection settings
   *
   * @type {MongoOptions}
   */
  options?: MongoOptions,
}

const MongoClient: MongoClient = mongo.MongoClient
const Db: new () => Db = mongo.Db
const GridFSBucket: new (dbName: Db) => GridFSBucket = mongo.GridFSBucket


interface File {
  _id: import('mongodb').ObjectId
  length: number
  chunkSize: number
  uploadDate: Date
  filename: string
  md5: string
}

interface MongoConnection {
  name: string
  client: MongoClient
  bucket: GridFSBucket
}

export default class MongoStorage extends Storage<MongoOptions> {

  protected static connections: MongoConnection[] = []

  /**
   * Initializes the connection to the database
   *
   * @internal
   * @param {StorageDisk<MongoOptions>} config
   * @memberof MongoDriver
   */
  public async boot(config: MongoConfiguration) {
    if (!config.options || !config.options.db) throw new Error(`A database is required for a mongo driver; set "options.db" in the driver settings.`)
    let options = config.options
    let username = options && options.user || ''
    let password = options && options.pass || ''

    let user = ''
    if (username) user += username
    if (username && password) user += ':' + password
    if (user.length > 0) user += '@'

    let host = options && options.host || 'localhost'
    let port = options && options.port || 27017
    let url = `mongodb://${user}${host}:${port}`

    let client = await (<MongoClientStatic>(MongoClient as unknown)).connect(url, { useNewUrlParser: true })
    let bucket = new GridFSBucket(client.db(options.db))

    MongoStorage.connections.push({ client, name: this.name, bucket })
  }

  public async shutdown() {
    let conn = this.getConnection(this.name)
    if (!conn) return
    let idx = MongoStorage.connections.findIndex(i => i.name == this.name)
    idx > -1 && MongoStorage.connections.splice(idx, 1)
    conn.client.close()
  }

  public async write(filePath: string, data: string | Buffer): Promise<boolean> {
    return new Promise<boolean>(async resolve => {
      let conn = this.getConnection(this.name)
      if (!conn) return false
      await this.delete(filePath)
      let r = new Readable()
      r._read = () => { }
      r.push(data)
      r.push(null)
      r.pipe(conn.bucket.openUploadStream(<string>this.forceRoot(filePath), {
        // metadata: {
        //   mime: mimeType,
        //   type: mimeType.split('/')[0] || 'unknown',
        //   ext: mimeType.split('/')[1] || 'unknown'
        // }
      }))
        .on('finish', () => resolve(true))
        .on('error', () => resolve(false))
    })
  }

  public async read(filePath: string, options?: object | undefined): Promise<Buffer> {
    return new Promise(async resolve => {
      try {
        let conn = this.getConnection(this.name)
        if (!conn) return resolve(Buffer.from(''))
        let file = await this.findFile(conn, filePath)
        if (file) {
          let chunks: any[] = []
          conn.bucket.openDownloadStream(file._id)
            .on('data', chunk => chunks.push(chunk))
            .on('error', () => Buffer.from(''))
            .on('close', () => resolve(Buffer.concat(chunks)))
        } else {
          resolve(Buffer.from(''))
        }
      } catch (e) {
        resolve(Buffer.from(''))
      }
    })
  }

  public async delete(filePath: string): Promise<boolean> {
    let conn = this.getConnection(this.name)
    if (!conn) return false
    let file = await this.findFile(conn, filePath)
    if (file) {
      await conn.bucket.delete(file._id)
      return true
    }
    return false
  }

  public async prepend(filePath: string, data: string | Buffer): Promise<boolean> {
    let conn = this.getConnection(this.name)
    if (!conn) return false
    let file = await this.read(filePath)
    if (file.length > 0 && await this.delete(filePath)) {
      return await this.write(filePath, data + file.toString())
    }
    return false
  }

  public async append(filePath: string, data: string | Buffer): Promise<boolean> {
    let conn = this.getConnection(this.name)
    if (!conn) return false
    let file = await this.read(filePath)
    if (file.length > 0 && await this.delete(filePath)) {
      return await this.write(filePath, file.toString() + data)
    }
    return false
  }

  public async copy(source: string, destination: string): Promise<boolean> {
    let conn = this.getConnection(this.name)
    if (!conn) return false
    let file = await this.findFile(conn, source)
    if (file) {
      conn.bucket.openDownloadStream(file._id)
        .pipe(conn.bucket.openUploadStream(<string>this.forceRoot(destination)))
      return true
    }
    return false
  }

  public async move(source: string, destination: string): Promise<boolean> {
    let conn = this.getConnection(this.name)
    if (!conn) return false
    let file = await this.findFile(conn, source)
    if (file) conn.bucket.rename(file._id, <string>this.forceRoot(destination))
    return !!file
  }

  public async exists(filePath: string): Promise<boolean> {
    let conn = this.getConnection(this.name)
    if (!conn) return false
    return !!(await this.findFile(conn, filePath))
  }

  public async isFile(filePath: string): Promise<boolean> {
    let conn = this.getConnection(this.name)
    if (!conn) return false
    return !!(await this.findFile(conn, filePath))
  }

  public async isDirectory(filePath: string): Promise<boolean> {
    let conn = this.getConnection(this.name)
    if (!conn) return false
    const esc = (string: string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    filePath = <string>this.forceRoot(filePath)
    filePath = esc(filePath.endsWith('/') ? filePath : filePath + '/')
    let collection: Collection = (<any>conn.client).db(this.disk.options.db).collection('fs.files')
    let results = await collection.aggregate([
      {
        '$project': {
          'path': { '$split': ['$filename', '/'] }
        }
      }, {
        '$project': {
          'path': { '$slice': ['$path', { '$subtract': [{ '$size': '$path' }, 1] }] }
        }
      }, {
        '$project': {
          'path': { '$slice': ['$path', 1, { '$size': '$path' }] }
        }
      }, {
        '$project': {
          'path': {
            '$reduce': {
              'input': '$path',
              'initialValue': '/',
              'in': { '$concat': ['$$value', '$$this', '/'] }
            }
          }
        }
      },
      {
        '$match': { 'path': RegExp(`^${filePath}`) }
      },
      {
        '$group': {
          '_id': null,
          'total': { $sum: 1 }
        }
      }
    ])
    try {
      return (await results.next()).total > 0
    } catch (e) {
      return false
    }
  }

  public toPath(filePath: string): string {
    return this.forceRoot(filePath).toString()
  }

  private async findFile(conn: MongoConnection, filename: string) {
    let collection: Collection = (<any>conn.client).db(this.disk.options.db).collection('fs.files')
    if (!collection) return null
    return await collection.findOne<File>({ filename: this.forceRoot(filename) })
  }

  private getConnection(name: string) {
    return MongoStorage.connections.find(c => c.name == name)
  }

  public info(objectPath: string): Promise<object> {
    return Promise.resolve({})
  }
}