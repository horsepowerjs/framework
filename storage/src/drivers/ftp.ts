import * as path from 'path'
import { Storage } from '../Storage'
import { Duplex, Writable } from 'stream'

let Client: new () => Client
// Check to see if the user has the dependency installed
try {
  require.resolve('basic-ftp')
  Client = require.main && require.main.require('basic-ftp').Client
} catch (e) {
  throw new Error(JSON.stringify({
    code: 'dependency-not-found',
    msg: 'The module "basic-ftp" is a dependency of the ftp storage driver. It needs to be installed manually "npm i -s basic-ftp"'
  }))
}

type AccessOptions = import('basic-ftp').AccessOptions
type FileInfo = import('basic-ftp').FileInfo
type Client = import('basic-ftp').Client


export type FTPConfiguration = {
  driver: 'ftp'
  root: string
  options?: AccessOptions,
}

interface FTPConnection {
  name: string
  client: Client
}

export default class FTPStorage extends Storage<AccessOptions> {

  protected static connections: FTPConnection[] = []

  public async boot(config: FTPConfiguration): Promise<void> {
    let c = new Client()
    await c.access(config.options)
    FTPStorage.connections.push({
      client: c, name: this.name
    })
  }

  public async shutdown() {
    let conn = this.getConnection(this.name)
    if (!conn) return
    let idx = FTPStorage.connections.findIndex(i => i.name == this.name)
    idx > -1 && FTPStorage.connections.splice(idx, 1)
    conn.client.close()
  }

  public async write(filePath: string, data: string | Buffer, options?: object | undefined): Promise<boolean> {
    let conn = this.getConnection(this.name)
    if (!conn) return false
    filePath = this.forceRoot(filePath) as string
    await conn.client.ensureDir(path.dirname(filePath))
    let buffer: Buffer = Buffer.isBuffer(data) ? data : Buffer.from(data)
    let stream = new Duplex
    stream.push(buffer);
    stream.push(null);
    await conn.client.upload(stream, filePath)
    return true
  }

  public async read(filePath: string, options?: object | undefined): Promise<Buffer> {
    return new Promise<Buffer>(async resolve => {
      let conn = this.getConnection(this.name)
      if (!conn) return resolve(Buffer.from(''))
      filePath = this.forceRoot(filePath) as string
      let chunks: any[] = []
      let write = new Writable
      write._write = (chunk, encoding, callback) => {
        chunks.push(chunk)
        callback()
      }
      write.on('finish', () => resolve(Buffer.concat(chunks)))
      conn.client.download(write, filePath)
    })
  }

  public async delete(filePath: string): Promise<boolean> {
    let conn = this.getConnection(this.name)
    if (!conn) return false
    filePath = this.forceRoot(filePath) as string
    let r: number
    try {
      r = (await conn.client.remove(filePath)).code
    } catch (e) {
      try {
        await conn.client.removeDir(filePath)
        r = 200
      } catch (e) { r = e.code }
    }
    return r == 200
  }

  public async prepend(filePath: string, data: string | Buffer): Promise<boolean> {
    let fileData = (await this.read(filePath)).toString()
    return this.write(filePath, data.toString() + fileData)
  }

  public async append(filePath: string, data: string | Buffer): Promise<boolean> {
    let fileData = (await this.read(filePath)).toString()
    return this.write(filePath, fileData + data.toString())
  }

  public async copy(source: string, destination: string): Promise<boolean> {
    let conn = this.getConnection(this.name)
    if (!conn) return false
    let data = await this.read(source)
    return await this.write(destination, data)
  }

  public async move(source: string, destination: string): Promise<boolean> {
    let conn = this.getConnection(this.name)
    if (!conn) return false
    let r = await conn.client.rename(this.forceRoot(source) as string, this.forceRoot(destination) as string)
    return r.code == 200
  }

  public async exists(filePath: string): Promise<boolean> {
    let conn = this.getConnection(this.name)
    if (!conn) return false
    filePath = this.forceRoot(filePath) as string
    let dir = path.dirname(filePath)
    let info: FileInfo[] = await conn.client.list(dir)
    for (let i of info) {
      let cFilePath = path.join(dir, i.name)
      if (filePath == cFilePath) return true
    }
    return false
  }

  public async isFile(filePath: string): Promise<boolean> {
    let conn = this.getConnection(this.name)
    if (!conn) return false
    filePath = this.forceRoot(filePath) as string
    let dir = path.dirname(filePath)
    let info: FileInfo[] = await conn.client.list(dir)
    for (let i of info) {
      let cFilePath = path.join(dir, i.name)
      if (i.isFile && filePath == cFilePath) return true
    }
    return false
  }

  public async isDirectory(filePath: string): Promise<boolean> {
    let conn = this.getConnection(this.name)
    if (!conn) return false
    filePath = this.forceRoot(filePath) as string
    let dir = path.dirname(filePath)
    let info: FileInfo[] = await conn.client.list(dir)
    for (let i of info) {
      let cFilePath = path.join(dir, i.name)
      if (i.isDirectory && filePath == cFilePath) return true
    }
    return false
  }

  public toPath(filePath: string): string {
    return this.forceRoot(filePath).toString()
  }

  private getConnection(name: string) {
    return FTPStorage.connections.find(c => c.name == name)
  }

  public info(objectPath: string): Promise<object> {
    return Promise.resolve({})
  }
}