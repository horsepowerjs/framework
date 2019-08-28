import { Storage } from '../Storage'
import * as path from 'path'
import * as fs from 'fs'
import * as mkdirp from 'mkdirp'

export type FileConfiguration = {
  driver: 'file'
  root: string
}

export type FileOptions = {
  flags?: string;
  encoding?: string;
  fd?: number;
  mode?: number;
  autoClose?: boolean;
  start?: number;
}

export interface FileStorage extends Storage<any> {
  /**
   * Saves a file to storage if the file exists overwrite it.
   * If the folder path doesn't exist save will automatically create the path.
   *
   * @param {string} filePath The location of the file/directory
   * @param {(string | Buffer)} data The data to save
   * @param {object} [options] The save options for when saving the file
   * @returns {Promise<boolean>}
   */
  write(filePath: string, data: string | Buffer, options?: FileOptions): Promise<boolean>
  /**
   * Loads a file from file storage
   *
   * @param {string} filePath The location of the file/directory
   * @param {object} [options] The save options for when saving the file
   * @returns {(Promise<Buffer>)}
   */
  read(filePath: string, options?: FileOptions): Promise<Buffer>
  /**
   * Deletes a file from storage
   *
   * @param {string} filePath The location of the file/directory
   * @returns {Promise<boolean>}
   */
  delete(filePath: string): Promise<boolean>
  /**
   * Prepends data to the beginning of a file
   *
   * @param {string} filePath The location of the file
   * @param {(string | Buffer)} data The data to prepend to the beginning of the file
   * @returns {Promise<boolean>}
   */
  prepend(filePath: string, data: string | Buffer): Promise<boolean>
  /**
   * Appends data to the end of a file
   *
   * @param {string} filePath The location of the file
   * @param {(string | Buffer)} data The data to append to the end of the file
   * @returns {Promise<boolean>}
   */
  append(filePath: string, data: string | Buffer): Promise<boolean>
  /**
   * Copies a file or directory from one location to another location
   *
   * @param {string} source The original location of the file/directory
   * @param {string} destination The new location of the file/directory
   * @returns {Promise<boolean>}
   */
  copy(source: string, destination: string): Promise<boolean>
  /**
   * Moves a file or directory from one location to another location
   *
   * @param {string} source The original location of the file/directory
   * @param {string} destination The new location of the file/directory
   * @returns {Promise<boolean>}
   */
  move(source: string, destination: string): Promise<boolean>
  /**
   * Checks if a file or directory exists
   *
   * @param {string} filePath The location of the file/directory
   * @returns {Promise<boolean>}
   */
  exists(filePath: string): Promise<boolean>
  /**
   * Checks if a path is a file
   *
   * @abstract
   * @param {string} filePath The path to the file
   * @returns {Promise<boolean>}
   * @memberof Storage
   */
  isFile(filePath: string): Promise<boolean>
  /**
   * Checks if a path is a directory
   *
   * @abstract
   * @param {string} filePath The path to the directory
   * @returns {Promise<boolean>}
   * @memberof Storage
   */
  isDirectory(filePath: string): Promise<boolean>
  /**
   * Gets information about a file
   *
   * @param {string} filePath The path to the file
   * @returns {(Promise<fs.Stats | null>)}
   * @memberof FileStorage
   */
  info(filePath: string): Promise<fs.Stats | null>
  /**
   * Gets the full path to a file or directory
   *
   * @abstract
   * @param {string} filePath The path to the file or directory
   * @returns {string}
   * @memberof Storage
   */
  toPath(filePath: string): string
}

export default class extends Storage<{}> {

  /**
   * Saves a file to storage if the file exists overwrite it.
   * If the folder path doesn't exist save will automatically create the path.
   *
   * @param {string} filePath The location of the file/directory
   * @param {(string | Buffer)} data The data to save
   * @returns {Promise<boolean>}
   */
  public write(filePath: string, data: string | Buffer, options?: FileOptions): Promise<boolean> {
    return new Promise(async resolve => {
      try {
        let dir = path.parse(<string>this.forceRoot(filePath)).dir
        await new Promise(r => mkdirp(dir, (err) => { err ? r(false) : r(true) }))
        let resource = this.forceRoot(filePath)
        let writeStream: fs.WriteStream = fs.createWriteStream(resource, Object.assign<FileOptions, FileOptions | undefined>({ flags: 'w' }, options))
        writeStream.on('error', () => resolve(false))
        writeStream.on('close', () => resolve(true))
        writeStream.write(data)
        writeStream.destroy()
      } catch (e) {
        resolve(false)
      }
    })
  }

