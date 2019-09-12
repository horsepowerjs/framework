import { Storage } from '..'
import { PassThrough } from 'stream'

let S3: S3
try {
  require.resolve('aws-sdk')
  S3 = require.main && require.main.require('aws-sdk/clients/s3')
} catch (e) {
  throw new Error(JSON.stringify({
    code: 'dependency-not-found',
    msg: 'The module "aws-sdk" is a dependency of the s3 storage driver. It needs to be installed manually "npm i -s aws-sdk"'
  }))
}

export type S3Options = import('aws-sdk/clients/s3').ClientConfiguration
type S3 = new (config: S3Options) => import('aws-sdk/clients/s3')
type PutObjectRequest = import('aws-sdk/clients/s3').PutObjectRequest
type GetObjectRequest = import('aws-sdk/clients/s3').GetObjectRequest
type DeleteObjectRequest = import('aws-sdk/clients/s3').DeleteObjectRequest

export type S3Configuration = {
  driver: 's3'
  root: string
  bucket: string
  options: S3Options
}

interface S3Connection {
  name: string
  conn: import('aws-sdk/clients/s3')
  bucket: string
}

export default class AmazonS3Storage extends Storage<S3Options> {

  public static connections: S3Connection[] = []

  public async boot(config: S3Configuration) {

    if (!config.bucket) throw new Error(`A bucket is required for a s3 driver; set "bucket" in the driver settings.`)

    AmazonS3Storage.connections.push({
      name: this.name,
      conn: new S3(config.options),
      bucket: config.bucket
    })
  }

  public async write(filePath: string, data: string | Buffer, options?: PutObjectRequest | undefined): Promise<boolean> {
    return new Promise(resolve => {
      let conn = this.getConnection()
      if (!conn) return false
      let v = {
        Bucket: conn.bucket,
        Key: filePath,
        Body: data,
        ACL: 'public-read'
      }
      if (options) v = Object.assign(v, options)
      conn.conn.putObject(v, (err, data) => {
        // if (err) return resolve(false)
        resolve(true)
      })
    })
  }

  public async read(filePath: string, options?: GetObjectRequest | undefined): Promise<Buffer> {
    return new Promise(resolve => {
      let conn = this.getConnection()
      if (!conn) return false
      let v = <GetObjectRequest>{
        Bucket: conn.bucket,
        Key: filePath
      }
      if (options) v = Object.assign(v, options)
      conn.conn.getObject(v, async (err, data) => {
        // if (err) return resolve(Buffer.concat([]))
        if (data && data.Body) return resolve(Buffer.from(data.Body.toString()))
        return resolve(Buffer.from(''))
      })
    })
  }

  public async delete(filePath: string): Promise<boolean> {
    return new Promise(resolve => {
      let conn = this.getConnection()
      if (!conn) return false
      conn.conn.deleteObject({
        Bucket: conn.bucket,
        Key: filePath
      }, (err, data) => {
        resolve(!!data.DeleteMarker)
      })
    })
  }

  public async prepend(filePath: string, data: string | Buffer): Promise<boolean> {
    let conn = this.getConnection()
    if (!conn) return false
    let fileData = (await this.read(filePath)).toString()
    return await this.write(filePath, data.toString() + fileData)
  }

  public async append(filePath: string, data: string | Buffer): Promise<boolean> {
    let conn = this.getConnection()
    if (!conn) return false
    let fileData = (await this.read(filePath)).toString()
    return await this.write(filePath, fileData + data.toString())
  }

  public async copy(source: string, destination: string): Promise<boolean> {
    return new Promise(resolve => {
      let conn = this.getConnection()
      if (!conn) return false
      conn.conn.copyObject({
        Bucket: conn.bucket,
        CopySource: source,
        Key: destination
      }, (err, data) => {
        resolve(!!data.CopyObjectResult)
      })
    })
  }

  public async move(source: string, destination: string): Promise<boolean> {
    await this.copy(source, destination)
    return await this.delete(source)
  }

  public async exists(filePath: string): Promise<boolean> {
    return new Promise(resolve => {
      let conn = this.getConnection()
      if (!conn) return false
      conn.conn.listObjects({
        Bucket: conn.bucket,
        Prefix: filePath,
        MaxKeys: 1
      }, (err, data) => {
        resolve(data.Contents && data.Contents.length > 0)
      })
    })
  }

  public async isFile(filePath: string): Promise<boolean> {
    throw new Error('Method not implemented.');
  }

  public async isDirectory(filePath: string): Promise<boolean> {
    throw new Error('Method not implemented.');
  }

  public toPath(filePath: string): string {
    throw new Error('Method not implemented.');
  }

  private getConnection() {
    return AmazonS3Storage.connections.find(i => i.name == this.name)
  }

  public async info(objectPath: string): Promise<object> {
    // return Promise.resolve({})
    let conn = this.getConnection()
    if (!conn) return {}
    let v = <GetObjectRequest>{
      Bucket: conn.bucket,
      Key: objectPath
    }
    return (await conn.conn.headObject(v).promise())
  }

  public async fileSize(filePath: string) {
    let conn = this.getConnection()
    if (!conn) return 0
    let v = <GetObjectRequest>{
      Bucket: conn.bucket,
      Key: filePath
    }
    return (await conn.conn.headObject(v).promise()).ContentLength || 0
  }

  public async readStream(filePath: string, options: object & { start?: number, end?: number, fileSize?: number } = {}) {
    let conn = this.getConnection()
    let passThrough = new PassThrough
    if (!conn) return passThrough
    let v = <GetObjectRequest>{
      Bucket: conn.bucket,
      Key: filePath,
    }
    if (options) {
      let range: (number | string)[] = []
      if (options.start) range.push(options.start)
      else range.push(0)
      if (options.end) range.push(options.end)
      else range.push(options.fileSize || '')
      v.Range = 'bytes=' + range.join('-')
    }
    // if (options) v = Object.assign(v, options)
    conn.conn.getObject(v).createReadStream().pipe(passThrough)
    return passThrough
  }

}