  /**
   * Loads a file from file storage
   *
   * @param {string} filePath The location of the file/directory
   * @returns {(Promise<Buffer>)}
   */
  public read(filePath: string): Promise<Buffer> {
    return new Promise(resolve => {
      try {
        let chunks: any[] = []
        let resource = this.forceRoot(filePath)
        let url = resource.toString()
        let readStream = fs.createReadStream(url)
        readStream.on('data', (data) => chunks.push(data))
        readStream.on('end', () => readStream.destroy())
        readStream.on('close', () => resolve(Buffer.concat(chunks)))
      } catch (e) {
        resolve(Buffer.from(''))
      }
    })
  }

  /**
   * Deletes a file from storage
   *
   * @param {string} filePath The location of the file/directory
   * @returns {Promise<boolean>}
   */
  public delete(filePath: string): Promise<boolean> {
    return new Promise(resolve => {
      try {
        fs.unlink(this.forceRoot(filePath), err => {
          resolve(!err)
        })
      } catch (e) {
        resolve(false)
      }
    })
  }

  /**
   * Prepends data to the beginning of a file
   *
   * @param {string} filePath The location of the file
   * @param {(string | Buffer)} data The data to prepend to the beginning of the file
   * @returns {Promise<boolean>}
   */
  public prepend(filePath: string, data: string | Buffer): Promise<boolean> {
    return new Promise(async resolve => {
      let fileData = await this.read(filePath)
      data = data.toString() + fileData.toString()
      resolve(await this.write(filePath, data))
    })
  }

  /**
   * Appends data to the end of a file
   *
   * @param {string} filePath The location of the file
   * @param {(string | Buffer)} data The data to append to the end of the file
   * @returns {Promise<boolean>}
   */
  public append(filePath: string, data: string | Buffer): Promise<boolean> {
    return this.write(filePath, data, { flags: 'a' })
  }

  /**
   * Copies a file or directory from one location to another location
   *
   * @param {string} source The original location of the file/directory
   * @param {string} destination The new location of the file/directory
   * @returns {Promise<boolean>}
   */
  public copy(source: string, destination: string): Promise<boolean> {
    return new Promise(async resolve => {
      let dir = path.parse(<string>this.forceRoot(destination)).dir
      await new Promise(r => mkdirp(dir, (err) => { err ? r(false) : r(true) }))
      let readStream = fs.createReadStream(this.forceRoot(source))
      let writeStream = fs.createWriteStream(this.forceRoot(destination))
      readStream.pipe(writeStream)
      readStream.on('finish', () => {
        readStream.destroy()
        writeStream.destroy()
      })
      readStream.on('close', () => resolve(true))
    })
  }

  /**
   * Moves a file or directory from one location to another location
   *
   * @param {string} source The original local location of the file/directory
   * @param {string} destination The new local location of the file/directory
   * @returns {Promise<boolean>}
   */
  public move(source: string, destination: string): Promise<boolean> {
    return new Promise(async resolve => {
      let dir = path.parse(<string>this.forceRoot(destination)).dir
      await new Promise(r => mkdirp(dir, (err) => { err ? r(false) : r(true) }))
      fs.rename(this.forceRoot(source), this.forceRoot(destination), (err) => {
        resolve(!err)
      })
    })
  }

  /**
   * Checks if a file or directory exists
   *
   * @param {string} objectPath The objects local path
   * @returns {Promise<boolean>}
   */
  public exists(objectPath: string): Promise<boolean> {
    return new Promise<boolean>(async resolve => {
      fs.stat(this.forceRoot(objectPath), (err, stat) => {
        if (err) resolve(false)
        else if (stat.isFile()) resolve(true)
        else resolve(stat.isDirectory())
      })
    })
  }

  /**
   * Checks if a path is a file
   *
   * @param {string} objectPath The objects local path
   * @returns {Promise<boolean>}
   */
  public isFile(objectPath: string): Promise<boolean> {
    return new Promise<boolean>(resolve => {
      fs.stat(this.forceRoot(objectPath), (err, stat) => {
        if (err) return resolve(false)
        return resolve(stat.isFile())
      })
    })
  }

  /**
   * Checks if a path is a directory
   *
   * @param {string} objectPath The objects local path
   * @returns {Promise<boolean>}
   */
  public isDirectory(objectPath: string): Promise<boolean> {
    return new Promise<boolean>(resolve => {
      fs.stat(this.forceRoot(objectPath), (err, stat) => {
        if (err) return resolve(false)
        return resolve(stat.isDirectory())
      })
    })
  }

  public info(objectPath: string): Promise<fs.Stats | null> {
    return new Promise<fs.Stats | null>(resolve => {
      fs.stat(this.forceRoot(objectPath), (err, stat) => {
        if (err) return resolve(null)
        return resolve(stat)
      })
    })
  }

  /**
   * Gets the full path to the object
   *
   * @param {string} objectPath The objects local path
   * @returns
   */
  public toPath(objectPath: string) {
    return this.forceRoot(objectPath).toString()
  }
}